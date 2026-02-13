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

// Sync on startup/alarm
async function syncSubscriptions() {
    try {
        // Add 10 second timeout to API calls
        const [subs, profile] = await withTimeout(
            Promise.all([
                api.getSubscriptions(),
                api.getUserProfile()
            ]),
            10000 // 10 second timeout
        );

        subscriptionCache = subs;

        // Batch save to storage
        await chrome.storage.local.set({
            subscriptions: subs,
            userProfile: profile
        });

        console.log('Synced:', { subs: subs.length, user: profile?.email });
    } catch (err) {
        console.warn('Sync failed (likely not logged in or timeout):', err?.message || err);
    }
}

// Initial sync
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

    // Ensure alarm exists (onInstalled is a good place for this)
    chrome.alarms.create('dailySync', { periodInMinutes: 1440 });
});

// If you also want it recreated when SW wakes without install, keep it here too,
// but it is not required.
// chrome.alarms.create('dailySync', { periodInMinutes: 1440 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'dailySync') syncSubscriptions();
});

// Handle Context Menu Click
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'save-to-subdupes') return;
    if (!tab?.id) return;

    // Validate URL - only allow HTTP(S) URLs
    let validUrl = tab.url;
    if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
        // For non-HTTP URLs, show error
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

    // Check for existing draft before overwriting
    chrome.storage.local.get(['detectedDraft'], (result) => {
        if (result.detectedDraft) {
            // Existing draft found - ask user before overwriting
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => confirm('A draft already exists. Replace it with this selection?')
            }, (results) => {
                if (results && results[0] && results[0].result === true) {
                    // User confirmed - save the new draft
                    saveDraft(draft, tab.id);
                } else {
                    console.log('User cancelled draft replacement');
                }
            });
        } else {
            // No existing draft - save directly
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

            // Notify user visually
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => alert('Selection saved to SubDupes draft! Open extension to review.')
            });

            // Set badge
            chrome.action.setBadgeText({ text: '!', tabId: tabId });
        });
    }
});

// URL Watcher for Price Hike / Already Subscribed Check
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab?.url) {
        checkUrlMatch(tabId, tab.url);
    }
});

async function checkUrlMatch(tabId, url) {
    // Hydrate if empty (Service Worker woke up)
    if (!subscriptionCache.length) {
        const result = await chrome.storage.local.get(['subscriptions']);
        if (result.subscriptions) subscriptionCache = result.subscriptions;
    }

    if (!subscriptionCache.length) return;

    // Filter out non-HTTP(S) URLs early
    if (!url || !url.startsWith('http://') && !url.startsWith('https://')) {
        // Clear badge for chrome://, about:, file://, data:, etc.
        chrome.action.setBadgeText({ text: '', tabId });
        return;
    }

    try {
        const urlObj = new URL(url);
        const currentHost = urlObj.hostname.toLowerCase().replace(/^www\./, '');

        // Skip localhost and internal IPs
        if (currentHost === 'localhost' || currentHost.startsWith('127.') || currentHost.startsWith('192.168.') || currentHost.startsWith('10.')) {
            chrome.action.setBadgeText({ text: '', tabId });
            return;
        }

        const match = subscriptionCache.find((sub) => {
            if (!sub.websiteUrl) return false;

            try {
                // Robust normalization: Handle "figma.com/pricing", "http://figma.com", etc.
                let normalizedUrl = sub.websiteUrl.trim();

                // Skip invalid or non-HTTP URLs in stored subscriptions
                if (!normalizedUrl || normalizedUrl.startsWith('chrome://') || normalizedUrl.startsWith('about:') || normalizedUrl.startsWith('file://')) {
                    return false;
                }

                // If it looks like a domain without protocol, prepend it
                if (!normalizedUrl.startsWith('http')) {
                    normalizedUrl = 'https://' + normalizedUrl;
                }

                const subUrlObj = new URL(normalizedUrl);
                const subHost = subUrlObj.hostname.toLowerCase().replace(/^www\./, '');

                // 1. Exact Host Match
                if (currentHost === subHost) return true;

                // 2. Subdomain Match (e.g. app.figma.com matches figma.com)
                if (currentHost.endsWith('.' + subHost)) return true;

                // 3. Reverse Subdomain (e.g. figma.com matches www.figma.com if stored incorrectly)
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
        } else {
            // Clear badge if no match (fix for persistent badge on navigation)
            chrome.action.setBadgeText({ text: '', tabId });
        }
    } catch (error) {
        // Invalid URL - clear badge
        console.warn('Invalid URL in checkUrlMatch:', url, error);
        chrome.action.setBadgeText({ text: '', tabId });
    }
}

// IMPORTANT: Message listener must be registered once at top level
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'GET_USER_BCC') {
        chrome.storage.local.get(['userProfile'], (result) => {
            sendResponse({ bccEmail: result.userProfile?.bccEmail });
        });
        return true; // async response
    }

    if (message?.type === 'SUBSCRIPTION_DETECTED') {
        console.log('Background received subscription:', message.data);

        // Standardize Data: Ensure amount is a number for consistent storage
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

        return; // no sendResponse needed
    }

    if (message?.type === 'CMD_SYNC_NOW' || message?.type === 'CMD_SYNC_ON_CONNECT') {
        syncSubscriptions().then(() => console.log('Sync complete'));
        return;
    }

    if (message?.type === 'CMD_DRAFT_CONSUMED') {
        // 1. Clear Storage
        chrome.storage.local.remove('detectedDraft');

        // 2. Clear Badge (if tabId provided)
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
});