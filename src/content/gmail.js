// Gmail Integration for SubDupes
console.log('SubDupes Gmail Module Loaded');

// Selectors for Gmail (These are heuristic and may change, hence relying on aria-labels where possible)
const COMPOSE_SELECTOR = 'div[role="dialog"][aria-label^="Compose"]'; // Compose window
const TOOLBAR_SELECTOR = 'tr.btC'; // Bottom toolbar row in compose
const BCC_INPUT_SELECTOR = 'input[name="bcc"]'; // Hidden BCC input often used by other extensions
const BCC_LINK_SELECTOR = 'span[role="link"][aria-label="Add Bcc"]'; // "Bcc" toggle link

let userBccAlias = null;

// Ask background for user alias
chrome.runtime.sendMessage({ type: 'GET_USER_BCC' }, (response) => {
    if (response && response.bccEmail) {
        userBccAlias = response.bccEmail;
        console.log('SubDupes: BCC Alias loaded');
    }
});

function injectBccButton(composeWindow) {
    if (composeWindow.dataset.sdInjected) return;

    const toolbar = composeWindow.querySelector(TOOLBAR_SELECTOR);
    if (!toolbar) return;

    const btnRow = toolbar.querySelector('td:nth-child(1) > div'); // Send button container
    if (!btnRow) return;

    const button = document.createElement('div');
    button.className = 'sd-gmail-btn';
    button.innerHTML = `
    <div style="cursor: pointer; margin-left: 8px; display: inline-flex; align-items: center; background: #EEF2FF; color: #4F46E5; padding: 4px 8px; border-radius: 4px; font-size: 13px; font-weight: 500;" title="Copy SubDupes Tracking Address">
      <span style="margin-right: 4px;">📋</span> Copy BCC
    </div>
  `;

    button.onclick = () => {
        addBccToFields(composeWindow);
    };

    // Insert after send button group
    btnRow.appendChild(button);
    composeWindow.dataset.sdInjected = 'true';
}

function addBccToFields(composeWindow) {
    if (!userBccAlias) {
        alert('Please log in to SubDupes extension first to sync your BCC alias.');
        return;
    }

    navigator.clipboard.writeText(userBccAlias).then(() => {
        const btn = composeWindow.querySelector('.sd-gmail-btn div');
        const originalText = btn.innerHTML;

        btn.innerText = 'Copied! Paste in BCC';
        btn.style.background = '#D1FAE5';
        btn.style.color = '#065F46';

        // Try to open BCC field if possible (best effort)
        const bccLink = composeWindow.querySelector(BCC_LINK_SELECTOR) || document.querySelector(BCC_LINK_SELECTOR);
        if (bccLink && bccLink.offsetParent !== null) {
            bccLink.click();
        }

        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '#EEF2FF';
            btn.style.color = '#4F46E5';
        }, 3000);
    });
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
