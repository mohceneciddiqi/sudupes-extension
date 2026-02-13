import { create } from 'zustand'
import { VIEWS } from '../constants'

const useStore = create((set) => ({
    user: null,
    setUser: (user) => set({ user }),

    draft: null,
    setDraft: (draft) => set({ draft }),
    updateDraft: (fields) => set((state) => ({
        draft: { ...state.draft, ...fields }
    })),
    clearDraft: () => {
        set({ draft: null });
        if (typeof chrome !== 'undefined' && chrome.tabs) {
            // Clear badge on ALL tabs, not just current window
            chrome.tabs.query({}, (allTabs) => {
                // Clear storage once
                chrome.runtime.sendMessage({ type: 'CMD_DRAFT_CONSUMED' });

                // Clear badges on all tabs that might have draft indicator
                allTabs.forEach(tab => {
                    if (tab.id) {
                        chrome.action.setBadgeText({ text: '', tabId: tab.id }).catch(() => {
                            // Tab might have been closed, ignore error
                        });
                    }
                });
            });
        }
    },

    view: VIEWS.AUTH,
    setView: (view) => set({ view }),

    // Hydrate from chrome.storage
    checkStorage: () => {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(['detectedDraft', 'subscriptions'], (result) => {
                    if (result.subscriptions) {
                        set({ subscriptions: result.subscriptions });
                    }
                    if (result.detectedDraft) {
                        set({ draft: result.detectedDraft, view: VIEWS.ADD_DRAFT })
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                });
            } else {
                resolve(false);
            }
        });
    },

    subscriptions: [],
    setSubscriptions: (subscriptions) => set({ subscriptions }),
}))

export default useStore
