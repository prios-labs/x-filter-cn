// Shared default rules (content script + options page).
//
// 思路：不为每个新变体加一条词，而是分两层——
//   1) 高信号短语：单独出现基本只可能是引流，直接命中
//   2) 组合模板：诱饵词 × 引流动作，或两个诱饵词挨在一起才命中；
//      单边出现不动，正常发言基本踩不到
// 加规则前先看能不能往下面两张词表里补一个词，而不是新加一条规则。

/**
 * 形近字替换：「同城⊥门」「加薇」这种躲词的写法，先还原再匹配，
 * 不然每换一个字就要补一条规则。只收词表里真会用到的字。
 */
const XF_CONFUSABLES = {
  "⊥": "上",
  "∟": "上",
  "丄": "上",
  "仩": "上",
  "冂": "门",
  "門": "门",
  "閅": "门",
  "薇": "微",
  "溦": "微",
  "澀": "涩",
  "澁": "涩",
  "騷": "骚",
  "處": "处",
  "処": "处",
  "費": "费",
  "頁": "页",
  "訊": "信",
  "職": "职",
  "學": "学",
  "體": "体",
  "養": "养",
  "國": "国",
  "簡": "简",
  "選": "选",
  "點": "点",
  "鏈": "链",
  "約": "约",
  "砲": "炮",
  "妺": "妹",
};

const XF_CONFUSABLE_RE = new RegExp(
  `[${Object.keys(XF_CONFUSABLES).join("")}]`,
  "g",
);

/**
 * 词内噪音：emoji、隐形格式字符、装饰性分隔符。
 * 「学🌸生妹」「上/门」这类插字躲词，靠给每个词加 \s* 是防不住的
 * —— 只能在归一化阶段整类删掉。
 *
 * 故意不删的三类，删了会伤到真实语义：
 *   - 和 ~　　　→ CTA 的「全国 1-5 线」靠它们
 *   + ＋ ➕　　 →「资源+v」的加号本身就是信号
 *   ，。、！？　→ 中文句读，删了「楼上，门开了」会被拼成「上门」
 */
const XF_NOISE_RE = new RegExp(
  "[\\p{Extended_Pictographic}\\uFE0F\\u200D\\u00AD\\u034F\\u061C\\u180E" +
    "\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF" +
    "·•‧∙⋅・.／/\\\\|_＿*＊^]",
  "gu",
);

/**
 * 匹配前先洗一遍文本：
 * NFKC 收掉全角字母、花体字（𝓼𝓪𝓸 → sao）、带圈数字，删掉词内噪音，
 * 再把形近字还原。content.js 和选项页的测试框都走这一步，口径才一致。
 */
// eslint-disable-next-line no-unused-vars
function xfNormalize(text) {
  return String(text || "")
    .normalize("NFKC")
    // 加号和飞机本身就是 emoji，先各自收敛成 ASCII / 汉字，
    // 否则下一步删噪音会把「资源➕v」「打✈」的信号一起删掉
    .replace(/[＋➕✚﹢＋]/gu, "+")
    .replace(/[✈🛫🛬🛩]/gu, "飞")
    .replace(XF_NOISE_RE, "")
    .replace(XF_CONFUSABLE_RE, (c) => XF_CONFUSABLES[c])
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 诱饵：性暗示 / 人设 / 交易信号。
 * 单独出现不判定 —— 必须配一个引流动作，或另一个诱饵词。
 */
// eslint-disable-next-line no-unused-vars
const XF_BAIT = [
  // 性暗示
  // 涩的替字：色 / 瑟 / S（「我果然太S了」）。s 后不接字母，
  // 免得撞上「真 slow」「太 sad」这类中英混写
  "(太|好|真|超|巨|果然|也)\\s*[涩色瑟]",
  "(太|好|真|超|巨|果然|也)\\s*s(?![a-z])",
  "涩\\s*(图|涩|货)",
  // 「逼」的替字都收：福（骚福）、b/B（骚b，NFKC 后全角也归这）、8
  // 诱饵词有组合门槛兜着（还要配引流动作或第二个诱饵词才隐藏），
  // 这一层宁可收宽，别在这怕误伤
  "(sao|骚)\\s*(货|的很|得很|批|逼|福|[b8])",
  "(没人比[他她]|没\\s*我|比\\s*我)\\s*(sao|骚)",
  "[他她]\\s*sao",
  "一\\s*夜\\s*情|炮\\s*友",
  "找\\s*主\\s*人|母\\s*狗|无\\s*偿\\s*(主人|调教|母|奴)",
  "破\\s*处",
  "处\\s*男",
  "无\\s*套",
  "全\\s*套",
  "约\\s*炮",
  "约\\s*p",
  "p\\s*友",
  "裸\\s*(聊|条|贷)",
  "顶\\s*不[\\s\\S]{0,2}住",
  "玩\\s*[的得][\\s\\S]{0,4}开",
  "[反返]\\s*差(?!\\s*萌)",
  "探[\\s\\S]{0,2}路",
  "花\\s*样[\\s\\S]{0,2}多",
  // 人设
  "体\\s*制\\s*内(?!\\s*(工作|备考|考试|考编|上岸|人员|单位|朋友|家庭|体系))",
  "女\\s*大\\s*(生|兼职)",
  "学\\s*生\\s*妹|空\\s*姐|少\\s*妇|御\\s*姐|人\\s*妻|萝\\s*莉",
  "福\\s*利\\s*姬|熟\\s*女|嫩\\s*模|制\\s*服\\s*诱\\s*惑",
  // 情趣要带后缀（生活情趣是正常话）；步兵/骑兵的军事义太常见，不收
  "情\\s*趣\\s*(用品|内衣|睡衣|酒店)|全\\s*裸|私\\s*照|求\\s*车\\s*牌",
  // 这三个的正常义比色情义更常见（左青龙右白虎 / 政策可出台 / 外围数据），
  // 放组合层：要再配一个引流动作或诱饵才算
  "白\\s*虎(?!\\s*(星|队|堂|旗|图|营))|可\\s*出\\s*台|外\\s*围\\s*(女|妹|资源|模特)",
  "视\\s*频\\s*服\\s*务|一\\s*对\\s*一\\s*(服务|视频)",
  "包\\s*养|援\\s*交|金\\s*主",
  // 交易黑话。快餐 / 一条龙 日常也有别的意思，但按「宁可多挡几条」的取舍收进来
  "选\\s*妃|品\\s*茶|喝\\s*茶|楼\\s*凤|快\\s*餐|一\\s*条\\s*龙",
  "上\\s*门",
  "过\\s*夜|包\\s*夜",
  "可\\s*约|能\\s*约|约\\s*吗",
  // 兼职 / 日结：中文语境下多为刷单与招嫖引流。正经招聘会被一并挡下，
  // 这是取查全率的取舍；组合门槛仍在，需再配一个引流动作或诱饵词
  "兼\\s*职",
  "日\\s*结",
].join("|");

/** 引流动作：把人导向站外或私聊的话术。 */
// eslint-disable-next-line no-unused-vars
const XF_CTA = [
  "主\\s*页",
  "简\\s*介",
  "置\\s*顶",
  "头\\s*像",
  "私\\s*信",
  "私\\s*聊",
  "私\\s*我",
  "不\\s*信\\s*你\\s*看|你\\s*看\\s*(就|便)\\s*知",
  "加\\s*我",
  "约\\s*不\\s*约|约\\s*起|处\\s*一\\s*个|处\\s*个",
  "网\\s*盘|度\\s*盘|夸\\s*克|磁\\s*力|种\\s*子|onlyfans",
  "秒\\s*回|秒\\s*删",
  "同\\s*号|进\\s*群|付\\s*费\\s*群",
  "滴\\s*我",
  "扣\\s*(我|1|一)",
  "找\\s*我",
  "联\\s*系\\s*我",
  // 引流号写联系方式的花样：加v / +v / ➕V / 加Q / 私我扣扣…一次收全
  "[加+＋➕]\\s*[v微威q]",
  "vx|wx|微\\s*信|威\\s*信|telegram|电\\s*报|扣\\s*扣|企\\s*鹅|\\bqq\\b|\\btg\\b|纸\\s*飞\\s*机",
  "同\\s*城",
  "速\\s*配",
  "匹\\s*配",
  "覆\\s*盖\\s*全\\s*国",
  // 「全国 1-5 线」这种覆盖承诺，市场分析贴也会写，所以只当引流动作用，
  // 得配一个诱饵词才算
  "[1一]\\s*[-—~～至]\\s*[5五]\\s*线",
  "无\\s*套\\s*路",
  "打\\s*[✈飞]",
  "点\\s*(我|头像|主页|链接)",
].join("|");

/** 内置规则版本：改动下面的表就 +1，老用户下次加载会拿到新表。 */
// eslint-disable-next-line no-unused-vars
const XF_DEFAULTS_VERSION = 16;

// eslint-disable-next-line no-unused-vars
const XF_DEFAULT_RULES = [
  // --- 1. 高信号短语：单边出现也不用犹豫 ---
  {
    id: "d-tongcheng-flex",
    label: "同城×上门（中间夹符号 / emoji）",
    pattern: "同\\s*城[\\s\\S]{0,3}上\\s*门",
    type: "regex",
    enabled: true,
  },
  { id: "d-shangmen", pattern: "上门服务", type: "keyword", enabled: true },
  { id: "d-yuepao", pattern: "约炮", type: "keyword", enabled: true },
  { id: "d-luoliao", pattern: "裸聊", type: "keyword", enabled: true },
  { id: "d-baoyang", pattern: "包养", type: "keyword", enabled: true },
  {
    id: "d-saox",
    label: "骚货 / 骚逼（含 b / 8 / 福 替字）",
    // 纯脏词单独出现就算，不用等引流动作；「骚的很」口语常见，留在组合层。
    // 拉丁 sao 后只接汉字：sao b 与越南语 sao bạn（"你为什么"）同形，
    // 单杀会波及整个语种，故留在组合层
    pattern: "骚\\s*(货|批|逼|福|[b8])|sao\\s*(货|批|逼|福)",
    type: "regex",
    enabled: true,
  },
  {
    id: "d-dirty-solo",
    label: "露骨黑话单杀（破处 / 外围 / 空降 / 打炮 / 大保健…）",
    // 与「约炮」同一档：单独出现即判定，不要求配引流动作
    pattern:
      "破\\s*处|一\\s*夜\\s*情|援\\s*交|楼\\s*凤|福\\s*利\\s*姬|选\\s*妃|炮\\s*友|裸\\s*(条|贷)|学\\s*生\\s*妹|找\\s*金\\s*主" +
      // 空降直播间/热搜、外围设备/市场 是高频正常中文，定向排除；
      // 「北京空降」「高端外围」照杀
      "|空\\s*降(?!\\s*(直播|热搜|嘉宾|舞台|主播))" +
      "|(高\\s*端|顶\\s*级|优\\s*质)?\\s*外\\s*围\\s*(女|妹|模特|资源|可约|上门|兼职|经纪|工作室)" +
      "|高\\s*端\\s*外\\s*围" +
      // 性行为直述：正常时间线不会出现，出现就是拉客
      "|约\\s*啪|打\\s*炮|做\\s*爱|性\\s*爱|啪\\s*啪\\s*啪|口\\s*爆|内\\s*射|颜\\s*射" +
      "|换\\s*妻|群\\s*p(?![a-z])|无\\s*码|素\\s*股" +
      // 白虎星/白虎队是神话与球队，定向排开
      // 线下交易黑话
      "|大\\s*保\\s*健|莞\\s*式|出\\s*台\\s*(女|价|费)" +
      "|技\\s*师\\s*(上门|服务|可约)|会\\s*所\\s*(嫩模|可约)" +
      // 成交承诺，只有拉客才这么写
      // “福不黑”“我的福”“我福不黑”等变体直接单杀
      "|[福逼屄b]\\s*不\\s*黑|我\\s*的?\\s*福(?!\\s*(建|州|利\\s*彩))" +
      // 「没人比我 X」是这套文案的固定开头，中间随便换词都跑不掉
      "|没\\s*人\\s*比\\s*我[\\s\\S]{0,10}(开|骚|sao|涩|色|福|浪|野)" +
      // 迷药 / 春药 / 壮阳一类：正常时间线不会卖这些
      "|催\\s*情|春\\s*药|媚\\s*药|情\\s*药|迷\\s*药|迷\\s*情|迷\\s*奸|助\\s*性" +
      "|听\\s*话\\s*[水药]|[男女]\\s*用\\s*(春|催|药|水|喷)|乖\\s*乖\\s*水|失\\s*忆\\s*水|一\\s*滴\\s*倒|蒙\\s*汗\\s*药" +
      "|三\\s*唑\\s*仑|氟\\s*硝\\s*西\\s*泮|印\\s*度\\s*神\\s*油" +
      "|壮\\s*阳|延\\s*时\\s*(喷|药)|增\\s*大\\s*增\\s*粗|持\\s*久\\s*(液|喷)" +
      "|真\\s*人\\s*(验证|视频)|先\\s*验\\s*后\\s*付|不\\s*满\\s*意\\s*不\\s*要\\s*钱" +
      "|照\\s*片\\s*(是|为)\\s*本\\s*人|可\\s*视\\s*频\\s*验\\s*证",
    type: "regex",
    enabled: true,
  },
  { id: "d-zhuyepipei", pattern: "主页匹配", type: "keyword", enabled: true },
  { id: "d-tongchengsupi", pattern: "同城速配", type: "keyword", enabled: true },
  { id: "d-outcall", pattern: "outcall", type: "keyword", enabled: true },
  { id: "d-incall", pattern: "incall", type: "keyword", enabled: true },
  {
    id: "d-pyou-tpl",
    label: "P友 / 同城约P",
    pattern: "(寻|找|约|同城)\\s*p\\s*友|同\\s*城\\s*约\\s*p",
    type: "regex",
    enabled: true,
  },
  {
    id: "d-pochu-tpl",
    label: "处男 × 免费",
    pattern:
      // 含「破处」的分支归 d-dirty-solo 单杀，这里只留处男系
      "处\\s*男\\s*免\\s*费|免\\s*费\\s*处\\s*男|免\\s*处\\s*男",
    type: "regex",
    enabled: true,
  },
  {
    id: "d-zhuye-tpl",
    label: "主页有惊喜 / 主页能打✈ / 主页进群",
    // 「闭」「能打」不能裸放：主页关闭了 / 主页能打开吗 都是真实中文
    pattern:
      "主\\s*页[\\s\\S]{0,6}(有\\s*惊\\s*喜|能\\s*打(?!\\s*开)|闭\\s*眼|进\\s*群|加\\s*群|群\\s*聊)",
    type: "regex",
    enabled: true,
  },
  {
    id: "d-ruiping-fu",
    label: "锐评 × 我的福",
    // 这套文案前半句年年换字（太涩了/太S了/太色了），后半句不变，
    // 单独成规则就不用追着前半句补词
    pattern: "锐\\s*评[\\s\\S]{0,12}我\\s*的\\s*福",
    type: "regex",
    enabled: true,
  },
  // 昵称引流号：正文常是无关内容，指望不上正文里的性暗示词。
  // 这些词组本身就是拉客文案，放高信号层直接拦。
  {
    id: "d-ziyuan-contact",
    label: "资源 × 联系方式",
    pattern:
      "资\\s*源[\\s\\S]{0,4}([加+]\\s*[v微威q]|私\\s*[信聊我]|滴\\s*我|自\\s*取|看\\s*主\\s*页)",
    type: "regex",
    enabled: true,
  },
  {
    id: "d-nearby-matchmaking",
    label: "同城/附近/真实可靠 × 牵线/对接/见面",
    pattern:
      "(附\\s*近|同\\s*城|本\\s*地|真\\s*实\\s*可\\s*靠)[\\s\\S]{0,12}(牵\\s*线|对\\s*接|交\\s*友|约\\s*会|约\\s*见|见\\s*面|点\\s*我|可\\s*约|安\\s*排)",
    type: "regex",
    enabled: true,
  },

  // --- 2. 组合模板：变体再多也不用一条条加 ---
  {
    id: "d-bait-cta",
    label: "诱饵词 × 引流动作",
    // 昵称与正文之间隔得远，所以不限距离，只要求两边都出现。
    // 开头的 ^ 是为了性能：不然引擎会在每个字符处重跑一遍向前查找，长贴上是 O(n²)
    pattern: `^(?=[\\s\\S]*(?:${XF_BAIT}))(?=[\\s\\S]*(?:${XF_CTA}))`,
    type: "regex",
    enabled: true,
  },
  {
    id: "d-bait-bait",
    label: "两个诱饵词挨在一起",
    // 「太涩了🙈…我的福」「sao货…没人比她sao」这类整句文案，中间常插 emoji。
    // (?!\1) 要求后一个词跟前一个不同 —— 同一个词在昵称和正文各出现一次
    // 只是同一个信号，不该当两个算。
    pattern: `(${XF_BAIT})[\\s\\S]{0,24}(?!\\1)(?:${XF_BAIT})`,
    type: "regex",
    enabled: true,
  },
];

/**
 * 存储里的规则 + 内置规则。
 * - 用户自己加的规则（id 不以 "d-" 开头）原样保留
 * - 内置规则以本文件为准，只沿用用户的启用/禁用选择；否则第一次保存后
 *   内置词表就被冻结在存储里，以后改 defaults.js 对老用户不生效
 */
// eslint-disable-next-line no-unused-vars
function xfRulesForStorage(rules) {
  return (Array.isArray(rules) ? rules : []).map((rule) => {
    if (String(rule?.id || "").startsWith("d-")) {
      return { id: rule.id, enabled: rule.enabled !== false };
    }
    return rule;
  });
}

// eslint-disable-next-line no-unused-vars
function xfMergeRules(storedRules, storedVersion) {
  const stored = Array.isArray(storedRules) ? storedRules : [];
  const chosen = new Map(
    stored.filter((r) => r && r.id).map((r) => [r.id, r.enabled !== false]),
  );
  const builtin = XF_DEFAULT_RULES.map((d) => ({
    ...d,
    enabled: chosen.has(d.id) ? chosen.get(d.id) : d.enabled !== false,
  }));
  const custom = stored.filter(
    (r) => r && !String(r.id || "").startsWith("d-"),
  );
  const rules = [...builtin, ...custom];
  const rulesForStorage = xfRulesForStorage(rules);
  const changed =
    storedVersion !== XF_DEFAULTS_VERSION ||
    JSON.stringify(stored) !== JSON.stringify(rulesForStorage);
  return { rules, rulesForStorage, changed };
}
