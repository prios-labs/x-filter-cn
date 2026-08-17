const assert = require("assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "defaults.js"),
  "utf8",
);
const { rules, version, mergeRules, rulesForStorage } = eval(
  src +
    "; ({ rules: XF_DEFAULT_RULES, version: XF_DEFAULTS_VERSION, mergeRules: xfMergeRules, rulesForStorage: xfRulesForStorage })",
);

const quotaBytesPerItem = 8192;
const legacyRulesItemBytes = Buffer.byteLength(
  "rules" + JSON.stringify(rules),
);
const compact = rulesForStorage(rules);
const rulesItemBytes = Buffer.byteLength("rules" + JSON.stringify(compact));
assert(
  legacyRulesItemBytes > quotaBytesPerItem,
  "full built-in rules should reproduce the storage quota regression",
);
assert(
  rulesItemBytes <= quotaBytesPerItem,
  `rules storage item is ${rulesItemBytes} bytes (limit: ${quotaBytesPerItem})`,
);
assert(
  compact
    .filter((rule) => rule.id.startsWith("d-"))
    .every((rule) => Object.keys(rule).sort().join(",") === "enabled,id"),
  "built-in rules must store only id and enabled",
);

const custom = {
  id: "r-custom",
  pattern: "自定义词",
  type: "keyword",
  enabled: true,
};
const disabledId = rules[0].id;
const stored = [
  ...compact.map((rule) =>
    rule.id === disabledId ? { ...rule, enabled: false } : rule,
  ),
  custom,
];
const merged = mergeRules(stored, version);
assert.strictEqual(merged.changed, false);
assert.strictEqual(
  merged.rules.find((rule) => rule.id === disabledId).enabled,
  false,
);
assert.deepStrictEqual(merged.rules.at(-1), custom);

const migrated = mergeRules([...rules, custom], version);
assert.strictEqual(migrated.changed, true);
assert.deepStrictEqual(migrated.rulesForStorage, [...compact, custom]);

console.log(
  `规则存储 ${rulesItemBytes} / ${quotaBytesPerItem} 字节，紧凑格式与迁移检查通过`,
);
