import useStore from '../store/useStore'
import React, { useState } from 'react'
import { VIEWS } from '../constants'

// --- Sub-Component for individual items to handle Image Error State ---
const SubscriptionItem = ({ sub }) => {
    const [imgError, setImgError] = useState(false);

    // Safely parse domain
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

    const domain = getDomain(sub.websiteUrl);
    // Use clearbit as secondary? No, stick to Google for now as primary, but fail gracefull.
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null;

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
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
                <div className="min-w-0">
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
            <div className="text-right shrink-0 ml-2">
                <div className="font-bold text-gray-900 text-sm">
                    {sub.currency} {Number(sub.amount || 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-gray-400">
                    {sub.billingCycle === 'MONTHLY' ? 'monthly' : 'yearly'}
                </div>
            </div>
        </div>
    );
};

const SubscriptionList = () => {
    const { subscriptions, setView } = useStore()

    // --- Calculations ---

    // 1. Total Count (Exclude SubDupes Rewards)
    const totalCount = subscriptions.filter(s => !s.name.includes('SubDupes')).length;

    // 2. Total Monthly Spend (Normalizing Yearly loops)
    const totalMonthlySpend = subscriptions.reduce((acc, sub) => {
        // Exclude SubDupes rewards from spend
        if (sub.name.includes('SubDupes')) return acc;

        let amount = Number(sub.amount || 0);
        if (sub.billingCycle === 'YEARLY') {
            amount = amount / 12;
        } else if (sub.billingCycle === 'WEEKLY') {
            amount = amount * 4.345; // 52 weeks / 12 months
        }
        return acc + amount;
    }, 0);

    // 3. Unused (Placeholder for now)
    const unusedCount = 0;

    // 4. Potential Savings (Placeholder or % of total)
    const potentialSavings = 0;


    // Sort by cost descending for impact
    const sortedList = [...subscriptions].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));

    return (
        <div className="flex flex-col h-full bg-slate-50 font-sans">
            {/* --- Header --- */}
            <div className="px-5 py-4 flex items-center justify-between bg-white sticky top-0 z-20 shadow-sm border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setView('dashboard')}
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

                {/* Profile / Actions */}
                <div className="flex items-center gap-3">
                    <button className="relative p-1 text-gray-400 hover:text-indigo-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        {/* Dot */}
                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                    </button>
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border border-indigo-200">
                        M
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 pb-10">

                {/* --- Description Text --- */}
                <p className="text-gray-500 text-xs mb-4 px-1">
                    SubDupes tracks your daily usage patterns and alerts you when you haven't used a subscriptions.
                </p>

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
                        <h3 className="text-3xl font-bold">${totalMonthlySpend.toFixed(2)}</h3>
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
                        <h3 className="text-3xl font-bold">${potentialSavings.toFixed(2)}</h3>
                        <div className="flex items-center gap-1 mt-2 text-[10px] bg-white/20 w-fit px-1.5 py-0.5 rounded">
                            <span>Possible reduction</span>
                        </div>
                    </div>
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
