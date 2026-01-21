// sidepanel.js
// Testing:
// 1) Load unpacked extension and open a ChatGPT tab + side panel.
// 2) Click “Copy protocol” and paste into chat.
// 3) Click “Scan chat”; if ACK is copied, paste it into chat.
// 4) Ask AI for BAI_ACTION lines, scan again, add actions to run list, and play.
// 5) Record a click and confirm only one recorded item appears.
const STORAGE_KEY = "bai_state_v2";

const recordBtn = document.getElementById("recordBtn");
const playBtn = document.getElementById("playBtn");
const clearBtn = document.getElementById("clearBtn");
const banner = document.getElementById("banner");

const copyProtocolBtn = document.getElementById("copyProtocolBtn");
const scanChatBtn = document.getElementById("scanChatBtn");

const runListEl = document.getElementById("runList");
const runEmptyEl = document.getElementById("runEmpty");
const runCountEl = document.getElementById("runCount");

const aiListEl = document.getElementById("aiList");
const aiEmptyEl = document.getElementById("aiEmpty");
const aiCountEl = document.getElementById("aiCount");

const recListEl = document.getElementById("recList");
const recEmptyEl = document.getElementById("recEmpty");
const recCountEl = document.getElementById("recCount");

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const workflowText = document.getElementById("workflowText");

const toastEl = document.getElementById("toast");

const settingsBtn = document.getElementById("settingsBtn");
const modalBackdrop = document.getElementById("modalBackdrop");
const delayInput = document.getElementById("delayInput");
const cancelSettings = document.getElementById("cancelSettings");
const saveSettings = document.getElementById("saveSettings");

let protocol = null;

let state = {
  workflow_id: null,
  delaySec: 0.6,
  recording: false,
  playing: false,

  // status flags
  awaiting_ack: false,
  ready: false,

  recorded: [],   // { id, label, selector, url, ts }
  ai_actions: [], // { key, protocol, workflow_id, action_id, type, payload, raw }
  run_list: []    // { id, source, type, label, payload }
};

let lastRecordedSelector = null;
let lastRecordedAt = 0;
const recordFingerprints = new Map();

function clampNum(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
function round1(n) { return Math.round(n * 10) / 10; }

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("on");
  clearTimeout(toastEl.__t);
  toastEl.__t = setTimeout(() => toastEl.classList.remove("on"), 1800);
}

async function loadProtocol() {
  const url = chrome.runtime.getURL("protocol.json");
  const res = await fetch(url);
  protocol = await res.json();
}

async function loadState() {
  const got = await chrome.storage.local.get([STORAGE_KEY]);
  if (got?.[STORAGE_KEY]) state = { ...state, ...got[STORAGE_KEY] };
  normalizeState();
  renderAll();
}

function normalizeState() {
  state.delaySec = clampNum(Number(state.delaySec ?? 0.6), 0.1, 10);
  state.recording = !!state.recording;
  state.playing = !!state.playing;
  state.awaiting_ack = !!state.awaiting_ack;
  state.ready = !!state.ready;

  if (!Array.isArray(state.recorded)) state.recorded = [];
  if (!Array.isArray(state.ai_actions)) state.ai_actions = [];
  if (!Array.isArray(state.run_list)) state.run_list = [];

  state.recorded = state.recorded.filter(x => x && typeof x === "object" && x.selector);
  state.ai_actions = state.ai_actions.filter(x => x && typeof x === "object" && x.raw);
  state.run_list = state.run_list.filter(x => x && typeof x === "object" && x.type);
}

async function saveState() {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function setStatus(kind) {
  if (kind === "ready") {
    statusDot.style.color = "hsl(140 80% 55%)";
    statusText.textContent = "Ready";
  } else if (kind === "awaiting_ack") {
    statusDot.style.color = "hsl(45 90% 60%)";
    statusText.textContent = "Awaiting ACK";
  } else {
    statusDot.style.color = "hsl(0 0% 65%)";
    statusText.textContent = "Not initialized";
  }
  workflowText.textContent = `workflow: ${state.workflow_id || "—"}`;
}

function setBanner(on) {
  banner.classList.toggle("on", !!on);
}

function setRecording(on) {
  state.recording = !!on;
  recordBtn.textContent = state.recording ? "Recording…" : "Record click";
  setBanner(state.recording);
  saveState();
}

function setPlaying(on) {
  state.playing = !!on;
  playBtn.textContent = state.playing ? "Stop" : "Play";
  recordBtn.disabled = state.playing;
  clearBtn.disabled = state.playing;
  copyProtocolBtn.disabled = state.playing;
  scanChatBtn.disabled = state.playing;
}

function openSettings() {
  delayInput.value = String(round1(clampNum(Number(state.delaySec), 0.1, 10)));
  modalBackdrop.classList.add("on");
  modalBackdrop.setAttribute("aria-hidden", "false");
  delayInput.focus();
}
function closeSettings() {
  modalBackdrop.classList.remove("on");
  modalBackdrop.setAttribute("aria-hidden", "true");
}

function elHandleSvg() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10 6h.01M14 6h.01M10 12h.01M14 12h.01M10 18h.01M14 18h.01"/>
    </svg>
  `;
}

function iconBtnSvg(kind) {
  if (kind === "highlight") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3v2"/><path d="M12 19v2"/>
        <path d="M3 12h2"/><path d="M19 12h2"/>
        <path d="M5.6 5.6l1.4 1.4"/><path d="M17 17l1.4 1.4"/>
        <path d="M18.4 5.6L17 7"/><path d="M7 17l-1.4 1.4"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    `;
  }
  if (kind === "add") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 5v14"/><path d="M5 12h14"/>
      </svg>
    `;
  }
  if (kind === "trash") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 6h18"/><path d="M8 6V4h8v2"/>
        <path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6"/><path d="M14 11v6"/>
      </svg>
    `;
  }
  if (kind === "copy") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2"/>
        <rect x="2" y="2" width="13" height="13" rx="2"/>
      </svg>
    `;
  }
  return "";
}

function createIconButton(title, kind, onClick) {
  const b = document.createElement("button");
  b.className = "iconbtn";
  b.title = title;
  b.innerHTML = iconBtnSvg(kind);
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick?.();
  });
  return b;
}

function createRow({ draggable, id, label, meta, actions, onClick, onDropReorder }) {
  const row = document.createElement("div");
  row.className = "item";
  row.draggable = !!draggable;
  row.dataset.id = id;

  const handle = document.createElement("div");
  handle.className = "handle";
  handle.title = draggable ? "Drag to reorder" : "";
  handle.innerHTML = elHandleSvg();

  const mid = document.createElement("div");
  const l = document.createElement("div");
  l.className = "label";
  l.textContent = label || "Item";
  const m = document.createElement("div");
  m.className = "meta";
  m.textContent = meta || "";
  mid.appendChild(l);
  if (meta) mid.appendChild(m);

  const act = document.createElement("div");
  act.className = "item-actions";
  (actions || []).forEach(a => act.appendChild(a));

  row.appendChild(handle);
  row.appendChild(mid);
  row.appendChild(act);

  if (onClick) row.addEventListener("click", onClick);

  if (draggable && onDropReorder) {
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
      row.style.opacity = "0.6";
    });
    row.addEventListener("dragend", () => (row.style.opacity = ""));
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData("text/plain");
      const targetId = id;
      if (!draggedId || !targetId || draggedId === targetId) return;
      onDropReorder(draggedId, targetId);
    });
  }

  return row;
}

function renderRecorded() {
  recListEl.innerHTML = "";
  recCountEl.textContent = `${state.recorded.length} items`;
  recEmptyEl.style.display = state.recorded.length ? "none" : "block";

  state.recorded.forEach((it, idx) => {
    const highlightBtn = createIconButton("Highlight", "highlight", async () => {
      await highlightSelector(it.selector);
    });
    const addBtn = createIconButton("Add to run list", "add", () => addRecordedToRun(it.id));
    const trashBtn = createIconButton("Remove", "trash", () => {
      state.recorded = state.recorded.filter(x => x.id !== it.id);
      saveState();
      renderAll();
    });

    const row = createRow({
      draggable: false,
      id: it.id,
      label: `${idx + 1}. ${it.label || "Element"}`,
      meta: it.selector,
      actions: [highlightBtn, addBtn, trashBtn],
      onClick: async () => highlightSelector(it.selector)
    });

    recListEl.appendChild(row);
  });
}

function renderAiActions() {
  aiListEl.innerHTML = "";
  aiCountEl.textContent = `${state.ai_actions.length} items`;
  aiEmptyEl.style.display = state.ai_actions.length ? "none" : "block";

  state.ai_actions.forEach((a, idx) => {
    const addBtn = createIconButton("Add to run list", "add", () => addAiToRun(a.key));
    const trashBtn = createIconButton("Remove", "trash", () => {
      state.ai_actions = state.ai_actions.filter(x => x.key !== a.key);
      saveState();
      renderAll();
    });

    const label = `${idx + 1}. ${a.type || "action"} #${a.action_id ?? "?"}`;
    const meta = a.payload?.selector ? a.payload.selector : (a.raw?.slice?.(0, 80) || "");

    aiListEl.appendChild(createRow({
      draggable: false,
      id: a.key,
      label,
      meta,
      actions: [addBtn, trashBtn]
    }));
  });
}

function renderRunList() {
  runListEl.innerHTML = "";
  runCountEl.textContent = `${state.run_list.length} items`;
  runEmptyEl.style.display = state.run_list.length ? "none" : "block";

  state.run_list.forEach((it, idx) => {
    const highlightBtn = it.payload?.selector
      ? createIconButton("Highlight", "highlight", async () => highlightSelector(it.payload.selector))
      : null;
    const trashBtn = createIconButton("Remove", "trash", () => {
      state.run_list = state.run_list.filter(x => x.id !== it.id);
      saveState();
      renderAll();
    });

    const actions = [];
    if (highlightBtn) actions.push(highlightBtn);
    actions.push(trashBtn);

    runListEl.appendChild(createRow({
      draggable: true,
      id: it.id,
      label: `${idx + 1}. ${it.label || it.type}`,
      meta: it.payload?.selector || "",
      actions,
      onDropReorder: reorderRunList
    }));
  });
}

function renderAll() {
  setBanner(state.recording);
  setPlaying(state.playing);

  if (!state.workflow_id) setStatus("not_initialized");
  else if (state.ready) setStatus("ready");
  else if (state.awaiting_ack) setStatus("awaiting_ack");
  else setStatus("not_initialized");

  renderRunList();
  renderAiActions();
  renderRecorded();
}

function reorderRunList(draggedId, targetId) {
  const from = state.run_list.findIndex(x => x.id === draggedId);
  const to = state.run_list.findIndex(x => x.id === targetId);
  if (from < 0 || to < 0) return;
  const [moved] = state.run_list.splice(from, 1);
  state.run_list.splice(to, 0, moved);
  saveState();
  renderRunList();
}

async function armRecording() {
  const resp = await chrome.runtime.sendMessage({ type: "BAI_ARM_RECORDING_ACTIVE_TAB" });
  if (!resp?.ok) throw new Error(resp?.error || "Failed to arm recording.");
}

async function highlightSelector(selector) {
  await chrome.runtime.sendMessage({
    type: "BAI_HIGHLIGHT_ACTIVE_TAB",
    payload: { selector }
  });
}

async function clearHighlight() {
  await chrome.runtime.sendMessage({ type: "BAI_CLEAR_HIGHLIGHT_ACTIVE_TAB" });
}

function addRecordedToRun(recordedId) {
  const it = state.recorded.find(x => x.id === recordedId);
  if (!it) return;
  state.run_list.push({
    id: uid(),
    source: "recorded",
    type: "click",
    label: `Click: ${it.label || "element"}`,
    payload: { selector: it.selector }
  });
  saveState();
  renderRunList();
}

function addAiToRun(aiKey) {
  const a = state.ai_actions.find(x => x.key === aiKey);
  if (!a) return;

  const type = a.type || "unknown";
  const label = `AI: ${type} #${a.action_id ?? "?"}`;

  state.run_list.push({
    id: uid(),
    source: "ai",
    type,
    label,
    payload: a.payload || {}
  });
  saveState();
  renderRunList();
}

async function executeAction(action) {
  const payload = { type: action.type, ...(action.payload || {}) };
  return await chrome.runtime.sendMessage({
    type: "BAI_EXECUTE_ACTION_ACTIVE_TAB",
    payload
  });
}

async function playRunList() {
  if (state.playing) {
    state.playing = false;
    setPlaying(false);
    await clearHighlight();
    saveState();
    toast("Stopped");
    return;
  }
  if (!state.run_list.length) return;

  setRecording(false);
  state.playing = true;
  setPlaying(true);
  await saveState();

  const delayMs = Math.round(clampNum(Number(state.delaySec), 0.1, 10) * 1000);

  for (let i = 0; i < state.run_list.length; i++) {
    if (!state.playing) break;

    const step = state.run_list[i];

    if (step.payload?.selector) {
      await highlightSelector(step.payload.selector);
      await sleep(120);
    }

    await executeAction(step);
    await sleep(delayMs);
  }

  state.playing = false;
  setPlaying(false);
  await clearHighlight();
  await saveState();
  toast("Done");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      console.warn("copy fallback failed", e);
      return false;
    }
  }
}

async function copyProtocolToClipboard() {
  if (!protocol) await loadProtocol();

  if (!state.workflow_id) {
    state.workflow_id = `bai_${uid()}`;
  }

  const prompt = String(protocol.bootstrap_prompt_template || "")
    .replaceAll("{WORKFLOW_ID}", state.workflow_id);

  const ok = await copyText(prompt);
  state.awaiting_ack = true;
  state.ready = false;
  await saveState();
  renderAll();

  toast(ok ? "Protocol copied" : "Copy failed (clipboard blocked)");
}

async function scanChat() {
  if (!protocol) await loadProtocol();
  if (!state.workflow_id) {
    state.workflow_id = `bai_${uid()}`;
    state.awaiting_ack = true;
    state.ready = false;
    await saveState();
  }

  const resp = await chrome.runtime.sendMessage({
    type: "BAI_SCAN_CHAT_ACTIVE_TAB",
    payload: {
      protocol: protocol.protocol,
      handshake_lang: protocol.handshake_block_language,
      handshake_prefix: protocol.handshake_line_prefix,
      action_prefix: protocol.action_line_prefix,
      ack_prefix: protocol.ack_line_prefix,
      workflow_id: state.workflow_id
    }
  });

  if (!resp?.ok) {
    toast(resp?.error || "Scan failed");
    return;
  }

  const result = resp.result || {};
  const handshake = result.handshake || null;
  const actions = Array.isArray(result.actions) ? result.actions : [];
  const ackSeen = !!result.ack_seen;

  if (handshake && handshake.workflow_id === state.workflow_id && handshake.state === "awaiting_extension_ack" && !ackSeen) {
    state.awaiting_ack = true;
    state.ready = false;
  } else if (ackSeen) {
    state.awaiting_ack = false;
    state.ready = true;
  } else if (handshake) {
    state.awaiting_ack = false;
    state.ready = true;
  }

  const existing = new Set(state.ai_actions.map(a => a.key));
  for (const a of actions) {
    if (!a?.key || existing.has(a.key)) continue;
    state.ai_actions.push(a);
    existing.add(a.key);
  }

  await saveState();
  renderAll();

  if (handshake && handshake.workflow_id === state.workflow_id && handshake.state === "awaiting_extension_ack" && !ackSeen) {
    const ackLine = `${protocol.ack_line_prefix} {"protocol":"${protocol.protocol}","workflow_id":"${state.workflow_id}","state":"extension_acknowledged","ack_nonce":"${uid()}"}`;
    const ok = await copyText(ackLine);
    toast(ok ? "ACK copied (paste into chat)" : "Copy failed (clipboard blocked)");
  } else {
    toast(`Scan: ${actions.length} action(s)`);
  }
}

function isDuplicateRecorded(payload) {
  const now = Date.now();
  if (lastRecordedSelector && lastRecordedSelector === payload.selector && (now - lastRecordedAt) < 400) {
    return true;
  }

  const rounded = Math.round(now / 200);
  const fingerprint = `${payload.selector}|${payload.label || ""}|${payload.url || ""}|${rounded}`;
  const last = recordFingerprints.get(fingerprint);
  if (last && (now - last) < 600) return true;

  recordFingerprints.set(fingerprint, now);
  lastRecordedSelector = payload.selector;
  lastRecordedAt = now;

  for (const [key, ts] of recordFingerprints.entries()) {
    if (now - ts > 2000) recordFingerprints.delete(key);
  }

  return false;
}

/* UI events */
recordBtn.addEventListener("click", async () => {
  try {
    if (state.playing) return;
    setRecording(true);
    await armRecording();
    toast("Click an element to record");
  } catch (e) {
    setRecording(false);
    toast("Record failed");
    console.warn(e);
  }
});

playBtn.addEventListener("click", playRunList);

clearBtn.addEventListener("click", async () => {
  if (state.playing) return;
  state.run_list = [];
  state.ai_actions = [];
  state.recorded = [];
  state.awaiting_ack = false;
  state.ready = false;
  await saveState();
  await clearHighlight();
  renderAll();
  toast("Cleared");
});

copyProtocolBtn.addEventListener("click", copyProtocolToClipboard);
scanChatBtn.addEventListener("click", scanChat);

/* Settings */
settingsBtn.addEventListener("click", openSettings);
cancelSettings.addEventListener("click", closeSettings);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeSettings();
});
saveSettings.addEventListener("click", async () => {
  const v = clampNum(Number(delayInput.value), 0.1, 10);
  state.delaySec = round1(v);
  await saveState();
  closeSettings();
  toast(`Delay: ${state.delaySec.toFixed(1)}s`);
});

/* Receive recorded element from content script (dedupe safeguard) */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "BAI_ELEMENT_RECORDED") return;

  const payload = msg.payload || {};
  if (!payload.selector) return;

  if (isDuplicateRecorded(payload)) return;

  state.recorded.push({
    id: uid(),
    label: payload.label || "Element",
    selector: payload.selector,
    url: payload.url || null,
    ts: Date.now()
  });

  setRecording(false);
  saveState();
  renderAll();
  toast("Recorded");
});

/* Init */
(async () => {
  await loadProtocol();
  await loadState();
})();
