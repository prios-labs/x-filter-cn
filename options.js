(() => {
  "use strict";

  const DEFAULT_RULES =
    typeof XF_DEFAULT_RULES !== "undefined"
      ? structuredClone(XF_DEFAULT_RULES)
      : [];

  const $enabled = document.getElementById("enabled");
  const $rules = document.getElementById("rules");
  const $toast = document.getElementById("toast");
  const $addKeyword = document.getElementById("add-keyword");
  const $addRegex = document.getElementById("add-regex");
  const $save = document.getElementById("save");
  const $reset = document.getElementById("reset");
  const $countAll = document.getElementById("count-all");
  const $countKeyword = document.getElementById("count-keyword");
  const $countRegex = document.getElementById("count-regex");
  const $tabs = document.querySelectorAll(".view-tabs .tab");
  const $testInput = document.getElementById("test-input");
  const $testResult = document.getElementById("test-result");
  const $acctMetrics = document.getElementById("acct-metrics");
  const $acctMaxFollowing = document.getElementById("acct-max-following");
  const $acctMaxFollowers = document.getElementById("acct-max-followers");
  const $acctDefaultAvatar = document.getElementById("acct-default-avatar");
  const $acctNonVerified = document.getElementById("acct-nonverified");

  const ACCOUNT_DEFAULTS = {
    byMetrics: false,
    maxFollowing: null,
    maxFollowers: 0,
    defaultAvatar: false,
    nonVerified: false,
  };

  /** 空串 = 不限（存成 null）；其余夹回非负整数 */
  function clampCount(v) {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function collectAccount() {
    return {
      byMetrics: $acctMetrics.checked,
      maxFollowing: clampCount($acctMaxFollowing.value),
      maxFollowers: clampCount($acctMaxFollowers.value),
      defaultAvatar: $acctDefaultAvatar.checked,
      nonVerified: $acctNonVerified.checked,
    };
  }

  function renderAccount(a) {
    const show = (v) => (clampCount(v) === null ? "" : String(clampCount(v)));
    $acctMetrics.checked = a?.byMetrics === true;
    $acctMaxFollowing.value = show(a?.maxFollowing);
    $acctMaxFollowers.value = show(a?.maxFollowers);
    $acctDefaultAvatar.checked = a?.defaultAvatar === true;
    $acctNonVerified.checked = a?.nonVerified === true;
  }

  /** @type {Array<{id:string,pattern:string,type:string,enabled:boolean}>} */
  let rules = [];
  /** @type {"all"|"keyword"|"regex"} */
  let view = "all";
  let toastTimer = 0;

  function uid() {
    return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function showToast(msg, kind) {
    $toast.textContent = msg || "";
    $toast.classList.remove("ok", "err");
    if (kind === "ok") $toast.classList.add("ok");
    if (kind === "err") $toast.classList.add("err");
    window.clearTimeout(toastTimer);
    if (msg && kind === "ok") {
      toastTimer = window.setTimeout(() => {
        if ($toast.textContent === msg) {
          $toast.textContent = "";
          $toast.classList.remove("ok", "err");
        }
      }, 3200);
    }
  }

  function validateRegex(pattern) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern, "i");
      return true;
    } catch {
      return false;
    }
  }

  function counts() {
    let keyword = 0;
    let regex = 0;
    for (const r of rules) {
      if (r.type === "regex") regex += 1;
      else keyword += 1;
    }
    return { all: rules.length, keyword, regex };
  }

  function updateCounts() {
    const c = counts();
    $countAll.textContent = String(c.all);
    $countKeyword.textContent = String(c.keyword);
    $countRegex.textContent = String(c.regex);
  }

  function setView(next) {
    view = next;
    for (const tab of $tabs) {
      const on = tab.dataset.view === view;
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    }
    render();
  }

  function syncRowTypeUI(row, rule, typeSel, input) {
    const t = rule.type === "regex" ? "regex" : "keyword";
    row.dataset.type = t;
    typeSel.value = t;
    typeSel.dataset.type = t;
    input.placeholder =
      t === "regex" ? "正则，如 同城\\s*.*\\s*上门" : "关键词，如 同城上门";
    input.setAttribute("aria-label", t === "regex" ? "正则表达式" : "关键词");
    if (t === "regex" && rule.pattern.trim()) {
      row.classList.toggle("invalid", !validateRegex(rule.pattern));
    } else {
      row.classList.remove("invalid");
    }
  }

  /** 内置规则由 defaults.js 维护，可开关但不在这里改内容。 */
  function isBuiltin(rule) {
    return String(rule.id || "").startsWith("d-");
  }

  /** 规则编号 = 在全量列表里的位置（1 起），测试命中时按号找行 */
  function ruleNumOf(rule) {
    return rules.indexOf(rule) + 1;
  }

  function makeRuleRow(rule) {
    const row = document.createElement("div");
    row.className = "rule";
    row.dataset.id = rule.id;
    const builtin = isBuiltin(rule);
    if (builtin) row.dataset.builtin = "1";

    const num = document.createElement("span");
    num.className = "rule-num";
    num.textContent = `#${ruleNumOf(rule)}`;

    const en = document.createElement("input");
    en.type = "checkbox";
    en.checked = rule.enabled !== false;
    en.setAttribute("aria-label", "启用");
    en.addEventListener("change", () => {
      rule.enabled = en.checked;
    });

    const typeSel = document.createElement("select");
    typeSel.className = "type-select";
    typeSel.setAttribute("aria-label", "类型");
    typeSel.innerHTML =
      '<option value="keyword">关键词</option><option value="regex">正则</option>';

    const input = document.createElement("input");
    input.type = "text";
    input.value = rule.pattern || "";
    input.spellcheck = false;
    input.addEventListener("input", () => {
      rule.pattern = input.value;
      if (rule.type === "regex" && rule.pattern.trim()) {
        row.classList.toggle("invalid", !validateRegex(rule.pattern));
      } else {
        row.classList.remove("invalid");
      }
    });

    typeSel.addEventListener("change", () => {
      const next = typeSel.value === "regex" ? "regex" : "keyword";
      rule.type = next;
      // 就地更新，不整表重排，避免行跳走、看不清改的是哪条
      syncRowTypeUI(row, rule, typeSel, input);
      updateCounts();
      if (view !== "all" && view !== next) {
        row.remove();
        if (!$rules.querySelector(".rule")) {
          const empty = document.createElement("p");
          empty.className = "empty";
          empty.textContent = view === "regex" ? "暂无正则" : "暂无关键词";
          $rules.appendChild(empty);
        }
      }
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn danger";
    del.textContent = "删除";
    del.addEventListener("click", () => {
      rules = rules.filter((r) => r.id !== rule.id);
      // 整表重渲染：后面的行编号要跟着前移
      render();
      runTest();
    });

    syncRowTypeUI(row, rule, typeSel, input);
    row.append(num, en, typeSel, input);
    if (builtin) {
      // 内容以 defaults.js 为准（版本升级时会覆盖），这里只留开关
      input.readOnly = true;
      typeSel.disabled = true;
      input.title = "内置规则不能修改；可停用或新建规则";
      typeSel.title = "内置规则的类型不可改";
    } else {
      row.appendChild(del);
    }

    // 组合模板的正则很长，给它一行人话说明是干嘛的
    if (rule.label) {
      const label = document.createElement("span");
      label.className = "rule-label";
      label.textContent = rule.label;
      row.appendChild(label);
    }
    return row;
  }

  function visibleRules() {
    if (view === "keyword") return rules.filter((r) => r.type !== "regex");
    if (view === "regex") return rules.filter((r) => r.type === "regex");
    return rules;
  }

  /** 用当前编辑中的规则跑一遍，返回命中的规则。 */
  function matchRules(text) {
    const hits = [];
    for (const rule of rules) {
      if (rule.enabled === false) continue;
      const pattern = String(rule.pattern || "").trim();
      if (!pattern) continue;
      try {
        if (rule.type === "regex") {
          if (new RegExp(pattern, "i").test(text)) hits.push(rule);
        } else if (text.toLowerCase().includes(pattern.toLowerCase())) {
          hits.push(rule);
        }
      } catch {
        // 无效正则由保存时拦截，这里跳过
      }
    }
    return hits;
  }

  /** 提取一段文本里命中的词表片段（去重、封顶） */
  function extractMatches(source, text, cap) {
    const out = [];
    try {
      const re = new RegExp(source, "gi");
      let m;
      while ((m = re.exec(text)) && out.length < cap) {
        const word = m[0].trim();
        if (word && !out.includes(word)) out.push(word);
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    } catch {
      // 词表不可用时跳过诊断
    }
    return out;
  }

  /** 没有整条规则命中时，解释离被过滤还差什么 */
  function renderPartial(text) {
    const baits =
      typeof XF_BAIT !== "undefined" ? extractMatches(XF_BAIT, text, 5) : [];
    const ctas =
      typeof XF_CTA !== "undefined" ? extractMatches(XF_CTA, text, 5) : [];
    const verdict = document.createElement("p");
    verdict.className = "test-verdict";

    if (baits.length === 0 && ctas.length === 0) {
      $testResult.classList.add("miss");
      verdict.textContent = "不会过滤：未命中规则";
      $testResult.appendChild(verdict);
      return;
    }

    $testResult.classList.add("partial");
    if (baits.length > 0 && ctas.length === 0) {
      verdict.textContent =
        "不会过滤：只有诱饵词，还需命中引流话术或第二个诱饵词";
    } else if (ctas.length > 0 && baits.length === 0) {
      verdict.textContent = "不会过滤：只有引流话术，还需命中诱饵词";
    } else {
      verdict.textContent = "不会过滤：诱饵词与引流话术间隔过远";
    }
    $testResult.appendChild(verdict);

    const list = document.createElement("div");
    list.className = "hit-list";
    for (const word of [...baits, ...ctas]) {
      const chip = document.createElement("span");
      chip.className = "hit-chip";
      chip.dataset.partial = "1";
      chip.textContent = word;
      list.appendChild(chip);
    }
    $testResult.appendChild(list);
  }

  function runTest() {
    if (!$testInput) return;
    // 与 content.js 走同一套归一化
    const text = xfNormalize($testInput.value);
    $testResult.textContent = "";
    $testResult.className = "test-result";
    if (!text) return;

    const hits = matchRules(text);
    const verdict = document.createElement("p");
    verdict.className = "test-verdict";

    if (hits.length === 0) {
      renderPartial(text);
      return;
    }

    $testResult.classList.add("hit");
    verdict.textContent = $enabled.checked
      ? `会被过滤：命中 ${hits.length} 条规则`
      : `命中 ${hits.length} 条规则（过滤功能已关闭）`;
    $testResult.appendChild(verdict);

    const list = document.createElement("div");
    list.className = "hit-list";
    for (const rule of hits.slice(0, 8)) {
      const chip = document.createElement("span");
      chip.className = "hit-chip";
      chip.dataset.type = rule.type === "regex" ? "regex" : "keyword";
      chip.textContent = `#${ruleNumOf(rule)} ${rule.label || rule.pattern}`;
      if (rule.label) {
        chip.dataset.labeled = "1";
        chip.title = rule.pattern;
      }
      list.appendChild(chip);
    }
    if (hits.length > 8) {
      const more = document.createElement("span");
      more.className = "hit-more";
      more.textContent = `+${hits.length - 8}`;
      list.appendChild(more);
    }
    $testResult.appendChild(list);
  }

  function render() {
    $rules.innerHTML = "";
    updateCounts();
    runTest();

    if (rules.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "暂无规则";
      $rules.appendChild(empty);
      return;
    }

    const list = visibleRules();
    if (list.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = view === "regex" ? "暂无正则" : "暂无关键词";
      $rules.appendChild(empty);
      return;
    }

    // 保持原有顺序，类型用下拉改；不按类型拆组跳动
    for (const rule of list) {
      $rules.appendChild(makeRuleRow(rule));
    }
  }

  function collectFromDom() {
    return rules.map((r) => ({
      id: r.id,
      pattern: String(r.pattern || "").trim(),
      type: r.type === "regex" ? "regex" : "keyword",
      enabled: r.enabled !== false,
      ...(r.label ? { label: r.label } : {}),
    }));
  }

  function flashSaveOk() {
    $save.classList.add("saved");
    const prev = $save.textContent;
    $save.textContent = "已保存";
    window.setTimeout(() => {
      $save.classList.remove("saved");
      $save.textContent = prev;
    }, 1600);
  }

  function save() {
    const next = collectFromDom().filter((r) => r.pattern);
    for (const r of next) {
      if (r.type === "regex" && !validateRegex(r.pattern)) {
        showToast(`正则无效：${r.pattern}`, "err");
        setView("regex");
        return;
      }
    }
    const dropped = collectFromDom().length - next.length;
    const rulesForStorage = xfRulesForStorage(next);
    chrome.storage.sync.set(
      {
        enabled: $enabled.checked,
        rules: rulesForStorage,
        account: collectAccount(),
        defaultsVersion: XF_DEFAULTS_VERSION,
      },
      () => {
        if (chrome.runtime.lastError) {
          showToast(chrome.runtime.lastError.message || "保存失败", "err");
          return;
        }
        rules = next;
        render();
        flashSaveOk();
        const extra = dropped > 0 ? `（已忽略 ${dropped} 条空规则）` : "";
        showToast(extra ? `已保存${extra}` : "已保存", "ok");
      },
    );
  }

  function load() {
    chrome.storage.sync.get(
      { enabled: true, rules: [], account: ACCOUNT_DEFAULTS, defaultsVersion: 0 },
      (raw) => {
        $enabled.checked = raw.enabled !== false;
        renderAccount(raw.account);
        const { rules: merged, rulesForStorage, changed } = xfMergeRules(
          raw.rules,
          raw.defaultsVersion,
        );
        rules = merged;
        if (changed) {
          chrome.storage.sync.set({
            rules: rulesForStorage,
            defaultsVersion: XF_DEFAULTS_VERSION,
          });
        }
        render();
      },
    );
  }

  function addRule(type) {
    rules.push({
      id: uid(),
      pattern: "",
      type: type === "regex" ? "regex" : "keyword",
      enabled: true,
    });
    if (view !== "all" && view !== type) setView(type);
    else render();
    // focus the new empty row of this type
    requestAnimationFrame(() => {
      const rows = $rules.querySelectorAll(`.rule[data-type="${type}"]`);
      const last = rows[rows.length - 1];
      last?.querySelector('input[type="text"]')?.focus();
    });
  }

  for (const tab of $tabs) {
    tab.addEventListener("click", () => setView(tab.dataset.view || "all"));
  }

  $testInput.addEventListener("input", runTest);
  $enabled.addEventListener("change", runTest);
  // 规则行改动（文本 / 类型 / 启用）后立即重跑测试
  $rules.addEventListener("input", runTest);
  $rules.addEventListener("change", runTest);

  $addKeyword.addEventListener("click", () => addRule("keyword"));
  $addRegex.addEventListener("click", () => addRule("regex"));
  $save.addEventListener("click", save);
  $reset.addEventListener("click", () => {
    if (!confirm("恢复默认规则？")) return;
    rules = structuredClone(DEFAULT_RULES);
    $enabled.checked = true;
    renderAccount(ACCOUNT_DEFAULTS);
    chrome.storage.sync.set(
      {
        enabled: true,
        rules: xfRulesForStorage(DEFAULT_RULES),
        account: { ...ACCOUNT_DEFAULTS },
        defaultsVersion: XF_DEFAULTS_VERSION,
      },
      () => {
        setView("all");
        render();
        flashSaveOk();
        showToast("已恢复默认", "ok");
      },
    );
  });

  load();
})();
