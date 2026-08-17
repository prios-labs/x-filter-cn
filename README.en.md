# X Filter CN

[中文](README.md) | English

X Filter CN is a Chrome extension with built-in rules for common spam replies and adult-content promotions. It works immediately after installation and also supports custom filters based on keywords, regular expressions, and account information.

Website: <https://x-filter.prios.dev>

Chrome Web Store: <https://chromewebstore.google.com/detail/ibkipokkocaajalmcplembnpaogbciik>

## Features

- Filter posts and replies by keyword or regular expression
- Match display names, @usernames, and post text
- Filter replies on status pages by following count, follower count, or verification status
- Show the number of filtered posts and restore individual items
- Add custom rules and test them before saving

## Install

### Chrome Web Store

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/ibkipokkocaajalmcplembnpaogbciik)

### Install from source

The repository contains both the source and the files Chrome loads, so you can inspect them and load the extension yourself. Source installations do not update automatically and must be reloaded after each update.

1. Download and extract the source, or clone this repository with Git.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the `x-filter-cn` folder that contains `manifest.json`.
6. Open or refresh [x.com](https://x.com).

After updating the source, click **Reload** for X Filter CN on `chrome://extensions`, then refresh X.

## Use

1. Click the X Filter CN toolbar icon to turn filtering on or off.
2. Click **Manage rules** to add keywords, regular expressions, or account filters.
3. Save your changes. They take effect immediately.

The control in the lower-right corner shows the number of filtered posts. Open it to review matches, locate a post, or restore an individual item.

Account filters apply only to replies on status pages. They do not affect the Home timeline or the original post.

## Privacy

- No analytics
- Post content and account metrics are processed only in the current tab and are not stored or uploaded
- Rules and toggles are saved in Chrome sync storage and may sync according to the user's Chrome settings
- The extension makes no network requests of its own

## License

[MIT](LICENSE)

## Tests

```bash
node test/check-rules.js
node test/check-storage.js
node test/check-page-hook.js
```
