// Bottom sheets (design/00 §6.14, motion §8.6). Large sheets: Cancel · Title header, sticky
// full-width Save footer. Drag the grabber/header down to dismiss; dirty forms ask first.
// Max two deep; the lower sheet scales to .94. Dialog semantics, focus trap, Esc closes.
import { reduceMotion } from "./dom.js";
import { icon } from "./icons.js";

const stack = [];
let layer = null;
const EASE_OUT = "cubic-bezier(.22,1,.36,1)", EASE_IN = "cubic-bezier(.4,0,1,1)";
const dur = (ms) => (reduceMotion() ? 160 : ms);

function ensureLayer() {
  if (layer && layer.isConnected) return layer;
  layer = document.createElement("div"); layer.className = "sheet-layer"; document.body.appendChild(layer);
  return layer;
}
function appEl() { return document.getElementById("app"); }
const isDialog = () => matchMedia("(min-width:640px)").matches;

/**
 * openSheet({ title, size: 'large'|'small', body: Node, footer: Node, isDirty, discardTitle, label })
 * -> { el, body, close(result, {force}), done: Promise<result> }
 */
export function openSheet(o = {}) {
  ensureLayer();
  if (stack.length >= 2) stack[stack.length - 1].close(undefined, { force: true });
  const size = o.size || "large";
  const scrim = document.createElement("div"); scrim.className = "sheet-scrim";
  const sh = document.createElement("div");
  sh.className = `sheet ${size}${o.auto ? " auto" : ""}`; sh.setAttribute("role", "dialog"); sh.setAttribute("aria-modal", "true"); sh.tabIndex = -1;
  sh.setAttribute("aria-label", o.title || o.label || "Sheet");
  const grab = document.createElement("div"); grab.className = "grabber"; sh.appendChild(grab);
  let head = null;
  if (size === "large" || o.title) {
    head = document.createElement("div"); head.className = "sheet-head";
    head.innerHTML = `<div><button type="button" class="text-btn" data-sheet-cancel>${o.cancelText || "Cancel"}</button></div><h2></h2><div></div>`;
    head.querySelector("h2").textContent = o.title || "";
    if (size === "small") head.firstElementChild.innerHTML = "", head.lastElementChild.innerHTML = `<button type="button" class="icon-btn" aria-label="Close" data-sheet-cancel style="margin-left:auto">${icon("close")}</button>`;
    sh.appendChild(head);
  }
  const body = document.createElement("div"); body.className = "sheet-body";
  if (o.body) body.appendChild(o.body);
  sh.appendChild(body);
  if (o.footer) { const f = document.createElement("div"); f.className = "sheet-foot"; f.appendChild(o.footer); sh.appendChild(f); }
  layer.append(scrim, sh);

  let resolve; const done = new Promise((r) => (resolve = r));
  const prevFocus = document.activeElement;
  const below = stack[stack.length - 1];
  const entry = { el: sh, body, close, done, scrim };
  stack.push(entry);

  // open animation
  const dialog = isDialog();
  const from = reduceMotion() ? { opacity: 0, transform: dialog ? "translate(-50%,-50%)" : "translateY(0)" } : { transform: dialog ? "translate(-50%,-46%)" : "translateY(100%)", opacity: dialog ? 0 : 1 };
  const to = { transform: dialog ? "translate(-50%,-50%)" : "translateY(0)", opacity: 1 };
  sh.style.transform = to.transform;
  sh.animate([from, to], { duration: dur(340), easing: EASE_OUT });
  scrim.style.opacity = 1; scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur(240) });
  if (below) { below.el.style.transition = `transform ${dur(340)}ms ${EASE_OUT}`; below.el.style.transform = (dialog ? "translate(-50%,-50%) " : "") + "scale(.94)"; below.scrim.style.opacity = 0; }
  else { const a = appEl(); if (a && !reduceMotion()) { a.classList.add("app-behind"); requestAnimationFrame(() => a.classList.add("pushed-back")); } }
  setTimeout(() => { const f = sh.querySelector("[autofocus]") || sh; f.focus({ preventScroll: true }); }, 30);

  async function close(result, { force = false } = {}) {
    if (entry.closing) return;
    // photos added to a new record but not saved yet count as changes too (ui/photo-strip.js)
    const draftPhotos = [...sh.querySelectorAll("[data-photo-strip]")].some((n) => n.photoDirty && n.photoDirty());
    if (!force && ((o.isDirty && o.isDirty()) || draftPhotos)) {
      const ok = await confirmSheet({ title: o.discardTitle || "Discard changes?", confirm: "Discard", cancel: "Keep editing", danger: true });
      if (!ok) return;
    }
    entry.closing = true;
    const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1);
    const cur = getComputedStyle(sh).transform;
    const a = sh.animate([{ transform: cur === "none" ? to.transform : cur, opacity: 1 }, reduceMotion() || dialog ? { transform: to.transform, opacity: 0 } : { transform: "translateY(100%)", opacity: 1 }], { duration: dur(240), easing: EASE_IN, fill: "forwards" });
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur(200), fill: "forwards" });
    if (below && below.el.isConnected) { below.el.style.transform = dialog ? "translate(-50%,-50%)" : "translateY(0)"; below.scrim.style.opacity = 1; }
    else if (!stack.length) { const ap = appEl(); if (ap) ap.classList.remove("pushed-back"); }
    a.onfinish = () => { sh.remove(); scrim.remove(); };
    document.removeEventListener("keydown", onKey, true);
    if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    o.onClose && o.onClose(result);
    resolve(result);
  }
  sh.addEventListener("click", (e) => { if (e.target.closest("[data-sheet-cancel]")) close(); });
  scrim.addEventListener("click", () => close());
  function onKey(e) {
    if (stack[stack.length - 1] !== entry) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "Tab") { // trap focus
      const f = [...sh.querySelectorAll("button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])")].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return; const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener("keydown", onKey, true);

  // drag to dismiss (grabber + header)
  if (!dialog) {
    let y0 = null, t0 = 0, dy = 0;
    const start = (e) => { if (e.target.closest("button")) return; y0 = e.clientY; t0 = performance.now(); dy = 0; sh.setPointerCapture(e.pointerId); };
    const move = (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translateY(${dy}px)`; };
    const end = async () => {
      if (y0 == null) return; const v = dy / Math.max(1, performance.now() - t0) * 1000; y0 = null;
      if (dy > sh.offsetHeight * 0.3 || v > 600) { await close(); if (!entry.closing) springBack(); }
      else springBack();
    };
    const springBack = () => { sh.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: dur(220), easing: EASE_OUT }); sh.style.transform = "translateY(0)"; };
    [grab, head].filter(Boolean).forEach((h) => { h.addEventListener("pointerdown", start); h.style.touchAction = "none"; });
    sh.addEventListener("pointermove", move); sh.addEventListener("pointerup", end); sh.addEventListener("pointercancel", end);
  }
  // keyboard: handled for every sheet by ui/keyboard.js (the sheet layer follows the visible area)
  return entry;
}

/** Small confirm sheet. Resolves true/false. */
export function confirmSheet({ title, body = "", confirm = "OK", cancel = "Cancel", danger = false }) {
  const b = document.createElement("div");
  b.innerHTML = `<p class="sheet-title-sm"></p><p class="t-callout ink-2" style="margin:0 4px 16px"></p><div class="btn-col"><button type="button" class="btn ${danger ? "danger" : ""}" data-yes></button><button type="button" class="btn secondary" data-no></button></div>`;
  b.querySelector(".sheet-title-sm").textContent = title;
  const p = b.querySelector("p.t-callout"); if (body) p.textContent = body; else p.remove();
  b.querySelector("[data-yes]").textContent = confirm; b.querySelector("[data-no]").textContent = cancel;
  const s = openSheet({ size: "small", body: b, label: title, auto: true });
  b.querySelector("[data-yes]").onclick = () => s.close(true, { force: true });
  b.querySelector("[data-no]").onclick = () => s.close(false, { force: true });
  return s.done.then((r) => r === true);
}
export function closeAllSheets() { [...stack].reverse().forEach((s) => s.close(undefined, { force: true })); }
export const sheetDepth = () => stack.length;
