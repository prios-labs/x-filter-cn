(() => {
  "use strict";

  const $enabled = document.getElementById("enabled");
  const $meta = document.getElementById("meta");
  const $options = document.getElementById("options");

  $options.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  function refreshMeta() {
    chrome.storage.sync.get({ enabled: true }, (raw) => {
      $enabled.checked = raw.enabled !== false;

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        const tabId = tab?.id;
        const url = tab?.url || "";
        const onX =
          /^https?:\/\/(x|twitter)\.com\//i.test(url) ||
          /^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(url);

        if (tabId == null || !onX) {
          $meta.textContent = "请先打开 X 页面";
          return;
        }

        chrome.action.getBadgeText({ tabId }, (text) => {
          const n =
            text === "99+" ? "99+" : text && /^\d+$/.test(text) ? text : "0";
          $meta.textContent = `本页已过滤 ${n}`;
          if (n === "0") return;

          // 有过滤时给个入口，直接展开页面右下角的明细面板
          const open = document.createElement("button");
          open.type = "button";
          open.textContent = "查看明细";
          open.addEventListener("click", () => {
            chrome.tabs.sendMessage(tabId, { type: "xf:open-panel" }, () => {
              void chrome.runtime.lastError;
              window.close();
            });
          });
          $meta.append(" · ", open);
        });
      });
    });
  }

  $enabled.addEventListener("change", () => {
    chrome.storage.sync.set({ enabled: $enabled.checked }, refreshMeta);
  });

  refreshMeta();
})();
