// Toasts (design/00 §6.15): one at a time, inverse colours, optional action (Undo), live region.
// Review fixes 1B (A #17, B #4): short-lived (3 s, 5 s with Undo); cleared when you move to
// another screen and when a sheet opens; never over a sheet (with a sheet open it shows at the
// top, over the dimmed screen) and never over the + button (it sits beside it).
import { reduceMotion } from "./dom.js";
let wrap = null; let current = null; let timer = null; let shownAt = 0;
export const TOAST_MS = 3000, TOAST_ACTION_MS = 5000, TOAST_MAX_MS = 6000;
const NAV_GRACE_MS = 900; // a toast raised by the tap that also changes screen survives that one change

function ensure() {
  if (wrap) return wrap;
  wrap = document.createElement("div");
  wrap.className = "toast-wrap"; wrap.setAttribute("role", "status"); wrap.setAttribute("aria-live", "polite");
  document.body.appendChild(wrap);
  return wrap;
}
/** toast("Calving saved", { action: "Undo", onAction }) */
export function toast(message, opts = {}) {
  ensure();
  const sheetOpen = !!document.querySelector(".sheet-layer .sheet:not(.closing)");
  wrap.classList.toggle("no-tabbar", !document.querySelector(".tabbar:not([hidden])"));
  wrap.classList.toggle("over-sheet", sheetOpen);
  wrap.classList.toggle("beside-fab", !sheetOpen && !!document.querySelector(".fab:not([hidden])"));
  clearTimeout(timer);
  const old = current;
  const t = document.createElement("div"); t.className = "toast";
  const m = document.createElement("div"); m.className = "msg"; m.textContent = message; t.appendChild(m);
  if (opts.action) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = opts.action;
    b.onclick = () => { hide(t); opts.onAction && opts.onAction(); }; t.appendChild(b);
  }
  // swipe down to dismiss
  let y0 = null;
  t.addEventListener("pointerdown", (e) => { y0 = e.clientY; });
  t.addEventListener("pointerup", (e) => { if (y0 != null && e.clientY - y0 > 24) hide(t); y0 = null; });
  if (old) { old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduceMotion() ? 1 : 120 }).onfinish = () => old.remove(); }
  wrap.appendChild(t); current = t; shownAt = Date.now();
  if (!reduceMotion()) t.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], { duration: 160, easing: "cubic-bezier(.22,1,.36,1)" });
  timer = setTimeout(() => hide(t), Math.min(TOAST_MAX_MS, opts.duration || (opts.action ? TOAST_ACTION_MS : TOAST_MS)));
  return t;
}
function hide(t) {
  if (!t.isConnected) return;
  const a = t.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(8px)" }], { duration: reduceMotion() ? 1 : 160, easing: "cubic-bezier(.4,0,1,1)" });
  a.onfinish = () => { t.remove(); if (current === t) current = null; };
}
export function clearToasts() { clearTimeout(timer); if (current) current.remove(); current = null; }
// Moving to another screen clears the toast (unless it was raised by the tap that navigated).
if (typeof addEventListener === "function") addEventListener("hashchange", () => { if (current && Date.now() - shownAt > NAV_GRACE_MS) clearToasts(); });
