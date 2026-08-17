// 跑在页面主世界（MAIN world，document_start）。
// 推文 DOM 里没有关注数/粉丝数，只能从 X 自己的接口响应里截：
// 挂上 fetch / XHR 钩子，把响应 JSON 里的用户对象（screen_name +
// followers_count）捞出来，postMessage 发给隔离世界的 content.js。
// 只读不改，X 的请求原样放行。
(() => {
  "use strict";
  if (window.__xfPageHook) return;
  window.__xfPageHook = true;

  const SOURCE = "xf-page-hook";
  const ENABLE = "xf-page-hook-enable";
  /** 账号指标过滤没开时不做任何拦截，钩子保持休眠 */
  let armed = false;
  window.addEventListener("message", (event) => {
    if (event.source === window && event.data?.source === ENABLE) {
      armed = event.data.on === true;
    }
  });
  /** handle -> 上次发过的 "followers:following:verified"，变了才重发 */
  const sent = new Map();
  let batch = [];
  let timer = 0;

  function flush() {
    timer = 0;
    if (!batch.length) return;
    try {
      // 目标源写成当前源而不是 *，避免把数据播给页面里的其它脚本
      window.postMessage({ source: SOURCE, users: batch }, location.origin);
    } catch {
      // 页面卸载中
    }
    batch = [];
  }

  function queue(handle, followers, following, verified) {
    const key = `${followers}:${following}:${verified ? 1 : 0}`;
    if (sent.get(handle) === key) return;
    sent.set(handle, key);
    batch.push({ handle, followers, following, verified });
    if (!timer) timer = setTimeout(flush, 200);
  }

  function walk(node, depth) {
    if (!node || typeof node !== "object" || depth > 30) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    // 用户对象：当前 GraphQL 结构把账号名放在 core、计数放在
    // relationship_counts；旧结构则把这些字段都放在 legacy。
    const coreHandle =
      typeof node.core?.screen_name === "string"
        ? node.core.screen_name
        : null;
    const counts = node.relationship_counts;
    if (coreHandle && typeof counts?.followers === "number") {
      queue(
        coreHandle.toLowerCase(),
        counts.followers,
        typeof counts.following === "number" ? counts.following : 0,
        node.is_blue_verified === true || node.verification?.verified === true,
      );
    }

    const legacy = node.legacy;
    if (legacy && typeof legacy === "object") {
      const handle =
        coreHandle
          ? coreHandle
          : typeof legacy.screen_name === "string"
            ? legacy.screen_name
            : null;
      if (handle && typeof legacy.followers_count === "number") {
        queue(
          handle.toLowerCase(),
          legacy.followers_count,
          typeof legacy.friends_count === "number" ? legacy.friends_count : 0,
          node.is_blue_verified === true ||
            node.verification?.verified === true ||
            legacy.verified === true,
        );
      }
    }
    for (const k in node) {
      const v = node[k];
      if (v && typeof v === "object") walk(v, depth + 1);
    }
  }

  function ingest(text) {
    if (!text || text.length > 3_000_000) return;
    try {
      walk(JSON.parse(text), 0);
    } catch {
      // 不是 JSON，跳过
    }
  }

  // 私信相关端点不解析：这个功能只需要时间线上的作者指标
  const isPrivate = (url) => /\/dm\/|DMInbox|DMConversation|dm_update/i.test(url);

  const looksLikeApi = (url) =>
    typeof url === "string" &&
    (url.includes("/i/api/") || url.includes("/graphql/")) &&
    !isPrivate(url);

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const promise = origFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
      if (armed && looksLikeApi(url)) {
        promise
          .then((res) => res.clone().text().then(ingest))
          .catch(() => {});
      }
    } catch {
      // 钩子自身不能影响页面请求
    }
    return promise;
  };

  const xhr = XMLHttpRequest.prototype;
  const origOpen = xhr.open;
  xhr.open = function (method, url, ...rest) {
    this.__xfUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = xhr.send;
  xhr.send = function (...args) {
    if (armed && looksLikeApi(String(this.__xfUrl || ""))) {
      this.addEventListener("loadend", () => {
        try {
          if (this.responseType === "" || this.responseType === "text") {
            ingest(this.responseText);
          }
        } catch {
          // responseText 在某些 responseType 下会抛，忽略
        }
      });
    }
    return origSend.apply(this, args);
  };
})();
