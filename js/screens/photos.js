// Photos on a ledger (More → Photos) and on the farm space (Farm → More → Photos): every photo
// you may see, newest first, grouped by month, each labelled with the record it belongs to.
// Tap for the full-screen viewer (swipe, zoom, caption, share, delete).
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { session } from "../services/session.js";
import { watchAllPhotos, loadImage, imageBytes, deletePhoto, setCaption } from "../services/photos.js";
import { writesPhoto, moneyFilterFor } from "../services/photo-codec.js";
import { openViewer } from "../ui/photo-viewer.js";
import { icon } from "../ui/icons.js";
import { plural } from "../ui/format.js";
import { makeScreen, largeTitle, backLink, groupLabel, emptyState, farmTabs } from "./common.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthOf = (iso) => { const d = new Date(iso || Date.now()); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

export default async function photosScreen({ params }) {
  const farmMode = !params.lid;
  const ledger = farmMode ? session.farm()?.space : session.ledger(params.lid);
  const back = farmMode ? backLink("#/farm/more", "More") : backLink(`#/l/${params.lid}/more`, "More");
  const body = el(html`<div>${back}${largeTitle("Photos", ledger ? (farmMode ? session.farm()?.farmName || "" : ledger.name) : "")}<div data-out></div></div>`);
  const out = body.querySelector("[data-out]");
  let unsub = () => {}; let viewer = null;
  if (!ledger || moneyFilterFor(ledger.role) === "none") {
    out.append(el(emptyState({ iconName: "lock", title: "No photos to show", body: farmMode ? "Only the farm's owner and managers see the farm's photos." : "You can't open this ledger." })));
  } else {
    const role = ledger.role;
    const note = role === "accountant" ? "You see photos on money records only." : role === "worker" || role === "viewer" ? "Photos on money records are only shown to money roles." : "";
    unsub = watchAllPhotos(ledger.id, role, (list, pending) => {
      if (!list.length) {
        out.replaceChildren(el(emptyState({ iconName: "camera", title: "No photos yet", body: "Add photos from a record — a docket, a vet letter, a death, a checklist item — and they all show here." })));
        return;
      }
      const groups = new Map();
      list.forEach((p, k) => { const m = monthOf(p.takenAt); if (!groups.has(m)) groups.set(m, []); groups.get(m).push([p, k]); });
      const waiting = list.filter((p) => pending.has(p.id)).length;
      out.replaceChildren(el(html`<div>
        ${note ? html`<p class="hint" style="margin:0 4px 8px">${note}</p>` : ""}
        ${waiting ? html`<div class="info-card" style="margin-bottom:12px">${raw(icon("cloudOff"))}<span>${plural(waiting, "photo")} waiting to upload. They'll send when you have signal.</span></div>` : ""}
        ${[...groups].map(([m, ps]) => html`<div class="section">${groupLabel(m, plural(ps.length, "photo"))}<div class="ph-grid">${ps.map(([p, k]) => html`
          <button type="button" class="ph-tile ph-thumb" data-k="${k}" aria-label="${p.parentLabel || "Photo"}${p.caption ? ": " + p.caption : ""}${pending.has(p.id) ? " (waiting to upload)" : ""}"><img alt="" src="${p.thumb || ""}" loading="lazy">
          <span class="ph-cell-label">${p.caption || p.parentLabel || ""}</span>${pending.has(p.id) ? html`<span class="ph-wait" style="bottom:auto;top:4px">${raw(icon("cloudOff", { size: 13 }))}Waiting</span>` : ""}</button>`)}</div></div>`)}
      </div>`));
      out.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => {
        const canW = writesPhoto(role, role === "accountant");
        viewer = openViewer({ items: list, index: Number(b.dataset.k), pending, canEdit: canW, canDelete: canW,
          getSrc: (it) => loadImage(ledger.id, it), getBytes: (it) => imageBytes(ledger.id, it),
          onDelete: (it) => deletePhoto(ledger.id, it), onCaption: (it, t) => setCaption(ledger.id, it, t), onClose: () => { viewer = null; } });
      }));
      if (viewer) viewer.update(pending);
    }, () => out.replaceChildren(el(emptyState({ iconName: "cloudOff", title: "Couldn't load the photos", body: "Try again when you have signal." }))));
  }
  const destroy = () => { unsub(); if (viewer) viewer.close(); };
  if (farmMode || !ledger) return makeScreen({ body, title: "Photos", area: "farm", tab: "more", depth: 1, chrome: { tabs: farmTabs(), tab: "more" }, destroy });
  const { ledgerTabs } = await import("./ledger.js"); const { sectorModule } = await import("../sectors/ui.js");
  return makeScreen({ body, title: "Photos", area: `ledger:${ledger.id}`, sector: ledger.type, depth: 1, chrome: { tabs: ledgerTabs(ledger, await sectorModule(ledger.type)), tab: "more" }, destroy });
}
