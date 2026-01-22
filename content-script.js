const PROTOCOL_MARKERS = ["!baisession", "!baiact"];

function extractProtocolLinesFromText(text, lines, seen) {
  if (!text) {
    return;
  }
  const chunks = text.split(/\r?\n/);
  chunks.forEach((chunk) => {
    const trimmed = chunk.trim();
    if (!trimmed) {
      return;
    }
    if (!PROTOCOL_MARKERS.some((marker) => trimmed.includes(marker))) {
      return;
    }
    if (seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    lines.push(trimmed);
  });
}

function scanChatDom() {
  const lines = [];
  const seen = new Set();

  const elements = document.querySelectorAll("pre, code");
  elements.forEach((element) => {
    extractProtocolLinesFromText(element.textContent, lines, seen);
  });

  if (document.body) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue) {
            return NodeFilter.FILTER_REJECT;
          }
          if (PROTOCOL_MARKERS.some((marker) => node.nodeValue.includes(marker))) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        },
      },
    );

    while (walker.nextNode()) {
      extractProtocolLinesFromText(walker.currentNode.nodeValue, lines, seen);
    }

    extractProtocolLinesFromText(document.body.innerText, lines, seen);
  }

  return lines;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CHAT_SCAN") {
    const lines = scanChatDom();
    sendResponse({ lines });
  }
});
