const sessionKeyEl = document.getElementById("session-key");
const contextEl = document.getElementById("context-line");
const initPromptEl = document.getElementById("init-prompt");
const copyInitPromptBtn = document.getElementById("copy-init-prompt");
const showInitPromptBtn = document.getElementById("show-init-prompt");
const initModal = document.getElementById("init-modal");
const closeInitModalBtn = document.getElementById("close-init-modal");
const copyContextBtn = document.getElementById("copy-context");
const refreshContextBtn = document.getElementById("refresh-context");
const actionInput = document.getElementById("action-input");
const parseActionBtn = document.getElementById("parse-action");
const scanActionBtn = document.getElementById("scan-action");
const actionQueueEl = document.getElementById("action-queue");
const connectionStatusEl = document.getElementById("connection-status");
const chatTabStatusEl = document.getElementById("chat-tab-status");
const scanStatusEl = document.getElementById("scan-status");
const autoScanToggle = document.getElementById("auto-scan-toggle");

const CONNECTED_STORAGE = "connected_state";
const CONNECTED_SESSION_KEY = "connected_session_key";
const CHAT_TAB_STORAGE = "chat_tab_id";
const SEEN_LINES_STORAGE = "seen_line_hashes";
const AUTO_SCAN_STORAGE = "auto_scan_enabled";

const actions = new Map();
const actionOrder = [];
let ctxCounter = 0;
let latestContext = null;
let currentSessionKey = "";
let protocolText = "";
let connected = false;
let chatTabId = null;
let autoScanEnabled = true;
let autoScanTimer = null;
let scanInFlight = false;
let seenLineHashes = new Set();
let lastScanAt = null;

function buildContext(tab) {
  ctxCounter += 1;
  const ctxId = `ctx${ctxCounter.toString().padStart(6, "0")}`;
  const nav = resolveNavState(tab);
  const ctx = {
    v: 1,
    id: ctxId,
    ts: new Date().toISOString(),
    t: tab?.id ?? null,
    u: tab?.url ?? "",
    n: tab?.title ?? "",
    nav,
  };
  latestContext = ctx;
  return ctx;
}

function resolveNavState(tab) {
  if (!tab) {
    return "idle";
  }
  if (tab.status === "loading") {
    if (tab.pendingUrl && tab.pendingUrl !== tab.url) {
      return "navigating";
    }
    return "loading";
  }
  return "idle";
}

function formatContext(ctx) {
  return `!baictx ${JSON.stringify(ctx)}`;
}

async function loadProtocolText() {
  try {
    const response = await fetch(chrome.runtime.getURL("protocol.md"));
    protocolText = await response.text();
  } catch (error) {
    console.warn("Failed to load protocol text", error);
    protocolText = "";
  }
  updateInitPrompt();
}

function updateInitPrompt() {
  if (!initPromptEl) {
    return;
  }
  if (!protocolText || !currentSessionKey) {
    initPromptEl.textContent = "";
    return;
  }
  initPromptEl.textContent = protocolText.replaceAll("<SESSION_KEY>", currentSessionKey);
}

function updateConnectionStatus() {
  if (!connectionStatusEl) {
    return;
  }
  connectionStatusEl.classList.toggle("connected", connected);
  const label = connectionStatusEl.querySelector(".status-label");
  if (label) {
    label.textContent = connected ? "Connected" : "Disconnected";
  }
}

function updateChatTabStatus() {
  if (!chatTabStatusEl) {
    return;
  }
  chatTabStatusEl.textContent = `chat tab: ${chatTabId ?? "not set"}`;
}

function formatScanTime(date) {
  if (!date) {
    return "never";
  }
  return date.toLocaleTimeString();
}

function updateScanStatus(foundCount, message) {
  if (!scanStatusEl) {
    return;
  }
  scanStatusEl.classList.toggle("warning", Boolean(message));
  if (message) {
    scanStatusEl.textContent = message;
    return;
  }
  scanStatusEl.textContent = `Last scan: ${formatScanTime(lastScanAt)} | Found: ${foundCount}`;
}

function hashLine(line) {
  let hash = 0;
  for (let i = 0; i < line.length; i += 1) {
    hash = (hash << 5) - hash + line.charCodeAt(i);
    hash |= 0;
  }
  return `${hash}`;
}

async function loadSeenLineHashes() {
  const stored = await chrome.storage.session.get(SEEN_LINES_STORAGE);
  const hashes = stored[SEEN_LINES_STORAGE];
  if (Array.isArray(hashes)) {
    seenLineHashes = new Set(hashes);
  }
}

async function persistSeenLineHashes() {
  await chrome.storage.session.set({ [SEEN_LINES_STORAGE]: Array.from(seenLineHashes) });
}

function updateAutoScanTimer() {
  if (autoScanTimer) {
    clearInterval(autoScanTimer);
    autoScanTimer = null;
  }
  if (!autoScanEnabled || !connected || !chatTabId) {
    return;
  }
  autoScanTimer = setInterval(() => {
    scanChatTab();
  }, 2500);
}

async function setConnected(value) {
  connected = value;
  updateConnectionStatus();
  updateAutoScanTimer();
  if (currentSessionKey) {
    await chrome.storage.session.set({
      [CONNECTED_STORAGE]: connected,
      [CONNECTED_SESSION_KEY]: currentSessionKey,
    });
  }
}

async function loadConnectionState(sessionKey) {
  const stored = await chrome.storage.session.get([CONNECTED_STORAGE, CONNECTED_SESSION_KEY]);
  connected = stored[CONNECTED_SESSION_KEY] === sessionKey && stored[CONNECTED_STORAGE] === true;
  if (stored[CONNECTED_SESSION_KEY] !== sessionKey) {
    connected = false;
    await chrome.storage.session.set({
      [CONNECTED_STORAGE]: false,
      [CONNECTED_SESSION_KEY]: sessionKey,
    });
  }
  updateConnectionStatus();
}

async function loadSessionKey() {
  const response = await chrome.runtime.sendMessage({ type: "get_session_key" });
  const sessionKey = response?.sessionKey || "";
  if (currentSessionKey && currentSessionKey !== sessionKey) {
    connected = false;
  }
  currentSessionKey = sessionKey;
  sessionKeyEl.textContent = sessionKey;
  updateInitPrompt();
  await loadConnectionState(sessionKey);
}

async function loadChatTabState() {
  const stored = await chrome.storage.session.get([CHAT_TAB_STORAGE, AUTO_SCAN_STORAGE]);
  chatTabId = stored[CHAT_TAB_STORAGE] ?? null;
  autoScanEnabled = stored[AUTO_SCAN_STORAGE] !== false;
  if (autoScanToggle) {
    autoScanToggle.checked = autoScanEnabled;
  }
  updateChatTabStatus();
  updateAutoScanTimer();
}

async function loadActiveTab() {
  const response = await chrome.runtime.sendMessage({ type: "request_active_tab" });
  if (response?.tab) {
    const ctx = buildContext(response.tab);
    contextEl.textContent = formatContext(ctx);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.warn("Clipboard write failed", error);
  }
}

function ensureAction(id) {
  if (!actions.has(id)) {
    actions.set(id, {
      id,
      raw: "",
      json: null,
      status: "queued",
      update_version: 0,
    });
    actionOrder.push(id);
  }
  return actions.get(id);
}

function isFenceLine(line) {
  return line.startsWith("```");
}

function extractJsonSubstring(line) {
  const start = line.indexOf("{");
  const end = line.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return line.slice(start, end + 1);
}

function maybeSetConnectedFromLine(line) {
  if (!line.startsWith("!baisession")) {
    return;
  }
  const jsonText = extractJsonSubstring(line);
  if (!jsonText) {
    return;
  }
  try {
    const payload = JSON.parse(jsonText);
    if (payload?.session_key === currentSessionKey) {
      setConnected(true);
    }
  } catch (error) {
    console.warn("Failed to parse !baisession payload.", error);
  }
}

function normalizeLines(lines) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line && !isFenceLine(line));
}

async function handleProtocolLines(lines, { dedupe } = { dedupe: false }) {
  const cleaned = normalizeLines(lines).filter(
    (line) => line.startsWith("!baisession") || line.startsWith("!baiact"),
  );

  const actionable = [];
  cleaned.forEach((line) => {
    maybeSetConnectedFromLine(line);
    if (line.startsWith("!baisession")) {
      return;
    }
    if (!dedupe) {
      actionable.push(line);
      return;
    }
    const isUpdate = /^!baiact\d{6}upd\d{3}\b/.test(line);
    const hash = hashLine(line);
    if (!isUpdate && seenLineHashes.has(hash)) {
      return;
    }
    seenLineHashes.add(hash);
    actionable.push(line);
  });

  if (dedupe) {
    await persistSeenLineHashes();
  }

  if (actionable.length) {
    parseProtocolLines(actionable);
  } else {
    renderQueue();
  }
}

function parseProtocolLines(lines) {
  lines.forEach((line) => {
    if (line.startsWith("!baisession")) {
      return;
    }

    const updateMatch = line.match(/^!baiact(\d{6})upd(\d{3})\b/);
    if (updateMatch) {
      const [, id, versionRaw] = updateMatch;
      const version = Number.parseInt(versionRaw, 10);
      const action = ensureAction(id);
      if (Number.isNaN(version) || version <= action.update_version) {
        return;
      }
      action.raw = line;
      action.update_version = version;
      const jsonText = extractJsonSubstring(line);
      if (!jsonText) {
        action.json = null;
        action.status = "parse_error";
        return;
      }
      try {
        action.json = JSON.parse(jsonText);
        action.status = "queued";
      } catch (error) {
        action.json = null;
        action.status = "parse_error";
      }
      return;
    }

    const deleteMatch = line.match(/^!baiact(\d{6})del\b/);
    if (deleteMatch) {
      const [, id] = deleteMatch;
      const action = ensureAction(id);
      action.raw = line;
      action.status = "deleted";
      return;
    }

    const actionMatch = line.match(/^!baiact(\d{6})\b/);
    if (actionMatch) {
      const [, id] = actionMatch;
      const action = ensureAction(id);
      action.raw = line;
      action.update_version = Math.max(action.update_version, 0);
      const jsonText = extractJsonSubstring(line);
      if (!jsonText) {
        action.json = null;
        action.status = "parse_error";
        return;
      }
      try {
        action.json = JSON.parse(jsonText);
        action.status = "queued";
      } catch (error) {
        action.json = null;
        action.status = "parse_error";
      }
    }
  });

  renderQueue();
}

function getActionSummary(action) {
  if (!action.json) {
    return { type: "", selector: "" };
  }
  return {
    type: action.json.a || "",
    selector: action.json.s || "",
  };
}

function renderQueue() {
  actionQueueEl.innerHTML = "";
  actionOrder.forEach((id) => {
    const action = actions.get(id);
    if (!action) {
      return;
    }
    const { type, selector } = getActionSummary(action);
    const item = document.createElement("div");
    item.className = "queue-item";

    const header = document.createElement("div");
    header.className = "queue-header";

    const title = document.createElement("div");
    title.className = "queue-title";
    title.textContent = `#${id} ${type || "(unknown)"}`;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = action.status;
    if (action.status === "deleted") {
      badge.classList.add("deleted");
    }
    if (action.status === "parse_error") {
      badge.classList.add("error");
    }

    header.appendChild(title);
    header.appendChild(badge);

    const selectorEl = document.createElement("div");
    selectorEl.textContent = selector ? `Selector: ${selector}` : "Selector: (none)";

    item.appendChild(header);
    item.appendChild(selectorEl);

    const warnings = document.createElement("div");
    warnings.className = "warning";
    if (action.json && latestContext && action.json.t !== undefined) {
      if (action.json.t !== latestContext.t) {
        warnings.textContent = "Warning: action tab id does not match current context.";
      }
    }
    if (warnings.textContent) {
      item.appendChild(warnings);
    }

    const rawDetails = document.createElement("details");
    const rawSummary = document.createElement("summary");
    rawSummary.textContent = "Raw line";
    const rawContent = document.createElement("pre");
    rawContent.textContent = action.raw || "";
    rawDetails.appendChild(rawSummary);
    rawDetails.appendChild(rawContent);

    const jsonDetails = document.createElement("details");
    const jsonSummary = document.createElement("summary");
    jsonSummary.textContent = "Parsed JSON";
    const jsonContent = document.createElement("pre");
    jsonContent.textContent = action.json ? JSON.stringify(action.json, null, 2) : "(none)";
    jsonDetails.appendChild(jsonSummary);
    jsonDetails.appendChild(jsonContent);

    item.appendChild(rawDetails);
    item.appendChild(jsonDetails);

    actionQueueEl.appendChild(item);
  });
}

async function scanChatTab() {
  if (scanInFlight) {
    return;
  }
  scanInFlight = true;
  updateScanStatus(0, null);
  if (!chatTabId) {
    updateScanStatus(0, "Cannot scan: chat tab not set.");
    scanInFlight = false;
    return;
  }
  const response = await chrome.runtime.sendMessage({
    type: "CHAT_SCAN_REQUEST",
    chatTabId,
  });
  if (response?.error === "NO_PERMISSION") {
    updateScanStatus(0, "Cannot read chat tab; grant permission for this site.");
    scanInFlight = false;
    return;
  }
  if (response?.error) {
    updateScanStatus(0, "Unable to scan chat tab.");
    scanInFlight = false;
    return;
  }
  const lines = Array.isArray(response?.lines) ? response.lines : [];
  lastScanAt = new Date();
  await handleProtocolLines(lines, { dedupe: true });
  updateScanStatus(lines.length, null);
  scanInFlight = false;
}

copyContextBtn.addEventListener("click", () => {
  copyText(contextEl.textContent);
});

refreshContextBtn.addEventListener("click", async () => {
  await loadActiveTab();
});

parseActionBtn.addEventListener("click", async () => {
  const rawLines = actionInput.value.split(/\r?\n/);
  await handleProtocolLines(rawLines, { dedupe: false });
});

scanActionBtn.addEventListener("click", () => {
  scanChatTab();
});

copyInitPromptBtn.addEventListener("click", () => {
  copyText(initPromptEl.textContent);
  chrome.runtime.sendMessage({ type: "request_active_tab" }).then((response) => {
    if (!response?.tab?.id) {
      return;
    }
    chatTabId = response.tab.id;
    chrome.storage.session.set({ [CHAT_TAB_STORAGE]: chatTabId });
    chrome.runtime.sendMessage({ type: "set_chat_tab", tabId: chatTabId });
    updateChatTabStatus();
    updateAutoScanTimer();
  });
});

autoScanToggle?.addEventListener("change", () => {
  autoScanEnabled = autoScanToggle.checked;
  chrome.storage.session.set({ [AUTO_SCAN_STORAGE]: autoScanEnabled });
  updateAutoScanTimer();
});

showInitPromptBtn.addEventListener("click", () => {
  if (!initModal) {
    return;
  }
  initModal.classList.add("open");
  initModal.setAttribute("aria-hidden", "false");
});

closeInitModalBtn.addEventListener("click", () => {
  if (!initModal) {
    return;
  }
  initModal.classList.remove("open");
  initModal.setAttribute("aria-hidden", "true");
});

initModal?.addEventListener("click", (event) => {
  if (event.target === initModal) {
    initModal.classList.remove("open");
    initModal.setAttribute("aria-hidden", "true");
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "active_tab" && message.tab) {
    const ctx = buildContext(message.tab);
    contextEl.textContent = formatContext(ctx);
  }
});

loadSessionKey();
loadActiveTab();
loadProtocolText();
loadChatTabState();
loadSeenLineHashes();
updateScanStatus(0, null);
