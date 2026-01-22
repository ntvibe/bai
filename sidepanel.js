const sessionKeyEl = document.getElementById("session-key");
const handshakeEl = document.getElementById("handshake-line");
const contextEl = document.getElementById("context-line");
const copyHandshakeBtn = document.getElementById("copy-handshake");
const copyContextBtn = document.getElementById("copy-context");
const refreshContextBtn = document.getElementById("refresh-context");
const inboundInput = document.getElementById("inbound-input");
const parseInboundBtn = document.getElementById("parse-inbound");
const actionQueueEl = document.getElementById("action-queue");

const actions = new Map();
const actionOrder = [];
let ctxCounter = 0;
let latestContext = null;

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

async function loadSessionKey() {
  const response = await chrome.runtime.sendMessage({ type: "get_session_key" });
  const sessionKey = response?.sessionKey || "";
  sessionKeyEl.textContent = sessionKey;
  handshakeEl.textContent = formatHandshake(sessionKey);
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

function parseInboundLines(text) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
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

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "active_tab" && message.tab) {
    const ctx = buildContext(message.tab);
    contextEl.textContent = formatContext(ctx);
  }
});

loadSessionKey();
loadActiveTab();
