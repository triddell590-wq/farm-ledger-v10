// Photo strip for any record sheet: "Take photo" and "From phone" tiles, thumbnails, count, and
// the full-screen viewer on tap. Two modes:
//  - live (the record exists: parent.id given) — photos save at once and show "Waiting to upload"
//    until the signal takes them;
//  - draft (a new record: no id yet) — photos are kept on the phone and saved by commit(id) when
//    the record is saved. Discarding the sheet discards them.
// Roles: hidden for people who can't see the record; no add / delete tiles for people who can't
// write it (viewers; workers on money records).
import { html, raw } from "../core/html.js";
import { el } from "./dom.js";
import { icon } from "./icons.js";
import { toast } from "./toast.js";
import { openSheet } from "./sheet.js";
import { openViewer } from "./photo-viewer.js";
import { session } from "../services/session.js";
import { canSeePhotos, canAddPhotos, toDataUrl } from "../services/photo-codec.js";
import { savePhoto, savePhotos, watchPhotos, loadImage, imageBytes, deletePhoto, setCaption } from "../services/photos.js";
import { pickFiles, preparePhoto } from "../services/photo-image.js";

const IMG_ICON = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-4.8-4.8L7 19.5"/></svg>';
const b64ToBytes = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let k = 0; k < s.length; k++) u[k] = s.charCodeAt(k); return u; };

/**
 * photoStrip({ lid, parent: { coll, id?, label }, title, hint, max, role, onChange(count) })
 * -> { node, commit(id, label?) -> ids, count(), dirty(), destroy() }
 */
export function photoStrip({ lid, parent, title = "Photos", hint = "", max = 12, role, onChange } = {}) {
  role = role || session.roleIn(lid);
  const p = { ...parent };
  const node = el(html`<div class="ph-strip" data-photo-strip data-coll="${p.coll}"><div class="ph-head"><span class="ph-title">${title}</span><span class="ph-count" data-count></span>${hint ? html`<span class="ph-hint">${hint}</span>` : ""}</div><div class="ph-row" role="list"></div><p class="ph-note" data-note hidden></p></div>`);
  if (!lid || !canSeePhotos(role, p.coll)) { node.hidden = true; return { node, commit: () => [], count: () => 0, dirty: () => false, destroy() {} }; }
  const canAdd = canAddPhotos(role, p.coll);
  const row = node.querySelector(".ph-row");
  let saved = []; let pending = new Set(); let draft = []; let busy = 0; let unsub = null; let viewer = null;

  const items = () => (p.id ? saved : draft);
  function paint() {
    const list = items();
    node.querySelector("[data-count]").textContent = list.length ? String(list.length) : "";
    const tiles = [];
    if (canAdd && list.length + busy < max) {
      tiles.push(html`<button type="button" class="ph-tile ph-add" data-ph-camera aria-label="Take a photo">${raw(icon("camera"))}<span>Take photo</span></button>`);
      tiles.push(html`<button type="button" class="ph-tile ph-add lib" data-ph-library aria-label="Add a photo from your phone">${raw(IMG_ICON)}<span>From phone</span></button>`);
    }
    for (let k = 0; k < busy; k++) tiles.push(html`<span class="ph-tile ph-busy" role="listitem" aria-label="Getting the photo ready"></span>`);
    list.forEach((it, k) => {
      const wait = !it.draft && pending.has(it.id);
      tiles.push(html`<button type="button" class="ph-tile ph-thumb" role="listitem" data-ph-i="${k}" aria-label="Photo ${k + 1} of ${list.length}${it.caption ? ": " + it.caption : ""}${wait ? " (waiting to upload)" : ""}"><img alt="" src="${it.thumb || ""}">${wait ? html`<span class="ph-wait">${raw(icon("cloudOff", { size: 13 }))}Waiting</span>` : ""}</button>`);
    });
    if (!tiles.length) tiles.push(html`<span class="ph-empty">No photos</span>`);
    row.replaceChildren(el(html`<div style="display:contents">${tiles}</div>`));
    const note = node.querySelector("[data-note]");
    const nWait = list.filter((it) => !it.draft && pending.has(it.id)).length;
    note.hidden = !nWait; note.classList.toggle("due", !!nWait);
    note.textContent = nWait ? `${nWait === 1 ? "1 photo is" : nWait + " photos are"} waiting to upload. They'll send when you have signal.` : "";
    if (viewer) viewer.update(pending);
    if (onChange && list.length !== lastCount) { lastCount = list.length; onChange(list.length); }
  }
  let lastCount = 0;

  async function add(camera) { return addFiles(await pickFiles({ camera, multiple: !camera })); }
  async function addFiles(all) {
    const files = [...(all || [])].slice(0, Math.max(0, max - items().length - busy));
    if (!files.length || !canAdd) return;
    busy += files.length; paint();
    for (const f of files) {
      try {
        const prepared = await preparePhoto(f);
        if (p.id) savePhoto(lid, p, prepared);
        else draft.push({ ...prepared, id: "draft-" + Math.random().toString(36).slice(2), draft: true, caption: "", parentLabel: p.label || "" });
      } catch (e) { console.warn("photo", e); toast(e.code === "photo/unreadable" ? "Couldn't read that picture. Try a JPEG or PNG." : "Couldn't add the photo"); }
      busy--; paint();
      requestAnimationFrame(() => row.scrollTo({ left: row.scrollWidth, behavior: "smooth" })); // show the new one
    }
    if (!p.id) node.dispatchEvent(new CustomEvent("photos:change", { bubbles: true }));
  }
  node.addEventListener("click", (e) => {
    if (e.target.closest("[data-ph-camera]")) return add(true);
    if (e.target.closest("[data-ph-library]")) return add(false);
    const t = e.target.closest("[data-ph-i]"); if (t) open(Number(t.dataset.phI));
  });

  function open(index) {
    const list = items();
    viewer = openViewer({
      items: list, index, title: title, pending, canEdit: canAdd, canDelete: canAdd,
      getSrc: (it) => (it.draft ? toDataUrl(it.b64) : loadImage(lid, it)),
      getBytes: (it) => (it.draft ? b64ToBytes(it.b64) : imageBytes(lid, it)),
      onDelete: (it) => { if (it.draft) { draft = draft.filter((x) => x !== it); paint(); node.dispatchEvent(new CustomEvent("photos:change", { bubbles: true })); return; } return deletePhoto(lid, it); },
      onCaption: (it, text) => { if (!it.draft) setCaption(lid, it, text); },
      onClose: () => { viewer = null; },
    });
  }

  function live() {
    if (unsub) unsub();
    unsub = watchPhotos(lid, role, p, (list, pend) => {
      if (node.isConnected) seen = true; else if (seen) { destroy(); return; }
      saved = list; pending = pend; paint();
    }, () => { saved = []; paint(); });
  }
  let seen = false;
  function destroy() { if (unsub) unsub(); unsub = null; }

  node.photoDirty = () => !p.id && draft.length > 0;
  if (p.id) live(); else paint();
  return {
    node,
    count: () => items().length,
    dirty: () => !p.id && draft.length > 0,
    /** Add picture files from elsewhere (e.g. the photo a docket reader just used). */
    addFiles,
    /** Save the draft photos on the new record, then follow it live. Returns the photo ids.
     *  coll: file them under a different collection (e.g. the money record a kill sheet made). */
    commit(id, label, coll) {
      if (p.id || id == null) return [];
      if (coll && canAddPhotos(role, coll)) p.coll = coll;
      p.id = String(id); if (label) p.label = label;
      const ids = draft.length ? savePhotos(lid, p, draft.map((d) => ({ ...d, label: undefined }))) : [];
      draft = []; live();
      return ids;
    },
    destroy,
  };
}

/** Draft strip helper for entry sheets: put the strip at the end of `form`; returns it. */
export function addPhotoStrip(form, opts) {
  const s = photoStrip(opts);
  form.appendChild(s.node);
  return s;
}

/**
 * Photo evidence for a checklist item (inspection self-checks): saved at once on the item, so a
 * photo counts as evidence even before the tick is saved. Put after the sheet's first form group.
 * list: "fqa" | "rtChecklist" | "lion" | ...; returns the strip (call .destroy() when the sheet closes).
 */
export function evidenceStrip(body, { lid, role, list, itemId, label = "" }) {
  const s = photoStrip({ lid, role, parent: { coll: "checklist", id: `${list}.${itemId}`, label: `${label}`.slice(0, 110) || `Checklist ${itemId}` }, title: "Photo evidence", hint: "Optional" });
  const at = body.querySelector(".form-group");
  if (at) at.after(s.node); else body.appendChild(s.node);
  return s;
}

/** A small sheet with just the evidence photos of one checklist item (for one-tap checklists). */
export function evidenceSheet({ lid, role, list, itemId, label = "" }) {
  const body = el(html`<div>${label ? html`<p class="hint" style="margin:0 4px 4px">${label}</p>` : ""}</div>`);
  const s = evidenceStrip(body, { lid, role, list, itemId, label });
  s.node.style.marginTop = "8px";
  const sh = openSheet({ title: "Photo evidence", body, size: "small", auto: true });
  sh.done.then(() => s.destroy());
  return sh;
}
/** Row button that opens evidenceSheet; returns html (wire with wireEvidenceButtons). */
export const evidenceButton = (itemId) => html`<button type="button" class="text-btn" data-evidence="${itemId}" aria-label="Photo evidence for ${itemId}">${raw(icon("camera", { size: 20 }))}Photos</button>`;
export function wireEvidenceButtons(root, { lid, role, list, labelOf = (id) => id }) {
  if (!canSeePhotos(role, "checklist")) { root.querySelectorAll("[data-evidence]").forEach((b) => b.remove()); return; }
  root.querySelectorAll("[data-evidence]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); evidenceSheet({ lid, role, list, itemId: b.dataset.evidence, label: labelOf(b.dataset.evidence) }); }));
}
