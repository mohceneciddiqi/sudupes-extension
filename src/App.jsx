import { useState, useEffect } from 'react'
import useStore from './store/useStore'
import AddSubscriptionForm from './components/AddSubscriptionForm'
import { api } from './services/api'
import { config } from './config'

function App() {
  const { view, setView, checkStorage, setUser, user } = useStore()
  const [init, setInit] = useState(false)

  const handleSync = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'CMD_SCAN_PAGE' });
      } catch (e) {
        console.log('Content script not ready or page not compatible');
      }
    }
  };

  // Initial Auth Check (Run Once)
  useEffect(() => {
    const initApp = async () => {
      const currentUser = await api.checkAuth();
      if (currentUser) {
        setUser(currentUser);
        const hasDraft = await checkStorage();
        if (!hasDraft) {
          setView('dashboard');
        }
      } else {
        setView('auth');
      }
      setInit(true);

      // Trigger scan once on load
      handleSync();
      // Trigger background sync to ensure cache is fresh
      chrome.runtime.sendMessage({ type: 'CMD_SYNC_ON_CONNECT' });
    };
    initApp();
  }, []); // Empty dependency array = run once on mount

  // Storage Listener
  useEffect(() => {
    const handleStorageChange = (changes, area) => {
      // Only update if we have a user (meaning we are in dashboard mode)
      if (area === 'local' && changes.detectedDraft && user) {
        checkStorage();
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [user]); // Re-bind if user state changes (e.g. login/logout)

  if (!init) return <div className="flex items-center justify-center h-full">Loading...</div>

  if (view === 'auth') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 bg-white text-center">
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Login Required</h2>
        <p className="text-sm text-gray-500 mb-6">
          Please log in to your SubDupes account to sync your subscriptions.
        </p>
        <button
          onClick={() => {
            chrome.tabs.create({ url: `${config.FRONTEND_URL}/login` });
          }}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors mb-4"
        >
          Log In via Web App
        </button>
        <div className="text-xs text-gray-400">
          After logging in, reopen this extension.
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold text-xs">
            S
          </div>
          <h1 className="font-semibold text-gray-800">SubDupes</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            className="text-gray-400 hover:text-blue-600 transition-colors p-1 rounded-md hover:bg-blue-50"
            title="Rescan Page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-y-auto">
        {view === 'dashboard' && (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-4">
              <h2 className="text-sm font-medium text-gray-500 mb-1">Active Tabs</h2>
              <div className="text-xs text-gray-400">Scanning for subscriptions...</div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setView('add-draft')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <span>+ Add Subscription Draft</span>
              </button>
              <button className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg text-sm transition-colors mb-2">
                View All Subscriptions
              </button>

              <hr className="border-gray-100 my-3" />

              <div onClick={() => {
                const query = 'subject:(receipt OR invoice OR subscription OR payment OR renewal) -from:me';
                const url = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`;
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

        {view === 'add-draft' && (
          <AddSubscriptionForm />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-4 py-2 text-xs text-center text-gray-400">
        Syncing with app.subdupes.com
      </footer>
    </div>
  )
}

export default App
