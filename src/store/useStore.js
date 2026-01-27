import { create } from 'zustand'

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
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.remove('detectedDraft');
        }
    },

    view: 'auth', // 'auth' | 'dashboard' | 'add-draft'
    setView: (view) => set({ view }),

    // Hydrate from chrome.storage
    checkStorage: () => {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(['detectedDraft'], (result) => {
                    if (result.detectedDraft) {
                        set({ draft: result.detectedDraft, view: 'add-draft' })
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                });
            } else {
                resolve(false);
            }
        });
    }
}))

export default useStore
