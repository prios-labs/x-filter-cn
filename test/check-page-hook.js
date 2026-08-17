const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "page-hook.js"),
  "utf8",
);
const messages = [];
const responses = [];
const timers = [];
const listeners = {};

const window = {
  addEventListener(type, listener) {
    listeners[type] = listener;
  },
  fetch() {
    return Promise.resolve({
      clone() {
        return {
          text() {
            return Promise.resolve(JSON.stringify(responses.shift()));
          },
        };
      },
    });
  },
  postMessage(message, targetOrigin) {
    messages.push({ message, targetOrigin });
  },
};

function XMLHttpRequest() {}
XMLHttpRequest.prototype.open = function () {};
XMLHttpRequest.prototype.send = function () {};
XMLHttpRequest.prototype.addEventListener = function () {};

vm.runInNewContext(source, {
  window,
  location: { origin: "https://x.com" },
  XMLHttpRequest,
  setTimeout(callback) {
    timers.push(callback);
    return timers.length;
  },
});

async function ingest(payload) {
  responses.push(payload);
  await window.fetch("https://x.com/i/api/graphql/test");
  await new Promise((resolve) => setImmediate(resolve));
  while (timers.length) timers.shift()();
}

async function main() {
  await ingest({
    result: {
      core: { screen_name: "IgnoredWhileOff" },
      relationship_counts: { followers: 1, following: 1 },
    },
  });
  assert.strictEqual(messages.length, 0, "the hook must stay idle until enabled");
  responses.length = 0;

  listeners.message({
    source: window,
    data: { source: "xf-page-hook-enable", on: true },
  });

  await ingest({
    result: {
      core: { screen_name: "NewShape" },
      relationship_counts: { followers: 2, following: 1 },
      profile_bio: { description: "约p平台入口" },
      verification: { verified: false },
    },
  });
  // 后续精简响应可能没有简介，不能把已经拿到的简介清空或重复发送。
  await ingest({
    result: {
      core: { screen_name: "NewShape" },
      relationship_counts: { followers: 2, following: 1 },
      verification: { verified: false },
    },
  });
  await ingest({
    result: {
      legacy: {
        screen_name: "LegacyShape",
        followers_count: 7,
        friends_count: 3,
        description: "同城线下",
        verified: true,
      },
    },
  });

  assert.strictEqual(
    JSON.stringify(messages),
    JSON.stringify([
      {
        message: {
          source: "xf-page-hook",
          users: [
            {
              handle: "newshape",
              followers: 2,
              following: 1,
              verified: false,
              description: "约p平台入口",
            },
          ],
        },
        targetOrigin: "https://x.com",
      },
      {
        message: {
          source: "xf-page-hook",
          users: [
            {
              handle: "legacyshape",
              followers: 7,
              following: 3,
              verified: true,
              description: "同城线下",
            },
          ],
        },
        targetOrigin: "https://x.com",
      },
    ]),
  );
  console.log("新旧 X 用户数据结构提取检查通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
