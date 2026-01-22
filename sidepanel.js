const sessionKeyEl = document.getElementById("session-key");
const handshakeEl = document.getElementById("handshake-line");
const contextEl = document.getElementById("context-line");
const initPromptEl = document.getElementById("init-prompt");
const copyInitPromptBtn = document.getElementById("copy-init-prompt");
const copyHandshakeBtn = document.getElementById("copy-handshake");
const copyContextBtn = document.getElementById("copy-context");
const refreshContextBtn = document.getElementById("refresh-context");
const inboundInput = document.getElementById("inbound-input");
const parseInboundBtn = document.getElementById("parse-inbound");
const actionQueueEl = document.getElementById("action-queue");
const connectionStatusEl = document.getElementById("connection-status");
const inboundEventsEl = document.getElementById("inbound-events");

const CONNECTED_STORAGE = "connected_state";
const CONNECTED_SESSION_KEY = "connected_session_key";

const actions = new Map();
const actionOrder = [];
let ctxCounter = 0;
let latestContext = null;
let currentSessionKey = "";
let protocolText = "";
let connected = false;

function formatHandshake(sessionKey) {
  return `!baisession {"session_key":"${sessionKey}"}`;
}

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
    initPromptEl.value = "";
    return;
  }
  initPromptEl.value = protocolText.replaceAll("<SESSION_KEY>", currentSessionKey);
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
  if (stored[CONNECTED_SESSION_KEY] === sessionKey && stored[CONNECTED_STORAGE] === true) {
    connected = true;
  } else {
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
  currentSessionKey = sessionKey;
  sessionKeyEl.textContent = sessionKey;
  handshakeEl.textContent = formatHandshake(sessionKey);
  updateInitPrompt();
  await loadConnectionState(sessionKey);
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

function logInboundEvent(message, { warning = false } = {}) {
  if (!inboundEventsEl) {
    return;
  }
  const entry = document.createElement("div");
  entry.className = warning ? "event warning" : "event";
  entry.textContent = message;
  inboundEventsEl.prepend(entry);
}

function parseSessionEvent(line) {
  const sessionMatch = line.match(/^!baisession\s+(\{.*\})$/);
  if (sessionMatch) {
    try {
      const payload = JSON.parse(sessionMatch[1]);
      if (payload?.session_key === currentSessionKey) {
        logInboundEvent("Handshake confirmed for current session key.");
        setConnected(true);
      } else {
        logInboundEvent("Received handshake for a different session key.", { warning: true });
      }
    } catch (error) {
      logInboundEvent("Failed to parse !baisession payload.", { warning: true });
    }
    return true;
  }

  const switchMatch = line.match(/^!baiswitch\s+(\{.*\})$/);
  if (switchMatch) {
    try {
      const payload = JSON.parse(switchMatch[1]);
      const target = payload?.session_key ? ` ${payload.session_key}` : "";
      logInboundEvent(`Warning: received !baiswitch${target}.`, { warning: true });
    } catch (error) {
      logInboundEvent("Warning: received unparseable !baiswitch.", { warning: true });
    }
    return true;
  }

  return false;
}

function parseInboundLines(text) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    if (parseSessionEvent(trimmed)) {
      return;
    }

    const updateMatch = trimmed.match(/^!baiact(\d{6})upd(\d{3})\s+(\{.*\})$/);
    if (updateMatch) {
      const [, id, versionRaw, jsonText] = updateMatch;
      const version = Number.parseInt(versionRaw, 10);
      const action = ensureAction(id);
      if (Number.isNaN(version) || version <= action.update_version) {
        return;
      }
      action.raw = trimmed;
      action.update_version = version;
      try {
        action.json = JSON.parse(jsonText);
        action.status = "queued";
      } catch (error) {
        action.json = null;
        action.status = "parse_error";
      }
      return;
    }

    const deleteMatch = trimmed.match(/^!baiact(\d{6})del$/);
    if (deleteMatch) {
      const [, id] = deleteMatch;
      const action = ensureAction(id);
      action.raw = trimmed;
      action.status = "deleted";
      return;
    }

    const actionMatch = trimmed.match(/^!baiact(\d{6})\s+(\{.*\})$/);
    if (actionMatch) {
      const [, id, jsonText] = actionMatch;
      const action = ensureAction(id);
      action.raw = trimmed;
      action.update_version = Math.max(action.update_version, 0);
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

copyHandshakeBtn.addEventListener("click", () => {
  copyText(handshakeEl.textContent);
});

copyContextBtn.addEventListener("click", () => {
  copyText(contextEl.textContent);
});

refreshContextBtn.addEventListener("click", async () => {
  await loadActiveTab();
});

parseInboundBtn.addEventListener("click", () => {
  parseInboundLines(inboundInput.value);
});

copyInitPromptBtn.addEventListener("click", () => {
  copyText(initPromptEl.value);
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
