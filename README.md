# X Filter CN

中文 | [English](README.en.md)

X Filter CN 是一款 Chrome 扩展，内置常见垃圾回复和色情引流内容的过滤规则，安装后即可使用。也可以按关键词、正则和账号信息自定义过滤 X（Twitter）中的帖子与回复。

官网：<https://x-filter.prios.dev>

Chrome 应用商店：<https://chromewebstore.google.com/detail/ibkipokkocaajalmcplembnpaogbciik>

## 功能

- 按关键词或正则过滤帖子和回复
- 同时匹配昵称、@用户名、公开简介和正文
- 在帖子详情页按关注数、粉丝数、默认头像或蓝 V 状态过滤回复
- 显示本页过滤数量，可查看或恢复单条内容
- 支持自定义规则和规则测试

## 安装

### Chrome 应用商店

[打开 Chrome 应用商店安装](https://chromewebstore.google.com/detail/ibkipokkocaajalmcplembnpaogbciik)

### 从源码安装

仓库源码与 Chrome 加载的文件都在当前文件夹中，可以检查后自行加载。源码安装不会自动更新，更新后需要手动重新加载。

1. 下载源码并解压，或用 Git 克隆本仓库。
2. 在 Chrome 地址栏打开 `chrome://extensions`。
3. 打开右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择包含 `manifest.json` 的 `x-filter-cn` 文件夹。
6. 打开或刷新 [x.com](https://x.com)。

代码更新后，在 `chrome://extensions` 中找到 X Filter CN，点击“重新加载”，再刷新 X 页面。

## 使用

1. 点击浏览器工具栏中的 X Filter CN 图标，开启或关闭过滤。
2. 点击“管理规则”，添加关键词、正则或账号过滤条件。
3. 保存后立即生效。

页面右下角会显示过滤数量。点击后可查看命中原因、定位内容或恢复单条帖子。

账号过滤仅作用于帖子详情页的回复，不影响主页时间线和原帖。

## 隐私

- 不含分析统计和远程代码
- 帖子内容和公开账号信息只在当前标签页内处理，不保存、不上传
- 规则和开关保存在 Chrome 同步存储中，可按 Chrome 设置随账号同步
- 扩展不会主动发起网络请求

## 许可

[MIT](LICENSE)

## 测试

```bash
node test/check-rules.js
node test/check-storage.js
node test/check-page-hook.js
```

词表样本与判据见 `test/check-rules.js`。
