# bAI Extension — MVP Specification (spec.md)

This document defines **what to build** for the bAI Chrome extension MVP and **what not to build**.  
It is authoritative for implementation.  
If anything is unclear, ask before proceeding.

The protocol used by this extension is defined in `protocol.md` and MUST be followed exactly.

---

## GOAL

Build the **smallest working Chrome MV3 extension** called **bAI** that:

- Opens a Side Panel UI from the extension icon
- Keeps the Side Panel open across tab switches
- Generates and displays protocol-compliant text messages
- Parses inbound protocol commands into a visible action queue

This MVP is **planning-only**: no browser actions are executed.

---

## NON-GOALS (DO NOT IMPLEMENT)

The following are explicitly out of scope for the MVP:

- No action execution (no clicking, typing, scrolling, screenshots, scans)
- No DOM inspection or content manipulation
- No network requests or API calls
- No authentication handling
- No automation logic
- No multi-session UI management (single active session only)
- No background persistence beyond the current browser session

---

## ARCHITECTURE (MV3)

The extension MUST use Chrome Manifest V3 and include:

### Service Worker (background)
- Opens the Side Panel when the extension icon is clicked
- Generates a `session_key` once per browser session
- Stores the `session_key` in `chrome.storage.session`
- Observes active tab changes and notifies the Side Panel

### Side Panel (primary UI)
- Displays the current session handshake
- Displays the current canonical context (`!baictx`)
- Allows the user to paste inbound AI output
- Parses inbound protocol lines
- Renders an action queue with statuses

### Content Script
- OPTIONAL for MVP
- May be included as a placeholder but must not perform DOM operations

---

## SESSION HANDLING

- A single session is active at any time
- The `session_key` is generated once per browser session
- The Side Panel displays the handshake line exactly as defined in `protocol.md`
- Manual copy/paste is the expected workflow

---

## CANONICAL CONTEXT GENERATION

The Side Panel MUST be able to generate and display a canonical context line:

!baictx {json}

Required fields:
- v (context version, use 1)
- id (unique per send, e.g. ctx000001)
- ts (timestamp)
- t (active tab id)
- u (active tab url)
- n (active tab title)
- nav (navigation state: idle | loading | navigating)

Behavior:
- Context updates when the active tab changes
- Context updates when the user clicks “Refresh ctx”
- Context is displayed as a single-line plain-text message
- Context can be copied via a button

---

## INBOUND PARSING (CORE MVP FEATURE)

The Side Panel MUST provide a textarea where the user pastes AI output.

The extension parses the pasted text line-by-line and detects:

- !baiactXXXXXX {json}
- !baiactXXXXXXdel
- !baiactXXXXXXupdNNN {json}

All other text is ignored.

---

## ACTION QUEUE MODEL

Actions are stored in memory as a map keyed by action id (XXXXXX).

Each action entry stores:
- id (string, zero-padded)
- raw (original line)
- json (parsed JSON if valid)
- status: queued | deleted | parse_error
- update_version (integer, default 0)

Delete handling:
- !baiactXXXXXXdel marks the action as deleted
- Deleted actions remain visible but are clearly marked

Update handling:
- updNNN replaces the stored action only if NNN is greater than the current version
- Older updates are ignored
- The newest update is authoritative

Validation:
- Malformed JSON must not crash the UI
- Invalid actions are shown with parse_error

---

## TAB ID CONSISTENCY CHECK

If an inbound action JSON contains a tab id (t) that does not match the latest canonical context tab id:
- Display a visible warning in the queue item
- Do NOT block parsing

---

## UI REQUIREMENTS (SIDE PANEL)

The Side Panel MUST include:

1. Session section
   - Display current session_key
   - Display handshake line:
     !baisession {"session_key":"..."}
   - Button: Copy handshake

2. Outgoing Context section
   - Display current !baictx {...}
   - Button: Copy ctx
   - Button: Refresh ctx

3. Inbound section
   - Large textarea for pasting AI output
   - Button: Parse

4. Action Queue section
   - One row per action
   - Shows action id, action type, selector (if any), status badge
   - Expandable raw line and parsed JSON

---

## PERMISSIONS

Keep permissions minimal:
- sidePanel
- storage
- tabs (only if required for active tab info)

Do NOT request host permissions for MVP.

---

## README REQUIREMENTS

The repository MUST include a README explaining:
- What the extension does (MVP scope)
- How to load it as an unpacked extension
- How to test handshake, context updates, and inbound parsing

---

## ACCEPTANCE TESTS

The MVP is complete only if:

1. Clicking the extension icon opens the Side Panel
2. The Side Panel remains open while switching tabs
3. A session_key is generated once per browser session
4. The handshake line matches protocol.md exactly
5. The !baictx line updates when the active tab changes
6. Pasting valid !baiact lines produces queue entries
7. del marks an action as deleted
8. updNNN replaces actions only when newer
9. Malformed JSON shows parse_error without crashing
10. No action execution occurs

---

## INTERPRETATION RULE

When in doubt:
- Prefer correctness over completeness
- Prefer explicit user control over automation
- Never invent protocol behavior

---

## END OF SPEC
