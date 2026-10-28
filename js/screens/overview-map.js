// Overview → Map (design/01 §7.3) with everything the v9 map had: satellite photo with roads and
// place names, grass-growth (Sentinel-2) overlay, full screen, "Me" (GPS), saved places, jump
// chips, drawing and redrawing field boundaries with acres worked out, side lengths, a field card,
// and the map starting on the farm's postcode. Fields and places are farm-wide (farm space
// `fields` / `places`); fields kept in a sector ledger show too. Tiles are cached by the service
// worker so the map still shows at the farm with no signal.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { openSheet, confirmSheet } from "../ui/sheet.js";
import { textField, selectField, wireForm, guardButton } from "../ui/form.js";
import { listRecords, addRecord, updateRecord, softDelete, restore } from "../services/records.js";
import { canRead, canWrite } from "../core/policy.js";
import { toast } from "../ui/toast.js";
import { num } from "../ui/format.js";
import { largeTitle, groupLabel, emptyState } from "./common.js";
import { areaAcres, fieldSides, mFmt, geocodePostcode, NI_CENTRE } from "./map-geo.js";

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
const LINE = { Grazing: "#3BE37F", Silage: "#FFC21A", Hay: "#FFC21A", Tillage: "#FF8A3D", "Rough grazing": "#B7E36B" };
const lineOf = (f) => LINE[f.type] || "#4FC3F7";
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
// Sentinel-2 grass growth via Copernicus Data Space (same configuration instance as v9).
const CDSE_WMS = "https://sh.dataspace.copernicus.eu/ogc/wms/1485fcf5-da2f-4b83-9ec2-9a03e1f7cf72";
const GROWTH_SCRIPT = `//VERSION=3
function setup(){return{input:["B04","B08","SCL","dataMask"],output:{bands:4}};}
function evaluatePixel(s){
  if(!s.dataMask) return [0,0,0,0];
  if([3,8,9,10].indexOf(s.SCL)>=0) return [1,1,1,0.85];
  var n=(s.B08-s.B04)/(s.B08+s.B04+1e-6);
  var c=colorBlend(n,[0.1,0.3,0.5,0.7,0.85],[[0.55,0.35,0.2],[0.85,0.6,0.25],[0.95,0.9,0.35],[0.55,0.8,0.3],[0.1,0.5,0.15]]);
  return [c[0],c[1],c[2],1];
}`;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

export default async function mapTab(farm) {
  const space = farm && farm.space;
  const sources = farm ? [space, ...farm.ledgers].filter((l) => l && canRead(l.role, "fields") && l.role !== "accountant") : [];
  const target = space && canWrite(space.role, "fields") ? space : sources.find((l) => canWrite(l.role, "fields"));
  const postcode = (space?.settings?.postcode || "").trim();
  const body = el(html`<div>${largeTitle("Map", farm?.farmName || "")}
    <div class="map-wrap" data-wrap>
      <div class="map-box" data-map role="application" aria-label="Map of your farm"></div>
      <div class="map-top">
        <button type="button" class="map-chip strong" data-full>${raw(icon("expand"))}<span>Full screen</span></button>
        <span class="map-seg" role="group" aria-label="Map picture"><button type="button" data-mode="photo" class="on">Photo</button><button type="button" data-mode="growth">Growth</button></span>
      </div>
      <div class="map-status" data-status hidden></div>
      <div class="map-card" data-card hidden></div>
      <div class="map-draw" data-draw hidden>
        <p class="map-hint" data-hint>Tap the map at each corner of the field, then tap Finish.</p>
        <div class="map-draw-bar"><button type="button" class="map-chip" data-cancel>Cancel</button><button type="button" class="map-chip" data-undo disabled>Undo point</button><span class="map-count" data-count>0 points</span><button type="button" class="map-chip go" data-finish disabled>Finish</button></div>
      </div>
      <div class="map-jump" data-jump></div>
    </div>
    ${target ? html`<div class="btn-col" style="margin-top:12px"><button type="button" class="btn" data-drawnew>${raw(icon("plus"))}Draw a field on the map</button></div>` : ""}
    <div class="section" data-list></div></div>`);
  const $ = (s) => body.querySelector(s);
  let map = null, L = null, fieldLayer = null, labelLayer = null, drawLayer = null, photo = null, growth = null;
  let fields = [], places = [], selected = null, full = false;
  const gps = { watch: null, fix: null, dot: null, ring: null, follow: false, err: "" };
  const draw = { on: false, pts: [], editing: null };

  const load = async () => {
    fields = []; places = [];
    for (const l of sources) { try { (await listRecords(l.id, "fields")).forEach((f) => fields.push({ ...f, ledger: l })); } catch (e) { /* no access */ } }
    if (space) { try { places = await listRecords(space.id, "places"); } catch (e) { places = []; } }
  };
  const farmPlace = () => places.find((p) => p.id === "farm" || p.kind === "farm");
  const status = (t) => { const s = $("[data-status]"); s.textContent = t || ""; s.hidden = !t; };

  // ---------- list under the map ----------
  const paintList = () => {
    const box = $("[data-list]");
    if (!fields.length) { box.replaceChildren(el(emptyState({ iconName: "map", title: "No fields yet", body: target ? "Tap “Draw a field on the map” and trace the field's edge on the satellite photo — the acres are worked out for you." : "Fields your farm adds show here." }))); return; }
    const total = fields.reduce((s, f) => s + (Number(f.acreage) || 0), 0);
    box.replaceChildren(el(html`<div>${groupLabel("Fields", `${num(total, 1)} acres`)}<div class="list">${fields.map((f) => html`<button type="button" class="row" data-f="${f.id}"><span class="tile" style="background:${lineOf(f)};color:#12301c">${raw(icon("map"))}</span><span class="main"><span class="primary">${f.name}</span><span class="secondary">${f.type || ""}${f.polygon?.length > 2 ? "" : " · not drawn on the map yet"}</span></span><span class="value">${num(Number(f.acreage) || 0, 1)} <span class="t-callout ink-2">ac</span></span></button>`)}</div></div>`));
    box.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { const f = fields.find((x) => x.id === b.dataset.f); if (f.polygon?.length > 2 && map) { jumpField(f); $("[data-wrap]").scrollIntoView({ behavior: "smooth", block: "start" }); } else fieldSheet(f); }));
  };

  // ---------- map drawing ----------
  const paintFields = () => {
    if (!map) return; fieldLayer.clearLayers();
    for (const f of fields) if (f.polygon && f.polygon.length > 2) {
      const ll = f.polygon.map((x) => [x.lat, x.lng]); const on = selected === f.id;
      L.polygon(ll, { color: "#000", weight: 8, opacity: 0.35, fill: false, interactive: false }).addTo(fieldLayer);
      const p = L.polygon(ll, { color: lineOf(f), weight: on ? 5 : 4, fillColor: lineOf(f), fillOpacity: on ? 0.5 : 0.08 }).addTo(fieldLayer);
      p.bindTooltip(f.name, { permanent: true, direction: "center", className: "fl-field-label" });
      p.on("click", (e) => { L.DomEvent.stopPropagation(e); if (!draw.on) select(f.id); });
    }
    paintEdges(); paintCard();
  };
  const paintEdges = () => {
    labelLayer.clearLayers(); const f = fields.find((x) => x.id === selected); if (!f || draw.on) return;
    for (const s of fieldSides(f.polygon).sides) L.marker(s.mid, { interactive: false, keyboard: false, icon: L.divIcon({ className: "edge-lbl", html: `<span>${mFmt(s.len)}</span>`, iconSize: [0, 0] }) }).addTo(labelLayer);
  };
  const select = (id) => { selected = id; paintFields(); };
  const paintCard = () => {
    const card = $("[data-card]"); const f = fields.find((x) => x.id === selected);
    if (!f || draw.on) { card.hidden = true; return; }
    const round = fieldSides(f.polygon).perimeter; const can = canWrite(f.ledger.role, "fields");
    card.replaceChildren(el(html`<div class="map-card-in"><span class="fc-swatch" style="background:${lineOf(f)}"></span><span class="fc-text"><b>${f.name}</b><span>${num(Number(f.acreage) || 0, 1)} ac${round ? ` · ${mFmt(round)} round` : ""} · ${f.type || ""}</span></span>
      ${can ? html`<button type="button" class="map-chip" data-redraw>Redraw</button><button type="button" class="map-chip go" data-edit>Edit</button>` : html`<button type="button" class="map-chip" data-edit>Details</button>`}<button type="button" class="map-x" data-close aria-label="Close">×</button></div>`));
    card.hidden = false;
    card.querySelector("[data-close]").onclick = () => select(null);
    card.querySelector("[data-edit]").onclick = () => fieldSheet(f);
    const rd = card.querySelector("[data-redraw]"); if (rd) rd.onclick = () => startDraw(f);
  };
  const jumpField = (f) => { map.fitBounds(f.polygon.map((x) => [x.lat, x.lng]), { padding: [30, 30], maxZoom: 18 }); select(f.id); };
  const paintJump = () => {
    const bar = $("[data-jump]"); const drawn = fields.filter((f) => f.polygon?.length > 2);
    const farmP = farmPlace();
    bar.replaceChildren(el(html`<div class="map-jump-in">
      <button type="button" class="map-chip me" data-j="me"><span class="me-dot"></span>Me</button>
      ${farmP || postcode ? html`<button type="button" class="map-chip" data-j="farm">Farm</button>` : ""}
      ${places.filter((p) => p !== farmP).map((p) => html`<button type="button" class="map-chip" data-j="place" data-id="${p.id}">${p.name}</button>`)}
      ${drawn.length > 1 ? html`<button type="button" class="map-chip" data-j="all">All fields</button>` : ""}
      ${drawn.map((f) => html`<button type="button" class="map-chip fchip" data-j="field" data-id="${f.id}" style="--fc:${lineOf(f)}">${f.name}</button>`)}
      ${space ? html`<button type="button" class="map-chip" data-j="places">${raw(icon("plus"))}Places</button>` : ""}</div>`));
    bar.onclick = (e) => {
      const b = e.target.closest("[data-j]"); if (!b || !map) return; const k = b.dataset.j;
      if (k === "me") startGps(true);
      if (k === "farm") goFarm(true);
      if (k === "place") { const p = places.find((x) => x.id === b.dataset.id); if (p) map.setView([p.lat, p.lng], p.zoom || 16); }
      if (k === "all") map.fitBounds(drawn.flatMap((f) => f.polygon.map((x) => [x.lat, x.lng])), { padding: [30, 30], maxZoom: 17 });
      if (k === "field") jumpField(fields.find((f) => f.id === b.dataset.id));
      if (k === "places") placesSheet();
    };
  };

  // ---------- where the map starts: Farm place → postcode → whole of NI ----------
  async function goFarm(animate) {
    const p = farmPlace();
    if (p && (!postcode || p.source !== "postcode" || p.postcode === postcode)) { map.setView([p.lat, p.lng], p.zoom || 16, { animate }); return true; }
    if (postcode) {
      const hit = await geocodePostcode(postcode, store);
      if (hit) {
        map.setView([hit.lat, hit.lng], 16, { animate });
        if (space && canWrite(space.role, "places") && navigator.onLine !== false) {
          const data = { name: "Farm", kind: "farm", lat: hit.lat, lng: hit.lng, zoom: 16, source: "postcode", postcode };
          if (p) updateRecord(space.id, "places", p, data, { history: false }); else addRecord(space.id, "places", data, "farm");
          setTimeout(async () => { await load(); paintJump(); }, 200);
        }
        return true;
      }
      if (animate) toast("Couldn't find that postcode — check it in Settings → Farm details.");
    }
    return false;
  }

  // ---------- GPS ----------
  function startGps(follow) {
    gps.follow = follow;
    if (!navigator.geolocation) { status("This phone can't share its location."); return; }
    if (gps.fix) { map.setView([gps.fix.lat, gps.fix.lng], Math.max(map.getZoom(), 17)); gps.follow = false; }
    if (gps.watch != null) return;
    status("Finding you…");
    gps.watch = navigator.geolocation.watchPosition((pos) => {
      gps.fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
      const ll = [gps.fix.lat, gps.fix.lng];
      if (gps.ring) gps.ring.setLatLng(ll).setRadius(gps.fix.acc); else gps.ring = L.circle(ll, { radius: gps.fix.acc, color: "#2E7DF6", weight: 1, fillColor: "#2E7DF6", fillOpacity: 0.12, interactive: false }).addTo(map);
      if (gps.dot) gps.dot.setLatLng(ll); else gps.dot = L.circleMarker(ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#2E7DF6", fillOpacity: 1, interactive: false }).addTo(map);
      if (gps.follow) { map.setView(ll, Math.max(map.getZoom(), 17)); gps.follow = false; }
      status(`You are here (±${Math.round(gps.fix.acc)} m)`);
    }, (err) => {
      status(err.code === 1 ? "Location is blocked. Allow it in Settings › Privacy › Location Services for Safari." : "Couldn't get a GPS fix. Try outside, away from buildings.");
      stopGps();
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }
  function stopGps() { if (gps.watch != null) { try { navigator.geolocation.clearWatch(gps.watch); } catch (e) { /* ignore */ } } gps.watch = null; }

  // ---------- grass growth ----------
  function setMode(mode) {
    store.set("fl-imagery", mode);
    body.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
    if (mode === "growth") {
      if (!growth) {
        const to = new Date(), from = new Date(Date.now() - 60 * 864e5); const d = (x) => x.toISOString().slice(0, 10);
        growth = L.tileLayer.wms(CDSE_WMS, { layers: "TRUE_COLOR", format: "image/png", transparent: true, tileSize: 512, maxZoom: 20, uppercase: true, time: `${d(from)}/${d(to)}`, maxcc: 30, priority: "mostRecent", showlogo: false, evalscript: btoa(GROWTH_SCRIPT), opacity: 0.7, zIndex: 1, attribution: "Contains modified Copernicus Sentinel data" });
        growth.on("tileerror", () => status("Couldn't load grass growth. Check your signal, or switch back to Photo."));
      }
      growth.addTo(map); status("Grass growth: newest clear satellite pass in the last 60 days. Brown = bare, green = strong, white = cloud.");
    } else { if (growth && map.hasLayer(growth)) map.removeLayer(growth); status(""); }
  }

  // ---------- full screen ----------
  function setFull(on) {
    full = on; const w = $("[data-wrap]");
    w.classList.toggle("map-full", on); document.documentElement.classList.toggle("map-is-full", on);
    const b = $("[data-full]"); b.querySelector("span").textContent = on ? "Exit full screen" : "Full screen";
    setTimeout(() => map && map.invalidateSize(true), 60);
  }

  // ---------- drawing a field ----------
  function startDraw(editing = null) {
    if (!map) return; draw.on = true; draw.pts = []; draw.editing = editing; select(null);
    $("[data-draw]").hidden = false; $("[data-hint]").textContent = editing ? `Redrawing ${editing.name}: tap each corner, then Finish.` : "Tap the map at each corner of the field, then tap Finish. Zoom in for a tight line.";
    map.doubleClickZoom.disable(); draw.autoFull = !full; if (!full) setFull(true); paintDraw();
  }
  function stopDraw() { draw.on = false; draw.pts = []; draw.editing = null; drawLayer.clearLayers(); $("[data-draw]").hidden = true; map.doubleClickZoom.enable(); if (draw.autoFull && full) setFull(false); draw.autoFull = false; paintFields(); }
  function paintDraw() {
    drawLayer.clearLayers();
    draw.pts.forEach((p) => L.circleMarker(p, { radius: 6, color: "#fff", weight: 2, fillColor: "#A8432F", fillOpacity: 1 }).addTo(drawLayer));
    if (draw.pts.length >= 2) L.polygon(draw.pts, { color: "#A8432F", weight: 2, dashArray: "6,6", fillOpacity: 0.15 }).addTo(drawLayer);
    const n = draw.pts.length; const ac = n >= 3 ? areaAcres(draw.pts.map(([lat, lng]) => ({ lat, lng }))) : 0;
    $("[data-count]").textContent = n >= 3 ? `${n} points · ${num(ac, 2)} ac` : `${n} point${n === 1 ? "" : "s"}`;
    $("[data-undo]").disabled = !n; $("[data-finish]").disabled = n < 3;
  }
  $("[data-undo]").onclick = () => { draw.pts.pop(); paintDraw(); };
  $("[data-cancel]").onclick = () => stopDraw();
  $("[data-finish]").onclick = () => {
    const poly = draw.pts.map(([lat, lng]) => ({ lat, lng })); const acres = Math.round(areaAcres(poly) * 100) / 100; const f = draw.editing;
    stopDraw();
    if (f) { updateRecord(f.ledger.id, "fields", f, { polygon: poly, acreage: acres }); toast(`${f.name} redrawn · ${num(acres, 2)} acres`); refresh(f.id); }
    else fieldSheet(null, { polygon: poly, acreage: acres });
  };

  // ---------- sheets ----------
  function fieldSheet(f = null, drawn = null) {
    const can = f ? canWrite(f.ledger.role, "fields") : !!target;
    const acres = drawn ? drawn.acreage : f?.acreage ?? "";
    const b = el(html`<form novalidate><div class="form-group">${textField({ name: "name", label: "Field name", value: f?.name || "", autofocus: !f })}${textField({ name: "acreage", label: "Acres", value: acres, inputmode: "decimal" })}${selectField({ name: "type", label: "Use", value: f?.type || "Grazing", options: USES.map((u) => ({ value: u, label: u })) })}${textField({ name: "description", label: "Notes", value: f?.description || "", optional: true })}</div>
      ${drawn ? html`<p class="hint">Worked out from the boundary you drew: ${num(drawn.acreage, 2)} acres. Change it if your maps say different.</p>` : f && f.polygon?.length > 2 ? html`<p class="hint">Drawn boundary: about ${num(areaAcres(f.polygon) || 0, 2)} acres.</p>` : can ? html`<p class="hint">Not on the map yet — use “Draw boundary” to trace it.</p>` : ""}
      ${f && can ? html`<div class="btn-col" style="margin-top:16px"><button type="button" class="btn secondary" data-redraw>${f.polygon?.length > 2 ? "Redraw boundary on the map" : "Draw boundary on the map"}</button><button type="button" class="btn secondary" style="color:var(--late)" data-del>${raw(icon("trash"))}Delete this field</button></div>` : ""}</form>`);
    if (!can) b.querySelectorAll("input,select").forEach((i) => (i.disabled = true));
    const btn = el(html`<button type="button" class="btn">Save field</button>`);
    const fm = wireForm(b); const miss = () => (fm.values().name ? null : "Add the field name to save");
    fm.onChange(() => guardButton(btn, "Save field", miss)); guardButton(btn, "Save field", miss);
    const sh = openSheet({ title: f ? f.name : "New field", body: b, footer: can ? btn : null, cancelText: can ? "Cancel" : "Done", isDirty: () => !f && !!drawn, discardTitle: "Discard this field?" });
    btn.onclick = () => {
      if (miss()) return; const v = fm.values(); const data = { name: v.name, acreage: parseFloat(v.acreage) || 0, type: v.type, description: v.description };
      if (drawn) data.polygon = drawn.polygon;
      let id = f?.id; if (f) updateRecord(f.ledger.id, "fields", f, data); else id = addRecord(target.id, "fields", data);
      sh.close(true, { force: true }); toast("Field saved"); refresh(id);
    };
    const rd = b.querySelector("[data-redraw]"); if (rd) rd.onclick = () => { sh.close(true, { force: true }); setTimeout(() => startDraw(f), 250); };
    const del = b.querySelector("[data-del]");
    if (del) del.onclick = async () => {
      if (!(await confirmSheet({ title: `Delete ${f.name}?`, body: "The field and its boundary come off the map. You can undo straight after, or bring it back from Recently deleted for 30 days.", confirm: "Delete field", danger: true }))) return;
      softDelete(f.ledger.id, "fields", f.id); sh.close(true, { force: true }); selected = null;
      toast(`${f.name} deleted`, { action: "Undo", duration: 6000, onAction: () => { restore(f.ledger.id, "fields", f.id); refresh(f.id); } }); refresh();
    };
  }
  function placesSheet() {
    const can = space && canWrite(space.role, "places");
    const fp = farmPlace();
    const b = el(html`<div><p class="hint" style="margin:0 4px 12px">Saved places show as buttons on the map. “Farm” starts at your postcode${postcode ? ` (${postcode})` : ""}. Stand in the yard and tap “Set Farm to where I am” to make it exact.</p>
      <div class="list">${places.length ? places.map((p) => html`<div class="row"><span class="main"><span class="primary">${p.name}</span><span class="secondary">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}${p.source === "postcode" ? " · from postcode" : ""}</span></span>${can ? html`<button type="button" class="map-chip" data-delp="${p.id}" aria-label="Delete ${p.name}">${raw(icon("trash"))}</button>` : ""}</div>`) : html`<div class="row"><span class="main"><span class="secondary">No places saved yet.</span></span></div>`}</div>
      ${can ? html`<div class="form-group" style="margin-top:16px">${textField({ name: "name", label: "Place name", placeholder: "Out-farm, mart, shed…" })}</div>
      <div class="btn-col" style="margin-top:12px"><button type="button" class="btn" data-save="centre">Save the middle of the map</button><button type="button" class="btn secondary" data-save="gps">Save where I am (GPS)</button><button type="button" class="btn secondary" data-farmgps>${fp ? "Set Farm to where I am" : "Set Farm to where I am"}</button></div>` : ""}</div>`);
    const sh = openSheet({ title: "Map places", body: b });
    const fm = can ? wireForm(b) : null;
    const save = (name, lat, lng, id, extra = {}) => {
      const data = { name, lat, lng, zoom: Math.max(map.getZoom(), 16), ...extra };
      const old = id && places.find((p) => p.id === id);
      if (old) updateRecord(space.id, "places", old, data, { history: false }); else addRecord(space.id, "places", data, id || undefined);
      sh.close(true, { force: true }); toast(`${name} saved`); refresh();
    };
    const here = (cb) => { if (!navigator.geolocation) { toast("This phone can't share its location."); return; } toast("Finding you…"); navigator.geolocation.getCurrentPosition((p) => cb(p.coords.latitude, p.coords.longitude), () => toast("Couldn't get your location. Allow location for Farm Ledger."), { enableHighAccuracy: true, timeout: 20000 }); };
    b.addEventListener("click", async (e) => {
      const s = e.target.closest("[data-save]"); const d = e.target.closest("[data-delp]");
      if (s) { const name = fm.values().name.trim(); if (!name) { toast("Give the place a name first."); return; } if (s.dataset.save === "gps") here((la, ln) => save(name, la, ln)); else { const c = map.getCenter(); save(name, c.lat, c.lng); } }
      if (e.target.closest("[data-farmgps]")) here((la, ln) => save("Farm", la, ln, fp ? fp.id : "farm", { kind: "farm", source: "gps" }));
      if (d) { const p = places.find((x) => x.id === d.dataset.delp); if (p && (await confirmSheet({ title: `Delete ${p.name}?`, confirm: "Delete", danger: true }))) { softDelete(space.id, "places", p.id); sh.close(true, { force: true }); toast(`${p.name} deleted`, { action: "Undo", onAction: () => { restore(space.id, "places", p.id); refresh(); } }); refresh(); } }
    });
  }
  async function refresh(focusId) { await new Promise((r) => setTimeout(r, 80)); await load(); paintList(); paintJump(); paintFields(); if (focusId) { const f = fields.find((x) => x.id === focusId); if (f && f.polygon?.length > 2) jumpField(f); } }

  await load(); paintList();
  const dn = $("[data-drawnew]"); if (dn) dn.onclick = () => startDraw(null);
  $("[data-full]").onclick = () => setFull(!full);
  body.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => map && setMode(b.dataset.mode)));

  const mounted = async () => {
    try {
      L = await loadLeaflet(); const box = $("[data-map]"); if (!box.isConnected) return;
      map = L.map(box, { zoomControl: true, attributionControl: true, tap: true }).setView(NI_CENTRE, 9);
      photo = L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 20, maxNativeZoom: 19, attribution: "Tiles &copy; Esri" }).addTo(map);
      L.tileLayer(`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 20, maxNativeZoom: 19, opacity: 0.9, zIndex: 2 }).addTo(map);
      L.tileLayer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 20, maxNativeZoom: 19, zIndex: 2 }).addTo(map);
      fieldLayer = L.layerGroup().addTo(map); labelLayer = L.layerGroup().addTo(map); drawLayer = L.layerGroup().addTo(map);
      map.on("click", (e) => { if (draw.on) { if (map.getZoom() < 14) { toast("Zoom in on the field first (pinch or +), then tap its corners."); return; } draw.pts.push([e.latlng.lat, e.latlng.lng]); paintDraw(); } else if (selected) select(null); });
      paintFields(); paintJump();
      const drawn = fields.filter((f) => f.polygon?.length > 2);
      if (!(await goFarm(false)) && drawn.length) map.fitBounds(drawn.flatMap((f) => f.polygon.map((x) => [x.lat, x.lng])), { padding: [24, 24], maxZoom: 17 });
      if (store.get("fl-imagery") === "growth") setMode("growth");
    } catch (e) { console.error(e); $("[data-map]").replaceChildren(el(html`<div class="center t-callout ink-2" style="padding:40px 16px">The map couldn't load. Your fields are listed below.</div>`)); }
  };
  const destroy = () => { stopGps(); document.documentElement.classList.remove("map-is-full"); if (map) map.remove(); };
  return { el: body, title: "Map", fab: null, mounted, destroy }; // the big "Draw a field" button does the + job here
}
