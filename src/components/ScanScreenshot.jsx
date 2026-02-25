import { useState } from 'react'
import useStore from '../store/useStore'
import { api } from '../services/api'
import { VIEWS } from '../constants'

const CONFIDENCE_INFO = {
    HIGH: { label: 'High confidence', color: '#16A34A', bg: '#DCFCE7' },
    MEDIUM: { label: 'Medium confidence', color: '#D97706', bg: '#FEF3C7' },
    LOW: { label: 'Low confidence', color: '#DC2626', bg: '#FEE2E2' },
}

export default function ScanScreenshot() {
    const { setView, updateDraft } = useStore()

    const [state, setState] = useState('idle')   // 'idle' | 'scanning' | 'result' | 'error'
    const [screenshot, setScreenshot] = useState(null)   // base64 data URL for preview
    const [extracted, setExtracted] = useState(null)     // parsed OCR fields
    const [fields, setFields] = useState({ name: '', amount: '', currency: 'USD', billingCycle: 'MONTHLY' })
    const [errorMsg, setErrorMsg] = useState('')

    const handleCapture = async () => {
        setState('scanning')
        setErrorMsg('')

        try {
            // 1. Capture visible tab
            const dataUrl = await new Promise((resolve, reject) => {
                chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 90 }, (url) => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
                    else resolve(url)
                })
            })

            setScreenshot(dataUrl)

            // 2. Send to OCR backend
            const result = await api.scanScreenshot(dataUrl)

            if (result) {
                setExtracted(result)
                setFields({
                    name: result.name || '',
                    amount: result.amount || '',
                    currency: result.currency || 'USD',
                    billingCycle: result.billingCycle || 'MONTHLY',
                })
                setState('result')
            } else {
                // Backend returned empty — let user fill in manually
                setExtracted({ confidence: 'LOW', confidenceScore: 0 })
                setFields({ name: '', amount: '', currency: 'USD', billingCycle: 'MONTHLY' })
                setState('result')
            }
        } catch (err) {
            setErrorMsg(err.message || 'Something went wrong. Try again.')
            setState('error')
        }
    }

    const handleAddToSubDupes = () => {
        updateDraft({
            name: fields.name,
            amount: fields.amount,
            currency: fields.currency,
            billingCycle: fields.billingCycle,
            websiteUrl: '',
        })
        setView(VIEWS.ADD_DRAFT)
    }

    const handleFieldChange = (e) => {
        setFields(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const conf = CONFIDENCE_INFO[extracted?.confidence] || CONFIDENCE_INFO.LOW

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                    <span className="text-sm font-bold text-slate-800">Scan This Page</span>
                </div>
                <button
                    onClick={() => setView(VIEWS.DASHBOARD)}
                    className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                >✕</button>
            </div>

            <div className="p-4">

                {/* ── IDLE ───────────────────────────────────── */}
                {state === 'idle' && (
                    <div className="text-center py-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mx-auto mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <h3 className="text-sm font-bold text-slate-800 mb-1">Snap & Track</h3>
                        <p className="text-[11px] text-slate-500 mb-5 leading-relaxed">
                            Navigate to a subscription, pricing or billing page, then click the button below.
                            We'll read the price and service name automatically.
                        </p>
                        <button
                            onClick={handleCapture}
                            className="w-full py-3 rounded-xl text-white text-sm font-bold shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)' }}
                        >
                            📷 Capture & Scan Current Tab
                        </button>
                    </div>
                )}

                {/* ── SCANNING ───────────────────────────────── */}
                {state === 'scanning' && (
                    <div className="text-center py-8">
                        <div className="relative w-14 h-14 mx-auto mb-4">
                            <svg className="animate-spin w-14 h-14 text-violet-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center text-base">🔍</div>
                        </div>
                        <p className="text-sm font-semibold text-slate-700">Analysing page…</p>
                        <p className="text-[11px] text-slate-400 mt-1">Reading text & detecting subscription details</p>
                    </div>
                )}

                {/* ── ERROR ──────────────────────────────────── */}
                {state === 'error' && (
                    <div className="text-center py-4">
                        <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-3 text-2xl">⚠️</div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Scan failed</p>
                        <p className="text-[11px] text-slate-500 mb-4">{errorMsg}</p>
                        <button
                            onClick={() => setState('idle')}
                            className="w-full py-2.5 rounded-xl border border-violet-200 text-violet-700 text-sm font-semibold hover:bg-violet-50 transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                )}

                {/* ── RESULT ─────────────────────────────────── */}
                {state === 'result' && (
                    <div>
                        {/* Screenshot thumbnail */}
                        {screenshot && (
                            <div className="mb-3 rounded-xl overflow-hidden border border-slate-100 shadow-sm" style={{ maxHeight: 120 }}>
                                <img src={screenshot} alt="Captured page" className="w-full object-cover object-top" style={{ maxHeight: 120 }} />
                            </div>
                        )}

                        {/* Confidence badge */}
                        <div className="flex items-center gap-1.5 mb-3">
                            <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{ color: conf.color, background: conf.bg }}
                            >
                                ● {conf.label}
                            </span>
                            {extracted?.confidenceScore > 0 && (
                                <span className="text-[10px] text-slate-400">{extracted.confidenceScore}%</span>
                            )}
                        </div>

                        {/* Editable extracted fields */}
                        <div className="space-y-2.5 mb-4">
                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Service Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={fields.name}
                                    onChange={handleFieldChange}
                                    placeholder="e.g. Netflix, Figma…"
                                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-violet-300 focus:border-violet-400 outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Amount</label>
                                    <input
                                        type="number"
                                        name="amount"
                                        value={fields.amount}
                                        onChange={handleFieldChange}
                                        placeholder="0.00"
                                        step="0.01"
                                        className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-violet-300 focus:border-violet-400 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Currency</label>
                                    <select
                                        name="currency"
                                        value={fields.currency}
                                        onChange={handleFieldChange}
                                        className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-violet-300 focus:border-violet-400 outline-none"
                                    >
                                        <option value="USD">USD ($)</option>
                                        <option value="EUR">EUR (€)</option>
                                        <option value="GBP">GBP (£)</option>
                                        <option value="PKR">PKR (₨)</option>
                                        <option value="INR">INR (₹)</option>
                                        <option value="AED">AED</option>
                                        <option value="SAR">SAR</option>
                                        <option value="BRL">BRL (R$)</option>
                                        <option value="TRY">TRY (₺)</option>
                                        <option value="AUD">AUD</option>
                                        <option value="CAD">CAD</option>
                                        <option value="JPY">JPY (¥)</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Billing Cycle</label>
                                <select
                                    name="billingCycle"
                                    value={fields.billingCycle}
                                    onChange={handleFieldChange}
                                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-violet-300 focus:border-violet-400 outline-none"
                                >
                                    <option value="MONTHLY">Monthly</option>
                                    <option value="YEARLY">Yearly</option>
                                    <option value="WEEKLY">Weekly</option>
                                </select>
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => setState('idle')}
                                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
                            >
                                🔄 Re-scan
                            </button>
                            <button
                                onClick={handleAddToSubDupes}
                                disabled={!fields.name}
                                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                                style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)' }}
                            >
                                ✅ Add to SubDupes
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-400 text-center mt-2">
                            Review and edit the fields above before saving
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
