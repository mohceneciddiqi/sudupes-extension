import { useState, useEffect } from 'react'
import useStore from '../store/useStore'
import { VIEWS } from '../constants'

const SyncConflictResolver = () => {
    const { syncConflicts, resolveConflict, clearSyncConflicts, setView } = useStore()
    const [resolving, setResolving] = useState(null) // index of currently resolving item

    const handleResolve = async (index, action) => {
        setResolving(index)
        const conflict = syncConflicts[index]

        try {
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'RESOLVE_CONFLICT',
                    data: {
                        action,
                        pending: conflict.pending,
                        existing: conflict.existing
                    }
                }, resolve)
            })

            if (response?.success) {
                resolveConflict(index)
            } else {
                alert('Resolution failed: ' + (response?.error || 'Unknown error'))
            }
        } catch (err) {
            alert('Error: ' + err.message)
        }

        setResolving(null)
    }

    const handleResolveAll = async (action) => {
        for (let i = syncConflicts.length - 1; i >= 0; i--) {
            await handleResolve(i, action)
        }
    }

    // Redirect to dashboard when all conflicts are resolved
    useEffect(() => {
        if (!syncConflicts || syncConflicts.length === 0) {
            setView(VIEWS.DASHBOARD)
        }
    }, [syncConflicts, setView])

    if (!syncConflicts || syncConflicts.length === 0) {
        return null
    }

    const currencySymbols = { USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥' }

    const formatAmount = (amount, currency) => {
        const symbol = currencySymbols[currency] || currency || '$'
        return `${symbol}${parseFloat(amount || 0).toFixed(2)}`
    }

    return (
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h2 className="text-lg font-semibold text-gray-800">Sync Conflicts</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {syncConflicts.length} subscription{syncConflicts.length !== 1 ? 's' : ''} match existing records
                    </p>
                </div>
                <button
                    onClick={() => {
                        clearSyncConflicts()
                        setView(VIEWS.DASHBOARD)
                    }}
                    className="text-gray-400 hover:text-gray-600"
                    title="Skip All"
                >
                    ✕
                </button>
            </div>

            {/* Bulk Actions */}
            <div className="flex gap-2 mb-3">
                <button
                    onClick={() => handleResolveAll('keep_existing')}
                    className="flex-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 py-1.5 px-2 rounded-md transition-colors"
                >
                    Keep All Existing
                </button>
                <button
                    onClick={() => handleResolveAll('keep_both')}
                    className="flex-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 py-1.5 px-2 rounded-md transition-colors"
                >
                    Keep All Both
                </button>
            </div>

            {/* Conflict List */}
            <div className="space-y-3 max-h-80 overflow-y-auto">
                {syncConflicts.map((conflict, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        {/* Conflict Header */}
                        <div className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded mb-2 flex items-center gap-1.5">
                            <span>⚠️</span>
                            <span>Possible duplicate found</span>
                        </div>

                        {/* Side-by-side Comparison */}
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            {/* Local / Pending */}
                            <div className="bg-blue-50 rounded-md p-2">
                                <div className="text-[10px] font-medium text-blue-500 uppercase mb-1">Saved Locally</div>
                                <div className="text-xs font-semibold text-gray-800 truncate">{conflict.pending.name}</div>
                                <div className="text-xs text-blue-600 font-bold mt-0.5">
                                    {formatAmount(conflict.pending.amount, conflict.pending.currency)}
                                    <span className="text-[10px] text-gray-400 ml-1 font-normal">
                                        /{(conflict.pending.billingCycle || 'MONTHLY').toLowerCase().replace('ly', '')}
                                    </span>
                                </div>
                            </div>

                            {/* Existing / Server */}
                            <div className="bg-green-50 rounded-md p-2">
                                <div className="text-[10px] font-medium text-green-500 uppercase mb-1">Already Tracked</div>
                                <div className="text-xs font-semibold text-gray-800 truncate">{conflict.existing.name}</div>
                                <div className="text-xs text-green-600 font-bold mt-0.5">
                                    {formatAmount(conflict.existing.amount, conflict.existing.currency)}
                                    <span className="text-[10px] text-gray-400 ml-1 font-normal">
                                        /{(conflict.existing.billingCycle || 'MONTHLY').toLowerCase().replace('ly', '')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1.5">
                            <button
                                onClick={() => handleResolve(index, 'merge')}
                                disabled={resolving === index}
                                className="flex-1 text-[10px] bg-purple-50 hover:bg-purple-100 text-purple-600 font-medium py-1.5 rounded-md transition-colors disabled:opacity-50"
                            >
                                Merge
                            </button>
                            <button
                                onClick={() => handleResolve(index, 'keep_existing')}
                                disabled={resolving === index}
                                className="flex-1 text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-1.5 rounded-md transition-colors disabled:opacity-50"
                            >
                                Keep Existing
                            </button>
                            <button
                                onClick={() => handleResolve(index, 'keep_both')}
                                disabled={resolving === index}
                                className="flex-1 text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-600 font-medium py-1.5 rounded-md transition-colors disabled:opacity-50"
                            >
                                Keep Both
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default SyncConflictResolver
