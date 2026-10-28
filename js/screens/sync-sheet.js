// Sync pill states and the sheet that explains them (design/00 §6.1, design/01 §13).
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { openSheet } from "../ui/sheet.js";
import { icon } from "../ui/icons.js";
import { on, emit } from "../core/bus.js";
import { backendName } from "../core/store.js";
import { timeHM, listDate } from "../ui/format.js";

let backend = null; let lastSynced = null; let offlineSince = null; const errors = [];
const LS = "fl10-offline-since";
try { offlineSince = +localStorage.getItem(LS) || null; } catch (e) { /* blocked */ }

export function useSyncBackend(b) { backend = b; }
on("store:error", (d) => {
  const code = d && d.error && (d.error.code || d.error.message);
  if (code === "unavailable") return; // offline: Firestore retries by itself
  errors.push({ at: new Date(), what: d.op || "save", code });
  emit("sync:state");
});
on("sync:state", () => {
  const s = state();
  if (s.online && !s.pending) lastSynced = new Date();
  try {
    if (!s.online && !offlineSince) { offlineSince = Date.now(); localStorage.setItem(LS, String(offlineSince)); }
    if (s.online && offlineSince) { offlineSince = null; localStorage.removeItem(LS); }
  } catch (e) { /* blocked */ }
});
function state() { return backend && backend.syncState ? backend.syncState() : { online: navigator.onLine, pending: 0 }; }
export function offlineHours() { return offlineSince ? (Date.now() - offlineSince) / 3600000 : 0; }

export function syncLabel() {
  const s = state();
  if (errors.length) return { state: "error", label: "Sync problem — tap" };
  if (!s.online && s.pending && offlineHours() > 24) return { state: "waiting", label: `${s.pending} changes waiting` };
  if (!s.online) return { state: "offline", label: "Saved on phone" };
  if (s.pending) return { state: "syncing", label: "Syncing…" };
  return { state: "ok", label: "Synced" };
}

export function openSyncSheet() {
  const s = syncLabel();
  const text = {
    ok: "Everything you've entered is saved on this phone and on the farm's online copy.",
    offline: "No signal. Your entries are saved on this phone and will sync by themselves when you're back online.",
    waiting: "You've been offline for over a day. Your work is safe on this phone and will sync when you get a signal.",
    syncing: "Sending your latest entries now.",
    error: "Some entries couldn't be saved online. This usually means your access to a ledger was changed.",
  }[s.state];
  const body = el(html`<div>
    <p class="sheet-title-sm">${s.label}</p>
    <div class="info-card" style="margin-bottom:16px">${raw(icon(s.state === "error" ? "alert" : s.state === "ok" ? "cloud" : "cloudOff"))}<span>${text}</span></div>
    <div class="list">
      <div class="row no-lead"><div class="main"><div class="primary">Last synced</div></div><div class="ink-2">${lastSynced ? `${listDate(lastSynced.toISOString())} ${timeHM(lastSynced)}` : "Not yet this session"}</div></div>
      ${errors.slice(-3).map((e) => html`<div class="row no-lead"><div class="main"><div class="primary">Couldn't ${e.what}</div><div class="secondary">${e.code || ""} · ${timeHM(e.at)}</div></div></div>`)}
    </div>
    ${backendName() === "memory" ? html`<p class="hint">Demo mode: entries are kept in this browser only.</p>` : ""}
    ${errors.length ? html`<button type="button" class="btn secondary" style="margin-top:16px" data-clear>Clear these messages</button>` : ""}
  </div>`);
  const sh = openSheet({ size: "small", body, label: "Sync", auto: true });
  const c = body.querySelector("[data-clear]"); if (c) c.onclick = () => { errors.length = 0; emit("sync:state"); sh.close(); };
}
