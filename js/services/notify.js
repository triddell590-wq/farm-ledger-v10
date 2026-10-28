// Phone notifications on this device (design/01 §11 "Reminders"; builder-notify brief).
// - Opt-in per device from Account settings → Notifications; permission is only asked on a tap.
// - Push needs a Web Push (VAPID) public key in config.js (FCM_VAPID_KEY). Without it the screen
//   says push isn't set up yet; the bell, the badge and the "became late" notice still work.
// - The device doc users/{uid}/devices/{deviceId} carries the FCM token, time zone and prefs; the
//   hourly sender (build/notify/send.mjs) reads it. Token refresh on open; removed on turn-off
//   and sign-out.
// - Items (alerts + jobs across all my ledgers) come from services/duties.js, the same code the
//   sender runs, and feed the bell, the notification centre and the app badge.
import { auth } from "../core/auth.js";
import { backendName } from "../core/store.js";
import { emit, on } from "../core/bus.js";
import { session } from "./session.js";
import { allItems } from "./duties.js";
import { saveDevice, removeDevice, getDevice, getLog, writeLog } from "./devices.js";
import { FCM_VAPID_KEY } from "../config.js";
import { normPrefs, filterForPrefs, lateLegal, badgeCount, lateKey, logId, DEFAULT_TZ, validTz } from "./notify-core.js";

const LS_DEVICE = "fl10-device", LS_STATE = "fl10-notify", LS_SEEN = "fl10-late-seen";
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* blocked */ } };

let test = null; // memory/demo backend only: { vapidKey, token(), deleteToken() }
/** Test hook (in-memory backend only): pretend push is configured. */
export function useTestPush(t) { if (backendName() === "memory") test = t; }

export function deviceId() {
  let id = lsGet(LS_DEVICE, null);
  if (!id) { id = "d" + Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, "0")).join(""); lsSet(LS_DEVICE, id); }
  return id;
}
export const vapidKey = () => (test ? test.vapidKey : FCM_VAPID_KEY) || "";
export const pushConfigured = () => !!vapidKey();
export function timeZone() { try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; return validTz(tz) ? tz : DEFAULT_TZ; } catch (e) { return DEFAULT_TZ; } }

/** What this phone can do: { state, ios, standalone, permission }.
 *  state: 'ios-install' | 'unsupported' | 'denied' | 'default' | 'granted' */
export function support() {
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = !!(navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches));
  const hasN = "Notification" in window; const hasPush = "serviceWorker" in navigator && "PushManager" in window;
  const permission = hasN ? Notification.permission : "unsupported";
  let state;
  if (ios && !standalone) state = "ios-install";        // iPhone: only the home-screen app (iOS 16.4+) can get push
  else if (!hasN) state = "unsupported";
  else state = permission;                               // default | granted | denied
  return { state, ios, standalone, permission, push: hasPush };
}
export function platform() {
  const ua = navigator.userAgent || "";
  return /Android/.test(ua) ? "android" : /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "ios" : /Windows|Macintosh|Linux|CrOS/.test(ua) ? "desktop" : "other";
}

/** Local opt-in state for this phone: { on, uid, prefs } */
export function localState() { const s = lsGet(LS_STATE, {}); return { on: !!s.on && s.uid === auth.user?.uid, uid: s.uid || null, prefs: normPrefs(s.prefs) }; }
const setLocal = (s) => lsSet(LS_STATE, { ...lsGet(LS_STATE, {}), ...s });

// ---- FCM token -------------------------------------------------------------------------
function loadScript(src) {
  if (document.querySelector(`script[data-src="${src}"]`)) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.dataset.src = src; s.onload = res; s.onerror = () => rej(new Error("load " + src)); document.head.appendChild(s); });
}
async function messaging() {
  await loadScript("vendor/firebase-messaging-compat.js");
  const fb = window.firebase;
  if (!fb.messaging || !(await fb.messaging.isSupported())) throw Object.assign(new Error("Push isn't supported in this browser."), { code: "push/unsupported" });
  return fb.messaging();
}
async function swReg() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg || (await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 4000))]));
}
async function getPushToken() {
  if (!pushConfigured()) return null;
  if (test) return test.token();
  if (backendName() !== "firestore") return null; // demo mode never talks to Firebase
  const reg = await swReg(); if (!reg) throw Object.assign(new Error("The app isn't fully installed yet. Close it and open it again."), { code: "push/no-sw" });
  return (await messaging()).getToken({ vapidKey: vapidKey(), serviceWorkerRegistration: reg });
}
async function dropPushToken() {
  try { if (test) return test.deleteToken && test.deleteToken(); if (backendName() === "firestore" && pushConfigured()) await (await messaging()).deleteToken(); } catch (e) { /* already gone */ }
}

// ---- opt in / out ----------------------------------------------------------------------
/** Call straight from a button tap (iPhone needs the permission request inside the tap). */
export async function turnOn(prefs) {
  const u = auth.user; if (!u) throw new Error("Sign in first");
  const sup = support();
  if (sup.state === "ios-install" || sup.state === "unsupported") return { ok: false, state: sup.state };
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, state: permission };
  let token = null, pushError = null;
  try { token = await getPushToken(); } catch (e) { pushError = e.message || String(e); }
  const p = normPrefs(prefs || localState().prefs);
  const doc = { token: token || null, platform: platform(), ua: (navigator.userAgent || "").slice(0, 200), tz: timeZone(), createdAt: new Date(), lastSeen: new Date(), prefs: p };
  const existing = await getDevice(u.uid, deviceId()).catch(() => null);
  if (existing && existing.createdAt) doc.createdAt = existing.createdAt;
  await saveDevice(u.uid, deviceId(), doc);
  setLocal({ on: true, uid: u.uid, prefs: p, token: token || null, lastSeen: Date.now() });
  primeSeen();
  emit("notify:state", localState());
  return { ok: true, state: "granted", push: !!token, pushError };
}
export async function turnOff() {
  const u = auth.user;
  await dropPushToken();
  if (u) await removeDevice(u.uid, deviceId()).catch(() => {});
  setLocal({ on: false, token: null });
  emit("notify:state", localState());
}
export async function savePrefs(prefs) {
  const u = auth.user; const p = normPrefs(prefs);
  setLocal({ prefs: p });
  if (u && localState().on) await saveDevice(u.uid, deviceId(), { prefs: p, tz: timeZone(), lastSeen: new Date() });
  emit("notify:state", localState());
  return p;
}
/** Before signing out: this phone stops getting that person's notifications. */
export async function beforeSignOut() {
  if (!localState().on) return;
  await turnOff().catch(() => {});
}
/** On open/resume: keep the token and time zone fresh; notice when permission was taken away. */
export async function refreshDevice() {
  const u = auth.user; const st = localState(); if (!u || !st.on) return;
  if ("Notification" in window && Notification.permission !== "granted") { await removeDevice(u.uid, deviceId()).catch(() => {}); setLocal({ on: false }); emit("notify:state", localState()); return; }
  const saved = lsGet(LS_STATE, {});
  let token = saved.token || null;
  try { token = (await getPushToken()) || token; } catch (e) { /* keep the old one */ }
  if (token !== saved.token || timeZone() !== saved.tz || Date.now() - (saved.lastSeen || 0) > 20 * 3600000) {
    await saveDevice(u.uid, deviceId(), { token, tz: timeZone(), lastSeen: new Date(), platform: platform() }).catch(() => {});
    setLocal({ token, tz: timeZone(), lastSeen: Date.now() });
  }
}

// ---- items, bell, badge, "became late" -------------------------------------------------
let cur = { items: [], at: 0, loading: null };
export const currentItems = () => cur.items;
export function myLedgers() { return session.ledgers.filter((l) => l.type !== "farm"); }
/** Work out everything due across my ledgers (all farms). Emits "notify:items". */
export function refreshItems({ force = false } = {}) {
  if (!auth.user) return Promise.resolve([]);
  if (cur.loading) return cur.loading;
  if (!force && Date.now() - cur.at < 60000) return Promise.resolve(cur.items);
  cur.loading = (async () => {
    try {
      const items = await allItems(myLedgers());
      cur = { items, at: Date.now(), loading: null };
      setBadge(badgeCount(items));
      emit("notify:items", items);
      checkNewlyLate(items).catch(() => {});
      return items;
    } finally { cur.loading = null; }
  })();
  return cur.loading;
}
export function setBadge(n) {
  try { if (n > 0 && navigator.setAppBadge) navigator.setAppBadge(n).catch(() => {}); else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {}); } catch (e) { /* not supported */ }
}
function primeSeen() { try { localStorage.removeItem(LS_SEEN); } catch (e) { /* blocked */ } } // next look only remembers
/** Legal items that turned late since this phone last looked: one system notification each (or
 *  one grouped), unless the sender already pushed it (notifyLog). The first look only remembers. */
export async function checkNewlyLate(items) {
  const u = auth.user; const st = localState();
  if (!u || !st.on || !("Notification" in window) || Notification.permission !== "granted") return [];
  const late = lateLegal(filterForPrefs(items, st.prefs));
  const seen = lsGet(LS_SEEN, null);
  const keys = late.map(lateKey);
  if (!seen || seen.uid !== u.uid) { lsSet(LS_SEEN, { uid: u.uid, keys }); return []; }
  const fresh = late.filter((i) => !seen.keys.includes(lateKey(i)));
  lsSet(LS_SEEN, { uid: u.uid, keys });
  if (!fresh.length || !st.prefs.late || !st.prefs.kinds.legal) return [];
  const show = [];
  for (const i of fresh) { const id = logId(lateKey(i)); const done = await getLog(u.uid, id).catch(() => null); if (!done) show.push(i); }
  if (!show.length) return [];
  const { lateMessage, MAX_LATE_PUSHES } = await import("./notify-core.js");
  const msgs = show.length > MAX_LATE_PUSHES ? [lateMessage(show)] : show.map((i) => lateMessage([i]));
  const reg = await swReg().catch(() => null);
  for (const m of msgs) {
    const opts = { body: m.body, tag: m.tag, data: { url: m.url }, icon: "icons/icon-192.png", badge: "icons/favicon-32.png" };
    try { if (reg && reg.showNotification) await reg.showNotification(m.title, opts); else new Notification(m.title, opts); } catch (e) { /* blocked */ }
  }
  for (const i of show) await writeLog(u.uid, logId(lateKey(i)), { key: lateKey(i), sentAt: new Date(), kind: "late", ledgerId: i.ledgerId, title: i.title, by: "app" }).catch(() => {});
  emit("notify:shown", msgs);
  return msgs;
}

/** Wire up once at boot: items on sign-in / ledger change / resume; token refresh. */
let started = false;
export function startNotify() {
  if (started) return; started = true;
  let t = null; const soon = (force) => { clearTimeout(t); t = setTimeout(() => refreshItems({ force }).catch(() => {}), 1200); };
  on("session:ledgers", () => soon(true));
  on("auth:change", (u) => { if (!u) { cur = { items: [], at: 0, loading: null }; setBadge(0); emit("notify:items", []); } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { soon(false); refreshDevice().catch(() => {}); } });
  if (auth.user) { soon(true); refreshDevice().catch(() => {}); }
  // The service worker asks the page to open a screen when a notification is tapped.
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => { const d = e.data || {}; if (d.type === "fl-open" && d.url) location.hash = d.url.replace(/^.*#/, "#"); });
}
