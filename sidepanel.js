const sessionKeyEl = document.getElementById("session-key");
const contextEl = document.getElementById("context-line");
const initPromptEl = document.getElementById("init-prompt");
const copyInitPromptBtn = document.getElementById("copy-init-prompt");
const showInitPromptBtn = document.getElementById("show-init-prompt");
const initModal = document.getElementById("init-modal");
const closeInitModalBtn = document.getElementById("close-init-modal");
const copyContextBtn = document.getElementById("copy-context");
const refreshContextBtn = document.getElementById("refresh-context");
const getTextBtn = document.getElementById("get-text");
const scanPageBtn = document.getElementById("scan-page");
const clearEvidenceBtn = document.getElementById("clear-evidence");
const actionInput = document.getElementById("action-input");
const parseActionBtn = document.getElementById("parse-action");
const actionQueueEl = document.getElementById("action-queue");
const connectionStatusEl = document.getElementById("connection-status");

const CONNECTED_STORAGE = "connected_state";
const CONNECTED_SESSION_KEY = "connected_session_key";
const SEEN_LINES_STORAGE = "seen_line_hashes";
const EVIDENCE_STORAGE = "evidence_by_tab";

const actions = new Map();
const actionOrder = [];
let ctxCounter = 0;
let latestContext = null;
let latestTab = null;
let currentSessionKey = "";
let protocolText = "";
let connected = false;
let seenLineHashes = new Set();
let evidenceByTab = new Map();

function buildContext(tab, evidence) {
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
  if (evidence?.sel) {
    ctx.sel = evidence.sel;
  }
  if (evidence?.text) {
    ctx.text = evidence.text;
  }
  if (evidence?.dom) {
    ctx.dom = evidence.dom;
  }
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

function formatDomEvidence(dom) {
  return JSON.stringify(dom, null, 2);
}

function formatMessageBundle(ctx, evidence) {
  const lines = [formatContext(ctx)];
  if (evidence?.text) {
    lines.push("---TEXT---");
    lines.push(evidence.text);
  }
  if (evidence?.dom) {
    lines.push("---SCAN---");
    lines.push(formatDomEvidence(evidence.dom));
  }
  return lines.join("\n");
}

function pruneEvidence(evidence) {
  const cleaned = { ...evidence };
  if (!cleaned.sel) {
    delete cleaned.sel;
  }
  if (!cleaned.text) {
    delete cleaned.text;
  }
  if (!cleaned.dom || (Object.keys(cleaned.dom || {}).length === 0)) {
    delete cleaned.dom;
  }
  if (!cleaned.lastEvidenceTs) {
    delete cleaned.lastEvidenceTs;
  }
  return cleaned;
}

function getEvidenceForTab(tabId) {
  if (!tabId) {
    return null;
  }
  return evidenceByTab.get(tabId) || null;
}

async function persistEvidenceState() {
  const payload = {};
  evidenceByTab.forEach((value, key) => {
    payload[key] = value;
  });
  await chrome.storage.session.set({ [EVIDENCE_STORAGE]: payload });
}

async function setEvidenceForTab(tabId, updates) {
  if (!tabId) {
    return;
  }
  const existing = evidenceByTab.get(tabId) || {};
  const merged = pruneEvidence({
    ...existing,
    ...updates,
    lastEvidenceTs: new Date().toISOString(),
  });
  if (Object.keys(merged).length === 0) {
    evidenceByTab.delete(tabId);
  } else {
    evidenceByTab.set(tabId, merged);
  }
  await persistEvidenceState();
}

async function clearEvidenceForTab(tabId) {
  if (!tabId) {
    return;
  }
  evidenceByTab.delete(tabId);
  await persistEvidenceState();
}

async function loadEvidenceState() {
  const stored = await chrome.storage.session.get(EVIDENCE_STORAGE);
  const data = stored[EVIDENCE_STORAGE];
  if (!data || typeof data !== "object") {
    evidenceByTab = new Map();
    return;
  }
  evidenceByTab = new Map(
    Object.entries(data).map(([key, value]) => [Number(key), value]),
  );
}

function updateContextFromTab(tab) {
  latestTab = tab;
  const evidence = getEvidenceForTab(tab?.id);
  const ctx = buildContext(tab, evidence);
  contextEl.textContent = formatMessageBundle(ctx, evidence);
}

function refreshContextFromLatest() {
  if (!latestTab) {
    return;
  }
  updateContextFromTab(latestTab);
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

async function setConnected(value) {
  connected = value;
  updateConnectionStatus();
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

async function loadActiveTab() {
  const response = await chrome.runtime.sendMessage({ type: "request_active_tab" });
  if (response?.tab) {
    updateContextFromTab(response.tab);
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

getTextBtn?.addEventListener("click", async () => {
  const tabId = latestTab?.id;
  if (!tabId) {
    await loadActiveTab();
    return;
  }
  const response = await chrome.runtime.sendMessage({
    type: "EVIDENCE_REQUEST",
    tabId,
    requestType: "GET_TEXT_EXCERPT",
  });
  if (!response?.ok) {
    return;
  }
  await setEvidenceForTab(tabId, {
    sel: response.selection || "",
    text: response.text || "",
  });
  refreshContextFromLatest();
});

scanPageBtn?.addEventListener("click", async () => {
  const tabId = latestTab?.id;
  if (!tabId) {
    await loadActiveTab();
    return;
  }
  const response = await chrome.runtime.sendMessage({
    type: "EVIDENCE_REQUEST",
    tabId,
    requestType: "RUN_SCAN",
  });
  if (!response?.ok) {
    return;
  }
  await setEvidenceForTab(tabId, { dom: response.dom || null });
  refreshContextFromLatest();
});

clearEvidenceBtn?.addEventListener("click", async () => {
  const tabId = latestTab?.id;
  if (!tabId) {
    return;
  }
  await clearEvidenceForTab(tabId);
  refreshContextFromLatest();
});

copyInitPromptBtn.addEventListener("click", () => {
  copyText(initPromptEl.textContent);
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
    updateContextFromTab(message.tab);
  }
});

async function initializePanel() {
  await loadEvidenceState();
  await loadSessionKey();
  await loadActiveTab();
  loadProtocolText();
  loadSeenLineHashes();
}

initializePanel();
