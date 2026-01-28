// DOM Observer for SubDupes
// Detects pricing information and potential subscription details

console.log('Use SubDupes Observer Loaded');

const PRICING_REGEX = /[\$€£]\s?\d+(?:[\.,]\d{2})?\s?(?:\/|per|mo|month|yr|year|annually)/i;
const PLAN_KEYWORDS = ['Free', 'Pro', 'Basic', 'Enterprise', 'Starter', 'Premium', 'Team'];

// Optimization: Only scan interesting pages
const INTERESTING_URLS = ['pricing', 'billing', 'checkout', 'plan', 'subscription', 'upgrade', 'payment', 'cart'];
const CURRENCY_SYMBOLS = ['$', '€', '£'];

function scanPageForSubscription(force = false) {
    // 1. FAST CHECK: URL Heuristic
    const url = window.location.href.toLowerCase();
    const isInterestingUrl = INTERESTING_URLS.some(kw => url.includes(kw));

    // STRICT GATE: If not interesting and not forced, bail out immediately.
    // This saves massive performance on 99% of browsing.
    if (!isInterestingUrl && !force) {
        return;
    }

    const textContent = document.body.innerText;

    // Quick Bloom Filter-ish (if we made it past the URL gate, or were forced):
    if (!CURRENCY_SYMBOLS.some(s => textContent.includes(s))) return;

    // ... rest of logic

    // 1. Detect Price
    // Helper: Normalize price string (e.g. "1.200,00" -> "1200.00", "12,99" -> "12.99")
    const normalizePrice = (priceStr) => {
        let clean = priceStr.replace(/[^\d\.,]/g, '');
        // Check for European format: comma at the end as decimal (e.g. 12,99)
        if (clean.includes(',') && !clean.includes('.')) {
            return clean.replace(',', '.');
        }
        if (clean.includes(',') && clean.includes('.')) {
            // Both present: if dot is first (1.200,00), it's thousand sep
            if (clean.indexOf('.') < clean.indexOf(',')) {
                return clean.replace(/\./g, '').replace(',', '.');
            }
            return clean.replace(/,/g, '');
        }
        return clean;
    };

    const detectCurrencyFromMatch = (matchStr) => {
        if (matchStr.includes('€')) return 'EUR';
        if (matchStr.includes('£')) return 'GBP';
        return 'USD';
    };

    // 1. Detect Price
    const lines = textContent.split(/\r?\n/).filter(l => l.trim());
    let detectedPrice = null;
    let detectedCycle = 'MONTHLY';
    let detectedCurrency = 'USD';

    // A. Priority Search
    // Expanded and lowercased keywords for better matching
    const PRIORITY_KEYWORDS = [
        'total', 'subtotal', 'due', 'amount', 'pay', 'charge', 'price', 'plan', 'bill',
        '/mo', '/yr', 'per month', 'annually', 'subscription'
    ];

    const priorityLine = lines.find(line => {
        const lineLower = line.toLowerCase();
        return PRIORITY_KEYWORDS.some(kw => lineLower.includes(kw)) && PRICING_REGEX.test(line);
    });

    if (priorityLine) {
        const match = priorityLine.match(PRICING_REGEX);
        if (match) {
            if (!match[0].includes('0.00')) {
                const rawNum = match[0].match(/[\d\.,]+/)[0];
                detectedPrice = normalizePrice(rawNum);
                detectedCurrency = detectCurrencyFromMatch(match[0]);

                if (priorityLine.match(/yr|year|annually/i)) detectedCycle = 'YEARLY';
                if (priorityLine.match(/wk|week|weekly/i)) detectedCycle = 'WEEKLY';
            }
        }
    }

    // B. Fallback Search
    if (!detectedPrice) {
        const allPrices = textContent.match(new RegExp(PRICING_REGEX, 'g')) || [];
        if (allPrices.length > 0) {
            const rawPrice = allPrices.find(p => !p.includes('0.00')) || allPrices[0];
            const rawNum = rawPrice.match(/[\d\.,]+/);

            if (rawNum) {
                detectedPrice = normalizePrice(rawNum[0]);
                detectedCurrency = detectCurrencyFromMatch(rawPrice);
            }
            if (rawPrice.match(/yr|year|annually/i)) detectedCycle = 'YEARLY';
        }
    }

    // 2. Detect Plan Name
    let detectedName = 'Unknown Service';

    // Strategy A: Open Graph Site Name (Most accurate)
    const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.content;

    // Strategy B: Hostname (e.g., figma.com -> Figma)
    const hostnameParts = window.location.hostname.split('.');
    const domainName = hostnameParts.length > 2 ? hostnameParts[hostnameParts.length - 2] : hostnameParts[0];
    const formattedDomain = domainName.charAt(0).toUpperCase() + domainName.slice(1);

    if (ogSiteName) {
        detectedName = ogSiteName;
    } else if (formattedDomain) {
        detectedName = formattedDomain;
    } else {
        // Fallback to title cleaning
        detectedName = document.title.split(/[-|]/)[0].trim();
    }

    if (detectedPrice) {
        const payload = {
            type: 'SUBSCRIPTION_DETECTED',
            data: {
                name: detectedName,
                amount: detectedPrice,
                currency: 'USD',
                billingCycle: detectedCycle,
                websiteUrl: window.location.origin
            }
        };

        // De-duplication Check
        const json = JSON.stringify(payload.data);
        if (json === lastSentData) {
            return; // Skip if identical to last sent
        }
        lastSentData = json;

        // Send to Background -> Popup
        try {
            chrome.runtime.sendMessage(payload);
        } catch (err) {
            // Extension context invalidated or no listener
        }
    }
}

// ... (retain listener) replaced with actual listeners:

import { PRICE_HIKE_HTML } from './alertTemplate.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SHOW_NO_HIKE_ALERT') {
        // Show "Price Safe" notification
    }

    if (message.type === 'SHOW_PRICE_HIKE_ALERT') {
        const { lastPrice, currentPrice } = message.data;

        // Check if already shown
        if (document.getElementById('subdupes-hike-alert')) return;

        const container = document.createElement('div');
        container.innerHTML = PRICE_HIKE_HTML
            .replace('__LAST_PRICE__', lastPrice)
            .replace('__CURRENT_PRICE__', currentPrice);

        document.body.appendChild(container);

        // Bind close button
        document.getElementById('sd-close').onclick = () => {
            container.remove();
        };
    }

    if (message.type === 'CMD_SCAN_PAGE') {
        console.log('Manual scan triggered');
        scanPageForSubscription(true); // FORCE SCAN
        sendResponse({ success: true });
    }
});

// Optimization: Observe DOM mutations for dynamic SPAs
let debounceTimer;
let lastSentData = null; // Cache to prevent duplicate spam
let lastScanTime = 0;
const MIN_SCAN_INTERVAL = 5000; // Minimum 5 seconds between scans (Throttling)

const observer = new MutationObserver((mutations) => {
    // 1. FILTER: Ignore mutations that don't add nodes (e.g. attribute changes)
    const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0);
    if (!hasAddedNodes) return;

    // 2. FILTER: Ignore if pure script/style injection (common in tracking pixels)
    const isRelevant = mutations.some(m => {
        return Array.from(m.addedNodes).some(node => {
            return node.nodeType === 1 &&
                ['DIV', 'SPAN', 'P', 'SECTION', 'MAIN', 'LI', 'TD'].includes(node.tagName);
        });
    });
    if (!isRelevant) return;

    // 3. THROTTLE: Check if we scanned recently
    const now = Date.now();
    if (now - lastScanTime < MIN_SCAN_INTERVAL) {
        // If throttled, maybe schedule one for later, but don't run immediately
        // Just let the debounce handle the tail end
    }

    // 4. DEBOUNCE: Wait for the storm to settle
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        lastScanTime = Date.now();
        scanPageForSubscription(false); // Passive scan
    }, 3000); // 3s settle time
});

// Optimization: Observe body but ignore attributes/characterData to save processing
observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
});

// Initial scan
scanPageForSubscription(false);
