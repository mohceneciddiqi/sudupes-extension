// Gmail Integration for SubDupes
console.log('SubDupes Gmail Module Loaded');

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

    if (!userBccAlias) {
        chrome.runtime.sendMessage({ type: 'GET_USER_BCC' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Failed to fetch BCC alias:', chrome.runtime.lastError.message);
                alert('Failed to connect to SubDupes extension. Please reload the page.');
                return;
            }
            if (response && response.bccEmail) {
                userBccAlias = response.bccEmail;
                performCopy(userBccAlias);
            } else {
                alert('Please log in to SubDupes extension first.');
            }
        });
        return;
    }
    performCopy(userBccAlias);
}


// Observer for new compose windows
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (isComposeWindow(node)) {
                injectBccButton(node);
            } else if (node.nodeType === 1 && node.querySelectorAll) {
                // Determine if any children are valid compose windows (e.g. if a container was added)
                // We search for the toolbar class within dialogs because selectors are cheaper than full checks
                const dialogs = node.querySelectorAll('div[role="dialog"]');
                dialogs.forEach(dialog => {
                    if (isComposeWindow(dialog)) injectBccButton(dialog);
                });
            }
        }
    }
});

observer.observe(document.body, { childList: true, subtree: true });
