import useStore from '../store/useStore'

const SubscriptionList = () => {
    const { subscriptions, setView } = useStore()

    // Sort by name for now, or maybe Next Billing Date?
    const startList = [...subscriptions].sort((a, b) => new Date(a.nextBillingDate) - new Date(b.nextBillingDate));

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <div className="bg-white px-4 py-3 border-b border-gray-200 sticky top-0 z-10 flex items-center gap-2">
                <button
                    onClick={() => setView('dashboard')}
                    className="text-gray-500 hover:text-gray-700 p-1"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                </button>
                <h1 className="font-semibold text-gray-800">Your Subscriptions</h1>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {startList.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 text-sm">
                        No subscriptions found.
                    </div>
                ) : (
                    startList.map(sub => (
                        <div key={sub._id} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                            <div className="flex justify-between items-start mb-1">
                                <h3 className="font-medium text-gray-900">{sub.name}</h3>
                                <span className="font-semibold text-gray-900 text-sm">
                                    {sub.currency} {sub.amount?.toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-gray-500">
                                <span>{sub.billingCycle}</span>
                                <span className={new Date(sub.nextBillingDate) < new Date() ? "text-red-500 font-medium" : ""}>
                                    Next: {new Date(sub.nextBillingDate).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

export default SubscriptionList
