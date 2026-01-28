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
        console.warn('Sync failed (likely not logged in):', err.message);
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
});

chrome.alarms.create('dailySync', { periodInMinutes: 1440 });

// Handle Context Menu Click
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'save-to-subdupes') {
        const draft = {
            name: tab.title.split(/[-|]/)[0].trim(), // Simple heuristic
            notes: info.selectionText,
            websiteUrl: tab.url,
            source: 'CONTEXT_MENU'
        };

        // Save to storage and open popup (requiring user action usually, asking to open side panel or just badge)
        chrome.storage.local.set({ detectedDraft: draft }, () => {
            // Notify user visually
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => alert('Selection saved to SubDupes draft! Open extension to review.')
            });
            // Set badge
            chrome.action.setBadgeText({ text: '!', tabId: tab.id });
        });
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'dailySync') syncSubscriptions();
});

// URL Watcher for Price Hike / Already Subscribed Check
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        checkUrlMatch(tabId, tab.url);
    }
});

async function checkUrlMatch(tabId, url) {
    // Hydrate if empty (Service Worker woke up)
    if (!subscriptionCache.length) {
        const result = await chrome.storage.local.get(['subscriptions']);
        if (result.subscriptions) {
            subscriptionCache = result.subscriptions;
        }
    }

    if (!subscriptionCache.length) return;

    try {
        const currentHost = new URL(url).hostname;

        const match = subscriptionCache.find(sub => {
            if (!sub.websiteUrl) return false;

            try {
                // Normalize cleaning
                const subHost = (sub.websiteUrl.startsWith('http')
                    ? new URL(sub.websiteUrl).hostname
                    : sub.websiteUrl).toLowerCase().replace(/^www\./, '');

                const host = currentHost.toLowerCase().replace(/^www\./, '');

                // Strict Match OR Subdomain Match (e.g. app.figma.com ends with figma.com)
                // We add a dot to ensure we don't match "ample.com" with "example.com"
                return host === subHost ||
                    host.endsWith('.' + subHost) ||
                    subHost.endsWith('.' + host);
            } catch (e) {
                return false;
            }
        });

        if (match) {
            console.log('URL Match found:', match.name);

            // Inject "Insight UI" or set badge
            chrome.action.setBadgeText({ text: '✔', tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#10B981', tabId }); // Green for "You have this"
        }
    } catch (e) {
        // Invalid URL
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_USER_BCC') {
        // Retrieve from storage or api
        chrome.storage.local.get(['userProfile'], (result) => {
            sendResponse({ bccEmail: result.userProfile?.bccEmail });
        });
        return true; // Async response
    }

    if (message.type === 'SUBSCRIPTION_DETECTED') {
        console.log('Background received subscription:', message.data);

        // Save to local storage so popup can pick it up
        chrome.storage.local.set({ detectedDraft: message.data }, () => {
            console.log('Draft saved to storage');

            // Optional: Set badge to indicate something was found
            if (sender.tab) {
                chrome.action.setBadgeText({ text: '!', tabId: sender.tab.id });
                chrome.action.setBadgeBackgroundColor({ color: '#2563EB', tabId: sender.tab.id });
            }
        });
    }

    if (message.type === 'CMD_SYNC_NOW' || message.type === 'CMD_SYNC_ON_CONNECT') {
        syncSubscriptions().then(() => {
            console.log('Sync complete');
        });
    }
});
