import { useState, useEffect } from 'react'
import useStore from './store/useStore'
import AddSubscriptionForm from './components/AddSubscriptionForm'
import SubscriptionList from './components/SubscriptionList'
import SyncConflictResolver from './components/SyncConflictResolver'
import ScanScreenshot from './components/ScanScreenshot'
import { api } from './services/api'
import { config, FREEMIUM_LIMIT_FALLBACK } from './config'

import { VIEWS, GMAIL_ENRICHED_QUERY } from './constants'
import { calculateMonthlySpend, getDominantCurrency } from './utils/calculations'
import { useMemo } from 'react'
import ReviewDetections from './components/ReviewDetections'

function App() {
  const {
    view, setView, checkStorage, setUser,
    pendingSubscriptions, syncConflicts, user,
    subscriptions, detectedSubscriptions
  } = useStore()
  const [init, setInit] = useState(false)

  // Move Metric Calculations to top level to avoid React Hook violations
  const { totalLocal: totalMonthlySpend, totalNormalizedUSD: totalMonthlySpendNormalized } = useMemo(() =>
    calculateMonthlySpend(subscriptions),
    [subscriptions, view]);

  const dominantCurrency = useMemo(() =>
    getDominantCurrency(subscriptions),
    [subscriptions]);

  const isLoggedIn = !!user;
  const monthlyBudget = user?.monthlyBudget || 500;
  const budgetUsagePercent = Math.min(100, Math.round((totalMonthlySpendNormalized / monthlyBudget) * 100));

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
          if (changes.userProfile) {
            useStore.getState().setUser(changes.userProfile.newValue || null);
          }
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

  return (
    <div className="w-[400px] min-h-[500px] bg-slate-50 flex flex-col font-sans select-none overflow-hidden text-slate-900">
      {/* Header */}
      <header className="bg-white px-4 py-4 flex items-center justify-between border-b border-slate-100 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-indigo-100 shadow-lg">
            S
          </div>
          <div>
            <h1 className="font-bold text-base leading-none text-slate-800">SubDupes</h1>
            <p className="text-[10px] text-slate-400 font-medium">Subscription Intelligence</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSync}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all"
            title="Refresh & Sync"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {isLoggedIn && (
            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 overflow-hidden">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                (user.firstName || user.email || 'U')[0].toUpperCase()
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {view === VIEWS.DASHBOARD && (
          <div className="flex-1 overflow-y-auto p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Welcome */}
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-slate-400">Welcome back,</h2>
                <h3 className="text-xl font-bold text-slate-800 truncate">{user?.firstName || 'Subscriber'}</h3>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${user?.plan === 'PRO' || user?.plan === 'ENTERPRISE' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-200 text-slate-500'}`}>
                  {user?.plan || 'Free'}
                </span>
                {user?.plan === 'FREEMIUM' && (
                  <button
                    onClick={() => chrome.tabs.create({ url: 'https://app.subdupes.com/settings?tab=billing' })}
                    className="text-[9px] font-bold text-indigo-600 hover:text-indigo-700 mt-1 underline"
                  >
                    Upgrade
                  </button>
                )}
              </div>
            </div>

            {/* Metrics Overview */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 truncate">Monthly Spend</p>
                <p className="text-xl font-black text-slate-800 truncate">
                  <span className="text-sm font-bold text-indigo-500 mr-0.5">{dominantCurrency.symbol}</span>
                  {totalMonthlySpend.toFixed(0)}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  <div className="flex -space-x-1">
                    {subscriptions.slice(0, 3).map((s, i) => (
                      <div key={i} className="w-4 h-4 rounded-full bg-slate-50 border border-white flex items-center justify-center text-[6px] font-bold text-slate-400 shadow-sm">
                        {s.name[0]}
                      </div>
                    ))}
                  </div>
                  <span className="text-[9px] text-slate-400 font-medium">+{subscriptions.length} subs</span>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm min-w-0">
                <div className="flex items-center justify-between mb-1 gap-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Slots</p>
                  <span className={`text-[9px] font-bold px-1 rounded shrink-0 ${(user?.subscriptionCount || subscriptions.length) >= (user?.maxSubscriptions || FREEMIUM_LIMIT_FALLBACK) ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                    {user?.subscriptionCount || subscriptions.length}/{user?.maxSubscriptions === -1 ? '∞' : (user?.maxSubscriptions || FREEMIUM_LIMIT_FALLBACK)}
                  </span>
                </div>
                <p className="text-xl font-black text-slate-800 truncate">
                  {Math.round(((user?.subscriptionCount || subscriptions.length) / (user?.maxSubscriptions === -1 ? Infinity : (user?.maxSubscriptions || FREEMIUM_LIMIT_FALLBACK))) * 100) || 0}
                  <span className="text-sm font-bold text-slate-400 ml-0.5">%</span>
                </p>
                <div className="mt-3 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ${(user?.subscriptionCount || subscriptions.length) >= (user?.maxSubscriptions || FREEMIUM_LIMIT_FALLBACK) ? 'bg-red-500' : 'bg-indigo-500'}`}
                    style={{ width: `${Math.min(100, ((user?.subscriptionCount || subscriptions.length) / (user?.maxSubscriptions === -1 ? 100 : (user?.maxSubscriptions || FREEMIUM_LIMIT_FALLBACK))) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* New Findings Notification */}
            {detectedSubscriptions?.length > 0 && (
              <button
                onClick={() => setView(VIEWS.REVIEW_DETECTIONS)}
                className="w-full mb-4 p-3 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between group hover:bg-indigo-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center text-xs animate-bounce">
                    ✨
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-indigo-900">New Findings Available</p>
                    <p className="text-[10px] text-indigo-400 font-medium">We found {detectedSubscriptions.length} subscriptions in your Gmail.</p>
                  </div>
                </div>
                <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-indigo-600 shadow-sm group-hover:translate-x-1 transition-transform">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            )}

            {/* ── Smart Scanner Card ── */}
            <div className="mb-5 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden border-l-4 border-l-indigo-600 min-w-0">
              <div className="p-4 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-bold text-sm text-slate-800 truncate">Smart Page Scanner</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">Detecting subscriptions...</p>
                </div>
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-pulse delay-75"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-100 animate-pulse delay-150"></span>
                </div>
              </div>

              <div className="px-4 pb-4">
                <button
                  onClick={() => setView(VIEWS.SCAN_SCREENSHOT)}
                  className="w-full py-2.5 bg-slate-50 hover:bg-indigo-50 text-indigo-700 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 border border-slate-100"
                >
                  <span className="text-base">📷</span>
                  Scan Current Window (OCR)
                </button>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 pl-1">Command Center</h4>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                onClick={() => setView(VIEWS.ADD_DRAFT)}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-100 rounded-2xl transition-all group min-w-0"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-[11px] font-bold text-slate-600 truncate w-full text-center">Add Draft</span>
              </button>

              <button
                onClick={() => setView(VIEWS.ALL_SUBSCRIPTIONS)}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-100 rounded-2xl transition-all group min-w-0"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <span className="text-[11px] font-bold text-slate-600 truncate w-full text-center">My Dashboard</span>
              </button>

              <button
                onClick={async () => {
                  const url = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(GMAIL_ENRICHED_QUERY)}`;
                  chrome.tabs.create({ url });
                }}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-100 rounded-2xl transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-slate-600">Gmail Scan</span>
              </button>

              <button
                onClick={() => {
                  chrome.tabs.create({ url: `${config.FRONTEND_URL}/dashboard`, active: true });
                }}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-100 rounded-2xl transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-slate-600">Web App</span>
              </button>
            </div>

            {/* Manage Card */}
            <button
              onClick={() => {
                chrome.tabs.create({ url: `${config.FRONTEND_URL}/subscriptions`, active: true });
              }}
              className="w-full flex items-center justify-between p-4 bg-indigo-600 hover:bg-indigo-700 rounded-2xl text-white shadow-lg transition-all active:scale-95"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </div>
                <span className="text-sm font-bold">Manage Subscriptions</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        )}

        {view === VIEWS.ADD_DRAFT && (
          <div className="flex-1 overflow-y-auto p-4">
            <AddSubscriptionForm isOffline={!isLoggedIn} />
          </div>
        )}

        {view === VIEWS.ALL_SUBSCRIPTIONS && (
          <SubscriptionList />
        )}

        {view === VIEWS.SYNC_CONFLICTS && (
          <div className="flex-1 overflow-y-auto p-4">
            <SyncConflictResolver />
          </div>
        )}

        {view === VIEWS.SCAN_SCREENSHOT && (
          <div className="flex-1 overflow-y-auto p-4">
            <ScanScreenshot />
          </div>
        )}

        {view === VIEWS.REVIEW_DETECTIONS && (
          <ReviewDetections />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto px-4 py-3 bg-white border-t border-slate-100 flex items-center justify-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${isLoggedIn ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {isLoggedIn ? 'Live Sync Active' : 'Offline Mode'}
        </p>
      </footer>
    </div>
  )
}

export default App
