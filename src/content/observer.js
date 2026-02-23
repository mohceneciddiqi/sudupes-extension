// DOM Observer for SubDupes
// Enhanced multi-signal subscription page detection with confidence scoring

console.log('SubDupes Observer Loaded');

// ─── Constants & Configuration ─────────────────────────────────────────────

// Price regex WITH billing cycle (e.g. $99/mo, Rs 1,299/month, ₨99/yr)
const PRICING_REGEX = /(?:[$€£¥₹₨₩₺₦₱]|Rs\.?\s?|R\$)\s?(?:\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?|\.\d{2}|,\d{2})\s?(?:[$€£¥₹₨₩₺₦₱]|USD|EUR|GBP|INR|JPY|AUD|CAD|PKR|BRL|TRY|KRW|THB|VND|MYR|NGN|EGP|ZAR|SAR|AED|BDT|LKR|NPR|PHP|IDR|SGD)?\s?(?:\/|per|mo|month|yr|year|annually|wk|week|weekly)/i;

// Currency code first WITH billing cycle (e.g. PKR 500/mo, BRL 29.90/month)
const PRICING_REGEX_CODE_FIRST = /(?:USD|EUR|GBP|INR|JPY|AUD|CAD|PKR|BRL|TRY|KRW|THB|VND|MYR|NGN|EGP|ZAR|SAR|AED|BDT|LKR|NPR|PHP|IDR|SGD)\s?(?:\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?|\.\d{2}|,\d{2})\s?(?:\/|per|mo|month|yr|year|annually|wk|week|weekly)/i;

// Standalone price (NO billing cycle required) — matches "Rs 1,299", "Rs. 2,500", "$49", "PKR 3000", etc.
const PRICE_STANDALONE_REGEX = /(?:[$€£¥₹₨₩₺₦₱]|Rs\.?\s?|R\$)\s?\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?/i;
const PRICE_STANDALONE_CODE_FIRST = /(?:USD|EUR|GBP|INR|JPY|AUD|CAD|PKR|BRL|TRY|KRW|THB|VND|MYR|NGN|EGP|ZAR|SAR|AED|BDT|LKR|NPR|PHP|IDR|SGD)\s?\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?/i;

// Number-first patterns (e.g. "9,200 Rs", "15,000Rs", "49.99 USD") — common in South Asian locales
const PRICE_NUMBER_FIRST = /\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?\s?(?:[$€£¥₹₨₩₺₦₱]|Rs\.?|R\$)/i;
const PRICE_NUMBER_FIRST_CODE = /\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?\s?(?:USD|EUR|GBP|INR|JPY|AUD|CAD|PKR|BRL|TRY|KRW|THB|VND|MYR|NGN|EGP|ZAR|SAR|AED|BDT|LKR|NPR|PHP|IDR|SGD)/i;

const CURRENCY_SYMBOLS = [
    '$', '€', '£', '¥', '₹', '₨', '₩', '₺', '₦', '₱',
    'Rs', 'R$',
    'USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD',
    'PKR', 'BRL', 'TRY', 'KRW', 'THB', 'VND', 'MYR',
    'NGN', 'EGP', 'ZAR', 'SAR', 'AED', 'BDT', 'LKR', 'NPR',
    'PHP', 'IDR', 'SGD'
];

// URL segments that indicate subscription/pricing pages
const INTERESTING_URLS = ['pricing', 'billing', 'checkout', 'plan', 'subscription', 'upgrade', 'payment', 'cart', 'subscribe', 'signup', 'premium', 'pro-plan'];

// Confidence thresholds
const CONFIDENCE_THRESHOLD = 40; // Minimum score to trigger detection
const PROMPT_THRESHOLD = 55;     // Score needed to show proactive prompt

// ─── Weighted Keyword Scoring ──────────────────────────────────────────────

const KEYWORD_WEIGHTS = {
    // High weight (5 pts) — strong subscription indicators
    high: [
        'subscribe now', 'checkout', 'upgrade plan', 'auto-renew', 'auto renew',
        'recurring billing', 'recurring payment', 'start subscription',
        'begin subscription', 'activate plan', 'confirm subscription',
        'start your free trial', 'start free trial', 'try for free',
        'add to cart', 'proceed to payment', 'complete purchase'
    ],
    // Medium weight (3 pts) — billing/plan indicators
    medium: [
        'monthly', 'yearly', 'annually', 'per month', 'per year', '/mo', '/yr',
        'billing cycle', 'billed monthly', 'billed annually', 'billed yearly',
        'subscription', 'plan', 'upgrade', 'downgrade', 'cancel anytime',
        'free trial', 'money back', 'most popular', 'best value',
        'current plan', 'change plan', 'switch plan'
    ],
    // Low weight (1 pt) — weak/contextual indicators
    low: [
        'pricing', 'premium', 'pro', 'enterprise', 'business', 'starter',
        'basic plan', 'professional', 'team', 'individual', 'personal',
        'features', 'included', 'unlimited', 'storage', 'seats', 'users',
        'compare plans', 'see all features', 'get started'
    ]
};

// ─── DOM Structure Selectors ───────────────────────────────────────────────

const PRICING_TABLE_SELECTORS = [
    '[class*="pricing"]', '[class*="Pricing"]',
    '[class*="plan-card"]', '[class*="PlanCard"]', '[class*="planCard"]',
    '[class*="price-card"]', '[class*="PriceCard"]', '[class*="priceCard"]',
    '[class*="subscription"]', '[class*="Subscription"]',
    '[class*="tier"]', '[class*="Tier"]',
    '[data-testid*="pricing"]', '[data-testid*="plan"]',
    '[id*="pricing"]', '[id*="plans"]',
    'table[class*="compare"]', '[class*="comparison"]'
];

const BILLING_TOGGLE_SELECTORS = [
    '[class*="toggle"][class*="bill"]',
    '[class*="billing-toggle"]', '[class*="billingToggle"]',
    '[class*="period-switch"]', '[class*="periodSwitch"]',
    '[role="switch"]', '[role="tablist"]',
    'input[type="radio"][name*="billing"]',
    'input[type="radio"][name*="period"]',
    'input[type="radio"][name*="cycle"]',
    'button[class*="monthly"]', 'button[class*="annual"]'
];

const PAYMENT_FORM_SELECTORS = [
    'form[action*="pay"]', 'form[action*="checkout"]', 'form[action*="subscribe"]',
    'input[name*="card"]', 'input[name*="cardNumber"]',
    'input[autocomplete="cc-number"]', 'input[autocomplete="cc-exp"]',
    'input[name*="cvv"]', 'input[name*="cvc"]',
    'iframe[src*="stripe"]', 'iframe[src*="js.stripe.com"]',
    'iframe[src*="paddle"]', 'iframe[src*="recurly"]',
    'iframe[src*="braintree"]', 'iframe[src*="chargebee"]',
    '[class*="StripeElement"]', '[class*="stripe-element"]',
    '#card-element', '#payment-element',
    'div[data-stripe]', '[data-braintree-id]'
];

const PLAN_NAME_SELECTORS = [
    '[class*="plan-name"]', '[class*="planName"]', '[class*="plan_name"]',
    '[class*="tier-name"]', '[class*="tierName"]',
    '[class*="pricing-title"]', '[class*="pricingTitle"]',
    'h2[class*="plan"]', 'h3[class*="plan"]',
    'h2[class*="pricing"]', 'h3[class*="pricing"]',
    '[class*="plan"] h2', '[class*="plan"] h3',
    '[class*="pricing"] h2', '[class*="pricing"] h3',
    '[data-testid*="plan-name"]', '[data-testid*="planName"]'
];

// ─── Confidence Scoring Engine ─────────────────────────────────────────────

function computeConfidenceScore() {
    const scores = { url: 0, keywords: 0, dom: 0, price: 0 };

    // 1. URL Signal (0-25 pts)
    const url = window.location.href.toLowerCase();
    const urlPath = window.location.pathname.toLowerCase();
    const matchedUrlKeywords = INTERESTING_URLS.filter(kw => url.includes(kw));
    scores.url = Math.min(25, matchedUrlKeywords.length * 10);

    // Bonus for path-level matches (more specific than query params)
    if (INTERESTING_URLS.some(kw => urlPath.includes(kw))) {
        scores.url = Math.min(25, scores.url + 5);
    }

    // 2. Keyword Signal (0-30 pts)
    const textContent = document.body?.innerText?.toLowerCase() || '';
    if (textContent.length > 0) {
        let keywordScore = 0;

        for (const keyword of KEYWORD_WEIGHTS.high) {
            if (textContent.includes(keyword)) keywordScore += 5;
        }
        for (const keyword of KEYWORD_WEIGHTS.medium) {
            if (textContent.includes(keyword)) keywordScore += 3;
        }
        for (const keyword of KEYWORD_WEIGHTS.low) {
            if (textContent.includes(keyword)) keywordScore += 1;
        }

        scores.keywords = Math.min(30, keywordScore);
    }

    // 3. DOM Structure Signal (0-25 pts)
    let domScore = 0;

    // Pricing tables/cards
    const pricingElements = PRICING_TABLE_SELECTORS.some(sel => {
        try { return document.querySelector(sel); } catch { return false; }
    });
    if (pricingElements) domScore += 10;

    // Billing toggle
    const hasBillingToggle = BILLING_TOGGLE_SELECTORS.some(sel => {
        try { return document.querySelector(sel); } catch { return false; }
    });
    if (hasBillingToggle) domScore += 8;

    // Payment form / checkout elements
    const hasPaymentForm = PAYMENT_FORM_SELECTORS.some(sel => {
        try { return document.querySelector(sel); } catch { return false; }
    });
    if (hasPaymentForm) domScore += 12;

    scores.dom = Math.min(25, domScore);

    // 4. Price Pattern Signal (0-20 pts)
    if (textContent.length > 0 && CURRENCY_SYMBOLS.some(s => textContent.includes(s.toLowerCase()) || textContent.includes(s))) {
        const bodyText = document.body?.innerText || '';
        // First try cycle-based regexes, then fall back to standalone currency+number
        let priceMatches = [
            ...(bodyText.match(new RegExp(PRICING_REGEX, 'g')) || []),
            ...(bodyText.match(new RegExp(PRICING_REGEX_CODE_FIRST, 'g')) || [])
        ];
        // If no cycle-based prices found, try standalone (Rs 1,299 without /mo)
        if (priceMatches.length === 0) {
            priceMatches = [
                ...(bodyText.match(new RegExp(PRICE_STANDALONE_REGEX, 'g')) || []),
                ...(bodyText.match(new RegExp(PRICE_STANDALONE_CODE_FIRST, 'g')) || []),
                ...(bodyText.match(new RegExp(PRICE_NUMBER_FIRST, 'g')) || []),
                ...(bodyText.match(new RegExp(PRICE_NUMBER_FIRST_CODE, 'g')) || [])
            ];
        }
        // Deduplicate matches that overlap across multiple regexes
        priceMatches = [...new Set(priceMatches.map(m => m.trim()))];
        // More price patterns = more likely a pricing page
        if (priceMatches.length >= 3) scores.price = 20;
        else if (priceMatches.length >= 2) scores.price = 15;
        else if (priceMatches.length >= 1) scores.price = 10;
    }

    const totalScore = scores.url + scores.keywords + scores.dom + scores.price;

    return { scores, totalScore };
}

// ─── Price Normalization Helpers ───────────────────────────────────────────

const normalizePrice = (priceStr) => {
    if (!priceStr) return null;
    let clean = priceStr.replace(/[^\d.,]/g, '').trim();
    if (!clean) return null;

    // Handle fractional prices like ".99" or ",99"
    if (clean.startsWith('.') || clean.startsWith(',')) {
        clean = '0' + clean.replace(',', '.');
    }
    clean = clean.replace(/\s+/g, '');

    const dotCount = (clean.match(/\./g) || []).length;
    const commaCount = (clean.match(/,/g) || []).length;

    if (dotCount > 1 && commaCount === 0) {
        if (!clean.includes(',')) return null;
    }
    if (commaCount > 1 && dotCount === 0) {
        if (!clean.includes('.')) return null;
    }

    // European format: comma as decimal
    if (clean.includes(',') && !clean.includes('.')) {
        return clean.replace(',', '.');
    }

    if (clean.includes(',') && clean.includes('.')) {
        const lastComma = clean.lastIndexOf(',');
        const lastDot = clean.lastIndexOf('.');
        if (lastDot > lastComma) {
            return clean.replace(/,/g, '');
        } else {
            return clean.replace(/\./g, '').replace(',', '.');
        }
    }

    return clean;
};

const detectCurrencyFromMatch = (matchStr) => {
    const str = matchStr.toUpperCase();
    if (str.includes('PKR') || matchStr.includes('₨') || /\bRs\.?\s?\d/.test(matchStr)) return 'PKR';
    if (str.includes('EUR') || matchStr.includes('€')) return 'EUR';
    if (str.includes('GBP') || matchStr.includes('£')) return 'GBP';
    if (str.includes('INR') || matchStr.includes('₹')) return 'INR';
    if (str.includes('JPY') || str.includes('YEN') || matchStr.includes('¥')) return 'JPY';
    if (str.includes('BRL') || matchStr.includes('R$')) return 'BRL';
    if (str.includes('TRY') || matchStr.includes('₺')) return 'TRY';
    if (str.includes('KRW') || matchStr.includes('₩')) return 'KRW';
    if (str.includes('NGN') || matchStr.includes('₦')) return 'NGN';
    if (str.includes('PHP') || matchStr.includes('₱')) return 'PHP';
    if (str.includes('ZAR')) return 'ZAR';
    if (str.includes('EGP')) return 'EGP';
    if (str.includes('SAR')) return 'SAR';
    if (str.includes('AED')) return 'AED';
    if (str.includes('BDT')) return 'BDT';
    if (str.includes('THB')) return 'THB';
    if (str.includes('MYR')) return 'MYR';
    if (str.includes('IDR')) return 'IDR';
    if (str.includes('SGD')) return 'SGD';
    if (str.includes('AUD')) return 'AUD';
    if (str.includes('CAD')) return 'CAD';
    if (str.includes('USD') || matchStr.includes('$')) return 'USD';
    return 'USD';
};

// ─── Data Extraction ───────────────────────────────────────────────────────

function extractSubscriptionData() {
    const textContent = document.body.innerText;
    const lines = textContent.split(/\r?\n/).filter(l => l.trim());

    let detectedPrice = null;
    let detectedCycle = 'MONTHLY';
    let detectedCurrency = 'USD';

    // A. Priority Search — lines with billing keywords
    const PRIORITY_KEYWORDS = [
        'total', 'subtotal', 'due', 'amount', 'pay', 'charge', 'price', 'plan', 'bill',
        '/mo', '/yr', '/wk', 'per month', 'annually', 'weekly', 'subscription'
    ];

    // Try cycle-based regexes first, then standalone, then number-first as fallback
    const matchesPrice = (line) => PRICING_REGEX.test(line) || PRICING_REGEX_CODE_FIRST.test(line) || PRICE_STANDALONE_REGEX.test(line) || PRICE_STANDALONE_CODE_FIRST.test(line) || PRICE_NUMBER_FIRST.test(line) || PRICE_NUMBER_FIRST_CODE.test(line);
    const extractPrice = (line) => line.match(PRICING_REGEX) || line.match(PRICING_REGEX_CODE_FIRST) || line.match(PRICE_STANDALONE_REGEX) || line.match(PRICE_STANDALONE_CODE_FIRST) || line.match(PRICE_NUMBER_FIRST) || line.match(PRICE_NUMBER_FIRST_CODE);

    const priorityLine = lines.find(line => {
        const lineLower = line.toLowerCase();
        return PRIORITY_KEYWORDS.some(kw => lineLower.includes(kw)) && matchesPrice(line);
    });

    if (priorityLine) {
        const match = extractPrice(priorityLine);
        if (match && !match[0].includes('0.00')) {
            const rawNum = match[0].match(/[\d.,]+/);
            if (rawNum) {
                const normalized = normalizePrice(rawNum[0]);
                if (normalized) {
                    detectedPrice = normalized;
                    detectedCurrency = detectCurrencyFromMatch(match[0]);
                    if (priorityLine.match(/yr|year|annually/i)) detectedCycle = 'YEARLY';
                    if (priorityLine.match(/wk|week|weekly/i)) detectedCycle = 'WEEKLY';
                }
            }
        }
    }

    // B. Fallback Search
    if (!detectedPrice) {
        let allPrices = [
            ...(textContent.match(new RegExp(PRICING_REGEX, 'g')) || []),
            ...(textContent.match(new RegExp(PRICING_REGEX_CODE_FIRST, 'g')) || [])
        ];
        // Fallback to standalone prices if no cycle-based matches
        if (allPrices.length === 0) {
            allPrices = [
                ...(textContent.match(new RegExp(PRICE_STANDALONE_REGEX, 'g')) || []),
                ...(textContent.match(new RegExp(PRICE_STANDALONE_CODE_FIRST, 'g')) || []),
                ...(textContent.match(new RegExp(PRICE_NUMBER_FIRST, 'g')) || []),
                ...(textContent.match(new RegExp(PRICE_NUMBER_FIRST_CODE, 'g')) || [])
            ];
        }
        // Deduplicate matches that overlap across multiple regexes
        allPrices = [...new Set(allPrices.map(m => m.trim()))];
        if (allPrices.length > 0) {
            const rawPrice = allPrices.find(p => !p.includes('0.00')) || allPrices[0];
            const rawNum = rawPrice.match(/[\d.,]+/);
            if (rawNum) {
                const normalized = normalizePrice(rawNum[0]);
                if (normalized) {
                    detectedPrice = normalized;
                    detectedCurrency = detectCurrencyFromMatch(rawPrice);
                }
            }
            if (rawPrice.match(/yr|year|annually/i)) detectedCycle = 'YEARLY';
        }
    }

    // Detect vendor/plan name — multi-strategy
    let detectedName = 'Unknown Service';
    let detectedPlanName = '';

    // Strategy A: Open Graph Site Name
    const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.content;

    // Strategy B: Hostname
    const hostnameParts = window.location.hostname.split('.');
    const domainName = hostnameParts.length > 2 ? hostnameParts[hostnameParts.length - 2] : hostnameParts[0];
    const formattedDomain = domainName.charAt(0).toUpperCase() + domainName.slice(1);

    if (ogSiteName) {
        detectedName = ogSiteName;
    } else if (formattedDomain) {
        detectedName = formattedDomain;
    } else {
        detectedName = document.title.split(/[-|]/)[0].trim();
    }

    // Strategy C: Extract plan name from DOM elements
    for (const selector of PLAN_NAME_SELECTORS) {
        try {
            const el = document.querySelector(selector);
            if (el && el.textContent.trim().length > 0 && el.textContent.trim().length < 50) {
                detectedPlanName = el.textContent.trim();
                break;
            }
        } catch { /* Skip invalid selectors */ }
    }

    // Strategy D: Look for highlighted/selected plan card
    if (!detectedPlanName) {
        const highlightedSelectors = [
            '[class*="selected"] [class*="plan"]',
            '[class*="active"] [class*="plan"]',
            '[class*="recommended"] h2', '[class*="recommended"] h3',
            '[class*="popular"] h2', '[class*="popular"] h3',
            '[class*="highlighted"] h2', '[class*="highlighted"] h3',
            '[aria-selected="true"] h2', '[aria-selected="true"] h3'
        ];
        for (const selector of highlightedSelectors) {
            try {
                const el = document.querySelector(selector);
                if (el && el.textContent.trim().length > 0 && el.textContent.trim().length < 50) {
                    detectedPlanName = el.textContent.trim();
                    break;
                }
            } catch { /* Skip */ }
        }
    }

    return {
        name: detectedName,
        planName: detectedPlanName,
        amount: detectedPrice,
        currency: detectedCurrency,
        billingCycle: detectedCycle,
        websiteUrl: window.location.origin
    };
}

// ─── Main Scan Function ────────────────────────────────────────────────────

function scanPageForSubscription(force = false) {
    // Quick bail: Skip non-interesting pages unless forced
    if (!force) {
        const url = window.location.href.toLowerCase();
        const isInterestingUrl = INTERESTING_URLS.some(kw => url.includes(kw));
        if (!isInterestingUrl) return;
    }

    // Quick bail: No currency symbols at all
    const textContent = document.body?.innerText || '';
    if (!CURRENCY_SYMBOLS.some(s => textContent.includes(s))) return;

    // Compute confidence score
    const { scores, totalScore } = computeConfidenceScore();
    console.log('SubDupes Confidence:', { scores, totalScore, threshold: CONFIDENCE_THRESHOLD });

    // Below threshold — not a subscription page
    if (totalScore < CONFIDENCE_THRESHOLD) return;

    // Extract subscription data
    const extracted = extractSubscriptionData();

    // Only proceed if we have a price
    if (!extracted.amount) return;

    const payload = {
        type: 'SUBSCRIPTION_DETECTED',
        data: {
            ...extracted,
            confidenceScore: totalScore,
            detectedAt: new Date().toISOString()
        }
    };

    // De-duplication: skip if identical to last sent data
    const json = JSON.stringify(payload.data);
    if (json === lastSentData) return;
    lastSentData = json;

    // Send to background service worker
    try {
        chrome.runtime.sendMessage(payload, () => {
            if (chrome.runtime.lastError) {
                console.log('Message sending failed:', chrome.runtime.lastError.message);
            }
        });
    } catch (error) {
        console.log('Failed to send message:', error);
    }

    // If confidence is high enough, request proactive prompt
    if (totalScore >= PROMPT_THRESHOLD) {
        try {
            chrome.runtime.sendMessage({
                type: 'SUBSCRIPTION_PROMPT_READY',
                data: {
                    ...extracted,
                    confidenceScore: totalScore
                }
            }, () => {
                if (chrome.runtime.lastError) {
                    // Silently ignore — prompt handler may not exist yet
                }
            });
        } catch { /* Ignore */ }
    }
}

// ─── Price Hike Alert HTML ─────────────────────────────────────────────────

const PRICE_HIKE_HTML = `
<style>
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }
</style>
<div id="subdupes-hike-alert" style="
  position: fixed;
  top: 20px;
  right: 20px;
  width: 300px;
  background: white;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  z-index: 99999;
  font-family: system-ui, -apple-system, sans-serif;
  border-left: 4px solid #F59E0B;
  animation: slideIn 0.3s ease-out;
">
  <div style="padding: 16px;">
    <div style="display: flex; justify-content: space-between; align-items: start;">
      <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: #111827;">Price Change Detected</h3>
      <button id="sd-close" style="background: none; border: none; cursor: pointer; color: #9CA3AF;">&times;</button>
    </div>
    
    <div style="margin-top: 8px; font-size: 13px; color: #4B5563;">
      <p style="margin: 0;">We noticed a difference from your last payment:</p>
      <div style="display: flex; justify-content: space-between; margin-top: 8px; padding: 8px; background: #F3F4F6; border-radius: 4px;">
        <span>Last Paid:</span>
        <span style="font-weight: 600;">$__LAST_PRICE__</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 4px; padding: 8px; background: #FEF3C7; border-radius: 4px; color: #92400E;">
        <span>Current:</span>
        <span style="font-weight: 600;">$__CURRENT_PRICE__</span>
      </div>
    </div>
  </div>
</div>
`;

// ─── Message Listeners ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // TODO: Price hike detection — these handlers are ready but the trigger
    // logic (comparing current page price vs stored subscription amount)
    // needs to be implemented in the service worker's checkUrlMatch flow.
    // When implemented, the service worker should send SHOW_PRICE_HIKE_ALERT
    // with { lastPrice, currentPrice } when a price increase is detected.
    if (message.type === 'SHOW_PRICE_HIKE_ALERT') {
        const { lastPrice, currentPrice } = message.data;
        if (document.getElementById('subdupes-hike-alert')) return;

        const container = document.createElement('div');
        container.innerHTML = PRICE_HIKE_HTML
            .replace('__LAST_PRICE__', lastPrice)
            .replace('__CURRENT_PRICE__', currentPrice);
        document.body.appendChild(container);

        document.getElementById('sd-close').onclick = () => container.remove();
    }

    if (message.type === 'CMD_SCAN_PAGE') {
        console.log('Manual scan triggered');
        scanPageForSubscription(true);
        sendResponse({ success: true });
    }
});

// ─── DOM Mutation Observer ─────────────────────────────────────────────────

let debounceTimer;
let lastSentData = null;
let lastScanTime = 0;
const MIN_SCAN_INTERVAL = 5000;

const observer = new MutationObserver((mutations) => {
    const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0);
    if (!hasAddedNodes) return;

    const isRelevant = mutations.some(m => {
        return Array.from(m.addedNodes).some(node => {
            return node.nodeType === 1 &&
                ['DIV', 'SPAN', 'P', 'SECTION', 'MAIN', 'LI', 'TD', 'FORM', 'TABLE'].includes(node.tagName);
        });
    });
    if (!isRelevant) return;

    const now = Date.now();
    const timeSinceLastScan = now - lastScanTime;

    let delay = 3000;
    if (timeSinceLastScan < MIN_SCAN_INTERVAL) {
        const remainingThrottle = MIN_SCAN_INTERVAL - timeSinceLastScan;
        delay = Math.max(3000, remainingThrottle);
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        lastScanTime = Date.now();
        scanPageForSubscription(false);
    }, delay);
});

// ─── Observer Lifecycle ────────────────────────────────────────────────────

const isInterestingPage = () => {
    const url = window.location.href.toLowerCase();
    return INTERESTING_URLS.some(kw => url.includes(kw));
};

let isObserverActive = false;

if (isInterestingPage()) {
    console.log('SubDupes: Pricing page detected, attaching observer.');
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
    });
    isObserverActive = true;
    scanPageForSubscription(false);
} else {
    console.log('SubDupes: Not a pricing page, observer dormant.');
}

// SPA Navigation Watcher
let lastUrl = window.location.href;
const urlCheckInterval = setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        lastSentData = null; // Reset de-duplication on navigation
        const shouldObserve = isInterestingPage();

        if (shouldObserve && !isObserverActive) {
            console.log('SubDupes: Page navigation - now a pricing page, starting observer.');
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: false,
                characterData: false
            });
            isObserverActive = true;
            scanPageForSubscription(false);
        } else if (!shouldObserve && isObserverActive) {
            console.log('SubDupes: Page navigation - no longer a pricing page, stopping observer.');
            observer.disconnect();
            isObserverActive = false;
            clearTimeout(debounceTimer);
        }
    }
}, 1000);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    clearInterval(urlCheckInterval);
    clearTimeout(debounceTimer);
    if (isObserverActive) {
        observer.disconnect();
    }
});
