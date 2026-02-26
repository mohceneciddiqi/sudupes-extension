import useStore from '../store/useStore'
import React, { useState, useMemo, useEffect } from 'react'
import { VIEWS, DOMAIN_CATEGORIES } from '../constants'
import {
    CURRENCY_SYMBOLS,
    normalizeToUSD,
    normalizeToMonthly,
    calculateMonthlySpend,
    getDominantCurrency
} from '../utils/calculations'

// --- Utility Functions ---
const getDomain = (url) => {
    try {
        if (!url) return '';
        let safeUrl = url.trim();
        if (!safeUrl.startsWith('http')) {
            safeUrl = 'https://' + safeUrl;
        }
        return new URL(safeUrl).hostname;
    } catch {
        return '';
    }
};

// --- Sub-Component for individual items to handle Image Error State ---
const SubscriptionItem = ({ sub }) => {
    const [imgError, setImgError] = useState(false);



    const domain = getDomain(sub.websiteUrl);
    // Use clearbit as secondary? No, stick to Google for now as primary, but fail gracefull.
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null;

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Logo */}
                <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center p-1.5 overflow-hidden shrink-0">
                    {!imgError && faviconUrl ? (
                        <img
                            src={faviconUrl}
                            alt={sub.name}
                            className="w-full h-full object-contain"
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        <div className="text-xs font-bold text-gray-400 uppercase">
                            {(sub.name || '?')[0]}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-gray-900 text-sm truncate">{sub.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-500 font-medium bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                            {sub.billingCycle}
                        </span>
                        <p className="text-[10px] text-gray-400 truncate">
                            {domain.replace('www.', '')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Cost */}
            <div className="text-right shrink-0 min-w-[80px]">
                <div className="font-bold text-gray-900 text-sm truncate">
                    {sub.currency} {Number(sub.amount || 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-gray-400 uppercase tracking-tighter">
                    {sub.billingCycle === 'MONTHLY' ? 'monthly' : 'yearly'}
                </div>
            </div>
        </div>
    );
};

const SubscriptionList = () => {
    const { subscriptions, setView, user } = useStore()
    const [lastVisited, setLastVisited] = useState({});

    useEffect(() => {
        chrome.storage.local.get(['lastVisited'], (result) => {
            if (result.lastVisited) setLastVisited(result.lastVisited);
        });
    }, []);

    // --- Calculations ---

    // 1. Total Count (Exclude SubDupes Rewards)
    const totalCount = subscriptions.filter(s => !s.name.includes('SubDupes')).length;

    const { totalLocal: totalMonthlySpend, totalNormalizedUSD: totalMonthlySpendNormalized } = useMemo(() =>
        calculateMonthlySpend(subscriptions),
        [subscriptions]);

    // Determine dominant currency from subscriptions
    const dominantCurrency = useMemo(() =>
        getDominantCurrency(subscriptions),
        [subscriptions]);

    const sortedList = [...subscriptions].sort((a, b) => normalizeToMonthly(b) - normalizeToMonthly(a));

    // Calculate Unused (Feature Refinement: 7-day grace period for new subs)
    const unusedCount = useMemo(() => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        return subscriptions.filter(sub => {
            if (sub.name?.includes('SubDupes')) return false;
            const subId = sub.id || sub._id;
            const lastVisit = lastVisited[subId];

            // Check if sub is "new" (added in last 7 days)
            const createdAt = sub.createdAt || sub.detectedAt;
            const isNew = createdAt ? new Date(createdAt) > sevenDaysAgo : false;

            if (!lastVisit) {
                return !isNew; // New subs without visits are NOT unused yet
            }
            return new Date(lastVisit) < thirtyDaysAgo;
        }).length;
    }, [subscriptions, lastVisited]);

    // Budget Logic (Feature 9 Fix: Use USD normalization for budget check)
    const monthlyBudget = user?.monthlyBudget || 500;
    const isOverBudget = totalMonthlySpendNormalized > monthlyBudget;
    const budgetUsagePercent = Math.min(100, Math.round((totalMonthlySpendNormalized / monthlyBudget) * 100));
    const budgetCurrencySymbol = '$'; // Budget is always USD from server

    // Category Stats (Feature 8)
    const categoryStats = useMemo(() => {
        const stats = {};
        subscriptions.forEach(sub => {
            const domain = getDomain(sub.websiteUrl);
            const category = DOMAIN_CATEGORIES[domain] || 'Other';
            const cost = normalizeToMonthly(sub);

            if (!stats[category]) stats[category] = { spend: 0, count: 0 };
            stats[category].spend += cost;
            stats[category].count += 1;
        });

        return Object.entries(stats)
            .sort((a, b) => b[1].spend - a[1].spend)
            .map(([name, data]) => ({ name, ...data }));
    }, [subscriptions]);

    // CSV Export (Feature 8 Fix: Escaped fields)
    const handleExport = () => {
        const escapeCSV = (val) => {
            let str = String(val || '').replace(/"/g, '""');
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                return `"${str}"`;
            }
            return str;
        };

        const headers = ['Name', 'Amount', 'Currency', 'Billing Cycle', 'Website', 'Next Billing Date', 'Category'];
        const rows = subscriptions.map(sub => [
            escapeCSV(sub.name),
            sub.amount,
            sub.currency,
            sub.billingCycle,
            escapeCSV(sub.websiteUrl),
            sub.nextBillingDate || '',
            DOMAIN_CATEGORIES[getDomain(sub.websiteUrl)] || 'Other'
        ]);

        const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `subdupes_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Placeholders
    const potentialSavings = totalMonthlySpend * 0.15; // 15% estimated optimization potential

    return (
        <div className="flex flex-col h-full bg-slate-50 font-sans max-w-full overflow-hidden">
            {/* --- Header --- */}
            <div className="px-4 py-4 flex items-center justify-between bg-white sticky top-0 z-20 shadow-sm border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setView(VIEWS.DASHBOARD)}
                        className="p-1 -ml-2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm">
                            S
                        </div>
                        <h1 className="font-bold text-xl text-gray-800 tracking-tight">SubDupes</h1>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border border-indigo-200">
                        {(user?.name || user?.email || 'U')[0].toUpperCase()}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-10">

                {/* --- Description Text --- */}
                <p className="text-gray-500 text-xs mb-4 px-1">
                    SubDupes tracks your daily usage patterns and alerts you when you haven't used a subscriptions.
                </p>

                {/* --- Budget Alert --- */}
                {isOverBudget && (
                    <div className="mb-6 bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-4 animate-pulse">
                        <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div>
                            <h4 className="font-bold text-red-900 text-sm">Budget Exceeded!</h4>
                            <p className="text-red-700 text-xs mt-0.5">
                                You've spent {budgetCurrencySymbol}{totalMonthlySpendNormalized.toFixed(2)} this month (normalized),
                                which is {budgetUsagePercent}% of your {budgetCurrencySymbol}{monthlyBudget} budget.
                            </p>
                        </div>
                    </div>
                )}

                {/* --- Category Breakdown — Spiral Ring Chart --- */}
                {categoryStats.length > 0 && (() => {
                    const COLORS = [
                        ['#6366F1', '#818CF8'], // indigo
                        ['#A855F7', '#C084FC'], // purple
                        ['#EC4899', '#F472B6'], // pink
                        ['#14B8A6', '#2DD4BF'], // teal
                        ['#F59E0B', '#FCD34D'], // amber
                    ];
                    const slices = categoryStats.slice(0, 5);
                    const cx = 80, cy = 80;
                    const baseR = 60, ringW = 10, gap = 4;

                    const arcPath = (r, pct) => {
                        if (pct <= 0) return '';
                        if (pct >= 1) pct = 0.9999;
                        const angle = pct * 2 * Math.PI;
                        const x1 = cx + r * Math.sin(0);
                        const y1 = cy - r * Math.cos(0);
                        const x2 = cx + r * Math.sin(angle);
                        const y2 = cy - r * Math.cos(angle);
                        const large = angle > Math.PI ? 1 : 0;
                        return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
                    };

                    return (
                        <div className="mb-6 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-tight">Spend by Category</h4>
                                <div className="flex gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-300"></span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-100"></span>
                                </div>
                            </div>

                            {/* SVG Spiral Rings — centred */}
                            <div className="flex justify-center mb-4">
                                <svg width="150" height="150" viewBox="0 0 160 160">
                                    <defs>
                                        {slices.map((_, i) => (
                                            <linearGradient key={i} id={`sg${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stopColor={COLORS[i][0]} />
                                                <stop offset="100%" stopColor={COLORS[i][1]} />
                                            </linearGradient>
                                        ))}
                                    </defs>

                                    {/* Track rings */}
                                    {slices.map((_, i) => {
                                        const r = baseR - i * (ringW + gap);
                                        return (
                                            <circle key={`track-${i}`} cx={cx} cy={cy} r={r}
                                                fill="none" stroke="#F1F5F9" strokeWidth={ringW} />
                                        );
                                    })}

                                    {/* Filled arc rings */}
                                    {slices.map((stat, i) => {
                                        const r = baseR - i * (ringW + gap);
                                        const pct = totalMonthlySpend > 0 ? stat.spend / totalMonthlySpend : 0;
                                        return (
                                            <path key={`arc-${i}`} d={arcPath(r, pct)}
                                                fill="none" stroke={`url(#sg${i})`}
                                                strokeWidth={ringW} strokeLinecap="round" />
                                        );
                                    })}

                                    {/* Centre label */}
                                    <text x={cx} y={cy - 6} textAnchor="middle" fontSize="14" fontWeight="700" fill="#1E293B">
                                        {dominantCurrency.symbol}{totalMonthlySpend.toFixed(0)}
                                    </text>
                                    <text x={cx} y={cy + 9} textAnchor="middle" fontSize="8" fill="#94A3B8" fontWeight="500">
                                        /month
                                    </text>
                                </svg>
                            </div>

                            {/* Legend — 2-column grid below chart */}
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                                {slices.map((stat, i) => {
                                    const pct = totalMonthlySpend > 0 ? Math.round((stat.spend / totalMonthlySpend) * 100) : 0;
                                    return (
                                        <div key={stat.name} className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2 py-1.5">
                                            <span
                                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                                style={{ background: COLORS[i][0] }}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[11px] font-semibold text-slate-700 truncate">{stat.name}</div>
                                                <div className="text-[10px] text-slate-400">
                                                    {dominantCurrency.symbol}{stat.spend.toFixed(0)} · {pct}%
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}

                {/* --- Stats Grid --- */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    {/* Card 1: Total Subs */}
                    <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-20">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <p className="text-[10px] font-medium opacity-80 uppercase tracking-wider mb-1">Total Subscriptions</p>
                        <h3 className="text-3xl font-bold">{totalCount}</h3>
                        <div className="flex items-center gap-1 mt-2 text-[10px] bg-white/20 w-fit px-1.5 py-0.5 rounded">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 16.586 5H12z" clipRule="evenodd" />
                            </svg>
                            <span>Active</span>
                        </div>
                    </div>

                    {/* Card 2: Unused */}
                    <div className="bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-20">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p className="text-[10px] font-medium opacity-80 uppercase tracking-wider mb-1">Unused Subscriptions</p>
                        <h3 className="text-3xl font-bold">{unusedCount}</h3>
                        <div className="flex items-center gap-1 mt-2 text-[10px] bg-white/20 w-fit px-1.5 py-0.5 rounded">
                            <span>Needs review</span>
                        </div>
                    </div>

                    {/* Card 3: Monthly Spend */}
                    <div className="bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-20">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p className="text-[10px] font-medium opacity-80 uppercase tracking-wider mb-1">Monthly Spend</p>
                        <h3 className="text-3xl font-bold">{dominantCurrency.symbol}{totalMonthlySpend.toFixed(2)}</h3>
                        <div className="flex items-center gap-1 mt-2 text-[10px] bg-white/20 w-fit px-1.5 py-0.5 rounded">
                            <span>Est. Total</span>
                        </div>
                    </div>

                    {/* Card 4: Savings */}
                    <div className="bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-20">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                        <p className="text-[10px] font-medium opacity-80 uppercase tracking-wider mb-1">Savings Potential</p>
                        <h3 className="text-3xl font-bold">{dominantCurrency.symbol}{potentialSavings.toFixed(2)}</h3>
                        <div className="flex items-center gap-1 mt-2 text-[10px] bg-white/20 w-fit px-1.5 py-0.5 rounded">
                            <span>Possible reduction</span>
                        </div>
                    </div>
                </div>

                {/* --- Quick Actions (Feature 7) --- */}
                <div className="flex gap-3 mb-8">
                    <button
                        onClick={() => setView(VIEWS.ADD_DRAFT)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm transition-all shadow-lg shadow-indigo-200"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Subscription
                    </button>
                    <button
                        onClick={handleExport}
                        className="px-4 flex items-center justify-center bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-2xl font-bold text-sm transition-all shadow-sm"
                        title="Export to CSV"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                    </button>
                </div>

                {/* --- List Section --- */}
                <h2 className="font-bold text-gray-900 mb-3 text-sm">Subscription usage list</h2>

                <div className="space-y-3">
                    {sortedList.length === 0 ? (
                        <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-300">
                            <p className="text-gray-400 text-sm">No subscriptions yet.</p>
                            <button
                                onClick={() => setView(VIEWS.ADD_DRAFT)}
                                className="mt-2 text-indigo-600 text-xs font-semibold"
                            >
                                + Add one manually
                            </button>
                        </div>
                    ) : (
                        sortedList.map((sub, index) => (
                            <SubscriptionItem key={sub._id || sub.id || sub.websiteUrl || index} sub={sub} />
                        ))
                    )}
                </div>

            </div>
        </div>
    )
}

export default SubscriptionList
