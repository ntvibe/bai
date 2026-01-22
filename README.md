# bAI Chrome Extension (MVP)

This repository contains a Chrome MV3 extension for the bAI MVP. It opens a Side Panel, shows the current session key, generates canonical `!baictx` messages, and parses inbound `!baiact` lines into a visible action queue. The MVP is planning-only and does not execute browser actions. It can also capture evidence (selection, text excerpt, and a compact DOM scan) from the active tab to bundle with the outgoing message.

## Load the extension (unpacked)

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository folder (`/workspace/bai`).
4. Pin the extension if desired and click the bAI icon to open the Side Panel.

## Manual MVP checks

### Initialization prompt + connection status
1. Open any chat tab in your preferred AI.
2. In the Side Panel, click **Copy init prompt**.
3. Paste the prompt as the **first message** in the chat.
4. Confirm the AI replies with a line like `!baisession {"session_key":"<SESSION_KEY>"}`.
5. Paste that reply into the Action input and click **Parse**.
6. Confirm the status dot shows **Connected**.

### Canonical context
1. Switch tabs and observe the **Message for AI** line update.
2. Click **Refresh** to regenerate the `!baictx` line.
3. Use **Copy** to copy the line for pasting into an AI.

### Evidence capture
1. Open any website tab, then open the bAI Side Panel.
2. Click **Get Text** and confirm the Message for AI bundle includes a `---TEXT---` block.
3. Click **Scan Page** and confirm the bundle includes a `---SCAN---` block.
4. Switch tabs and confirm evidence is per-tab (does not leak between tabs).
5. Click **Clear Evidence** and confirm the bundle removes evidence fields/blocks.
6. Click **Copy** and confirm the full bundle is copied as plain text.

### Action parsing (manual fallback)
1. Paste AI output that includes lines like:
   - `!baiact000001 {"v":1,"t":1,"a":"CTX","s":"","x":""}`
   - `!baiact000001del`
   - `!baiact000001upd001 {"v":1,"t":1,"a":"SCAN","s":"","x":""}`
2. Click **Parse** and confirm the **Action Queue** shows each action with status, raw line, and parsed JSON.
3. Ensure malformed JSON shows `parse_error` without crashing.
