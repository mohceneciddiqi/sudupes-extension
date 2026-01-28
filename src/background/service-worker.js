import { api } from '../services/api.js';

console.log('SubDupes Background Service Worker Loaded');

// Cache for active subscriptions
let subscriptionCache = [];

// Sync on startup/alarm
async function syncSubscriptions() {
    try {
        const [subs, profile] = await Promise.all([
            api.getSubscriptions(),
            api.getUserProfile()
        ]);

        subscriptionCache = subs;

        // Batch save to storage
        await chrome.storage.local.set({
            subscriptions: subs,
            userProfile: profile
        });

        console.log('Synced:', { subs: subs.length, user: profile?.email });
    } catch (err) {
        console.warn('Sync failed (likely not logged in):', err?.message || err);
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

    const draft = {
        name: (tab.title || '').split(/[-|]/)[0].trim(),
        notes: info.selectionText,
        websiteUrl: tab.url,
        source: 'CONTEXT_MENU'
    };

    chrome.storage.local.set({ detectedDraft: draft }, () => {
        // Notify user visually
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => alert('Selection saved to SubDupes draft! Open extension to review.')
        });

        // Set badge
        chrome.action.setBadgeText({ text: '!', tabId: tab.id });
    });
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

    try {
        const currentHost = new URL(url).hostname;

        const match = subscriptionCache.find((sub) => {
            if (!sub.websiteUrl) return false;

            try {
                // Robust normalization: Handle "figma.com/pricing", "http://figma.com", etc.
                let normalizedUrl = sub.websiteUrl;
                if (!normalizedUrl.startsWith('http')) normalizedUrl = 'https://' + normalizedUrl;

                const subHost = new URL(normalizedUrl).hostname.toLowerCase().replace(/^www\./, '');
                const host = currentHost.toLowerCase().replace(/^www\./, '');

                // Strict match OR subdomain match
                return host === subHost || host.endsWith('.' + subHost) || subHost.endsWith('.' + host);
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
    } catch {
        // Invalid URL
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

        chrome.storage.local.set({ detectedDraft: message.data }, () => {
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
});