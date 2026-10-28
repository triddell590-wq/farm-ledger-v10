// Full-screen photo viewer: swipe between photos, pinch or double-tap to zoom, drag to pan,
// tap to hide the bars, caption, delete (with its own confirm, so it works over a sheet) and
// share / save through the phone's share sheet. Always dark, like the camera roll.
// Works for saved photos and for a draft strip's photos (not saved yet): the caller passes
// getSrc / getThumb / onDelete / onCaption.
import { html, raw } from "../core/html.js";
import { el, reduceMotion } from "./dom.js";
import { icon } from "./icons.js";
import { toast } from "./toast.js";
import { listDate, timeHM } from "./format.js";
import { photoFileName } from "../services/photo-codec.js";

const MAX_ZOOM = 4;

/**
 * openViewer({ items, index, title, pending:Set, canEdit, canDelete, getSrc(item)->Promise<url>,
 *   getBytes(item)->Promise<Uint8Array>, onDelete(item)->Promise|void, onCaption(item, text) })
 * -> { close() }
 */
export function openViewer(o) {
  let items = [...o.items]; let i = Math.max(0, Math.min(o.index || 0, items.length - 1));
  const prevFocus = document.activeElement;
  const v = el(html`<div class="ph-viewer" role="dialog" aria-modal="true" aria-label="Photo viewer" tabindex="-1">
    <div class="ph-top">
      <button type="button" class="icon-btn" data-close aria-label="Close photos">${raw(icon("close"))}</button>
      <span class="ph-n" aria-live="polite"></span>
      <button type="button" class="icon-btn" data-share aria-label="Share or save this photo">${raw(icon("share"))}</button>
      <button type="button" class="icon-btn" data-del aria-label="Delete this photo" ${raw(o.canDelete ? "" : "hidden")}>${raw(icon("trash"))}</button>
    </div>
    <div class="ph-track"></div>
    <button type="button" class="ph-nav prev" data-prev aria-label="Previous photo">${raw(icon("back"))}</button>
    <button type="button" class="ph-nav next" data-next aria-label="Next photo">${raw(icon("chevron"))}</button>
    <div class="ph-foot"><div data-cap></div><div class="ph-meta" data-meta></div></div>
    <div class="ph-confirm" hidden><div class="box" role="alertdialog" aria-labelledby="ph-c-t">
      <h2 id="ph-c-t">Delete this photo?</h2><p>It's removed from the record for everyone on this ledger.</p>
      <button type="button" class="btn danger" data-yes>Delete photo</button>
      <button type="button" class="btn secondary" data-no>Keep it</button></div></div>
  </div>`);
  const track = v.querySelector(".ph-track");
  document.body.appendChild(v);
  const W = () => v.clientWidth || innerWidth;

  // ---- slides ----
  const slides = [];
  function build() {
    track.replaceChildren(); slides.length = 0;
    items.forEach((it, k) => {
      const s = el(html`<div class="ph-slide" role="img" aria-label="${label(it, k)}"><img alt="" draggable="false"></div>`);
      slides.push({ el: s, img: s.querySelector("img"), loaded: false, item: it });
      track.appendChild(s);
    });
  }
  function label(it, k) { return `Photo ${k + 1} of ${items.length}${it.caption ? ": " + it.caption : ""}`; }
  function ensureLoaded(k) {
    const s = slides[k]; if (!s || s.loaded) return; s.loaded = true;
    const thumb = o.getThumb ? o.getThumb(s.item) : s.item.thumb;
    if (thumb) { s.img.src = thumb; s.img.classList.add("low"); }
    Promise.resolve(o.getSrc(s.item)).then((url) => { if (!url) return; const im = new Image(); im.onload = () => { s.img.src = url; s.img.classList.remove("low"); }; im.src = url; })
      .catch(() => { s.loaded = false; if (k === i) toast(navigator.onLine ? "Couldn't load this photo" : "This photo loads when you have signal"); });
  }

  // ---- zoom state (current slide only) ----
  let z = { s: 1, x: 0, y: 0 };
  function applyZoom(animate = false) {
    const img = slides[i]?.img; if (!img) return;
    img.style.transition = animate && !reduceMotion() ? "transform 200ms cubic-bezier(.22,1,.36,1)" : "none";
    img.style.transform = z.s === 1 ? "" : `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
  }
  function clampPan() { // keep the zoomed picture covering the screen edges it can reach
    const img = slides[i]?.img; if (!img) return;
    const mx = Math.max(0, (img.offsetWidth * z.s - W()) / 2), my = Math.max(0, (img.offsetHeight * z.s - v.clientHeight) / 2);
    z.x = Math.max(-mx, Math.min(mx, z.x)); z.y = Math.max(-my, Math.min(my, z.y));
  }
  const resetZoom = (anim) => { z = { s: 1, x: 0, y: 0 }; applyZoom(anim); };

  // ---- position ----
  function place(animate) {
    const x = -i * W();
    if (animate && !reduceMotion()) {
      track.animate([{ transform: track.style.transform || "translateX(0)" }, { transform: `translateX(${x}px)` }], { duration: 300, easing: "cubic-bezier(.22,1,.36,1)" });
    }
    track.style.transform = `translateX(${x}px)`;
  }
  function show(k, animate = true) {
    if (slides[i]) { const im = slides[i].img; im.style.transform = ""; }
    z = { s: 1, x: 0, y: 0 };
    i = Math.max(0, Math.min(k, items.length - 1));
    place(animate); [i, i - 1, i + 1].forEach(ensureLoaded); paint();
  }
  function paint() {
    const it = items[i]; if (!it) return;
    v.querySelector(".ph-n").textContent = items.length > 1 ? `${i + 1} of ${items.length}` : (o.title || "Photo");
    v.querySelector("[data-prev]").hidden = i === 0; v.querySelector("[data-next]").hidden = i >= items.length - 1;
    const cap = v.querySelector("[data-cap]");
    if (o.canEdit) {
      cap.replaceChildren(el(html`<button type="button" class="ph-cap-btn" data-cap-edit>${it.caption ? html`<span class="ph-cap">${it.caption}</span>` : html`${raw(icon("edit", { size: 20 }))}Add a caption`}</button>`));
    } else cap.replaceChildren(el(html`<div class="ph-cap">${it.caption || ""}</div>`));
    const when = it.takenAt ? `${listDate(it.takenAt)} · ${timeHM(new Date(it.takenAt))}` : "";
    const wait = o.pending && o.pending.has(it.id);
    v.querySelector("[data-meta]").replaceChildren(el(html`<span>${[it.parentLabel, when, it.byName].filter(Boolean).join(" · ")}${wait ? html` · <span class="ph-waitline">Waiting to upload</span>` : ""}${it.draft ? html` · <span class="ph-waitline">Not saved yet</span>` : ""}</span>`));
  }

  // ---- gestures ----
  const pts = new Map(); let start = null; let lastTap = 0; let moved = false;
  v.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button,input,.ph-confirm,.ph-top,.ph-foot")) return;
    v.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pts.size === 1) start = { x: e.clientX, y: e.clientY, t: performance.now(), zx: z.x, zy: z.y, kind: z.s > 1 ? "pan" : "swipe" };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; start = { kind: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y), s: z.s, zx: z.x, zy: z.y, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; }
  });
  v.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (start.kind === "pinch" && pts.size === 2) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      z.s = Math.max(1, Math.min(MAX_ZOOM, start.s * (d / (start.d || 1))));
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2; z.x = start.zx + (cx - start.cx); z.y = start.zy + (cy - start.cy);
      moved = true; applyZoom(false); return;
    }
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
    if (start.kind === "pan") { z.x = start.zx + dx; z.y = start.zy + dy; applyZoom(false); }
    else if (start.kind === "swipe") {
      const edge = (i === 0 && dx > 0) || (i === items.length - 1 && dx < 0);
      track.style.transform = `translateX(${-i * W() + (edge ? dx / 3 : dx)}px)`;
    }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (!start) return;
    if (start.kind === "pinch") { if (pts.size === 0) { if (z.s < 1.05) resetZoom(true); else { clampPan(); applyZoom(true); } start = null; } else { const [p] = [...pts.values()]; start = { x: p.x, y: p.y, t: performance.now(), zx: z.x, zy: z.y, kind: z.s > 1 ? "pan" : "swipe" }; } return; }
    const dx = e.clientX - start.x; const dt = performance.now() - start.t;
    if (!moved) { // tap
      const now = performance.now();
      if (now - lastTap < 300) { lastTap = 0; if (z.s > 1) resetZoom(true); else { z.s = 2.5; z.x = (W() / 2 - e.clientX) * 1.5; z.y = (v.clientHeight / 2 - e.clientY) * 1.5; clampPan(); applyZoom(true); } }
      else { lastTap = now; setTimeout(() => { if (lastTap === now) v.classList.toggle("chrome-off"); }, 310); }
    } else if (start.kind === "swipe") {
      const fast = Math.abs(dx) / Math.max(1, dt) > 0.5;
      if ((dx < -W() * 0.2 || (fast && dx < -30)) && i < items.length - 1) show(i + 1);
      else if ((dx > W() * 0.2 || (fast && dx > 30)) && i > 0) show(i - 1);
      else place(true);
    } else if (start.kind === "pan") { clampPan(); applyZoom(true); }
    start = null;
  };
  v.addEventListener("pointerup", up); v.addEventListener("pointercancel", up);
  v.addEventListener("wheel", (e) => { if (!e.ctrlKey) return; e.preventDefault(); z.s = Math.max(1, Math.min(MAX_ZOOM, z.s * (e.deltaY < 0 ? 1.1 : 0.9))); if (z.s === 1) resetZoom(false); else applyZoom(false); }, { passive: false });

  // ---- buttons ----
  v.addEventListener("click", async (e) => {
    const t = (s) => e.target.closest(s);
    if (t("[data-close]")) return close();
    if (t("[data-prev]")) return show(i - 1);
    if (t("[data-next]")) return show(i + 1);
    if (t("[data-share]")) return share();
    if (t("[data-del]")) { v.querySelector(".ph-confirm").hidden = false; v.querySelector("[data-no]").focus(); return; }
    if (t("[data-no]")) { v.querySelector(".ph-confirm").hidden = true; return; }
    if (t("[data-yes]")) {
      v.querySelector(".ph-confirm").hidden = true;
      const it = items[i];
      try { await o.onDelete(it); } catch (err) { toast("Couldn't delete the photo"); return; }
      items.splice(i, 1);
      toast("Photo deleted");
      if (!items.length) return close();
      build(); show(Math.min(i, items.length - 1), false); return;
    }
    if (t("[data-cap-edit]")) return editCaption();
  });
  function editCaption() {
    const it = items[i]; const box = v.querySelector("[data-cap]");
    const f = el(html`<form class="ph-cap-edit"><input name="cap" maxlength="300" placeholder="What's in this photo?" aria-label="Caption" value="${it.caption || ""}"><button type="submit">Save</button></form>`);
    box.replaceChildren(f); const inp = f.querySelector("input"); inp.focus();
    f.onsubmit = (e) => { e.preventDefault(); const text = inp.value.trim(); it.caption = text; o.onCaption && o.onCaption(it, text); paint(); slides[i].el.setAttribute("aria-label", label(it, i)); };
  }
  async function share() {
    const it = items[i];
    try {
      const bytes = await o.getBytes(it); const name = photoFileName(it);
      const file = new File([bytes], name, { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: it.parentLabel || "Farm photo" }); return; }
      const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast("Photo saved to your downloads");
    } catch (err) { if (err && err.name === "AbortError") return; toast(navigator.onLine ? "Couldn't share the photo" : "Sharing this photo needs it loaded first"); }
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (!v.querySelector(".ph-confirm").hidden) v.querySelector(".ph-confirm").hidden = true; else close(); }
    else if (e.key === "ArrowLeft" && !e.target.closest("input")) show(i - 1);
    else if (e.key === "ArrowRight" && !e.target.closest("input")) show(i + 1);
    else if (e.key === "Tab") { // keep focus inside
      const f = [...v.querySelectorAll("button,input")].filter((x) => !x.hidden && x.offsetParent !== null);
      if (!f.length) return; const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener("keydown", onKey, true);
  const onResize = () => { place(false); resetZoom(false); };
  addEventListener("resize", onResize);

  let closed = false;
  function close() {
    if (closed) return; closed = true;
    document.removeEventListener("keydown", onKey, true); removeEventListener("resize", onResize);
    const a = v.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: reduceMotion() ? "none" : "scale(.97)" }], { duration: reduceMotion() ? 120 : 200, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
    a.onfinish = () => v.remove();
    if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    o.onClose && o.onClose();
  }

  build(); show(i, false);
  v.animate([{ opacity: 0, transform: reduceMotion() ? "none" : "scale(.96)" }, { opacity: 1, transform: "none" }], { duration: reduceMotion() ? 160 : 260, easing: "cubic-bezier(.22,1,.36,1)" });
  setTimeout(() => v.querySelector("[data-close]").focus({ preventScroll: true }), 30);
  return { close, el: v, update(pending) { o.pending = pending; paint(); } };
}
