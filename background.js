const SESSION_KEY_STORAGE = "session_key";
const CHAT_TAB_STORAGE = "chat_tab_id";

function generateSessionKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ensureSessionKey() {
  const stored = await chrome.storage.session.get(SESSION_KEY_STORAGE);
  if (stored[SESSION_KEY_STORAGE]) {
    return stored[SESSION_KEY_STORAGE];
  }
  const sessionKey = generateSessionKey();
  await chrome.storage.session.set({ [SESSION_KEY_STORAGE]: sessionKey });
  return sessionKey;
}

async function notifyActiveTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.runtime.sendMessage({ type: "active_tab", tab });
  } catch (error) {
    console.warn("Failed to notify active tab", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  ensureSessionKey();
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener(async (tab) => {
  await ensureSessionKey();
  if (tab?.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await ensureSessionKey();
  await chrome.sidePanel.open({ tabId });
  await notifyActiveTab(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "loading" || changeInfo.status === "complete") {
    await notifyActiveTab(tabId);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "get_session_key") {
    ensureSessionKey().then((sessionKey) => {
      sendResponse({ sessionKey });
    });
    return true;
  }
  if (message?.type === "request_active_tab") {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => sendResponse({ tab: tab || null }))
      .catch(() => sendResponse({ tab: null }));
    return true;
  }
  if (message?.type === "set_chat_tab") {
    const tabId = message?.tabId ?? null;
    chrome.storage.session
      .set({ [CHAT_TAB_STORAGE]: tabId })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "CHAT_SCAN_REQUEST") {
    const tabId = message?.chatTabId;
    if (!tabId) {
      sendResponse({ lines: [], error: "NO_TAB" });
      return false;
    }
    (async () => {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content-script.js"],
        });
      } catch (error) {
        console.warn("Failed to inject content script", error);
        sendResponse({ lines: [], error: "NO_PERMISSION" });
        return;
      }
      try {
        const response = await chrome.tabs.sendMessage(tabId, { type: "CHAT_SCAN" });
        sendResponse({ lines: response?.lines || [] });
      } catch (error) {
        console.warn("Failed to scan chat tab", error);
        sendResponse({ lines: [], error: "NO_RECEIVER" });
      }
    })();
    return true;
  }
  return false;
});
