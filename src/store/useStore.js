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
            // clear badge on active tab
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    // Send signal to background to clear storage AND badge
                    chrome.runtime.sendMessage({ type: 'CMD_DRAFT_CONSUMED', tabId: tabs[0].id });
                } else {
                    // If no active tab (unlikely in popup), just clear storage
                    chrome.runtime.sendMessage({ type: 'CMD_DRAFT_CONSUMED' });
                }
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
