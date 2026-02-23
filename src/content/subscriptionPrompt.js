// SubDupes - Proactive Subscription Save Prompt
// In-page toast UI injected when a subscription/checkout page is confidently detected

console.log('SubDupes Subscription Prompt Module Loaded');

// ─── State ─────────────────────────────────────────────────────────────────

let promptShown = false;
let dismissedDomains = new Set();

// Load dismissed domains from storage
try {
    chrome.storage.local.get(['dismissedDomains'], (result) => {
        if (chrome.runtime.lastError) return;
        if (result.dismissedDomains) {
            dismissedDomains = new Set(result.dismissedDomains);
        }
    });
} catch { /* Ignore in non-extension context */ }

// ─── Prompt HTML Template ──────────────────────────────────────────────────

function buildPromptHTML(data) {
    const currencySymbols = { USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥' };
    const symbol = currencySymbols[data.currency] || data.currency || '$';
    const amount = data.amount ? `${symbol}${parseFloat(data.amount).toFixed(2)}` : 'Detected';
    const cycleName = (data.billingCycle || 'MONTHLY').toLowerCase();

    // Escape HTML to prevent XSS from attacker-controlled page titles
    const escapeHTML = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const safeName = escapeHTML(data.name);
    const planLabel = data.planName ? ` — ${escapeHTML(data.planName)}` : '';

    return `
    <div id="subdupes-save-prompt" style="
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 360px;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow: hidden;
        animation: sdPromptSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        transform-origin: bottom right;
    ">
        <style>
            @keyframes sdPromptSlideIn {
                from { opacity: 0; transform: translateY(16px) scale(0.96); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes sdPromptSlideOut {
                from { opacity: 1; transform: translateY(0) scale(1); }
                to { opacity: 0; transform: translateY(16px) scale(0.96); }
            }
            #subdupes-save-prompt * { box-sizing: border-box; }
            #subdupes-save-prompt button { font-family: inherit; }
        </style>

        <!-- Header Bar -->
        <div style="
            background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%);
            padding: 14px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        ">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="
                    width: 28px; height: 28px;
                    background: rgba(255,255,255,0.2);
                    border-radius: 8px;
                    display: flex; align-items: center; justify-content: center;
                    color: white; font-weight: 800; font-size: 13px;
                ">S</div>
                <span style="color: white; font-weight: 700; font-size: 14px; letter-spacing: -0.01em;">SubDupes</span>
            </div>
            <button id="sd-prompt-close" style="
                background: rgba(255,255,255,0.15);
                border: none;
                color: white;
                width: 24px; height: 24px;
                border-radius: 6px;
                cursor: pointer;
                display: flex; align-items: center; justify-content: center;
                font-size: 16px;
                line-height: 1;
                transition: background 0.2s;
            " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">&times;</button>
        </div>

        <!-- Body -->
        <div style="padding: 16px 16px 12px;">
            <div style="font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 4px;">
                Subscription Detected 🎯
            </div>
            <p style="font-size: 12px; color: #6B7280; margin: 0 0 14px; line-height: 1.4;">
                Looks like you're about to subscribe. Save it to track and never overpay!
            </p>

            <!-- Detected Details Card -->
            <div style="
                background: #F8FAFC;
                border: 1px solid #E2E8F0;
                border-radius: 10px;
                padding: 12px;
                margin-bottom: 14px;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 13px; font-weight: 600; color: #1E293B;">${safeName}${planLabel}</div>
                        <div style="font-size: 11px; color: #94A3B8; margin-top: 2px;">${window.location.hostname}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 18px; font-weight: 700; color: #2563EB;">${amount}</div>
                        <div style="font-size: 10px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.5px;">${cycleName}</div>
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <button id="sd-prompt-save" style="
                width: 100%;
                padding: 10px 16px;
                background: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%);
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: opacity 0.2s, transform 0.1s;
                letter-spacing: -0.01em;
            " onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'" onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='scale(1)'">
                💾 Save to SubDupes
            </button>

            <div style="display: flex; gap: 8px; margin-top: 8px;">
                <button id="sd-prompt-dismiss" style="
                    flex: 1;
                    padding: 8px;
                    background: #F1F5F9;
                    color: #64748B;
                    border: none;
                    border-radius: 8px;
                    font-size: 11px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.2s;
                " onmouseover="this.style.background='#E2E8F0'" onmouseout="this.style.background='#F1F5F9'">
                    Dismiss
                </button>
                <button id="sd-prompt-block" style="
                    flex: 1;
                    padding: 8px;
                    background: #F1F5F9;
                    color: #94A3B8;
                    border: none;
                    border-radius: 8px;
                    font-size: 11px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.2s;
                " onmouseover="this.style.background='#E2E8F0'" onmouseout="this.style.background='#F1F5F9'">
                    Not a subscription
                </button>
            </div>
        </div>

        <!-- Progress bar (auto-dismiss timer) -->
        <div style="height: 3px; background: #F1F5F9; overflow: hidden;">
            <div id="sd-prompt-timer-bar" style="
                height: 100%;
                width: 100%;
                background: linear-gradient(90deg, #2563EB, #7C3AED);
                transition: width 15s linear;
            "></div>
        </div>
    </div>
    `;
}

// ─── Prompt Lifecycle ──────────────────────────────────────────────────────

let promptData = null;
let autoDismissTimer = null;

function showPrompt(data) {
    // Guards
    if (promptShown) return;
    if (dismissedDomains.has(window.location.hostname)) return;
    if (document.getElementById('subdupes-save-prompt')) return;

    promptShown = true;
    promptData = data;

    const container = document.createElement('div');
    container.id = 'subdupes-prompt-container';
    container.innerHTML = buildPromptHTML(data);
    document.body.appendChild(container);

    // Start auto-dismiss timer bar animation
    requestAnimationFrame(() => {
        const timerBar = document.getElementById('sd-prompt-timer-bar');
        if (timerBar) timerBar.style.width = '0%';
    });

    // Auto-dismiss after 15 seconds
    autoDismissTimer = setTimeout(() => {
        removePrompt();
    }, 15000);

    // Bind event handlers
    bindPromptActions(data);
}

function removePrompt() {
    clearTimeout(autoDismissTimer);
    const el = document.getElementById('subdupes-save-prompt');
    if (el) {
        el.style.animation = 'sdPromptSlideOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        setTimeout(() => {
            const container = document.getElementById('subdupes-prompt-container');
            if (container) container.remove();
        }, 300);
    }
    // Don't reset promptShown — prevent re-showing on same page load
}

function bindPromptActions(data) {
    // Close button
    const closeBtn = document.getElementById('sd-prompt-close');
    if (closeBtn) closeBtn.addEventListener('click', removePrompt);

    // Save button
    const saveBtn = document.getElementById('sd-prompt-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            // Send save request to background
            const cleanData = {
                name: data.name,
                planName: data.planName || '',
                amount: parseFloat(data.amount) || null,
                currency: data.currency || 'USD',
                billingCycle: data.billingCycle || 'MONTHLY',
                websiteUrl: data.websiteUrl || window.location.origin,
                source: 'PROACTIVE_PROMPT',
                detectedAt: new Date().toISOString()
            };

            try {
                chrome.runtime.sendMessage({
                    type: 'SAVE_FROM_PROMPT',
                    data: cleanData
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn('Save message failed:', chrome.runtime.lastError.message);
                    }
                });
            } catch (error) {
                console.warn('Failed to send save message:', error);
            }

            // Visual feedback
            saveBtn.textContent = '✓ Saved!';
            saveBtn.style.background = 'linear-gradient(135deg, #059669 0%, #10B981 100%)';

            setTimeout(() => removePrompt(), 1500);
        });
    }

    // Dismiss button
    const dismissBtn = document.getElementById('sd-prompt-dismiss');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', removePrompt);
    }

    // "Not a subscription" button — block this domain
    const blockBtn = document.getElementById('sd-prompt-block');
    if (blockBtn) {
        blockBtn.addEventListener('click', () => {
            const domain = window.location.hostname;
            dismissedDomains.add(domain);

            // Persist to storage
            try {
                chrome.storage.local.set({
                    dismissedDomains: Array.from(dismissedDomains)
                });
            } catch { /* Ignore */ }

            removePrompt();
        });
    }
}

// ─── Message Listener ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Triggered by observer.js via background relay or directly
    if (message.type === 'SHOW_SUBSCRIPTION_PROMPT') {
        showPrompt(message.data);
    }
});

// Also listen for the SUBSCRIPTION_PROMPT_READY from observer (same content script context)
// Since observer.js and subscriptionPrompt.js run in the same content script scope,
// we can use a custom event for in-page communication
window.addEventListener('subdupes-prompt-ready', (e) => {
    if (e.detail) {
        showPrompt(e.detail);
    }
});
