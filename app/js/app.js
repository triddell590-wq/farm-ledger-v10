// Boot: appearance prefs -> backends -> splash -> auth -> router.
// Backend choice (safety first — see config.js): ?backend=memory forces the in-memory demo
// backend; ?backend=firestore forces Firebase; otherwise Firebase only on the live host.
import { FIREBASE_CONFIG, LIVE_HOSTS, WARM_START_MS, BUILD } from "./config.js";
import { startBoardFeed } from "../board-feed.js";
import { useBackend, store } from "./core/store.js";
import { useAuthBackend, auth } from "./core/auth.js";
import { createMemoryBackend } from "./core/store-memory.js";
import { createMemoryAuth } from "./core/auth-memory.js";
import { on } from "./core/bus.js";
import * as router from "./core/router.js";
import { mountShell, updateShell } from "./shell.js";
import { session } from "./services/session.js";
import { applyAppearance } from "./services/appearance.js";
import { useSyncBackend } from "./screens/sync-sheet.js";
import { defineRoutes, guard } from "./routes.js";
import { playSplash, endSplash } from "./ui/splash.js";
import { toast } from "./ui/toast.js";
import { startKeyboardWatch } from "./ui/keyboard.js";

const qs = new URLSearchParams(location.search);
applyAppearance();

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load " + src)); document.head.appendChild(s); });
}

async function pickBackends() {
  const forced = qs.get("backend");
  const live = forced === "firestore" || (!forced && LIVE_HOSTS.includes(location.hostname));
  if (live) {
    for (const f of ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"]) await loadScript("vendor/" + f);
    const [{ createFirestoreBackend }, { createFirebaseAuth }] = await Promise.all([import("./core/store-firestore.js"), import("./core/auth-firebase.js")]);
    const b = createFirestoreBackend(FIREBASE_CONFIG);
    useBackend(b); useAuthBackend(createFirebaseAuth()); useSyncBackend(b);
    return b;
  }
  if (qs.get("fresh") === "1") { try { localStorage.removeItem("fl10-demo-db"); localStorage.removeItem("fl10-demo-auth"); } catch (e) { /* blocked */ } }
  const b = createMemoryBackend({ persistKey: "fl10-demo-db" });
  const a = createMemoryAuth(b, { persistKey: "fl10-demo-auth", autoVerify: qs.get("verified") === "1" });
  useBackend(b); useAuthBackend(a); useSyncBackend(b);
  window.__fl = { store: b, auth: a, router, session, appStore: store }; // test hooks (memory/demo only)
  addEventListener("online", () => b.setOnline(true)); addEventListener("offline", () => b.setOnline(false));
  if (!navigator.onLine) b.setOnline(false);
  return b;
}

async function boot() {
  let warm = false;
  try { warm = Date.now() - (+sessionStorage.getItem("fl10-active") || 0) < WARM_START_MS; } catch (e) { /* blocked */ }
  const splashDone = warm ? Promise.resolve() : playSplash();
  await pickBackends();
  const appEl = document.getElementById("app");
  mountShell(appEl); startKeyboardWatch();
  defineRoutes();
  router.setGuard(guard);
  router.onScreenChange((s) => { updateShell(s); if (s.area !== "auth" && s.remember !== false) session.rememberPlace(router.currentPath()); });
  on("store:error", (d) => {
    const code = d && d.error && d.error.code;
    if (code === "permission-denied") toast("That couldn't be saved — you don't have permission for it on this ledger.");
  });
  on("router:error", () => toast("That screen didn't open. Try again."));
  // Tom's Morning Board: feed it from any Beef ledger he owns that carries a board token.
  const feeds = new Map();
  on("session:ledgers", (ls) => { for (const l of ls || []) if (l.type === "beef" && l.role === "owner" && !feeds.has(l.id)) feeds.set(l.id, startBoardFeed(store, l.id, BUILD)); });
  on("auth:change", (u) => { if (!u) { feeds.forEach((f) => f.stop()); feeds.clear(); } });
  // First auth answer (from the phone's saved session — works offline).
  await new Promise((res) => { let first = true; auth.onChange(async (u) => { if (u) await session.load(); else session.reset(); if (first) { first = false; res(); } }); });
  setInterval(() => { try { sessionStorage.setItem("fl10-active", String(Date.now())); } catch (e) { /* blocked */ } }, 15000);
  const stage = document.getElementById("stage");
  const ready = router.start(stage);
  await Promise.all([splashDone, ready]);
  endSplash();
  // Bell count, app badge, "became late" notice, push token refresh (services/notify.js).
  import("./services/notify.js").then((n) => n.startNotify()).catch((e) => console.warn("notify", e));
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost") && qs.get("sw") !== "0") {
    navigator.serviceWorker.register("service-worker.js").catch((e) => console.warn("SW", e));
  }
}
boot().catch((e) => { console.error(e); const s = document.getElementById("boot-error"); if (s) { s.hidden = false; s.querySelector("code").textContent = String(e && e.message || e); } endSplash(); });
