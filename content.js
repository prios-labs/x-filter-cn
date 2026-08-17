(() => {
  "use strict";

  const ATTR = "data-xf-hidden";
  const ATTR_SIG = "data-xf-sig";
  const REVEAL_ATTR = "data-xf-show-hidden";
  const ROOT_ID = "xf-hidden-root";
  const NOTICE_ID = "xf-hidden-notice";
  const PANEL_ID = "xf-hidden-panel";
  const DEFAULT_RULES =
    typeof XF_DEFAULT_RULES !== "undefined" ? XF_DEFAULT_RULES : [];

  /**
   * 账户维度过滤（回复区专用），默认全关。
   * maxFollowing / maxFollowers 为 null 表示该条件不限；
   * 填了的条件都满足才隐藏。
   */
  const ACCOUNT_DEFAULTS = {
    byMetrics: false,
    maxFollowing: null,
    maxFollowers: 0,
    nonVerified: false,
  };

  /** @type {{ enabled: boolean, rules: Array<{id:string,pattern:string,type:string,enabled:boolean}>, account: typeof ACCOUNT_DEFAULTS }} */
  let settings = { enabled: true, rules: DEFAULT_RULES, account: ACCOUNT_DEFAULTS };
  /** @type {Array<{ test: (s: string) => boolean, id: string }>} */
  let matchers = [];

  let scheduled = false;
  let lastUrl = location.href;
  /**
   * Cumulative hidden post keys on this route (survives virtualized unmount).
   * 一条推文里可能嵌着引用推文的 article，所以用文本当身份会重复计数。
   */
  const hiddenKeys = new Set();
  /** key -> { reasons, author, snippet }：面板里展示每条为什么被过滤 */
  const hiddenInfo = new Map();
  /** 用户在面板里点了「显示」的 key：本页内不再隐藏（误伤复核用） */
  const allowKeys = new Set();
  const fallbackPostKeys = new WeakMap();
  let nextFallbackPostKey = 1;
  let lastBadge = -1;
  /** 是否临时展开了本页被过滤的内容。 */
  let showingHidden = false;
  /** 明细面板是否展开。 */
  let panelOpen = false;
  let lastPanelSig = "";

  /**
   * page-hook.js 从接口响应里捞到的作者数据：handle -> 指标。
   * DOM 里没有关注/粉丝数，这是唯一来源；没捞到的作者一律不按指标处理。
   */
  const userStats = new Map();
  /** 数据每进一批就 +1，写进 sig 让已扫过的 article 重新评估 */
  let metricsGen = 0;

  function normalizeAccount(a) {
    // null / undefined / 空串 = 该条件不限
    const num = (v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Math.floor(Number(v));
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    return {
      byMetrics: a?.byMetrics === true,
      maxFollowing: num(a?.maxFollowing),
      maxFollowers: num(a?.maxFollowers),
      nonVerified: a?.nonVerified === true,
    };
  }

  /** 通知主世界的钩子：功能没开就别拦截任何请求 */
  function armPageHook(on) {
    try {
      window.postMessage(
        { source: "xf-page-hook-enable", on: on === true },
        location.origin,
      );
    } catch {
      // 页面卸载中
    }
    if (!on) userStats.clear();
  }

  function loadSettings(raw, persist) {
    const enabled = raw?.enabled !== false;
    const { rules, rulesForStorage, changed } = xfMergeRules(
      raw?.rules,
      raw?.defaultsVersion,
    );
    settings = { enabled, rules, account: normalizeAccount(raw?.account) };
    matchers = compileMatchers(rules);
    armPageHook(enabled && settings.account.byMetrics);
    // Persist the merged list so the options page shows the same thing
    if (persist && changed) {
      chrome.storage.sync.set({
        rules: rulesForStorage,
        defaultsVersion: XF_DEFAULTS_VERSION,
      });
    }
  }

  function compileMatchers(rules) {
    const out = [];
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!rule || rule.enabled === false) continue;
      const pattern = String(rule.pattern || "").trim();
      if (!pattern) continue;

      // 编号 = 全量列表位置（含禁用行），和选项页显示的 #N 一致
      const label = `#${i + 1} ${rule.label || pattern}`;
      if (rule.type === "regex") {
        try {
          const re = new RegExp(pattern, "i");
          out.push({
            id: rule.id || pattern,
            label,
            test: (s) => re.test(s),
          });
        } catch (err) {
          console.warn("[X Filter] invalid regex:", pattern, err);
        }
      } else {
        const needle = pattern.toLowerCase();
        out.push({
          id: rule.id || pattern,
          label,
          test: (s) => s.toLowerCase().includes(needle),
        });
      }
    }
    return out;
  }

  function textOf(el) {
    return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  /**
   * Collect matchable text for a tweet/reply article.
   * Includes display name, @handle, and body (covers 同城上门 in nickname).
   */
  function extractText(article) {
    const parts = [];

    // 一条 article 里可能有多个 User-Name（比如引用推文的头）。
    // 昵称引流号的整段文案常在昵称里，正文反而是无关内容，所以全都收。
    const userNames = article.querySelectorAll('[data-testid="User-Name"]');
    userNames.forEach((userName) => parts.push(textOf(userName)));

    // Fallback: profile links near the header
    if (!userNames.length) {
      article.querySelectorAll('a[role="link"]').forEach((a) => {
        const t = textOf(a);
        if (t && t.length < 80) parts.push(t);
      });
    }

    const body = article.querySelector('[data-testid="tweetText"]');
    if (body) parts.push(textOf(body));

    // Some ads / cards put text elsewhere
    const card = article.querySelector('[data-testid="card.wrapper"]');
    if (card) parts.push(textOf(card));

    // 归一化后再匹配：全角、花体字、零宽字符、形近字（同城⊥门）都在这里洗掉
    return xfNormalize(parts.join(" \n "));
  }

  /** @returns {{id:string,label:string}|null} 第一条命中的规则 */
  function matchRule(text) {
    if (!text) return null;
    for (const m of matchers) {
      try {
        if (m.test(text)) return m;
      } catch {
        // ignore single-matcher failures
      }
    }
    return null;
  }

  /**
   * 每个可见的时间线单元给一个身份。引用推文的 article 和外层 article 同属
   * 一个 cell，用 cell 里第一个 /status/<id> 链接，两者算一条。
   */
  function postKeyOf(article) {
    const cell = article.closest('[data-testid="cellInnerDiv"]') || article;
    const statusLink = cell.querySelector('a[href*="/status/"]');
    const match = (statusLink?.getAttribute("href") || "").match(
      /\/status\/(\d+)/,
    );
    if (match) return `status:${match[1]}`;

    // 广告和异形卡片可能没有 status 链接，给当前 DOM 节点一个稳定的 key，
    // 不要退回用文本或时间戳当身份。
    let key = fallbackPostKeys.get(cell);
    if (!key) {
      key = `cell:${nextFallbackPostKey++}`;
      fallbackPostKeys.set(cell, key);
    }
    return key;
  }

  /**
   * article 的作者：@handle（第一个纯 /handle 的链接）+ 有无认证标。
   * 只看第一个 User-Name 块，引用推文的头不算这条的作者。
   */
  function authorInfoOf(article) {
    const userName = article.querySelector('[data-testid="User-Name"]');
    if (!userName) return null;
    let handle = null;
    for (const a of userName.querySelectorAll('a[href^="/"]')) {
      const m = (a.getAttribute("href") || "").match(/^\/([A-Za-z0-9_]{1,20})$/);
      if (m) {
        handle = m[1].toLowerCase();
        break;
      }
    }
    return {
      handle,
      verified: !!userName.querySelector('svg[data-testid="icon-verified"]'),
    };
  }

  /** 只处理帖子详情页的回复；被打开的那条主推不算。 */
  function isReplyOnStatusPage(article) {
    const m = location.pathname.match(/\/status\/(\d+)/);
    if (!m) return false;
    return postKeyOf(article) !== `status:${m[1]}`;
  }

  /**
   * 账号维度的命中原因，按证据强度排序后全部返回。
   * 只报第一个会让面板里满屏都是信息量最低的那条。
   */
  function accountHideReasons(article) {
    const acct = settings.account;
    if (!acct.byMetrics && !acct.nonVerified) return [];
    if (!isReplyOnStatusPage(article)) return [];
    const info = authorInfoOf(article);
    if (!info) return [];

    const out = [];
    if (acct.byMetrics && info.handle) {
      const stats = userStats.get(info.handle);
      // 填了的条件都满足才隐藏（留空 = 不限）；两个都空视为没开；
      // 没捞到数据的作者不动
      const hasAny = acct.maxFollowing !== null || acct.maxFollowers !== null;
      if (
        stats &&
        hasAny &&
        (acct.maxFollowing === null || stats.following <= acct.maxFollowing) &&
        (acct.maxFollowers === null || stats.followers <= acct.maxFollowers)
      ) {
        out.push({
          kind: "metrics",
          text: `${stats.following} 关注 · ${stats.followers} 粉丝`,
        });
      }
    }
    if (acct.nonVerified && !info.verified) {
      out.push({ kind: "verified", text: "未认证" });
    }
    return out;
  }

  /** 面板行内容：作者昵称 + 正文摘要 */
  function summarize(article) {
    const name = textOf(article.querySelector('[data-testid="User-Name"]'));
    const body = textOf(article.querySelector('[data-testid="tweetText"]'));
    return {
      author: name.slice(0, 40) || "(无昵称)",
      snippet: (body || "(无正文)").slice(0, 60),
    };
  }

  /** @returns {boolean} 这个 article 当前是否命中；命中时更新 hiddenInfo */
  function processArticle(article, key) {
    if (!(article instanceof HTMLElement)) return false;
    if (article.tagName !== "ARTICLE") return false;

    const acct = settings.account;
    const acctSig = `${acct.byMetrics ? 1 : 0}:${acct.maxFollowing}:${acct.maxFollowers}:${acct.nonVerified ? 1 : 0}:${metricsGen}:${allowKeys.size}`;
    const text = extractText(article);
    const sig = `${settings.enabled ? 1 : 0}|${matchers.length}|${acctSig}|${text}`;
    if (article.getAttribute(ATTR_SIG) === sig) {
      return article.getAttribute(ATTR) === "1";
    }
    article.setAttribute(ATTR_SIG, sig);

    if (!settings.enabled || allowKeys.has(key)) {
      if (article.getAttribute(ATTR) === "1") {
        article.removeAttribute(ATTR);
      }
      return false;
    }

    // 证据从强到弱：命中的规则最具体，粉丝数有数字可核，未认证最宽泛
    const rule = matchers.length > 0 ? matchRule(text) : null;
    const reasons = rule ? [{ kind: "rule", text: rule.label }] : [];
    reasons.push(...accountHideReasons(article));
    if (reasons.length > 0) {
      article.setAttribute(ATTR, "1");
      hiddenInfo.set(key, { reasons, ...summarize(article) });
      return true;
    }
    if (article.getAttribute(ATTR) === "1") {
      article.removeAttribute(ATTR);
    }
    return false;
  }

  function findArticleByKey(key) {
    for (const article of document.querySelectorAll("article")) {
      if (postKeyOf(article) === key) return article;
    }
    return null;
  }

  function setReveal(on) {
    showingHidden = on;
    if (on) document.documentElement.setAttribute(REVEAL_ATTR, "1");
    else document.documentElement.removeAttribute(REVEAL_ATTR);
  }

  /** 用户点「显示」：这条本页内不再隐藏（误伤复核的出口） */
  function allowPost(key) {
    allowKeys.add(key);
    hiddenKeys.delete(key);
    hiddenInfo.delete(key);
    const article = findArticleByKey(key);
    if (article) {
      article.removeAttribute(ATTR);
      article.removeAttribute(ATTR_SIG);
      article.classList.add("xf-flash");
      article.scrollIntoView({ block: "center" });
      setTimeout(() => article.classList.remove("xf-flash"), 1600);
    }
    scheduleScan();
  }

  /**
   * 明细面板：每条被过滤的帖子显示命中规则 + 作者 + 摘要，
   * 可单条「显示」复核误伤。写入前都做内容比对，避免自触发 MutationObserver。
   */
  function renderPanel(count) {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    let panel = document.getElementById(PANEL_ID);
    if (!panelOpen || !count) {
      panel?.remove();
      lastPanelSig = "";
      return;
    }
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.className = "xf-hidden-panel";
      root.prepend(panel);
    }

    const entries = [...hiddenInfo.entries()];
    const sig = `${showingHidden ? 1 : 0}|${entries
      .map(([k, v]) => `${k}:${v.reasons.map((r) => r.kind + r.text).join("+")}`)
      .join(",")}`;
    if (sig === lastPanelSig) return;
    lastPanelSig = sig;

    panel.textContent = "";

    const head = document.createElement("div");
    head.className = "xf-panel-head";
    const title = document.createElement("span");
    title.textContent = `本页已过滤 ${count} 条`;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "xf-panel-btn";
    toggle.textContent = showingHidden ? "恢复隐藏" : "显示全部";
    toggle.addEventListener("click", () => {
      setReveal(!showingHidden);
      renderPanel(settings.enabled ? hiddenKeys.size : 0);
    });
    head.append(title, toggle);
    panel.appendChild(head);

    const list = document.createElement("div");
    list.className = "xf-panel-list";
    for (const [key, info] of entries) {
      const row = document.createElement("div");
      row.className = "xf-panel-row";
      if (!info.reasons.some((r) => r.kind === "rule")) {
        row.classList.add("xf-panel-row-account");
      }

      const why = document.createElement("span");
      why.className = "xf-panel-why";
      for (const r of info.reasons) {
        const chip = document.createElement("span");
        chip.className = "xf-panel-rule";
        chip.dataset.kind = r.kind;
        // 规则名里括号中的示例只是举例，胶囊里放不下也没必要放，
        // 留在悬停提示里；胶囊只显示编号与规则名本身
        chip.textContent = r.text.replace(/[（(].*$/, "").trim();
        chip.title = r.text;
        why.appendChild(chip);
      }

      const text = document.createElement("button");
      text.type = "button";
      text.className = "xf-panel-text";
      text.title = "点击定位到这条";
      text.textContent = `${info.author} — ${info.snippet}`;
      text.addEventListener("click", () => {
        const article = findArticleByKey(key);
        if (!article) return;
        setReveal(true);
        article.classList.add("xf-flash");
        article.scrollIntoView({ block: "center" });
        setTimeout(() => article.classList.remove("xf-flash"), 1600);
        renderPanel(settings.enabled ? hiddenKeys.size : 0);
      });

      const show = document.createElement("button");
      show.type = "button";
      show.className = "xf-panel-btn";
      show.textContent = "显示";
      show.title = "本页不再隐藏此帖";
      show.addEventListener("click", () => allowPost(key));

      row.append(why, text, show);
      list.appendChild(row);
    }
    panel.appendChild(list);
  }

  /**
   * 误伤时的退路：article 保留命中状态，显不显示交给 CSS。
   * 点浮层展开明细面板，看每条命中了什么规则。
   */
  function renderHiddenNotice(count) {
    let root = document.getElementById(ROOT_ID);
    if (!count) {
      root?.remove();
      setReveal(false);
      panelOpen = false;
      lastPanelSig = "";
      return;
    }

    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      root.className = "xf-hidden-root";
      const notice = document.createElement("button");
      notice.id = NOTICE_ID;
      notice.type = "button";
      notice.className = "xf-hidden-notice";
      notice.addEventListener("click", () => {
        panelOpen = !panelOpen;
        renderHiddenNotice(settings.enabled ? hiddenKeys.size : 0);
      });
      root.appendChild(notice);
      document.body?.appendChild(root);
    }

    const notice = document.getElementById(NOTICE_ID);
    const text = panelOpen
      ? `已过滤 ${count} 条 · 收起`
      : `已过滤 ${count} 条 · 查看`;
    // 只在变化时写：改 textContent 会触发 MutationObserver，
    // 每次扫描都无条件写的话就是一个每帧重扫的死循环。
    if (notice.textContent !== text) notice.textContent = text;
    const pressed = panelOpen ? "true" : "false";
    if (notice.getAttribute("aria-expanded") !== pressed) {
      notice.setAttribute("aria-expanded", pressed);
    }
    renderPanel(count);
  }

  function reportBadge() {
    const count = settings.enabled ? hiddenKeys.size : 0;
    renderHiddenNotice(count);
    if (count === lastBadge) return;
    lastBadge = count;
    try {
      chrome.runtime.sendMessage(
        { type: "xf:badge", count, enabled: settings.enabled },
        () => {
          // ignore closed channel / no receiver during reload
          void chrome.runtime.lastError;
        },
      );
    } catch {
      // extension context invalidated
    }
  }

  function scan() {
    scheduled = false;
    const scannedKeys = new Set();
    const matchedKeys = new Set();
    for (const article of document.querySelectorAll("article")) {
      const key = postKeyOf(article);
      scannedKeys.add(key);
      if (processArticle(article, key)) matchedKeys.add(key);
    }

    // 一个 cell 只按它的最终状态计一次，避免引用推文和外层推文各算一条
    for (const key of scannedKeys) {
      if (matchedKeys.has(key)) hiddenKeys.add(key);
      else {
        hiddenKeys.delete(key);
        hiddenInfo.delete(key);
      }
    }
    reportBadge();
  }

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  function onUrlMaybeChanged() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    // SPA navigation: clear sigs so cells re-evaluate after React reuses nodes
    document.querySelectorAll(`article[${ATTR_SIG}]`).forEach((el) => {
      el.removeAttribute(ATTR_SIG);
    });
    hiddenKeys.clear();
    hiddenInfo.clear();
    allowKeys.clear();
    setReveal(false);
    panelOpen = false;
    lastPanelSig = "";
    lastBadge = -1;
    scheduleScan();
  }

  // --- boot ---
  chrome.storage.sync.get(
    { enabled: true, rules: [], account: ACCOUNT_DEFAULTS, defaultsVersion: 0 },
    (raw) => {
      loadSettings(raw, true);
      scheduleScan();
    },
  );

  // 弹窗里点「查看明细」→ 展开页面右下角的明细面板
  chrome.runtime.onMessage?.addListener((msg) => {
    if (msg?.type !== "xf:open-panel") return;
    if (!hiddenKeys.size) return;
    panelOpen = true;
    renderHiddenNotice(settings.enabled ? hiddenKeys.size : 0);
  });

  // page-hook.js（主世界）发来的作者指标
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "xf-page-hook") {
      return;
    }
    let added = false;
    for (const u of event.data.users || []) {
      if (!u || typeof u.handle !== "string") continue;
      if (typeof u.followers !== "number" || typeof u.following !== "number") {
        continue;
      }
      const prev = userStats.get(u.handle);
      if (
        !prev ||
        prev.followers !== u.followers ||
        prev.following !== u.following ||
        prev.verified !== u.verified
      ) {
        userStats.set(u.handle, {
          followers: u.followers,
          following: u.following,
          verified: u.verified === true,
        });
        added = true;
      }
    }
    if (added) {
      metricsGen++;
      // 指标过滤没开就不用为新数据重扫
      if (settings.account.byMetrics) scheduleScan();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const next = {
      enabled:
        changes.enabled?.newValue !== undefined
          ? changes.enabled.newValue
          : settings.enabled,
      rules:
        changes.rules?.newValue !== undefined
          ? changes.rules.newValue
          : settings.rules,
      account:
        changes.account?.newValue !== undefined
          ? changes.account.newValue
          : settings.account,
      defaultsVersion: XF_DEFAULTS_VERSION,
    };
    loadSettings(next, false);
    document.querySelectorAll(`article[${ATTR_SIG}]`).forEach((el) => {
      el.removeAttribute(ATTR_SIG);
    });
    if (!settings.enabled) {
      hiddenKeys.clear();
      lastBadge = -1;
    }
    scheduleScan();
  });

  const observer = new MutationObserver((records) => {
    // 忽略我们自己那个提示按钮引起的变动，否则「扫描 → 改提示 → 再扫描」
    const root = document.getElementById(ROOT_ID);
    if (root && records.every((r) => root.contains(r.target))) return;
    onUrlMaybeChanged();
    scheduleScan();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Catch SPA route changes that don't always mutate enough
  const wrap = (type) => {
    const orig = history[type];
    history[type] = function (...args) {
      const ret = orig.apply(this, args);
      queueMicrotask(onUrlMaybeChanged);
      return ret;
    };
  };
  wrap("pushState");
  wrap("replaceState");
  window.addEventListener("popstate", onUrlMaybeChanged);
  window.addEventListener("scroll", scheduleScan, { passive: true });
})();
