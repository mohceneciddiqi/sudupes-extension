// Gmail Integration for SubDupes
console.log('SubDupes Gmail Module Loaded');

// Selectors for Gmail (These are heuristic and may change, hence relying on aria-labels where possible)
const COMPOSE_SELECTOR = 'div[role="dialog"][aria-label^="Compose"]'; // Compose window
const TOOLBAR_SELECTOR = 'tr.btC'; // Bottom toolbar row in compose
const BCC_INPUT_SELECTOR = 'input[name="bcc"]'; // Hidden BCC input often used by other extensions
const findBccToggle = (composeWindow) => {
    // 1. Try standard aria-label (English)
    let toggle = composeWindow.querySelector('span[role="link"][aria-label="Add Bcc"]');
    if (toggle) return toggle;

    // 2. Try known variations (French, Spanish, etc - example list)
    const knownLabels = ["Add Bcc", "Ajouter Cci", "Añadir CCO", "Bcc", "Cci", "CCO"];
    // Structural search: Find all link spans in the header area
    // Usually the header is a table or div structure. We search within the top container.
    const potentialLinks = composeWindow.querySelectorAll('span[role="link"]');
    for (let link of potentialLinks) {
        if (knownLabels.includes(link.innerText) || knownLabels.includes(link.ariaLabel)) {
            return link;
        }
    }

    return null;
};

function addBccToFields(composeWindow) {
    // Helper to perform the copy action
    const performCopy = (alias) => {
        const showSuccess = () => {
            const btn = composeWindow.querySelector('.sd-gmail-btn div');
            if (btn) {
                const originalText = btn.innerHTML;
                btn.innerText = 'Copied! Paste in BCC';
                btn.style.background = '#D1FAE5';
                btn.style.color = '#065F46';

                // Try to open BCC field if possible
                const bccLink = findBccToggle(composeWindow) || document.querySelector('span[role="link"][aria-label="Add Bcc"]');
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
                alert(`Could not copy BCC address. Access denied or clipboard error.\n\nYour Alias: ${alias}`);
            }
        };

        // Attempt 1: Modern Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(alias)
                .then(showSuccess)
                .catch(err => {
                    // Fallback if permission denied
                    fallbackCopy(alias, showSuccess, showError);
                });
        } else {
            // Fallback for older contexts
            fallbackCopy(alias, showSuccess, showError);
        }
    };

    // Helper: Legacy execCommand fallback
    const fallbackCopy = (text, onSuccess, onError) => {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;

            // Ensure invisible but part of DOM
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            document.body.appendChild(textArea);

            textArea.focus();
            textArea.select();

            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);

            if (successful) onSuccess();
            else onError(new Error('execCommand returned false'));
        } catch (err) {
            onError(err);
        }
    };

    if (!userBccAlias) {
        // Try to fetch manually (user might have just logged in)
        chrome.runtime.sendMessage({ type: 'GET_USER_BCC' }, (response) => {
            if (response && response.bccEmail) {
                userBccAlias = response.bccEmail;
                performCopy(userBccAlias);
            } else {
                alert('Please log in to SubDupes extension first to sync your BCC alias.');
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
            if (node.nodeType === 1) {
                // Check if node is compose window or contains it
                if (node.matches && node.matches(COMPOSE_SELECTOR)) {
                    injectBccButton(node);
                } else if (node.querySelectorAll) {
                    const composes = node.querySelectorAll(COMPOSE_SELECTOR);
                    composes.forEach(injectBccButton);
                }
            }
        }
    }
});

observer.observe(document.body, { childList: true, subtree: true });
