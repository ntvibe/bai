// content.js
const H_OVERLAY_ID = "__bai_highlight_overlay__";
const H_STYLE_ID = "__bai_highlight_style__";

let armed = false;
let armHandler = null;

function ensureHighlightStyle() {
  if (document.getElementById(H_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = H_STYLE_ID;
  style.textContent = `
    #${H_OVERLAY_ID}{
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
    }
    #${H_OVERLAY_ID} .box{
      position: absolute;
      border: 3px solid currentColor;
      border-radius: 10px;
      box-sizing: border-box;
      color: #7dd3fc;
      filter: drop-shadow(0 8px 18px rgba(0,0,0,.35));
      animation: baiPulse 650ms ease-in-out infinite;
      background: rgba(125,211,252,.10);
    }
    #${H_OVERLAY_ID} .tag{
      position: absolute;
      top: -26px;
      left: 0;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(0,0,0,.70);
      color: #fff;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 11px;
      max-width: 360px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border: 1px solid rgba(255,255,255,.12);
    }
    @keyframes baiPulse{
      0%{ transform: scale(1); opacity: .85; }
      50%{ transform: scale(1.01); opacity: 1; }
      100%{ transform: scale(1); opacity: .85; }
    }
  `;
  document.documentElement.appendChild(style);
}

function getHighlightOverlay() {
  let overlay = document.getElementById(H_OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = H_OVERLAY_ID;
    document.documentElement.appendChild(overlay);
  }
  return overlay;
}

function clearHighlight() {
  const overlay = document.getElementById(H_OVERLAY_ID);
  if (overlay) overlay.remove();
}

function textPreview(el) {
  const raw =
    (el.innerText && el.innerText.trim()) ||
    (el.value && String(el.value).trim()) ||
    (el.getAttribute("aria-label") || "").trim() ||
    (el.getAttribute("title") || "").trim() ||
    "";
  return raw.slice(0, 80);
}

function elementLabel(el) {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls = el.classList?.length ? "." + [...el.classList].slice(0, 2).join(".") : "";
  const txt = textPreview(el);
  return `${tag}${id}${cls}${txt ? " — " + txt : ""}`;
}

function cssEscapeIdent(s) {
  return String(s).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

function buildSelector(el) {
  if (!el || el.nodeType !== 1) return null;

  if (el.id) return `#${cssEscapeIdent(el.id)}`;

  const parts = [];
  let cur = el;
  let depth = 0;

  while (cur && cur.nodeType === 1 && depth < 7) {
    const tag = cur.tagName.toLowerCase();
    let part = tag;

    const cls = [...(cur.classList || [])].filter(c => c && c.length <= 40).slice(0, 1);
    if (cls.length) part += `.${cssEscapeIdent(cls[0])}`;

    const parent = cur.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter(n => n.tagName === cur.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(cur) + 1;
        part += `:nth-of-type(${idx})`;
      }
    }

    parts.unshift(part);

    const candidate = parts.join(" > ");
    try {
      if (document.querySelectorAll(candidate).length === 1) return candidate;
    } catch (_) {}

    cur = cur.parentElement;
    depth += 1;
  }

  return parts.join(" > ");
}

function getRect(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;

  const left = Math.max(0, r.left);
  const top = Math.max(0, r.top);
  const right = Math.min(window.innerWidth, r.right);
  const bottom = Math.min(window.innerHeight, r.bottom);

  const w = right - left;
  const h = bottom - top;
  if (w < 2 || h < 2) return null;

  return { left, top, width: w, height: h };
}

function highlightSelector(selector) {
  ensureHighlightStyle();
  clearHighlight();

  let el = null;
  try { el = document.querySelector(selector); } catch (_) { el = null; }
  if (!el) return { ok: false, error: "Element not found for selector.", selector };

  try { el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); } catch (_) {}

  const overlay = getHighlightOverlay();
  const box = document.createElement("div");
  box.className = "box";

  const tag = document.createElement("div");
  tag.className = "tag";
  tag.textContent = elementLabel(el);
  box.appendChild(tag);
  overlay.appendChild(box);

  const refresh = () => {
    const rect = getRect(el);
    if (!rect) return;
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  };

  refresh();

  overlay.__baiCleanup?.();
  const onScroll = () => refresh();
  const onResize = () => refresh();
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onResize, true);
  overlay.__baiCleanup = () => {
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize, true);
  };

  return { ok: true, selector, label: elementLabel(el) };
}

function disarmRecording() {
  armed = false;
  if (armHandler) {
    window.removeEventListener("click", armHandler, true);
    armHandler = null;
  }
}

function armRecording() {
  disarmRecording();
  armed = true;

  armHandler = (e) => {
    if (!armed) return;

    const path = e.composedPath?.() || [];
    if (path.some(n => n?.id === H_OVERLAY_ID)) return;

    const target = e.target;

    // One-shot capture: stop navigation / default action
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

    disarmRecording();

    const selector = buildSelector(target);
    const payload = {
      selector,
      label: elementLabel(target),
      url: location.href
    };

    if (selector) highlightSelector(selector);

    chrome.runtime.sendMessage({ type: "BAI_ELEMENT_RECORDED", payload });
  };

  window.addEventListener("click", armHandler, true);
  return { ok: true, armed: true };
}

function safeClickSelector(selector) {
  let el = null;
  try { el = document.querySelector(selector); } catch (_) { el = null; }
  if (!el) return { ok: false, error: "Element not found.", selector };

  try { el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); } catch (_) {}

  try {
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const opts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy };
    el.dispatchEvent(new MouseEvent("mouseover", opts));
    el.dispatchEvent(new MouseEvent("mousemove", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
  } catch (_) {}

  try { el.click(); } catch (_) {}

  return { ok: true, selector };
}

function setValueSelector(selector, text) {
  let el = null;
  try { el = document.querySelector(selector); } catch (_) { el = null; }
  if (!el) return { ok: false, error: "Element not found.", selector };

  try { el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); } catch (_) {}

  const prev = el.value;
  el.focus?.();

  el.value = String(text ?? "");
  try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) {}
  try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (_) {}

  return { ok: true, selector, prev, next: el.value };
}

function getAssistantMessageNodes() {
  const nodes = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
  if (nodes.length) return nodes;

  const turns = Array.from(document.querySelectorAll('[data-testid="conversation-turn"]'));
  if (turns.length) {
    return turns.filter(t => {
      const text = (t.innerText || "").toLowerCase();
      return text.includes("bai_") || t.querySelector("pre code");
    });
  }

  const main = document.querySelector("main");
  return main ? [main] : [];
}

function detectCodeBlockLanguage(codeEl) {
  const cls = String(codeEl.className || "");
  const m = cls.match(/language-([a-z0-9_-]+)/i);
  if (m) return m[1].toLowerCase();
  const dl = codeEl.getAttribute("data-language") || codeEl.parentElement?.getAttribute("data-language");
  return dl ? String(dl).toLowerCase() : "";
}

function isLikelyCompleteJson(text) {
  if (!text.endsWith("}")) return false;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function parseJsonLine(prefix, line) {
  if (!line.startsWith(prefix + " ")) return null;
  const jsonStr = line.slice((prefix + " ").length).trim();
  if (!isLikelyCompleteJson(jsonStr)) return null;
  try {
    return { obj: JSON.parse(jsonStr), raw: jsonStr };
  } catch (_) {
    return null;
  }
}

function scanChat({ protocol, handshake_lang, handshake_prefix, action_prefix, ack_prefix, ack_state, workflow_id }) {
  const assistantNodes = getAssistantMessageNodes();

  const actions = [];
  let handshake = null;
  let ackSeen = false;

  const actionPfx = action_prefix ? String(action_prefix) : null;
  const ackPfx = ack_prefix ? String(ack_prefix) : null;
  const ackState = ack_state ? String(ack_state) : null;
  const hsPfx = handshake_prefix ? String(handshake_prefix) : null;
  const hsLang = handshake_lang ? String(handshake_lang).toLowerCase() : null;

  for (const node of assistantNodes) {
    if (hsLang) {
      const codes = Array.from(node.querySelectorAll("pre code"));
      for (const c of codes) {
        const lang = detectCodeBlockLanguage(c);
        if (lang !== hsLang) continue;
        const raw = (c.textContent || "").trim();
        if (!raw) continue;
        try {
          const obj = JSON.parse(raw);
          if (obj?.protocol === protocol && obj?.workflow_id && obj?.state) {
            if (!workflow_id || obj.workflow_id === workflow_id) handshake = obj;
          }
        } catch (_) {}
      }
    }

    const text = (node.innerText || node.textContent || "").split("\n").map(s => s.trim()).filter(Boolean);

    for (const line of text) {
      if (ackPfx && ackState) {
        const ackParsed = parseJsonLine(ackPfx, line);
        if (ackParsed?.obj) {
          const obj = ackParsed.obj;
          if (obj?.protocol === protocol && obj?.workflow_id && (!workflow_id || obj.workflow_id === workflow_id)) {
            if (obj.state === ackState) ackSeen = true;
          }
        }
      }

      if (hsPfx) {
        const hsParsed = parseJsonLine(hsPfx, line);
        if (hsParsed?.obj) {
          const obj = hsParsed.obj;
          if (obj?.protocol === protocol && obj?.workflow_id && obj?.state) {
            if (!workflow_id || obj.workflow_id === workflow_id) handshake = obj;
          }
        }
      }

      if (actionPfx) {
        const actionParsed = parseJsonLine(actionPfx, line);
        if (actionParsed?.obj) {
          const obj = actionParsed.obj;
          if (!obj || typeof obj !== "object") continue;
          if (obj.protocol !== protocol) continue;
          if (!obj.workflow_id || !obj.type || obj.action_id == null) continue;
          if (workflow_id && obj.workflow_id !== workflow_id) continue;

          const key = `${obj.workflow_id}:${obj.action_id}:${obj.type}`;
          actions.push({
            key,
            protocol: obj.protocol,
            workflow_id: obj.workflow_id,
            action_id: obj.action_id,
            type: obj.type,
            payload: obj.payload || {},
            raw: actionParsed.raw
          });
        }
      }
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const a of actions) {
    if (!a?.key || seen.has(a.key)) continue;
    seen.add(a.key);
    deduped.push(a);
  }

  return { ok: true, handshake, actions: deduped, ack_seen: ackSeen };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    if (msg?.type === "BAI_ARM_RECORDING") {
      sendResponse?.(armRecording());
      return;
    }

    if (msg?.type === "BAI_HIGHLIGHT_ONE") {
      const selector = msg.payload?.selector;
      if (!selector) { sendResponse?.({ ok: false, error: "Missing selector." }); return; }
      sendResponse?.(highlightSelector(selector));
      return;
    }

    if (msg?.type === "BAI_CLEAR_HIGHLIGHT") {
      const overlay = document.getElementById(H_OVERLAY_ID);
      if (overlay?.__baiCleanup) overlay.__baiCleanup();
      clearHighlight();
      sendResponse?.({ ok: true, cleared: true });
      return;
    }

    if (msg?.type === "BAI_EXECUTE_ACTION") {
      const type = msg.payload?.type;
      if (!type) { sendResponse?.({ ok: false, error: "Missing action type." }); return; }

      if (type === "click") {
        const selector = msg.payload?.selector;
        if (!selector) { sendResponse?.({ ok: false, error: "Missing selector." }); return; }
        sendResponse?.(safeClickSelector(selector));
        return;
      }

      if (type === "input_text") {
        const selector = msg.payload?.selector;
        const text = msg.payload?.text;
        if (!selector) { sendResponse?.({ ok: false, error: "Missing selector." }); return; }
        sendResponse?.(setValueSelector(selector, text));
        return;
      }

      if (type === "wait") {
        const ms = Number(msg.payload?.ms ?? 0);
        setTimeout(() => sendResponse?.({ ok: true, ms }), Math.max(0, ms));
        return true;
      }

      if (type === "scroll") {
        const y = Number(msg.payload?.y ?? 0);
        window.scrollBy(0, y);
        sendResponse?.({ ok: true, y });
        return;
      }

      sendResponse?.({ ok: false, error: `Unsupported action type: ${type}` });
      return;
    }

    if (msg?.type === "BAI_SCAN_CHAT") {
      sendResponse?.(scanChat(msg.payload || {}));
      return;
    }
  } catch (e) {
    sendResponse?.({ ok: false, error: String(e?.message ?? e) });
  }
});
