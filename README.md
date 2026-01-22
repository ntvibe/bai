# bAI Chrome Extension (MVP)

This repository contains a Chrome MV3 extension for the bAI MVP. It opens a Side Panel, shows the current session key, generates canonical `!baictx` messages, and parses inbound `!baiact` lines into a visible action queue. The MVP is planning-only and does not execute browser actions. The extension can also bind to a chat tab to automatically scan AI responses from the page DOM.

## Load the extension (unpacked)

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository folder (`/workspace/bai`).
4. Pin the extension if desired and click the bAI icon to open the Side Panel.

## Manual MVP checks

### Initialization prompt + connection status
1. Open a `chatgpt.com` conversation tab.
2. In the Side Panel, click **Copy init prompt**. This binds the current tab as the chat tab and copies the init prompt.
3. Paste the prompt as the **first message** in the chat.
4. Confirm the AI replies with a line like `!baisession {"session_key":"<SESSION_KEY>"}`.
5. Without manual paste, wait a few seconds (or click **Scan**) and confirm the status dot shows **Connected**.
6. Ask the AI to output an action line like `!baiact000001 {"v":1,"t":1,"a":"CTX","s":"","x":""}`.
7. Click **Scan** (or wait for auto-scan) and confirm the action queue populates.
8. Switch to another tab and back; the side panel should stay open and the chat tab id should remain set for the session.

### Canonical context
1. Switch tabs and observe the **Message for AI** line update.
2. Click **Refresh** to regenerate the `!baictx` line.
3. Use **Copy** to copy the line for pasting into an AI.

### Action parsing (manual fallback)
1. Paste AI output that includes lines like:
   - `!baiact000001 {"v":1,"t":1,"a":"CTX","s":"","x":""}`
   - `!baiact000001del`
   - `!baiact000001upd001 {"v":1,"t":1,"a":"SCAN","s":"","x":""}`
2. Click **Parse** and confirm the **Action Queue** shows each action with status, raw line, and parsed JSON.
3. Ensure malformed JSON shows `parse_error` without crashing.
