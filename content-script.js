const TEXT_LIMIT = 9000;
const SELECTION_LIMIT = 2000;
const SAMPLE_LIMIT = 60;
const TEXT_SNIPPET_LIMIT = 140;
const CLASS_LIMIT = 80;
const VALUE_LIMIT = 140;

const SCAN_SELECTORS =
  "h1,h2,h3,a,button,input,textarea,select,[role='button'],[onclick]";

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text, limit) {
  if (!text) {
    return "";
  }
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}…`;
}

function getSelectionText() {
  const selection = window.getSelection();
  if (!selection) {
    return "";
  }
  return truncate(normalizeWhitespace(selection.toString()), SELECTION_LIMIT);
}

function getTextExcerpt() {
  const rawText = document.body?.innerText || document.documentElement?.innerText || "";
  const normalized = normalizeWhitespace(rawText);
  return truncate(normalized, TEXT_LIMIT);
}

function isVisible(element) {
  if (!element) {
    return false;
  }
  if (element.offsetParent !== null) {
    return true;
  }
  return element.getClientRects().length > 0;
}

function buildSample(element) {
  const tag = element.tagName?.toLowerCase() || "unknown";
  const sample = {
    tag,
    visible: isVisible(element),
  };

  const id = element.id?.trim();
  if (id) {
    sample.id = truncate(id, CLASS_LIMIT);
  }

  const className =
    typeof element.className === "string" ? element.className.trim() : "";
  if (className) {
    sample.class = truncate(className, CLASS_LIMIT);
  }

  const text = normalizeWhitespace(element.textContent || "");
  if (text) {
    sample.text = truncate(text, TEXT_SNIPPET_LIMIT);
  }

  const ariaLabel = element.getAttribute?.("aria-label")?.trim();
  if (ariaLabel) {
    sample.aria = truncate(ariaLabel, TEXT_SNIPPET_LIMIT);
  }

  if (tag === "a") {
    const href = element.getAttribute?.("href")?.trim();
    if (href) {
      sample.href = truncate(href, VALUE_LIMIT);
    }
  }

  if (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select"
  ) {
    const inputType = element.getAttribute?.("type")?.trim();
    if (inputType) {
      sample.inputType = truncate(inputType, VALUE_LIMIT);
    }
    if ("value" in element) {
      const value = `${element.value ?? ""}`.trim();
      if (value) {
        sample.value = truncate(value, VALUE_LIMIT);
      }
    }
    const placeholder = element.getAttribute?.("placeholder")?.trim();
    if (placeholder) {
      sample.placeholder = truncate(placeholder, VALUE_LIMIT);
    }
  }

  return sample;
}

function runScan() {
  const elements = Array.from(document.querySelectorAll(SCAN_SELECTORS));
  const counts = {};
  const samples = [];

  elements.forEach((element) => {
    const tag = element.tagName?.toLowerCase() || "unknown";
    counts[tag] = (counts[tag] || 0) + 1;
    if (samples.length >= SAMPLE_LIMIT) {
      return;
    }
    if (isVisible(element)) {
      samples.push(buildSample(element));
    }
  });

  return { counts, samples };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_SELECTION") {
    sendResponse({ selection: getSelectionText() });
    return true;
  }
  if (message?.type === "GET_TEXT_EXCERPT") {
    sendResponse({ selection: getSelectionText(), text: getTextExcerpt() });
    return true;
  }
  if (message?.type === "RUN_SCAN") {
    sendResponse({ dom: runScan() });
    return true;
  }
  return false;
});
