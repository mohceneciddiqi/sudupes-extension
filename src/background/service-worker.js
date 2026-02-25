import { api } from '../services/api.js';

console.log('SubDupes Background Service Worker Loaded');

// Cache for active subscriptions
let subscriptionCache = [];

// Helper to add timeout to promises
function withTimeout(promise, timeoutMs = 10000) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
        )
    ]);
}

// ─── Sync Subscriptions ────────────────────────────────────────────────────

async function syncSubscriptions() {
    try {
        const [subs, profile] = await withTimeout(
            Promise.all([
                api.getSubscriptions(),
                api.getUserProfile()
            ]),
            10000
        );

        subscriptionCache = subs;

        await chrome.storage.local.set({
            subscriptions: subs,
            userProfile: profile
        });

        console.log('Synced:', { subs: subs.length, user: profile?.email });

        // If user is authenticated and has pending subscriptions, sync them
        if (profile?.email) {
            await syncPendingSubscriptions();
        }
    } catch (err) {
        console.warn('Sync failed (likely not logged in or timeout):', err?.message || err);
    }
}

// ─── Pending Subscriptions Sync (Offline → Server) ─────────────────────────

async function syncPendingSubscriptions() {
    const result = await chrome.storage.local.get(['pendingSubscriptions']);
    const pending = result.pendingSubscriptions || [];

    if (pending.length === 0) return { synced: 0, conflicts: [] };

    console.log(`Syncing ${pending.length} pending subscription(s)...`);

    // Hydrate subscription cache if empty
    if (!subscriptionCache.length) {
        const cached = await chrome.storage.local.get(['subscriptions']);
        if (cached.subscriptions) subscriptionCache = cached.subscriptions;
    }

    const synced = [];
    const conflicts = [];
    const failed = [];

    for (const pendingSub of pending) {
        // Check for duplicates against existing subscriptions
        const duplicate = findDuplicate(pendingSub, subscriptionCache);

        if (duplicate) {
            conflicts.push({
                pending: pendingSub,
                existing: duplicate,
                resolvedAction: null // Will be set by user
            });
        } else {
            // No duplicate — try to create via API
            try {
                const created = await api.createSubscription({
                    name: pendingSub.name,
                    amount: parseFloat(pendingSub.amount) || 0,
                    currency: pendingSub.currency || 'USD',
                    billingCycle: pendingSub.billingCycle || 'MONTHLY',
                    websiteUrl: pendingSub.websiteUrl || '',
                    nextBillingDate: calculateNextDate(pendingSub.billingCycle || 'MONTHLY'),
                    notes: pendingSub.planName ? `Plan: ${pendingSub.planName}` : '',
                    source: pendingSub.source || 'OFFLINE_SAVE'
                });

                synced.push(created);
                // Add to cache so subsequent checks see it
                subscriptionCache.push(created);
            } catch (err) {
                console.error('Failed to sync pending subscription:', pendingSub.name, err);
                failed.push(pendingSub);
            }
        }
    }

    // Update storage
    if (failed.length > 0) {
        // Keep only failed ones in pending
        await chrome.storage.local.set({ pendingSubscriptions: failed });
    } else {
        await chrome.storage.local.remove('pendingSubscriptions');
    }

    if (conflicts.length > 0) {
        await chrome.storage.local.set({ syncConflicts: conflicts });
        console.log(`Found ${conflicts.length} conflict(s) to resolve.`);
    }

    if (synced.length > 0) {
        // Refresh subscription cache from server
        try {
            const freshSubs = await api.getSubscriptions();
            subscriptionCache = freshSubs;
            await chrome.storage.local.set({ subscriptions: freshSubs });
        } catch { /* Non-critical */ }
    }

    console.log('Pending sync complete:', { synced: synced.length, conflicts: conflicts.length, failed: failed.length });
    return { synced: synced.length, conflicts };
}

// ─── Duplicate Detection ───────────────────────────────────────────────────

function findDuplicate(pendingSub, existingList) {
    const normalizeHost = (url) => {
        if (!url) return '';
        try {
            let safeUrl = url.trim();
            if (!safeUrl.startsWith('http')) safeUrl = 'https://' + safeUrl;
            return new URL(safeUrl).hostname.toLowerCase().replace(/^www\./, '');
        } catch { return ''; }
    };

    const pendingHost = normalizeHost(pendingSub.websiteUrl);
    const pendingAmount = parseFloat(pendingSub.amount) || 0;
    const pendingName = (pendingSub.name || '').toLowerCase().trim();

    for (const existing of existingList) {
        const existingHost = normalizeHost(existing.websiteUrl);
        const existingAmount = parseFloat(existing.amount) || 0;
        const existingName = (existing.name || '').toLowerCase().trim();

        // Match 1: Same host AND similar amount (within 10%)
        if (pendingHost && existingHost && pendingHost === existingHost) {
            if (pendingAmount === 0 || existingAmount === 0) {
                return existing; // Can't compare amounts, but host matches
            }
            const diff = Math.abs(pendingAmount - existingAmount);
            const threshold = Math.max(pendingAmount, existingAmount) * 0.1;
            if (diff <= threshold) {
                return existing;
            }
        }

        // Match 2: Same name AND same host
        if (pendingName && existingName && pendingName === existingName && pendingHost === existingHost) {
            return existing;
        }

        // Match 3: Same name AND similar amount (no host match but clear duplicate)
        if (pendingName && existingName && pendingName === existingName) {
            if (pendingAmount > 0 && existingAmount > 0) {
                const diff = Math.abs(pendingAmount - existingAmount);
                const threshold = Math.max(pendingAmount, existingAmount) * 0.1;
                if (diff <= threshold) {
                    return existing;
                }
            }
        }
    }

    return null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function calculateNextDate(cycle) {
    const now = new Date();
    const next = new Date(now);
    if (cycle === 'WEEKLY') {
        next.setDate(now.getDate() + 7);
    } else if (cycle === 'YEARLY') {
        next.setFullYear(now.getFullYear() + 1);
    } else {
        const d = next.getDate();
        next.setMonth(next.getMonth() + 1);
        if (next.getDate() !== d) next.setDate(0);
    }
    next.setHours(12, 0, 0, 0);
    return next.toISOString();
}

// ─── Lifecycle Events ──────────────────────────────────────────────────────

chrome.runtime.onStartup.addListener(syncSubscriptions);

chrome.runtime.onInstalled.addListener(() => {
    syncSubscriptions();

    // Create Context Menu (prevent duplicates)
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'save-to-subdupes',
            title: 'Save to SubDupes',
            contexts: ['selection']
        });
    });

    chrome.alarms.create('dailySync', { periodInMinutes: 1440 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'dailySync') {
        console.log('Performing daily background sync...');
        syncSubscriptions();
        checkUpcomingRenewals();
    }
});

// ─── Context Menu ──────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'save-to-subdupes') return;
    if (!tab?.id) return;

    // Validate URL
    let validUrl = tab.url;
    if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => alert('Cannot save from this page. Please use on regular web pages.')
        });
        return;
    }

    const draft = {
        name: (tab.title || '').split(/[-|]/)[0].trim(),
        notes: info.selectionText,
        websiteUrl: validUrl,
        source: 'CONTEXT_MENU'
    };

    chrome.storage.local.get(['detectedDraft'], (result) => {
        if (result.detectedDraft) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => confirm('A draft already exists. Replace it with this selection?')
            }, (results) => {
                if (results && results[0] && results[0].result === true) {
                    saveDraft(draft, tab.id);
                } else {
                    console.log('User cancelled draft replacement');
                }
            });
        } else {
            saveDraft(draft, tab.id);
        }
    });

    function saveDraft(draftData, tabId) {
        chrome.storage.local.set({ detectedDraft: draftData }, () => {
            if (chrome.runtime.lastError) {
                console.error('Failed to save draft:', chrome.runtime.lastError);
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: () => alert('Failed to save draft. Please try again.')
                });
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => alert('Selection saved to SubDupes draft! Open extension to review.')
            });

            chrome.action.setBadgeText({ text: '!', tabId: tabId });
        });
    }
});

// ─── Help Helpers ──────────────────────────────────────────────────────────

async function trackLastVisited(subId) {
    if (!subId) return;
    chrome.storage.local.get(['lastVisited'], (result) => {
        const lastVisited = result.lastVisited || {};
        lastVisited[subId] = new Date().toISOString();
        chrome.storage.local.set({ lastVisited });
    });
}

function checkUpcomingRenewals() {
    chrome.storage.local.get(['subscriptions', 'userProfile'], (result) => {
        const subs = result.subscriptions || [];
        if (!subs.length) return;

        const now = new Date();
        const notifyThresholds = [1, 3, 7]; // Days ahead to notify

        subs.forEach(sub => {
            const checkDate = sub.trialEndDate ? new Date(sub.trialEndDate) : (sub.nextBillingDate ? new Date(sub.nextBillingDate) : null);
            if (!checkDate || isNaN(checkDate.getTime())) return;

            const diffTime = checkDate - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (notifyThresholds.includes(diffDays)) {
                const type = sub.trialEndDate ? 'Trial Expiring' : 'Renewal Upcoming';
                chrome.notifications.create(`renew-${sub.id || sub._id}-${diffDays}`, {
                    type: 'basic',
                    iconUrl: '/icons/icon128.png',
                    title: `SubDupes: ${type}`,
                    message: `${sub.name} ${type.toLowerCase()} in ${diffDays} day${diffDays === 1 ? '' : 's'}. (${sub.currency} ${sub.amount})`,
                    priority: 2
                });
            }
        });
    });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab?.url) {
        checkUrlMatch(tabId, tab.url);
    }
});

async function checkUrlMatch(tabId, url) {
    if (!subscriptionCache.length) {
        const result = await chrome.storage.local.get(['subscriptions']);
        if (result.subscriptions) subscriptionCache = result.subscriptions;
    }

    if (!subscriptionCache.length) return;

    if (!url || !url.startsWith('http://') && !url.startsWith('https://')) {
        chrome.action.setBadgeText({ text: '', tabId });
        return;
    }

    try {
        const urlObj = new URL(url);
        const currentHost = urlObj.hostname.toLowerCase().replace(/^www\./, '');

        if (currentHost === 'localhost' || currentHost.startsWith('127.') || currentHost.startsWith('192.168.') || currentHost.startsWith('10.')) {
            chrome.action.setBadgeText({ text: '', tabId });
            return;
        }

        const match = subscriptionCache.find((sub) => {
            if (!sub.websiteUrl) return false;

            try {
                let normalizedUrl = sub.websiteUrl.trim();
                if (!normalizedUrl || normalizedUrl.startsWith('chrome://') || normalizedUrl.startsWith('about:') || normalizedUrl.startsWith('file://')) {
                    return false;
                }
                if (!normalizedUrl.startsWith('http')) {
                    normalizedUrl = 'https://' + normalizedUrl;
                }

                const subUrlObj = new URL(normalizedUrl);
                const subHost = subUrlObj.hostname.toLowerCase().replace(/^www\./, '');

                if (currentHost === subHost) return true;
                if (currentHost.endsWith('.' + subHost)) return true;
                if (subHost.endsWith('.' + currentHost)) return true;

                return false;
            } catch {
                return false;
            }
        });

        if (match) {
            console.log('URL Match found:', match.name);
            chrome.action.setBadgeText({ text: '✔', tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#10B981', tabId });

            // Record visit for unused subscription detection
            trackLastVisited(match.id || match._id);

            // Price hike detection: ask the content script to compare
            // the current page's detected price against the stored amount
            try {
                chrome.tabs.sendMessage(tabId, {
                    type: 'DETECT_PRICE_HIKE',
                    data: {
                        storedAmount: parseFloat(match.amount) || 0,
                        storedCurrency: match.currency || 'USD',
                        subscriptionName: match.name
                    }
                }).catch(() => { /* Content script may not be ready */ });
            } catch { /* Ignore */ }

            // Feature 6: Smart "Already Subscribed" Toast (with 24h cooldown)
            chrome.storage.local.get(['toastCooldowns'], (result) => {
                const cooldowns = result.toastCooldowns || {};
                const now = Date.now();
                const lastShow = cooldowns[match.websiteUrl] || 0;

                if (now - lastShow > 24 * 60 * 60 * 1000) {
                    chrome.tabs.sendMessage(tabId, {
                        type: 'SHOW_ALREADY_SUBSCRIBED_TOAST',
                        data: {
                            id: match.id || match._id || null,
                            name: match.name,
                            storedAmount: match.amount,
                            storedCurrency: match.currency,
                            billingCycle: match.billingCycle || 'MONTHLY',
                            websiteUrl: match.websiteUrl
                        }
                    }).then(() => {
                        // Update cooldown only on success
                        cooldowns[match.websiteUrl] = now;
                        chrome.storage.local.set({ toastCooldowns: cooldowns });
                    }).catch(() => { });
                }
            });
        } else {
            chrome.action.setBadgeText({ text: '', tabId });
        }
    } catch (error) {
        console.warn('Invalid URL in checkUrlMatch:', url, error);
        chrome.action.setBadgeText({ text: '', tabId });
    }
}

// ─── Message Handler ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'GET_USER_BCC') {
        chrome.storage.local.get(['userProfile'], (result) => {
            sendResponse({ bccEmail: result.userProfile?.bccEmail });
        });
        return true; // async response
    }

    if (message?.type === 'SUBSCRIPTION_DETECTED') {
        console.log('Background received subscription:', message.data);

        const cleanDraft = {
            ...message.data,
            amount: parseFloat(message.data.amount) || null
        };

        chrome.storage.local.set({ detectedDraft: cleanDraft }, () => {
            if (chrome.runtime.lastError) {
                console.error('Failed to save detected draft:', chrome.runtime.lastError);
                return;
            }

            console.log('Draft saved to storage');

            if (sender?.tab?.id) {
                chrome.action.setBadgeText({ text: '!', tabId: sender.tab.id });
                chrome.action.setBadgeBackgroundColor({ color: '#2563EB', tabId: sender.tab.id });
            }
        });
        return;
    }

    // Proactive prompt: relay to content script to show the toast
    if (message?.type === 'SUBSCRIPTION_PROMPT_READY') {
        if (sender?.tab?.id) {
            // Check if domain is dismissed
            chrome.storage.local.get(['dismissedDomains'], (result) => {
                const dismissed = result.dismissedDomains || [];
                try {
                    const host = new URL(message.data.websiteUrl || '').hostname;
                    if (dismissed.includes(host)) return;
                } catch { /* Continue */ }

                // Relay to contentscript (subscriptionPrompt.js)
                chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'SHOW_SUBSCRIPTION_PROMPT',
                    data: message.data
                }).catch(() => {
                    // Content script not ready — ignore
                });
            });
        }
        return;
    }

    // Save from proactive prompt (could be offline or online)
    if (message?.type === 'SAVE_FROM_PROMPT') {
        handlePromptSave(message.data, sender?.tab?.id);
        return;
    }

    // Explicit offline save from popup
    if (message?.type === 'SAVE_OFFLINE') {
        savePendingSubscription(message.data, sender?.tab?.id);
        sendResponse({ success: true });
        return;
    }

    // Sync pending subscriptions manually
    if (message?.type === 'SYNC_PENDING') {
        syncPendingSubscriptions().then((result) => {
            sendResponse(result);
        }).catch((err) => {
            sendResponse({ error: err.message });
        });
        return true; // async
    }

    // Get pending count
    if (message?.type === 'GET_PENDING_COUNT') {
        chrome.storage.local.get(['pendingSubscriptions'], (result) => {
            sendResponse({ count: (result.pendingSubscriptions || []).length });
        });
        return true;
    }

    // Conflict resolution actions
    if (message?.type === 'RESOLVE_CONFLICT') {
        handleConflictResolution(message.data).then((result) => {
            sendResponse(result);
        }).catch((err) => {
            sendResponse({ error: err.message });
        });
        return true;
    }

    if (message?.type === 'CMD_SYNC_NOW' || message?.type === 'CMD_SYNC_ON_CONNECT') {
        syncSubscriptions().then(() => console.log('Sync complete'));
        return;
    }

    if (message?.type === 'CMD_DRAFT_CONSUMED') {
        chrome.storage.local.remove('detectedDraft');
        if (message.tabId) {
            chrome.action.setBadgeText({ text: '', tabId: message.tabId });
        }
        return;
    }

    if (message?.type === 'CMD_CLEAR_BADGE') {
        if (message.tabId) {
            chrome.action.setBadgeText({ text: '', tabId: message.tabId });
        }
        return;
    }

    // Feature 5: Relay Gmail receipt import prompt
    if (message?.type === 'RECEIPT_DETECTED') {
        if (sender?.tab?.id) {
            chrome.tabs.sendMessage(sender.tab.id, {
                type: 'SHOW_RECEIPT_IMPORT_PROMPT',
                data: message.data
            }).catch(() => { });
        }
        return;
    }

    // Feature 6: Open popup or invite user
    if (message?.type === 'OPEN_POPUP') {
        // Note: Chrome doesn't allow programmatically opening the popup itself.
        // We set the badge to '!' to invite the user.
        if (sender?.tab?.id) {
            chrome.action.setBadgeText({ text: '!', tabId: sender.tab.id });
            chrome.action.setBadgeBackgroundColor({ color: '#10B981', tabId: sender.tab.id });
        }
        return;
    }
});

// ─── Prompt Save Handler ───────────────────────────────────────────────────

async function handlePromptSave(data, tabId) {
    // Try to save via API first (if user is logged in)
    try {
        const token = await getAuthTokenQuick();
        if (token) {
            // User is logged in — create subscription directly via API
            try {
                await api.createSubscription({
                    name: data.name || 'Unknown',
                    amount: parseFloat(data.amount) || 0,
                    currency: data.currency || 'USD',
                    billingCycle: data.billingCycle || 'MONTHLY',
                    websiteUrl: data.websiteUrl || '',
                    nextBillingDate: calculateNextDate(data.billingCycle || 'MONTHLY'),
                    notes: data.planName ? `Plan: ${data.planName}` : '',
                    source: data.source || 'PROACTIVE_PROMPT'
                });

                // Refresh cache after successful save
                try {
                    const freshSubs = await api.getSubscriptions();
                    subscriptionCache = freshSubs;
                    await chrome.storage.local.set({ subscriptions: freshSubs });
                } catch { /* Non-critical */ }

                if (tabId) {
                    chrome.action.setBadgeText({ text: '\u2714', tabId });
                    chrome.action.setBadgeBackgroundColor({ color: '#10B981', tabId });
                }
                return;
            } catch (apiErr) {
                console.error('API save failed, falling back to draft:', apiErr);
                // Fall through to draft save as fallback
                const cleanDraft = { ...data, amount: parseFloat(data.amount) || null };
                chrome.storage.local.set({ detectedDraft: cleanDraft });
                if (tabId) {
                    chrome.action.setBadgeText({ text: '!', tabId });
                    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B', tabId });
                }
                return;
            }
        }
    } catch { /* Not logged in */ }

    // User not logged in — save offline
    savePendingSubscription(data, tabId);
}

async function getAuthTokenQuick() {
    return new Promise((resolve) => {
        try {
            const configUrl = 'https://app.subdupes.com'; // Production cookie URL
            chrome.cookies.getAll({ url: configUrl }, (cookies) => {
                if (chrome.runtime.lastError) { resolve(null); return; }
                const sessionCookie = cookies?.find(c => c.name === 'session_token');
                resolve(sessionCookie?.value || null);
            });
        } catch { resolve(null); }
    });
}

function savePendingSubscription(data, tabId) {
    chrome.storage.local.get(['pendingSubscriptions'], (result) => {
        const pending = result.pendingSubscriptions || [];

        const newEntry = {
            id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: data.name || 'Unknown',
            planName: data.planName || '',
            amount: parseFloat(data.amount) || 0,
            currency: data.currency || 'USD',
            billingCycle: data.billingCycle || 'MONTHLY',
            websiteUrl: data.websiteUrl || '',
            source: data.source || 'OFFLINE_SAVE',
            savedAt: new Date().toISOString()
        };

        pending.push(newEntry);

        chrome.storage.local.set({ pendingSubscriptions: pending }, () => {
            if (chrome.runtime.lastError) {
                console.error('Failed to save pending subscription:', chrome.runtime.lastError);
                return;
            }
            console.log('Saved pending subscription:', newEntry.name);

            if (tabId) {
                chrome.action.setBadgeText({ text: `${pending.length}`, tabId });
                chrome.action.setBadgeBackgroundColor({ color: '#F59E0B', tabId });
            }
        });
    });
}

// ─── Conflict Resolution ───────────────────────────────────────────────────

async function handleConflictResolution({ action, pending, existing }) {
    if (action === 'keep_existing') {
        // Discard the pending item — nothing to do on server
        return { success: true };
    }

    if (action === 'keep_both') {
        // Create the pending as a new subscription
        const created = await api.createSubscription({
            name: pending.name,
            amount: parseFloat(pending.amount) || 0,
            currency: pending.currency || 'USD',
            billingCycle: pending.billingCycle || 'MONTHLY',
            websiteUrl: pending.websiteUrl || '',
            nextBillingDate: calculateNextDate(pending.billingCycle || 'MONTHLY'),
            notes: pending.planName ? `Plan: ${pending.planName}` : ''
        });
        return { success: true, created };
    }

    if (action === 'merge') {
        // Update the existing subscription with pending data (where pending has better data)
        // For now, save as draft for user to review in the popup
        const mergedDraft = {
            name: pending.name || existing.name,
            amount: parseFloat(pending.amount) || parseFloat(existing.amount) || 0,
            currency: pending.currency || existing.currency || 'USD',
            billingCycle: pending.billingCycle || existing.billingCycle || 'MONTHLY',
            websiteUrl: pending.websiteUrl || existing.websiteUrl || '',
            source: 'MERGE_RESOLUTION'
        };

        await chrome.storage.local.set({ detectedDraft: mergedDraft });
        return { success: true, merged: true };
    }

    return { success: false, error: 'Unknown action' };
}