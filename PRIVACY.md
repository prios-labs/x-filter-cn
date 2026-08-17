# 隐私权政策 / Privacy Policy

最后更新：2026-08-18

## English

X Filter CN processes the minimum data needed to filter posts and replies. Page content and public account data stay in the current tab and are not sent to the developer or any third party.

**What is stored**

Your filter rules, toggles, and thresholds are saved with `chrome.storage.sync`. Chrome may sync these settings through your signed-in account according to your Chrome settings. The developer has no access to them.

**Page text and public bios**

To decide whether a post matches your rules, the extension reads the display name, @handle, public bio, post body, and card text that X returns to the current page. This data stays in page memory and is not written to storage or transmitted by the extension.

**Account metrics**

When text rules or account filters are enabled, the extension inspects API responses X returns to the page for public bios and, when available, follower counts, following counts, and verification status. Direct-message endpoints are skipped. This data stays in the current tab's memory, disappears when the tab closes, and is not stored or transmitted by the extension.

**What it does not do**

The extension contains no analytics or remote code and makes no network requests of its own. It does not read direct messages, passwords, cookies, or login credentials. It does not run on any site other than x.com and twitter.com.

**Permissions**

`storage` saves your rules. Host permissions for `x.com` and `twitter.com` let the extension read post text on those sites and hide matching posts.

The extension uses this data only to provide its filtering features. Its use of data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

**Contact**

Issues and feedback: https://x-filter.prios.dev

---

## 简体中文

X Filter CN 只处理过滤帖子和回复所需的数据。页面内容和公开账号信息不会离开当前标签页，也不会发送给扩展开发者或其他第三方。

**存在哪里的数据**

你的过滤规则、开关状态和阈值设置通过 `chrome.storage.sync` 保存，并可按 Chrome 设置随已登录的 Chrome 账号同步。扩展开发者无法访问这些设置。

**页面文本和公开简介**

为了判断一条帖子是否符合你的规则，扩展会读取 X 返回给当前页面的昵称、@用户名、公开简介、帖子正文和卡片文字。这些内容只在页面内存中处理，不写入存储，也不由扩展发送到其他地方。

**账号指标**

开启文字规则或账号过滤后，扩展会检查 X 返回给页面的接口响应，从中读取公开简介，以及接口中已有的关注数、粉丝数和认证状态。私信相关接口会被跳过。这些数据只保留在当前标签页的内存中，关闭标签页即清除，不写入存储，也不由扩展发送到其他地方。

**不做的事**

扩展没有分析统计或远程代码，也不会主动发起网络请求。不读取私信、密码、Cookie 或登录凭据，不在 x.com 和 twitter.com 以外的网站运行。

**权限**

`storage` 用于保存你的规则。`x.com` 与 `twitter.com` 的主机权限用于读取这两个站点的帖子文本并隐藏匹配项。

扩展只将这些数据用于提供过滤功能，并遵守 Chrome 应用商店用户数据政策及其 Limited Use 要求。

**联系方式**

问题与反馈：https://x-filter.prios.dev
