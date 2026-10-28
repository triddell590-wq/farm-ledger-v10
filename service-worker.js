// Farm Ledger 10 service worker: keeps a full copy of the app on the phone so it opens with no
// signal. Same network strategy as v9.14 (which works): the page itself tries the network for
// at most 3s then uses the saved copy; every other app file is phone-copy-first per version;
// satellite map tiles are cached as you look at them. Firebase traffic is left to Firebase's
// own offline storage. The asset list and cache version are generated (asset-list.js).
importScripts("./asset-list.js");
const CACHE = self.CACHE_VERSION;
const TILE_CACHE = "fl10-tiles-v1";
const TILE_MAX = 4000;
const TILE_HOSTS = ["server.arcgisonline.com", "services.arcgisonline.com"];
const NET_WAIT_MS = 3000;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(self.ASSETS.map((u) => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  const keep = [CACHE, TILE_CACHE];
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)))));
  self.clients.claim();
});

let tilePuts = 0;
async function trimTiles(c) { const keys = await c.keys(); if (keys.length > TILE_MAX) await Promise.all(keys.slice(0, keys.length - TILE_MAX).map((k) => c.delete(k))); }

function appFirst(e) {
  const req = e.request;
  return caches.open(CACHE).then(async (c) => {
    const net = fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; });
    e.waitUntil(net.catch(() => {}));
    let saved = await c.match(req, { ignoreSearch: true });
    if (!saved && req.mode === "navigate") saved = await c.match("./index.html");
    if (!saved) return net.catch(() => c.match("./index.html"));
    const wait = new Promise((r) => setTimeout(() => r(saved), NET_WAIT_MS));
    return Promise.race([net.then((res) => (res && res.ok ? res : saved)).catch(() => saved), wait]);
  });
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin === self.location.origin && e.request.mode !== "navigate" && !/\/(index\.html)?$/.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res && res.ok) c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }
  if (TILE_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(TILE_CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then((res) => { if (res && (res.ok || res.type === "opaque")) { c.put(e.request, res.clone()); if (++tilePuts % 100 === 0) trimTiles(c); } return res; });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net.catch(() => new Response("", { status: 504 }));
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(appFirst(e));
});

// ---- Notifications (builder-notify) ----------------------------------------------------
// Push messages come from the hourly sender (build/notify/send.mjs) through Firebase Cloud
// Messaging as data-only messages: { title, body, url, tag, badge }. We show them ourselves, so
// no Firebase code runs in the worker. Tapping one opens (or focuses) the app on that screen.
self.addEventListener("push", (e) => {
  let j = {};
  try { j = e.data ? e.data.json() : {}; } catch (err) { j = { body: e.data ? e.data.text() : "" }; }
  const d = { ...j, ...(j.notification || {}), ...(j.data || {}) };
  const title = d.title || "Farm Ledger";
  const badge = parseInt(d.badge, 10);
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, { body: d.body || "", tag: d.tag || "fl", renotify: !!d.tag && d.tag !== "fl-summary", icon: "icons/icon-192.png", badge: "icons/favicon-32.png", data: { url: d.url || "#/notifications" } }),
    (self.navigator && self.navigator.setAppBadge && badge >= 0) ? (badge > 0 ? self.navigator.setAppBadge(badge) : self.navigator.clearAppBadge()).catch(() => {}) : Promise.resolve(),
  ]));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const hash = String((e.notification.data && e.notification.data.url) || "#/notifications").replace(/^[^#]*/, "") || "#/notifications";
  const target = new URL("./index.html" + hash, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
    const mine = list.find((c) => c.url.startsWith(self.registration.scope));
    if (mine) {
      try { await mine.focus(); } catch (err) { /* not allowed */ }
      mine.postMessage({ type: "fl-open", url: hash });
      return;
    }
    return self.clients.openWindow(target);
  }));
});
