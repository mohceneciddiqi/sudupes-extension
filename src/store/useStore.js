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
            // Clear storage
            chrome.runtime.sendMessage({ type: 'CMD_DRAFT_CONSUMED' });

            // Only clear badge on the active tab to preserve ✔ badges on other tabs
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.action.setBadgeText({ text: '', tabId: tabs[0].id }).catch(() => { });
                }
            });
        }
    },

    view: VIEWS.AUTH,
    setView: (view) => set({ view }),

    // Pending subscriptions (offline saves)
    pendingSubscriptions: [],
    setPendingSubscriptions: (pendingSubscriptions) => set({ pendingSubscriptions }),
    addPendingSubscription: (sub) => set((state) => {
        const updated = [...state.pendingSubscriptions, sub];
        // Persist to chrome.storage.local
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({ pendingSubscriptions: updated });
        }
        return { pendingSubscriptions: updated };
    }),
    clearPendingSubscriptions: () => {
        set({ pendingSubscriptions: [] });
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.remove('pendingSubscriptions');
        }
    },

    // Sync conflicts (duplicates found during login sync)
    syncConflicts: [],
    setSyncConflicts: (syncConflicts) => set({ syncConflicts }),
    clearSyncConflicts: () => {
        set({ syncConflicts: [] });
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.remove('syncConflicts');
        }
    },
    resolveConflict: (index) => set((state) => {
        const updated = state.syncConflicts.filter((_, i) => i !== index);
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({ syncConflicts: updated });
        }
        return { syncConflicts: updated };
    }),

    // Hydrate from chrome.storage
    checkStorage: () => {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get([
                    'detectedDraft',
                    'subscriptions',
                    'pendingSubscriptions',
                    'syncConflicts'
                ], (result) => {
                    if (result.subscriptions) {
                        set({ subscriptions: result.subscriptions });
                    }
                    if (result.pendingSubscriptions?.length > 0) {
                        set({ pendingSubscriptions: result.pendingSubscriptions });
                    }
                    if (result.syncConflicts?.length > 0) {
                        set({ syncConflicts: result.syncConflicts });
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
