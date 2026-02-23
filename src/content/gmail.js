console.log('SubDupes Gmail Module Loaded');

const GMAIL_PRICE_REGEX = /(?:[$€£¥₹₨]|Rs\.?|R\$)\s?(?:\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?|\.\d{2}|,\d{2})\s?(?:\/|per|mo|month|yr|year|annually|wk|week|weekly)/i;
const GMAIL_RECEIPT_WORDS = ['receipt', 'invoice', 'order confirmation', 'subscription', 'payment', 'billed', 'thank you for your purchase'];
const GMAIL_KNOWN_SENDERS = ['netflix.com', 'spotify.com', 'openai.com', 'microsoft.com', 'amazon.com', 'google.com', 'apple.com', 'adobe.com', 'canva.com', 'zoom.us'];

let lastScannedThreadId = null;

// 1. Structural Selector: Dialog containing stable Gmail fields
const isComposeWindow = (node) => {
    if (!node || node.nodeType !== 1) return false;

    // Primary check: role="dialog"
    if (node.getAttribute('role') !== 'dialog') return false;

    // Secondary check: Contains Subject field or Message Body AND some generic button (toolbar loaded)
    const hasSubject = node.querySelector('input[name="subjectbox"]');
    const hasBody = node.querySelector('div[contenteditable="true"][role="textbox"]');
    const hasButton = node.querySelector('[role="button"]'); // Ensures toolbar/actions are rendering

    return !!((hasSubject || hasBody) && hasButton);
};

let userBccAlias = null;

// Fetch alias on load
chrome.runtime.sendMessage({ type: 'GET_USER_BCC' }, (response) => {
    if (chrome.runtime.lastError) {
        console.warn('Failed to fetch BCC alias:', chrome.runtime.lastError.message);
        return;
    }
    if (response?.bccEmail) {
        userBccAlias = response.bccEmail;
        console.log('SubDupes: Alias loaded', userBccAlias);
    }
});

const injectBccButton = (composeWindow) => {
    // Avoid double injection using unique marker class
    if (composeWindow.querySelector('.sd-gmail-btn')) return;

    // Strategy: robust relative injection
    // Find the bottom toolbar container
    const bottomBar = composeWindow.querySelector('.btC') ||
        composeWindow.querySelector('tr.btC') ||
        composeWindow.querySelector('div[role="toolbar"]')?.parentElement;

    if (!bottomBar) return;

    // Create button container (ALWAYS DIV, never TD to avoid breaking table structure)
    const btnContainer = document.createElement('div');
    btnContainer.className = 'sd-gmail-btn';
    btnContainer.style.padding = '0 4px';
    btnContainer.style.display = 'inline-flex'; // Safe for both flex and block contexts
    btnContainer.style.verticalAlign = 'middle';
    btnContainer.style.alignItems = 'center';

    // Create button
    const btn = document.createElement('div');
    btn.innerText = 'Copy BCC';
    btn.style.cursor = 'pointer';
    btn.style.background = '#EEF2FF';
    btn.style.color = '#4F46E5';
    btn.style.fontSize = '12px';
    btn.style.fontWeight = '600';
    btn.style.padding = '4px 8px';
    btn.style.borderRadius = '6px';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '4px';
    btn.title = 'Copy SubDupes Tracking Alias';

    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        addBccToFields(composeWindow);
    };

    btnContainer.appendChild(btn);

    // Injection Placement
    if (bottomBar.tagName === 'TR') {
        // Legacy Table Layout: Inject into the first TD (Action Cell)
        // Do NOT append a new TD. Append DIV inside existing TD.
        const firstCell = bottomBar.querySelector('td');
        if (firstCell) {
            firstCell.appendChild(btnContainer);
        }
    } else {
        // Modern Flex Layout: Inject after the first child (usually Send group)
        if (bottomBar.firstChild) {
            bottomBar.insertBefore(btnContainer, bottomBar.firstChild.nextSibling);
        } else {
            bottomBar.appendChild(btnContainer);
        }
    }
};

// ... (findBccToggle and addBccToFields remain same) ...

const findBccToggle = (composeWindow) => {
    // 1. Try standard aria-label (English)
    let toggle = composeWindow.querySelector('span[role="link"][aria-label="Add Bcc"]');
    if (toggle) return toggle;

    // 2. Try known variations (French, Spanish, etc - example list)
    const knownLabels = ["Add Bcc", "Ajouter Cci", "Añadir CCO", "Bcc", "Cci", "CCO"];
    const potentialLinks = composeWindow.querySelectorAll('span[role="link"]');
    for (let link of potentialLinks) {
        if (knownLabels.includes(link.innerText) || knownLabels.includes(link.ariaLabel)) {
            return link;
        }
    }
    return null;
};

// ... (addBccToFields implementation from line 79 to 168) ...
function addBccToFields(composeWindow) {
    const performCopy = (alias) => {
        const showSuccess = () => {
            const btn = composeWindow.querySelector('.sd-gmail-btn div');
            if (btn) {
                const originalText = btn.innerHTML;
                btn.innerText = 'Copied! Paste in BCC';
                btn.style.background = '#D1FAE5';
                btn.style.color = '#065F46';

                // Try to open BCC field
                const bccLink = findBccToggle(composeWindow);
                if (bccLink && bccLink.offsetParent !== null) {
                    bccLink.click();
                }

                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.style.background = '#EEF2FF';
                    btn.style.color = '#4F46E5';
                }, 3000);
            }
        };

        const showError = (err) => {
            console.error('SubDupes Copy Failed:', err);
            const btn = composeWindow.querySelector('.sd-gmail-btn div');
            if (btn) {
                btn.innerText = 'Copy Failed ❌';
                btn.style.background = '#FEE2E2';
                btn.style.color = '#B91C1C';
                alert(`Could not copy BCC address.\n\nYour Alias: ${alias}`);
            }
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(alias).then(showSuccess).catch(() => fallbackCopy(alias, showSuccess, showError));
        } else {
            fallbackCopy(alias, showSuccess, showError);
        }
    };

    const fallbackCopy = (text, onSuccess, onError) => {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (successful) onSuccess();
            else onError(new Error('execCommand fail'));
        } catch (err) {
            onError(err);
        }
    };

    // Lazy re-fetch: if alias is null (user wasn't logged in when page loaded),
    // fetch it now and cache for subsequent clicks
    if (!userBccAlias) {
        chrome.runtime.sendMessage({ type: 'GET_USER_BCC' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Failed to fetch BCC alias:', chrome.runtime.lastError.message);
                alert('Failed to connect to SubDupes extension. Please reload the page.');
                return;
            }
            if (response && response.bccEmail) {
                userBccAlias = response.bccEmail; // Cache for subsequent clicks
                performCopy(userBccAlias);
            } else {
                alert('Please log in to SubDupes extension first.');
            }
        });
        return;
    }
    performCopy(userBccAlias);
}


// ─── Thread Scanner (Feature 5) ───────────────────────────────────────────

const scanGmailThread = () => {
    // Check if we are in a thread view
    const threadContainer = document.querySelector('div[role="main"] .if');
    if (!threadContainer) return;

    // Use Gmail's thread ID from URL if possible to avoid re-scanning
    const threadId = (window.location.hash.match(/#\w+\/([\w\d]+)/) || [])[1];
    if (threadId === lastScannedThreadId) return;
    lastScannedThreadId = threadId;

    console.log('SubDupes: Scanning thread for receipts...');

    const bodyText = threadContainer.innerText || '';

    // Heuristic: Must be from a known sender or contain receipt keywords
    const senderEl = document.querySelector('.gD');
    let senderDomain = '';
    let isWhitelisted = false;

    if (senderEl) {
        const email = senderEl.getAttribute('email') || '';
        senderDomain = email.split('@')[1]?.toLowerCase() || '';
        isWhitelisted = GMAIL_KNOWN_SENDERS.some(domain => senderDomain.includes(domain));
    }

    const hasReceiptWord = GMAIL_RECEIPT_WORDS.some(word => bodyText.toLowerCase().includes(word));

    // If not on whitelist and no receipt words, skip
    if (!isWhitelisted && !hasReceiptWord) return;

    const priceMatch = bodyText.match(GMAIL_PRICE_REGEX);
    if (!priceMatch) return;

    // Heuristic: If we have a price and a receipt word/whitelist, it's likely a receipt
    const rawPrice = priceMatch[0];

    // Improve formatting handling (Feature 5: Fix European format)
    let cleanPrice = rawPrice.replace(/[^\d.,]/g, '').trim();
    // If it has coma as decimal (e.g. 19,99) or European style (1.299,99)
    const dotCount = (cleanPrice.match(/\./g) || []).length;
    const commaCount = (cleanPrice.match(/,/g) || []).length;

    if (commaCount === 1 && dotCount === 0) {
        cleanPrice = cleanPrice.replace(',', '.'); // 19,99 -> 19.99
    } else if (commaCount === 1 && dotCount === 1) {
        // Assume last one is decimal if it's after the dot
        if (cleanPrice.lastIndexOf(',') > cleanPrice.lastIndexOf('.')) {
            cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.'); // 1.299,99 -> 1299.99
        } else {
            cleanPrice = cleanPrice.replace(/,/g, ''); // 1,299.99 -> 1299.99
        }
    } else {
        cleanPrice = cleanPrice.replace(/,/g, '');
    }

    const amount = parseFloat(cleanPrice);
    if (!amount || amount <= 0) return;

    // Extract service name from sender
    let serviceName = senderDomain ? senderDomain.split('.')[0] : 'Subscription';
    serviceName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1);

    // Expand Currency Detection (Feature 6)
    let currency = 'USD';
    const pUpper = rawPrice.toUpperCase();
    if (rawPrice.includes('€')) currency = 'EUR';
    else if (rawPrice.includes('£')) currency = 'GBP';
    else if (rawPrice.includes('₹')) currency = 'INR';
    else if (rawPrice.includes('₨') || pUpper.includes('RS')) currency = 'PKR';
    else if (rawPrice.includes('R$')) currency = 'BRL';
    else if (rawPrice.includes('₺')) currency = 'TRY';

    chrome.runtime.sendMessage({
        type: 'RECEIPT_DETECTED',
        data: {
            name: serviceName,
            amount: amount,
            currency: currency,
            websiteUrl: senderDomain || '',
            billingCycle: rawPrice.toLowerCase().includes('yr') ? 'YEARLY' : 'MONTHLY',
            source: 'GMAIL_SCAN'
        }
    });
};

// Observer for new compose windows and thread views
const observer = new MutationObserver((mutations) => {
    let shouldScanThread = false;

    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (isComposeWindow(node)) {
                injectBccButton(node);
            } else if (node.nodeType === 1 && node.querySelectorAll) {
                const dialogs = node.querySelectorAll('div[role="dialog"]');
                dialogs.forEach(dialog => {
                    if (isComposeWindow(dialog)) injectBccButton(dialog);
                });

                // Check for thread entry
                if (node.classList?.contains('if') || node.querySelector('.if')) {
                    shouldScanThread = true;
                }
            }
        }
    }

    if (shouldScanThread) {
        setTimeout(scanGmailThread, 1000); // Wait for body to load
    }
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial scan
if (window.location.hash.includes('#')) {
    setTimeout(scanGmailThread, 2000);
}
