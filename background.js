(() => {
  "use strict";

  const BLUE = "#1d9bf0";
  const GRAY = "#536471";

  function formatBadge(count) {
    if (!count || count < 1) return "";
    if (count > 99) return "99+";
    return String(count);
  }

  function setTabBadge(tabId, count, enabled) {
    if (tabId == null) return;
    const n = enabled === false ? 0 : count;
    const text = formatBadge(n);
    chrome.action.setBadgeText({ tabId, text });
    chrome.action.setBadgeBackgroundColor({
      tabId,
      color: n > 0 ? BLUE : GRAY,
    });
    const title =
      n > 0 ? `X Filter · 本页已过滤 ${n}` : "X Filter";
    chrome.action.setTitle({ tabId, title });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "xf:badge") return;
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse?.({ ok: false });
      return;
    }
    setTabBadge(tabId, Number(msg.count) || 0, msg.enabled !== false);
    sendResponse?.({ ok: true });
    return true;
  });

  // Leaving x.com / closed tab: badge is per-tab and goes away with the tab.
  chrome.tabs.onRemoved.addListener(() => {
    // no-op; Chrome drops per-tab badge state with the tab
  });
})();
