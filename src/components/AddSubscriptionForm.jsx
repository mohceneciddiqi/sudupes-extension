import { useState } from 'react'
import useStore from '../store/useStore'
import { api } from '../services/api'

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
            // Better Date Logic
            const calculateNextDate = (cycle) => {
                const now = new Date();
                const next = new Date(now);
                if (cycle === 'WEEKLY') next.setDate(now.getDate() + 7);
                else if (cycle === 'YEARLY') next.setFullYear(now.getFullYear() + 1);
                else next.setDate(now.getDate() + 30); // Default Monthly
                return next.toISOString();
            };

            const nextBillingDate = formData.trialEndDate
                ? new Date(formData.trialEndDate).toISOString()
                : calculateNextDate(formData.billingCycle);

            const parsedAmount = parseFloat(formData.amount);
            if (isNaN(parsedAmount)) {
                alert("Please enter a valid amount");
                return;
            }

            await api.createSubscription({
                ...formData,
                amount: parsedAmount,
                nextBillingDate: nextBillingDate,
            });

            alert('Subscription Saved to SubDupes!');
            clearDraft()
            setView('dashboard')
            // Trigger a sync to update the list immediately
            chrome.runtime.sendMessage({ type: 'CMD_SYNC_NOW' });

        } catch (err) {
            alert('Error saving: ' + err.message);
        }
    }

    return (
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">New Subscription</h2>
                <button
                    onClick={() => setView('dashboard')}
                    className="text-gray-400 hover:text-gray-600"
                >
                    ✕
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
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

                <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors mt-2"
                >
                    Save Subscription
                </button>
            </form>
        </div>
    )
}

export default AddSubscriptionForm
