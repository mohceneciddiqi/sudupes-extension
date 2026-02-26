/**
 * Utility for subscription calculations
 */

export const CURRENCY_SYMBOLS = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    INR: '₹',
    JPY: '¥',
    PKR: 'Rs',
    AED: 'AED',
    SAR: 'SAR',
    BRL: 'R$',
    TRY: '₺',
    AUD: 'A$',
    CAD: 'C$'
};

// Fixed rates for normalization to USD (used for budget checks)
export const USD_RATES = {
    USD: 1,
    EUR: 1.08,
    GBP: 1.26,
    INR: 0.012,
    PKR: 0.0036,
    BRL: 0.20,
    TRY: 0.031,
    AUD: 0.65,
    CAD: 0.74
};

/**
 * Normalizes an amount to USD for comparison against a budget
 */
export const normalizeToUSD = (amount, currency) => {
    return amount * (USD_RATES[currency] || 1);
};

/**
 * Normalizes a subscription amount to a monthly value
 */
export const normalizeToMonthly = (sub) => {
    let amount = Number(sub.amount || 0);
    if (sub.billingCycle === 'YEARLY') amount = amount / 12;
    else if (sub.billingCycle === 'WEEKLY') amount = amount * 4.345;
    return amount;
};

/**
 * Calculates total monthly spend in both local and normalized USD
 */
export const calculateMonthlySpend = (subscriptions) => {
    return subscriptions.reduce((acc, sub) => {
        if (sub.name?.includes('SubDupes')) return acc; // Exclude rewards

        const monthlyAmount = normalizeToMonthly(sub);
        const normalizedUSD = normalizeToUSD(monthlyAmount, sub.currency || 'USD');

        return {
            totalLocal: acc.totalLocal + monthlyAmount,
            totalNormalizedUSD: acc.totalNormalizedUSD + normalizedUSD
        };
    }, { totalLocal: 0, totalNormalizedUSD: 0 });
};

/**
 * Gets the dominant currency from a list of subscriptions
 */
export const getDominantCurrency = (subscriptions) => {
    const counts = {};
    subscriptions.forEach(s => {
        if (s.name?.includes('SubDupes')) return;
        const c = s.currency || 'USD';
        counts[c] = (counts[c] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const code = sorted.length > 0 ? sorted[0][0] : 'USD';

    return {
        code,
        symbol: CURRENCY_SYMBOLS[code] || code
    };
};
