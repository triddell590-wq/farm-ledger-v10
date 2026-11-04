// The live app and the test app (/preview/) share one site: each service worker keeps and clears
// only its own saved copy, and the live worker leaves the test app's requests alone.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../../app/service-worker.js", import.meta.url), "utf8");
const SITE = "https://triddell590-wq.github.io/farm-ledger-v10/";
function worker(scope, cacheNames) {
  const handlers = {}; const names = new Set(cacheNames);
  const caches = { keys: async () => [...names], delete: async (k) => names.delete(k), open: async () => ({ match: async () => null, put: async () => {} }) };
  const self = { CACHE_VERSION: "fl10-new", ASSETS: [], location: { origin: "https://triddell590-wq.github.io" }, addEventListener: (t, fn) => { handlers[t] = fn; },
    registration: { scope }, clients: { claim() {} }, skipWaiting() {} };
  vm.runInNewContext(SRC, { self, importScripts() {}, caches, fetch: async () => ({ ok: false }), URL, Response: class {}, Request: class {}, setTimeout, Promise, console });
  const fire = async (type, ev) => { const waits = []; handlers[type]({ ...ev, waitUntil: (p) => waits.push(p) }); await Promise.all(waits); };
  return { fire, names };
}
const ALL = ["fl10-old", "fl10-new", "fl10-old-preview", "fl10-new-preview", "fl10-tiles-v1", "other-site-cache"];

test("live worker clears only the live app's old copy", async () => {
  const w = worker(SITE, ALL);
  await w.fire("activate", {});
  assert.deepEqual([...w.names].sort(), ["fl10-new", "fl10-new-preview", "fl10-old-preview", "fl10-tiles-v1", "other-site-cache"]);
});
test("test-app worker clears only the test app's old copy", async () => {
  const w = worker(SITE + "preview/", ALL);
  await w.fire("activate", {});
  assert.deepEqual([...w.names].sort(), ["fl10-new", "fl10-new-preview", "fl10-old", "fl10-tiles-v1", "other-site-cache"]);
});
test("live worker doesn't answer for the test app", async () => {
  const w = worker(SITE, []); let answered = 0;
  await w.fire("fetch", { request: { method: "GET", url: SITE + "preview/index.html", mode: "navigate" }, respondWith: () => answered++ });
  assert.equal(answered, 0);
  await w.fire("fetch", { request: { method: "GET", url: SITE + "index.html", mode: "navigate" }, respondWith: () => answered++ });
  assert.equal(answered, 1);
});
