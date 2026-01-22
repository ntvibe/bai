# bAI Chrome Extension (MVP)

This repository contains the smallest working Chrome MV3 extension for the bAI MVP. It opens a Side Panel, shows the current session key, generates canonical `!baictx` messages, and parses inbound `!baiact` lines into a visible action queue. The MVP is planning-only and does not execute browser actions.

## Load the extension (unpacked)

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository folder (`/workspace/bai`).
4. Pin the extension if desired and click the bAI icon to open the Side Panel.

## Manual MVP checks

### Initialization prompt + connection status
1. In the Side Panel, click **Copy init prompt** and paste the text as the **first message** in a new AI chat.
2. Confirm the AI replies with a line like `!baisession {"session_key":"<SESSION_KEY>"}`.
3. Paste the AI reply (or a full messy chat chunk that includes it) into **Action**.
4. Click **Scan** and verify the status dot shows **Connected** (green) and stays green until the browser session ends or the session key changes.
5. Click **Parse** with clean protocol lines and confirm the action queue updates accordingly.

### Canonical context
1. Switch tabs and observe the **Message for AI** line update.
2. Click **Refresh** to regenerate the `!baictx` line.
3. Use **Copy** to copy the line for pasting into an AI.

### Action parsing
1. Paste AI output that includes lines like:
   - `!baiact000001 {"v":1,"t":1,"a":"CTX","s":"","x":""}`
   - `!baiact000001del`
   - `!baiact000001upd001 {"v":1,"t":1,"a":"SCAN","s":"","x":""}`
2. Click **Parse** and confirm the **Action Queue** shows each action with status, raw line, and parsed JSON.
3. Ensure malformed JSON shows `parse_error` without crashing.
