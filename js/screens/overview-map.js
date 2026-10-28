// Overview → Map (design/01 §7.3): the farm's fields on the v9 satellite map (Leaflet, bundled in
// vendor/, tiles cached by the service worker so it works with no signal). Fields are farm-wide
// (farm space `fields`); fields kept in a sector ledger (e.g. Tom's migrated Beef ledger) show too.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { openSheet } from "../ui/sheet.js";
import { textField, selectField, wireForm, guardButton } from "../ui/form.js";
import { listRecords, addRecord, updateRecord } from "../services/records.js";
import { canRead, canWrite } from "../core/policy.js";
import { toast } from "../ui/toast.js";
import { num } from "../ui/format.js";
import { largeTitle, groupLabel, emptyState } from "./common.js";

let leafletReady = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "vendor/leaflet.css"; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = "vendor/leaflet.js"; s.onload = () => res(window.L); s.onerror = rej; document.head.appendChild(s);
  });
  return leafletReady;
}
const USES = ["Grazing", "Silage", "Hay", "Tillage", "Rough grazing", "Other"];

function areaAcres(poly) { // spherical-excess approximation, fine at field scale
  if (!poly || poly.length < 3) return null;
  const R = 6378137, rad = Math.PI / 180; let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += (q.lng - p.lng) * rad * (2 + Math.sin(p.lat * rad) + Math.sin(q.lat * rad)); }
  return Math.abs(a * R * R / 2) / 4046.8564224;
}

export default async function mapTab(farm) {
  const sources = farm ? [farm.space, ...farm.ledgers].filter((l) => l && canRead(l.role, "fields") && l.role !== "accountant") : [];
  const target = farm && farm.space && canWrite(farm.space.role, "fields") ? farm.space : sources.find((l) => canWrite(l.role, "fields"));
  const body = el(html`<div>${largeTitle("Map", farm?.farmName || "")}<div class="map-box" data-map role="img" aria-label="Map of your fields"></div><div class="section" data-list></div></div>`);
  let map = null, layer = null, fields = [];
  const load = async () => { fields = []; for (const l of sources) { try { (await listRecords(l.id, "fields")).forEach((f) => fields.push({ ...f, ledger: l })); } catch (e) { /* no access */ } } };
  const paintList = () => {
    const box = body.querySelector("[data-list]");
    if (!fields.length) { box.replaceChildren(el(emptyState({ iconName: "map", title: "No fields yet", body: "Add your fields and see acres, what's grazing where, and spreading records.", action: target ? "Add a field" : null, actAttr: "data-add" }))); const b = box.querySelector("[data-add]"); if (b) b.onclick = () => fieldSheet(); return; }
    const total = fields.reduce((s, f) => s + (Number(f.acreage) || 0), 0);
    box.replaceChildren(el(html`<div>${groupLabel("Fields", `${num(total, 1)} acres`)}<div class="list">${fields.map((f) => html`<button type="button" class="row" data-f="${f.id}"><span class="tile ok">${raw(icon("map"))}</span><span class="main"><span class="primary">${f.name}</span><span class="secondary">${f.type || ""}${f.description ? " · " + f.description : ""}</span></span><span class="value">${num(Number(f.acreage) || 0, 1)} <span class="t-callout ink-2">ac</span></span></button>`)}</div></div>`));
    box.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => fieldSheet(fields.find((x) => x.id === b.dataset.f))));
  };
  const paintMap = () => {
    if (!map) return; layer.clearLayers(); const L = window.L; const pts = [];
    for (const f of fields) if (f.polygon && f.polygon.length > 2) {
      const p = L.polygon(f.polygon.map((x) => [x.lat, x.lng]), { color: "#ECEFE8", weight: 2, fillColor: "#7FB98A", fillOpacity: 0.35 }).addTo(layer);
      p.bindTooltip(f.name, { permanent: true, direction: "center", className: "fl-field-label" }); p.on("click", () => fieldSheet(f)); f.polygon.forEach((x) => pts.push([x.lat, x.lng]));
    }
    if (pts.length) map.fitBounds(pts, { padding: [24, 24], maxZoom: 17 });
  };
  function fieldSheet(f = null) {
    const can = f ? canWrite(f.ledger.role, "fields") : !!target;
    const b = el(html`<form novalidate><div class="form-group">${textField({ name: "name", label: "Name", value: f?.name || "", autofocus: !f })}${textField({ name: "acreage", label: "Acres", value: f?.acreage ?? "", inputmode: "decimal" })}${selectField({ name: "type", label: "Use", value: f?.type || "Grazing", options: USES.map((u) => ({ value: u, label: u })) })}${textField({ name: "description", label: "Notes", value: f?.description || "", optional: true })}</div>
      ${f && f.polygon && f.polygon.length > 2 ? html`<p class="hint">Mapped boundary: about ${num(areaAcres(f.polygon) || 0, 1)} acres.</p>` : html`<p class="hint">Type the acres. (Drawing the boundary on the map comes with the field tools.)</p>`}</form>`);
    if (!can) b.querySelectorAll("input,select").forEach((i) => (i.disabled = true));
    const btn = el(html`<button type="button" class="btn">Save field</button>`);
    const fm = wireForm(b); const miss = () => (fm.values().name ? null : "Add the field name to save");
    fm.onChange(() => guardButton(btn, "Save field", miss)); guardButton(btn, "Save field", miss);
    const sh = openSheet({ title: f ? f.name : "Add a field", body: b, footer: can ? btn : null, cancelText: can ? "Cancel" : "Done" });
    btn.onclick = async () => {
      const v = fm.values(); const data = { name: v.name, acreage: parseFloat(v.acreage) || 0, type: v.type, description: v.description };
      if (f) updateRecord(f.ledger.id, "fields", f, data); else addRecord(target.id, "fields", data);
      sh.close(true, { force: true }); toast("Field saved"); setTimeout(async () => { await load(); paintList(); paintMap(); }, 60);
    };
  }
  await load(); paintList();
  const mounted = async () => {
    try {
      const L = await loadLeaflet(); const box = body.querySelector("[data-map]"); if (!box.isConnected) return;
      map = L.map(box, { zoomControl: false, attributionControl: true }).setView([54.85, -6.57], 14);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Esri World Imagery" }).addTo(map);
      layer = L.layerGroup().addTo(map); paintMap();
    } catch (e) { body.querySelector("[data-map]").replaceChildren(el(html`<div class="center t-callout ink-2" style="padding:40px 16px">The map couldn't load. Your fields are listed below.</div>`)); }
  };
  return { el: body, title: "Map", fab: target ? () => fieldSheet() : null, mounted, destroy: () => { if (map) map.remove(); } };
}
