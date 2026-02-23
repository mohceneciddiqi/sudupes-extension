import { useState, useEffect } from 'react'
import useStore from './store/useStore'
import AddSubscriptionForm from './components/AddSubscriptionForm'
import SubscriptionList from './components/SubscriptionList'
import SyncConflictResolver from './components/SyncConflictResolver'
import { api } from './services/api'
import { config } from './config'

import { VIEWS } from './constants'

function App() {
  const {
    view, setView, checkStorage, setUser,
    pendingSubscriptions, syncConflicts, user
  } = useStore()
  const [init, setInit] = useState(false)

  const handleSync = async () => {
    try {
      chrome.runtime.sendMessage({ type: 'CMD_SYNC_NOW' });
    } catch (error) {
      console.error('Failed to send sync message:', error);
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'CMD_SCAN_PAGE' });
      } catch {
        console.log('Content script not ready or page not compatible');
      }
    }
  };

  // Initial Auth Check
  useEffect(() => {
    const handleSyncInternal = async () => {
      try {
        chrome.runtime.sendMessage({ type: 'CMD_SYNC_NOW' });
      } catch (error) {
        console.error('Failed to send sync message:', error);
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'CMD_SCAN_PAGE' });
        } catch {
          console.log('Content script not ready or page not compatible');
        }
      }
    };

    const initApp = async () => {
      const currentUser = await api.checkAuth();
      if (currentUser) {
        setUser(currentUser);
        const hasDraft = await checkStorage();

        // Check for sync conflicts first
        const state = useStore.getState();
        if (state.syncConflicts?.length > 0) {
          setView(VIEWS.SYNC_CONFLICTS);
        } else if (!hasDraft) {
          setView(VIEWS.DASHBOARD);
        }
      } else {
        // Not logged in — check if there are pending items or drafts
        await checkStorage();
        const state = useStore.getState();
        if (state.draft) {
          // Has a draft — show the form in offline mode
          setView(VIEWS.ADD_DRAFT);
        } else {
          setView(VIEWS.AUTH);
        }
      }
      setInit(true);
      handleSyncInternal();
    };
    initApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Storage Listener
  useEffect(() => {
    const handleStorageChange = (changes, area) => {
      const currentUser = useStore.getState().user;

      if (area === 'local') {
        // Always listen for pending subscriptions changes (even when not logged in)
        if (changes.pendingSubscriptions) {
          useStore.getState().setPendingSubscriptions(changes.pendingSubscriptions.newValue || []);
        }
        if (changes.syncConflicts) {
          const conflicts = changes.syncConflicts.newValue || [];
          useStore.getState().setSyncConflicts(conflicts);
          // Auto-navigate to conflicts view if new conflicts appear
          if (conflicts.length > 0 && currentUser) {
            useStore.getState().setView(VIEWS.SYNC_CONFLICTS);
          }
        }

        if (currentUser) {
          if (changes.detectedDraft) {
            useStore.getState().checkStorage();
          }
          if (changes.subscriptions) {
            useStore.getState().setSubscriptions(changes.subscriptions.newValue || []);
          }
        } else {
          // Not logged in — still listen for drafts
          if (changes.detectedDraft) {
            useStore.getState().checkStorage();
          }
        }
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  if (!init) return <div className="flex items-center justify-center h-full">Loading...</div>

  // ─── Auth View (Not Logged In, No Draft) ─────────────────────────────────

  if (view === VIEWS.AUTH) {
    const hasPending = pendingSubscriptions.length > 0;

    return (
      <div className="flex flex-col items-center justify-center h-full p-6 bg-white text-center">
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          {hasPending ? 'Subscriptions Saved!' : 'Login Required'}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {hasPending
            ? `You have ${pendingSubscriptions.length} subscription${pendingSubscriptions.length !== 1 ? 's' : ''} saved locally. Log in to sync them.`
            : 'Please log in to your SubDupes account to sync your subscriptions.'
          }
        </p>

        {/* Pending Subscriptions Preview */}
        {hasPending && (
          <div className="w-full mb-4 max-h-32 overflow-y-auto">
            {pendingSubscriptions.map((sub, i) => (
              <div key={sub.id || i} className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2 mb-1 border border-amber-100">
                <div className="text-left">
                  <div className="text-xs font-semibold text-gray-700">{sub.name}</div>
                  <div className="text-[10px] text-gray-400">{sub.websiteUrl}</div>
                </div>
                <div className="text-xs font-bold text-amber-600">
                  {({ USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥', PKR: 'Rs', AED: 'AED ', SAR: 'SAR ', BDT: 'BDT ', BRL: 'R$', TRY: '₺', AUD: 'A$', CAD: 'C$' })[sub.currency] || (sub.currency ? sub.currency + ' ' : '$')}
                  {parseFloat(sub.amount || 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => {
            chrome.tabs.create({ url: `${config.FRONTEND_URL}/login` });
          }}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors mb-2"
        >
          Log In via Web App
        </button>

        {/* Allow adding subscriptions offline */}
        <button
          onClick={() => setView(VIEWS.ADD_DRAFT)}
          className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 font-medium py-2 px-4 rounded-lg text-sm transition-colors mb-4"
        >
          + Save a Subscription Locally
        </button>

        <div className="text-xs text-gray-400">
          {hasPending ? 'Subscriptions will sync automatically after login.' : 'After logging in, reopen this extension.'}
        </div>
      </div>
    )
  }

  // ─── Main Layout ─────────────────────────────────────────────────────────

  const isLoggedIn = !!user;

  return (
    <div className="w-full h-full bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold text-xs">
            S
          </div>
          <h1 className="font-semibold text-gray-800">SubDupes</h1>
          {/* Pending count indicator */}
          {pendingSubscriptions.length > 0 && (
            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {pendingSubscriptions.length} pending
            </span>
          )}
        </div>
        <div className="flex items-center">
          <button
            onClick={handleSync}
            className="text-gray-400 hover:text-blue-600 transition-colors p-1.5 rounded-xl hover:bg-blue-50"
            title="Rescan current page for subscriptions"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-y-auto">
        {view === VIEWS.DASHBOARD && (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-4">
              <h2 className="text-sm font-medium text-gray-500 mb-1">Active Tabs</h2>
              <div className="text-xs text-gray-400">Scanning for subscriptions...</div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setView(VIEWS.ADD_DRAFT)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <span>+ Add Subscription Draft</span>
              </button>
              <button
                onClick={() => setView(VIEWS.ALL_SUBSCRIPTIONS)}
                className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg text-sm transition-colors mb-2"
              >
                View All Subscriptions
              </button>

              <hr className="border-gray-100 my-3" />

              <div onClick={async () => {
                const query = 'subject:(receipt OR invoice OR subscription OR payment OR renewal) -from:me';

                let accountIndex = '0';
                try {
                  const tabs = await chrome.tabs.query({ url: 'https://mail.google.com/*' });
                  if (tabs.length > 0) {
                    const match = tabs[0].url.match(/\/mail\/u\/(\d+)\//);
                    if (match) {
                      accountIndex = match[1];
                    }
                  }
                } catch (error) {
                  console.log('Could not detect Gmail account, using default:', error);
                }

                const url = `https://mail.google.com/mail/u/${accountIndex}/#search/${encodeURIComponent(query)}`;
                chrome.tabs.create({ url });
              }} className="cursor-pointer bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 p-3 rounded-lg flex items-center gap-3 transition-colors">
                <div className="bg-white p-1.5 rounded text-indigo-600 shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs font-semibold text-indigo-900">Find Lost Receipts</div>
                  <div className="text-[10px] text-indigo-700">Open Gmail search for invoices</div>
                </div>
              </div>
            </div>
          </>
        )}

        {view === VIEWS.ADD_DRAFT && (
          <AddSubscriptionForm isOffline={!isLoggedIn} />
        )}

        {view === VIEWS.ALL_SUBSCRIPTIONS && (
          <SubscriptionList />
        )}

        {view === VIEWS.SYNC_CONFLICTS && (
          <SyncConflictResolver />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-4 py-2 text-xs text-center text-gray-400">
        {isLoggedIn ? 'Syncing with app.subdupes.com' : 'Not logged in — saving locally'}
      </footer>
    </div>
  )
}

export default App
