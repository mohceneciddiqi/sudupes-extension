import { useState } from 'react'
import useStore from '../store/useStore'
import { api } from '../services/api'
import { VIEWS } from '../constants'

const AddSubscriptionForm = () => {
    const { draft, updateDraft, clearDraft, setView } = useStore()

    // Local state for form if no draft exists, or init from draft
    const [formData, setFormData] = useState({
        name: draft?.name || '',
        amount: draft?.amount || '',
        currency: draft?.currency || 'USD',
        billingCycle: draft?.billingCycle || 'MONTHLY',
        websiteUrl: draft?.websiteUrl || '',
        trialEndDate: draft?.trialEndDate || ''
    })

    // Validation helper - centralized to keep consistency
    const isValidAmount = (amount) => {
        if (!amount || amount === '') return false;
        const parsed = parseFloat(amount);
        return !isNaN(parsed) && parsed > 0;
    };

    const handleChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
        // Also update global draft state if needed
        if (draft) {
            updateDraft({ [name]: value })
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        try {
            // URL Normalization
            let cleanUrl = formData.websiteUrl.trim();
            if (cleanUrl && !cleanUrl.startsWith('http')) {
                cleanUrl = 'https://' + cleanUrl;
            }

            // Better Date Logic
            const calculateNextDate = (cycle) => {
                const now = new Date();
                const next = new Date(now);
                if (cycle === 'WEEKLY') {
                    next.setDate(now.getDate() + 7);
                } else if (cycle === 'YEARLY') {
                    next.setFullYear(now.getFullYear() + 1);
                } else {
                    // Smart Month Increment: Handle end-of-month (e.g., Jan 31 -> Feb 28/29)
                    const d = next.getDate();
                    next.setMonth(next.getMonth() + 1);
                    // If date changed (e.g., Jan 31 became Mar 3), roll back to last day of target month
                    if (next.getDate() !== d) {
                        next.setDate(0); // Sets to last day of the previous month (which is the target month)
                    }
                }
                // Set to Noon to avoid timezone flipping (off-by-one errors)
                next.setHours(12, 0, 0, 0);
                return next.toISOString();
            };

            let nextBillingDate;
            if (formData.trialEndDate) {
                const trialDate = new Date(formData.trialEndDate);
                if (isNaN(trialDate.getTime())) {
                    // Fallback or Alert
                    // Since there is no input to fix it, we ignore the invalid trial date
                    // and calculate based on cycle, but warn the user.
                    console.warn("Invalid trialEndDate in draft, ignoring.");
                    nextBillingDate = calculateNextDate(formData.billingCycle);
                } else {
                    nextBillingDate = trialDate.toISOString();
                }
            } else {
                nextBillingDate = calculateNextDate(formData.billingCycle);
            }

            const parsedAmount = parseFloat(formData.amount);
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                alert("Please enter a valid amount greater than 0");
                return;
            }

            await api.createSubscription({
                ...formData,
                websiteUrl: cleanUrl, // Use normalized URL instead of formData.websiteUrl
                amount: parsedAmount,
                nextBillingDate: nextBillingDate,
            });

            alert('Subscription Saved to SubDupes!');
            clearDraft()
            setView(VIEWS.DASHBOARD)
            // Trigger a sync to update the list immediately
            try {
                chrome.runtime.sendMessage({ type: 'CMD_SYNC_NOW' });
            } catch (error) {
                console.error('Failed to trigger sync:', error);
            }

        } catch (err) {
            alert('Error saving: ' + err.message);
        }
    }

    const handleDiscard = async () => {
        clearDraft();
        setView(VIEWS.DASHBOARD);
    };

    return (
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">New Subscription</h2>
                <button
                    onClick={handleDiscard}
                    className="text-gray-400 hover:text-gray-600"
                    title="Dismiss Draft"
                >
                    ✕
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
                {/* ... fields ... */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Service Name</label>
                    <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="e.g. Netflix, Figma"
                        className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 p-2 border"
                        required
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                        <input
                            type="number"
                            name="amount"
                            value={formData.amount}
                            onChange={handleChange}
                            placeholder="0.00"
                            step="0.01"
                            className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 p-2 border"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                        <select
                            name="currency"
                            value={formData.currency}
                            onChange={handleChange}
                            className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 p-2 border"
                        >
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (€)</option>
                            <option value="GBP">GBP (£)</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Billing Cycle</label>
                    <select
                        name="billingCycle"
                        value={formData.billingCycle}
                        onChange={handleChange}
                        className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 p-2 border"
                    >
                        <option value="MONTHLY">Monthly</option>
                        <option value="YEARLY">Yearly</option>
                        <option value="WEEKLY">Weekly</option>
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Trial End Date (Optional)</label>
                    <input
                        type="date"
                        name="trialEndDate"
                        value={formData.trialEndDate || ''}
                        onChange={handleChange}
                        className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 p-2 border"
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Website (Optional)</label>
                    <input
                        type="url"
                        name="websiteUrl"
                        value={formData.websiteUrl}
                        onChange={handleChange}
                        placeholder="https://example.com"
                        className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 p-2 border"
                    />
                </div>

                <div className="flex gap-2 mt-2 pt-2">
                    <button
                        type="button"
                        onClick={handleDiscard}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-2 px-4 rounded-lg text-sm transition-colors"
                    >
                        Discard
                    </button>
                    <button
                        type="submit"
                        disabled={!isValidAmount(formData.amount)}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
                    >
                        Save
                    </button>
                </div>
            </form>
        </div>
    )
}

export default AddSubscriptionForm
