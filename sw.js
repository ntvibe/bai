// sw.js
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (e) {
    console.warn("setPanelBehavior not supported:", e);
  }
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab.");
  return tab;
}

async function ensureContent(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg?.type) return;

      // IMPORTANT: DO NOT re-broadcast BAI_ELEMENT_RECORDED (it already reaches the side panel).
      if (msg.type === "BAI_ELEMENT_RECORDED") {
        sendResponse?.({ ok: true });
        return;
      }

      if (msg.type === "BAI_ARM_RECORDING_ACTIVE_TAB") {
        const tab = await getActiveTab();
        await ensureContent(tab.id);
        const res = await chrome.tabs.sendMessage(tab.id, { type: "BAI_ARM_RECORDING" });
        sendResponse({ ok: true, tabId: tab.id, result: res });
        return;
      }

      if (msg.type === "BAI_HIGHLIGHT_ACTIVE_TAB") {
        const tab = await getActiveTab();
        await ensureContent(tab.id);
        const res = await chrome.tabs.sendMessage(tab.id, {
          type: "BAI_HIGHLIGHT_ONE",
          payload: { selector: msg.payload?.selector }
        });
        sendResponse({ ok: true, tabId: tab.id, result: res });
        return;
      }

      if (msg.type === "BAI_CLEAR_HIGHLIGHT_ACTIVE_TAB") {
        const tab = await getActiveTab();
        await ensureContent(tab.id);
        const res = await chrome.tabs.sendMessage(tab.id, { type: "BAI_CLEAR_HIGHLIGHT" });
        sendResponse({ ok: true, tabId: tab.id, result: res });
        return;
      }

      if (msg.type === "BAI_EXECUTE_ACTION_ACTIVE_TAB") {
        const tab = await getActiveTab();
        await ensureContent(tab.id);
        const res = await chrome.tabs.sendMessage(tab.id, {
          type: "BAI_EXECUTE_ACTION",
          payload: msg.payload || {}
        });
        sendResponse({ ok: true, tabId: tab.id, result: res });
        return;
      }

      if (msg.type === "BAI_SCAN_CHAT_ACTIVE_TAB") {
        const tab = await getActiveTab();
        await ensureContent(tab.id);
        const res = await chrome.tabs.sendMessage(tab.id, {
          type: "BAI_SCAN_CHAT",
          payload: msg.payload || {}
        });
        sendResponse({ ok: true, tabId: tab.id, result: res });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type." });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message ?? e) });
    }
  })();

  return true;
});
