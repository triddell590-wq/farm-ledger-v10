// Toasts (design/00 §6.15): one at a time, inverse colours, optional action (Undo), live region.
import { reduceMotion } from "./dom.js";
let wrap = null; let current = null; let timer = null;

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
  wrap.classList.toggle("no-tabbar", !document.querySelector(".tabbar:not([hidden])"));
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
  wrap.appendChild(t); current = t;
  if (!reduceMotion()) t.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], { duration: 160, easing: "cubic-bezier(.22,1,.36,1)" });
  timer = setTimeout(() => hide(t), opts.duration || (opts.action ? 6000 : 4000));
  return t;
}
function hide(t) {
  if (!t.isConnected) return;
  const a = t.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(8px)" }], { duration: reduceMotion() ? 1 : 160, easing: "cubic-bezier(.4,0,1,1)" });
  a.onfinish = () => { t.remove(); if (current === t) current = null; };
}
export function clearToasts() { if (current) current.remove(); current = null; }
