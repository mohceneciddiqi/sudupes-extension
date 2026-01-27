// DOM Observer for SubDupes
// Detects pricing information and potential subscription details

console.log('Use SubDupes Observer Loaded');

const PRICING_REGEX = /[\$€£]\s?\d+(?:[\.,]\d{2})?\s?(?:\/|per|mo|month|yr|year|annually)/i;
const PLAN_KEYWORDS = ['Free', 'Pro', 'Basic', 'Enterprise', 'Starter', 'Premium', 'Team'];

// Optimization: Only scan interesting pages
const INTERESTING_URLS = ['pricing', 'billing', 'checkout', 'plan', 'subscription', 'upgrade', 'payment', 'cart'];
const CURRENCY_SYMBOLS = ['$', '€', '£'];

function scanPageForSubscription() {
    // 1. FAST CHECK: URL Heuristic
    const url = window.location.href.toLowerCase();
    const isInterestingUrl = INTERESTING_URLS.some(kw => url.includes(kw));

    // 2. FAST CHECK: Document content preview
    // If URL isn't interesting, check if page body *feels* like a pricing page before parsing everything.
    // We check the first 2000 chars or look for rapid indicators.
    // However, deep scans on every mutation are bad.

    // If not an "interesting" URL, we still scan but with much stricter validtion or lower frequency?
    // Actually, let's keep it simple: If URL is boring, bail out quickly unless manually triggered.
    // Wait, some pricing pages are just root domains (e.g. tool.com). We can't strictly filter by URL.

    // compromise: Only deep scan if we see at least one currency symbol in the visible text.
    // But getting textContent is expensive.

    // Let's rely on the mutation observer debounce to keep it cheap.
    // We'll increase debounce to 2500ms (2.5s) to avoid churning on animations.

    const textContent = document.body.innerText;

    // Quick Bloom FIlter-ish:
    if (!CURRENCY_SYMBOLS.some(s => textContent.includes(s))) return;

    // ... rest of logic

    // 1. Detect Price
    // Strategy: Split text into lines to find "Total" or "Subtotal" context
    const lines = textContent.split(/\r?\n/).filter(l => l.trim());
    let detectedPrice = null;
    let detectedCycle = 'MONTHLY';

    // A. Priority Search: Look for lines with "Total", "Subtotal", "Due" AND a price
    const PRIORITY_KEYWORDS = ['Total', 'Subtotal', 'Due today', 'Amount', '/mo', '/yr', 'per month'];
    const priorityLine = lines.find(line => {
        return PRIORITY_KEYWORDS.some(kw => line.includes(kw)) && PRICING_REGEX.test(line);
    });

    if (priorityLine) {
        const match = priorityLine.match(PRICING_REGEX);
        if (match) {
            // Exclude 0.00 if possible, unless it's the only total (free trial)
            if (!match[0].includes('0.00')) {
                detectedPrice = match[0].match(/[\d\.,]+/)[0];
                if (priorityLine.match(/yr|year|annually/i)) detectedCycle = 'YEARLY';
                if (priorityLine.match(/wk|week|weekly/i)) detectedCycle = 'WEEKLY';
                // console.log('SubDupes: Found Priority Price in line:', priorityLine);
            }
        }
    }

    // B. Fallback Search: First non-zero price found on page
    if (!detectedPrice) {
        const allPrices = textContent.match(new RegExp(PRICING_REGEX, 'g')) || [];
        if (allPrices.length > 0) {
            const rawPrice = allPrices.find(p => !p.includes('0.00')) || allPrices[0];
            const numMatch = rawPrice.match(/[\d\.,]+/);
            if (numMatch) detectedPrice = numMatch[0];
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

// ... (retain listener)

// Optional: Observe DOM mutations for dynamic SPAs
let debounceTimer;
let lastSentData = null; // Cache to prevent duplicate spam

const observer = new MutationObserver((mutations) => {
    // Optimization: Don't scan unless at least one mutation is big or relevant?
    // Hard to judge using mutation list.

    // Increased debounce to 2.5s to be un-intrusive
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        scanPageForSubscription();
    }, 2500);
});

// Optimization: Observe a specific container if possible, or body but with less 'subtree' depth?
// Actually 'childList' + 'subtree' is required for SPA changes.
observer.observe(document.body, { childList: true, subtree: true });

