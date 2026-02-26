export const VIEWS = {
    AUTH: 'auth',
    DASHBOARD: 'dashboard',
    ADD_DRAFT: 'add-draft',
    ALL_SUBSCRIPTIONS: 'all-subscriptions',
    SYNC_CONFLICTS: 'sync-conflicts',
    CATEGORIES: 'categories',
    SCAN_SCREENSHOT: 'scan-screenshot',
    REVIEW_DETECTIONS: 'review-detections'
};

export const DOMAIN_CATEGORIES = {
    'netflix.com': 'Entertainment',
    'spotify.com': 'Entertainment',
    'disneyplus.com': 'Entertainment',
    'hulu.com': 'Entertainment',
    'youtube.com': 'Entertainment',
    'amazon.com': 'Shopping',
    'chatgpt.com': 'Productivity',
    'openai.com': 'Productivity',
    'claude.ai': 'Productivity',
    'notion.so': 'Productivity',
    'slack.com': 'Productivity',
    'github.com': 'Development',
    'vercel.com': 'Development',
    'digitalocean.com': 'Cloud',
    'aws.amazon.com': 'Cloud',
    'google.com': 'Cloud',
    'dropbox.com': 'Cloud Storage',
    'adobe.com': 'Creative',
    'canva.com': 'Creative',
    'zoom.us': 'Communication',
    'microsoft.com': 'Software',
    'x.com': 'Social',
    'linkedin.com': 'Pro Network'
};

export const RECEIPT_SENDERS = [
    'order@', 'billing@', 'no-reply@', 'receipts@', 'invoice@', 'subscriptions@',
    'googleplay-noreply@google.com', 'no-reply@netflix.com', 'office@microsoft.com',
    'billing@openai.com', 'notices@customer.apple.com'
];

// ─── Gmail SaaS Scanner ───────────────────────────────────────────────────

export const GMAIL_SEARCH_KEYWORDS = [
    'receipt', 'invoice', 'subscription', 'payment', 'renewal',
    'order confirmation', 'billed', 'transaction', 'thank you for your purchase',
    'billing', 'membership', 'premium', 'account summary'
];

export const GMAIL_SAAS_PROVIDERS = [
    'Netflix', 'Spotify', 'Adobe', 'Microsoft', 'Google', 'AWS', 'DigitalOcean',
    'Slack', 'Zoom', 'Canva', 'OpenAI', 'ChatGPT', 'Midjourney', 'GitHub', 'Heroku',
    'Vercel', 'Shopify', 'Mailchimp', 'Dropbox', 'iCloud', 'Disney+', 'Hulu',
    'Paramount+', 'Peacock', 'YouTube Premium', 'Figma', 'Notion', 'Calendly',
    'Grammarly', 'Dashlane', '1Password', 'NordVPN', 'Surfshark', 'ExpressVPN',
    'Squarespace', 'Wix', 'Ghost', 'Substack', 'Patreon', 'LinkedIn'
];

export const GMAIL_ENRICHED_QUERY = `subject:(${GMAIL_SEARCH_KEYWORDS.slice(0, 9).join(' OR ')}) OR (${GMAIL_SAAS_PROVIDERS.slice(0, 15).join(' OR ')}) -from:me`;
