import React from 'react';
import useStore from '../store/useStore';
import { VIEWS } from '../constants';

const ReviewDetections = () => {
    const { detectedSubscriptions, removeDetectedSubscription, setView, addPendingSubscription, isLoggedIn } = useStore();

    const handleAdd = (sub) => {
        addPendingSubscription({
            ...sub,
            source: 'GMAIL_BULK_SCAN'
        });
        removeDetectedSubscription(sub.id);
    };

    const handleIgnore = (id) => {
        removeDetectedSubscription(id);
    };

    if (detectedSubscriptions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-slate-100 shadow-sm animate-in fade-in duration-300">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-2xl">
                    ✨
                </div>
                <h3 className="font-bold text-slate-800 mb-1">All caught up!</h3>
                <p className="text-xs text-slate-400 max-w-[200px]">
                    No new subscriptions detected in your inbox right now.
                </p>
                <button
                    onClick={() => setView(VIEWS.DASHBOARD)}
                    className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg"
                >
                    Back to Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-base font-bold text-slate-800">New Findings</h2>
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                        Review {detectedSubscriptions.length} Potential Subscriptions
                    </p>
                </div>
                <button
                    onClick={() => setView(VIEWS.DASHBOARD)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                >
                    ✕
                </button>
            </div>

            <div className="space-y-3 pb-8">
                {detectedSubscriptions.map((sub) => (
                    <div key={sub.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-lg font-bold text-slate-300">
                                    {sub.name[0]}
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm text-slate-800">{sub.name}</h4>
                                    <p className="text-[10px] text-slate-400">{sub.websiteUrl || 'SaaS Provider'}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-indigo-600 text-sm">
                                    {sub.currency} {sub.amount?.toFixed(2) || '?.??'}
                                </p>
                                <p className="text-[9px] text-slate-400 uppercase font-bold tracking-tighter">
                                    {sub.billingCycle || 'Pending'}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => handleAdd(sub)}
                                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-[11px] shadow-sm transition-all active:scale-95"
                            >
                                Add to List
                            </button>
                            <button
                                onClick={() => handleIgnore(sub.id)}
                                className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-xl font-bold text-[11px] border border-slate-100 transition-all active:scale-95"
                            >
                                Ignore
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <p className="text-[10px] text-slate-400 text-center px-4 mt-auto pb-4 italic">
                {isLoggedIn ? 'Note: Added items will sync with your account automatically.' : 'Note: Added items will be saved locally until you sign in.'}
            </p>
        </div>
    );
};

export default ReviewDetections;
