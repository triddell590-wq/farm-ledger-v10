// The service worker's push and notificationclick handlers (app/service-worker.js), run in a
// fake worker scope (headless Chromium can't show real notifications). Offline caching is
// covered by the e2e suite.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const plain = (v) => JSON.parse(JSON.stringify(v)); // objects from the worker realm

const SRC = readFileSync(new URL("../../app/service-worker.js", import.meta.url), "utf8");
function worker({ windows = [] } = {}) {
  const handlers = {}; const shown = []; const opened = []; let badge = null;
  const self = {
    CACHE_VERSION: "fl10-test", ASSETS: [], location: { origin: "https://triddell590-wq.github.io" },
    addEventListener: (t, fn) => { handlers[t] = fn; },
    registration: { scope: "https://triddell590-wq.github.io/farm-ledger/", showNotification: async (title, o) => { shown.push({ title, ...o }); } },
    navigator: { setAppBadge: async (n) => { badge = n; }, clearAppBadge: async () => { badge = 0; } },
    clients: { matchAll: async () => windows, openWindow: async (u) => { opened.push(u); }, claim() {} },
    skipWaiting() {},
  };
  vm.runInNewContext(SRC, { self, importScripts() {}, caches: {}, fetch() {}, URL, Response: class {}, Request: class {}, setTimeout, Promise, console });
  const fire = async (type, ev) => { const waits = []; handlers[type]({ ...ev, waitUntil: (p) => waits.push(p) }); await Promise.all(waits); };
  return { handlers, shown, opened, fire, get badge() { return badge; } };
}
const pushEvent = (obj) => ({ data: { json: () => obj, text: () => JSON.stringify(obj) } });

test("push: shows the sender's data message with its link, sets the badge", async () => {
  const w = worker();
  await w.fire("push", pushEvent({ data: { title: "Late: Notify NIFAIS of death", body: "Beef · moved off", url: "#/l/L1/breeding/register", tag: "fl-late-1", badge: "4" }, from: "123" }));
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].title, "Late: Notify NIFAIS of death"); assert.equal(w.shown[0].body, "Beef · moved off");
  assert.equal(w.shown[0].tag, "fl-late-1"); assert.equal(w.shown[0].renotify, true); assert.deepEqual(plain(w.shown[0].data), { url: "#/l/L1/breeding/register" });
  assert.equal(w.badge, 4);
});
test("push: a notification payload or bad JSON still shows something sensible; summary doesn't re-buzz", async () => {
  const w = worker();
  await w.fire("push", pushEvent({ notification: { title: "Today on Drumlin Farm", body: "2 jobs" }, data: { tag: "fl-summary", badge: "0" } }));
  assert.equal(w.shown[0].title, "Today on Drumlin Farm"); assert.equal(w.shown[0].renotify, false); assert.equal(w.shown[0].data.url, "#/notifications"); assert.equal(w.badge, 0);
  await w.fire("push", { data: { json: () => { throw new Error("x"); }, text: () => "plain words" } });
  assert.equal(w.shown[1].title, "Farm Ledger"); assert.equal(w.shown[1].body, "plain words");
});
test("click: focuses an open Farm Ledger window and tells it the screen; otherwise opens the app there", async () => {
  const posted = []; let focused = 0;
  const win = { url: "https://triddell590-wq.github.io/farm-ledger/index.html#/farm/today", focus: async () => { focused++; }, postMessage: (m) => posted.push(m) };
  let closed = 0; const n = { data: { url: "#/l/L1/alarm/House%202" }, close: () => closed++ };
  const w1 = worker({ windows: [{ url: "https://other.example/", focus() {}, postMessage() {} }, win] });
  await w1.fire("notificationclick", { notification: n });
  assert.equal(closed, 1); assert.equal(focused, 1); assert.deepEqual(plain(posted), [{ type: "fl-open", url: "#/l/L1/alarm/House%202" }]); assert.equal(w1.opened.length, 0);
  const w2 = worker();
  await w2.fire("notificationclick", { notification: { data: { url: "#/notifications" }, close() {} } });
  assert.deepEqual(plain(w2.opened), ["https://triddell590-wq.github.io/farm-ledger/index.html#/notifications"]);
  const w3 = worker();
  await w3.fire("notificationclick", { notification: { data: {}, close() {} } });
  assert.deepEqual(plain(w3.opened), ["https://triddell590-wq.github.io/farm-ledger/index.html#/notifications"]);
});
