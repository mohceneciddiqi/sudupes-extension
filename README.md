# SubDupes Extension

This is the browser extension for SubDupes.

## ⚠️ CRITICAL: How to Load in Chrome

**DO NOT load this root folder (`subdupes-extension`) directly.**
It contains raw source code (JSX, modern JS) that Chrome cannot execute.

### Correct Steps:
1. **Build the extension**:
   ```bash
   npm install
   npm run build
   ```
2. **Load the `dist` folder**:
   - Go to `chrome://extensions/`
   - Enable **Developer Mode** (top right)
   - Click **Load unpacked**
   - Select the **`dist`** folder inside this directory.

## Features
- **Smart Dashboard**: Visual subscription tracking.
- **Gmail Integration**: Adds "Copy BCC" button to Compose window.
- **Subscription Detection**: Auto-detects pricing on SaaS pages.
- **BCC Sync**: Syncs your user BCC alias for tracking.

## Development
- `npm run dev`: Runs in watch mode. You still need to load the `dist` folder, but it will auto-update (mostly) on changes.