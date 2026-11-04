// build fl10-b825fa4a46a8
// Farm Ledger 10 service worker: keeps a full copy of the app on the phone so it opens with no
// signal. The page and every other app file come from the saved copy first (refreshed behind);
// satellite map tiles are cached as you look at them. Firebase traffic is left to Firebase's
// own offline storage. The asset list and cache version are generated (asset-list.js).
importScripts("./asset-list.js");
// The test app (/preview/) shares the site with the live app: each keeps and clears only its own copy.
const TAG = new URL(self.registration.scope).pathname.endsWith("/preview/") ? "-preview" : "";
const CACHE = self.CACHE_VERSION + TAG;
const TILE_CACHE = "fl10-tiles-v1";
const TILE_MAX = 4000;
const TILE_HOSTS = ["server.arcgisonline.com", "services.arcgisonline.com"];

self.addEventListener("install", (e) => {
  // Fetch each file with the version in the address so GitHub's servers can't hand back a copy
  // they cached before this release was published (that left phones with old files), then save it
  // under its plain address. 12 at a time with one retry: 450 requests at once got refused.
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    const one = async (u) => {
      for (let i = 0; i < 3; i++) {
        try { const res = await fetch(new Request(`${u}${u.includes("?") ? "&" : "?"}v=${CACHE}`, { cache: "reload" })); if (res.ok) { await c.put(u, res); return; } } catch (err) { /* retry */ }
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
      throw new Error(`precache failed: ${u}`);
    };
    const list = [...self.ASSETS];
    await Promise.all(Array.from({ length: 12 }, async () => { while (list.length) await one(list.shift()); }));
  }));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  const old = (k) => k !== CACHE && k !== TILE_CACHE && k.startsWith("fl10-") && k.endsWith("-preview") === !!TAG;
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter(old).map((k) => caches.delete(k)))));
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
    return saved; // never wait on the signal to open the app; the fetch above refreshes the copy, and a new version arrives as a new worker
  });
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (!TAG && url.pathname.startsWith(new URL("preview/", self.registration.scope).pathname)) return; // the test app has its own worker
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
