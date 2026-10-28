// Import from the house controller (design/14 §4.1): pick the house and controller, choose the
// CSV (or paste it), match the columns once — the map is kept with each import and reused for the
// same controller — and the daily sheet then pre-fills water, temperatures and feed for those days
// with a small "from controller" label. The farmer still confirms eggs and deaths.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { dm, n0 } from "../ui.js";
import { sortedHouses } from "../model/flock.js";
import { CONTROLLERS, CTL_FIELDS, parseCsv, guessMap, toRows } from "../model/controller.js";
import { saveImport } from "../actions.js";

export default async function importScreen(ctx) {
  const body = el(html`<div class="ly-page push"></div>`);
  const st = { houseId: null, source: null, parsed: null, map: null, file: "" }; let snapRef = null;
  const draw = () => body.replaceChildren(render(snapRef, st, draw));
  const { first, stop } = liveSnap(ctx.ledger, (snap) => { snapRef = snap; if (!st.houseId) st.houseId = sortedHouses(snap.c)[0]?.id || null; if (!st.parsed) draw(); });
  await first;
  return { el: body, title: "Controller import", tab: "more", depth: 1, destroy: stop };
}

function render(snap, st, draw) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const hs = sortedHouses(snap.c); const can = canWrite(snap.role, "imports");
  const past = [...snap.data.imports].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const node = el(html`<div>${backLink(L("houses-setup"), "Houses and flocks")}${largeTitle("Import from your controller", "Water, temperatures and feed")}
    <div class="info-card">${raw(icon("info"))}<span>Farm Ledger sits beside your house controller, it doesn't replace it. Export a CSV from the controller and bring it in — the daily sheet fills water, temperatures and feed for those days. You still count eggs and deaths.</span></div>
    ${can ? html`<div class="section">${groupLabel("1. House and controller")}
      <p class="ly-cap" style="margin:0 4px 6px">House</p><div class="chips" role="radiogroup" aria-label="House">${hs.map((h) => html`<button type="button" class="chip" role="radio" aria-checked="${st.houseId === h.id}" data-house="${h.id}">${h.name}</button>`)}</div>
      <p class="ly-cap" style="margin:12px 4px 6px">Controller</p><div class="chips" role="radiogroup" aria-label="Controller">${CONTROLLERS.map(([id, label]) => html`<button type="button" class="chip" role="radio" aria-checked="${st.source === id}" data-src="${id}">${label}</button>`)}</div></div>
    ${st.source ? html`<div class="section">${groupLabel("2. Choose the file")}<label class="btn secondary" style="position:relative">${raw(icon("download"))}${st.file || "Choose a CSV file"}<input type="file" accept=".csv,text/csv,text/plain" data-file style="position:absolute;inset:0;opacity:0"></label>
      <details style="margin-top:8px" ${raw(st.parsed ? "" : "")}><summary class="text-btn">Or paste the text</summary><textarea class="ly-textarea" data-paste rows="5" style="margin-top:8px" placeholder="Date;Water meter;Temp min;Temp max;Feed kg"></textarea><button type="button" class="btn secondary" data-read style="margin-top:8px">Read pasted text</button></details></div>` : ""}
    ${st.parsed ? mapping(st) : ""}` : html`<div class="card pad t-callout ink-2">Your role can see imports but not add files.</div>`}
    <div class="section">${groupLabel("Imported", past.length || "")}${past.length ? html`<div class="list">${past.slice(0, 12).map((i) => html`<div class="row no-lead"><span class="main"><span class="primary">${dm(i.date)} · ${(CONTROLLERS.find((c) => c[0] === i.source) || [])[1] || i.source || "CSV"} · ${hs.find((h) => h.id === i.houseId)?.name || ""}</span><span class="secondary">${n0((i.rows || []).length)} day${(i.rows || []).length === 1 ? "" : "s"}${i.rows?.length ? ` · ${dm(i.rows[0].date)} – ${dm(i.rows[i.rows.length - 1].date)}` : ""}${i.byName ? ` · ${i.byName}` : ""}</span></span></div>`)}</div>` : html`<p class="hint">Nothing imported yet.</p>`}</div>
  </div>`);
  node.querySelectorAll("[data-house]").forEach((b) => (b.onclick = () => { st.houseId = b.dataset.house; draw(); }));
  node.querySelectorAll("[data-src]").forEach((b) => (b.onclick = () => { st.source = b.dataset.src; st.parsed = null; st.map = null; st.file = ""; draw(); }));
  const take = (text, name) => {
    const parsed = parseCsv(text); if (!parsed.headers.length || !parsed.rows.length) { toast("That file has no rows we can read"); return; }
    st.parsed = parsed; st.file = name;
    const prev = past.find((i) => i.source === st.source && i.map && Array.isArray(i.headers) && i.headers.join("|").toLowerCase() === parsed.headers.join("|").toLowerCase());
    st.map = prev ? { ...prev.map } : guessMap(parsed.headers); draw();
  };
  const fi = node.querySelector("[data-file]"); if (fi) fi.onchange = async () => { const f = fi.files[0]; if (f) take(await f.text(), f.name); };
  const rd = node.querySelector("[data-read]"); if (rd) rd.onclick = () => take(node.querySelector("[data-paste]").value, "Pasted text");
  node.querySelectorAll("[data-map]").forEach((s) => (s.onchange = () => { if (s.value === "") delete st.map[s.dataset.map]; else st.map[s.dataset.map] = +s.value; draw(); }));
  const go = node.querySelector("[data-import]"); if (go) go.onclick = () => {
    const rows = toRows(st.parsed, st.map); if (!rows.length) return;
    saveImport(snap, { source: st.source, houseId: st.houseId, rows, map: st.map, headers: st.parsed.headers });
    toast(`${rows.length} days imported for ${hs.find((h) => h.id === st.houseId)?.name || "the house"}`); st.parsed = null; st.map = null; st.file = ""; draw();
  };
  const cancel = node.querySelector("[data-cancel]"); if (cancel) cancel.onclick = () => { st.parsed = null; st.map = null; st.file = ""; draw(); };
  return node;
}

function mapping(st) {
  const rows = toRows(st.parsed, st.map); const ok = st.map.date != null && rows.length;
  return html`<div class="section">${groupLabel("3. Match the columns", `${st.parsed.rows.length} rows`)}
    <div class="form-group">${CTL_FIELDS.map((f) => html`<div class="field"><label>${f.label}</label><select data-map="${f.key}"><option value="">— not in this file —</option>${st.parsed.headers.map((h, i) => html`<option value="${i}" ${raw(st.map[f.key] === i ? "selected" : "")}>${h}</option>`)}</select></div>`)}</div>
    <div class="card pad" style="margin-top:12px"><p class="t-callout" style="margin:0"><b>${rows.length} day${rows.length === 1 ? "" : "s"} read</b>${rows.length ? ` · ${dm(rows[0].date)} – ${dm(rows[rows.length - 1].date)}` : ""}</p>
      ${rows[0] ? html`<p class="hint" style="margin:4px 0 0">e.g. ${dm(rows[rows.length - 1].date)}: ${[rows[rows.length - 1].waterMeter != null ? `meter ${n0(rows[rows.length - 1].waterMeter)} L` : null, rows[rows.length - 1].tMin != null ? `${rows[rows.length - 1].tMin}–${rows[rows.length - 1].tMax ?? "?"} °C` : null, rows[rows.length - 1].feedKg != null ? `${n0(rows[rows.length - 1].feedKg)} kg feed` : null].filter(Boolean).join(", ")}</p>` : ""}</div>
    <div class="ly-acts"><button type="button" class="btn" data-import ${raw(ok ? "" : "disabled")}>${st.map.date == null ? "Match the date column" : ok ? `Import ${rows.length} day${rows.length === 1 ? "" : "s"}` : "No dates read"}</button><button type="button" class="btn secondary" data-cancel>Start again</button></div></div>`;
}
