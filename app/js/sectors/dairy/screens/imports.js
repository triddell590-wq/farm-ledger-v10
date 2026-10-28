// Dairy → More → Imports (design/12 §9 "Import"): milk-recording (NMR/CIS) and robot (Lely,
// DeLaval) CSV files. The farmer maps the columns once; the mapping is saved as a template per
// source in `imports`, and each file becomes one `recordings` doc (robot files also feed the
// "not milked 12 h" alert). Column guesses are keyword matches only — export formats vary.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { num } from "../../../ui/format.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { add, update } from "../actions.js";
import { parseCsv, FIELDS, SOURCES, guessMap, toRecording } from "../model/csv.js";
import { nowStr } from "../model/milking.js";
import { normTag } from "../model/cows.js";

export default async function imports(ctx) {
  const body = el(html`<div class="dairy-page"></div>`);
  const st = { source: null, parsed: null, map: null, file: "" };
  let snapRef = null;
  const { first, stop } = liveSnap(ctx.ledger, (snap) => { snapRef = snap; if (!st.parsed) body.replaceChildren(render(snap, st, () => body.replaceChildren(render(snapRef, st, rerender)))); });
  function rerender() { body.replaceChildren(render(snapRef, st, rerender)); }
  await first;
  return { el: body, title: "Imports", tab: "more", destroy: stop };
}

/** Find a cow by management number, else by tag (full or last digits). */
export function finder(ix) {
  return (cowNo, tag) => {
    if (cowNo && ix.byNo.get(String(cowNo).replace(/^0+(?=\d)/, ""))) return ix.byNo.get(String(cowNo).replace(/^0+(?=\d)/, ""));
    if (cowNo && ix.byNo.get(String(cowNo))) return ix.byNo.get(String(cowNo));
    if (tag) { const t = normTag(tag); if (ix.byTag.get(t)) return ix.byTag.get(t); const tail = t.slice(-5); if (tail.length === 5) return [...ix.byTag.values()].find((a) => normTag(a.tag).endsWith(tail)) || null; }
    return null;
  };
}

function render(snap, st, rerender) {
  const { lid } = snap; const can = canWrite(snap.role, "recordings");
  const tpl = snap.data.imports.filter((t) => !t.deleted);
  const recs = snap.data.recordings.filter((r) => !r.deleted).sort((a, b) => String(b.at || b.date).localeCompare(String(a.at || a.date)));
  const node = el(html`<div>${backLink(`#/l/${lid}/more`, "More")}${largeTitle("Imports", "Milk recording and robot files (CSV)")}
    <div class="info-card">${raw(icon("info"))}<span>Farm Ledger is the decisions-and-compliance layer, not a parlour system. Export a CSV from your milk-recording or robot software and bring it in here — you map the columns once.</span></div>
    ${can ? html`<div class="section">${groupLabel("1. Where is the file from?")}
      <div class="chips scroll-chips" role="radiogroup" aria-label="Source">${SOURCES.map((s) => html`<button type="button" class="chip" role="radio" aria-checked="${st.source === s.id}" data-src="${s.id}">${s.label}</button>`)}</div></div>
    ${st.source ? html`<div class="section">${groupLabel("2. Choose the file")}<label class="btn secondary" style="position:relative">${raw(icon("download"))}${st.file || "Choose a CSV file"}<input type="file" accept=".csv,text/csv,text/plain" data-file style="position:absolute;inset:0;opacity:0"></label>
      <details style="margin-top:8px"><summary class="text-btn">Or paste the text</summary><textarea class="field" data-paste rows="5" style="width:100%;margin-top:8px" placeholder="Cow No,Test Date,Yield,Fat,Protein,SCC"></textarea><button type="button" class="btn secondary" data-read style="margin-top:8px">Read pasted text</button></details></div>` : ""}
    ${st.parsed ? mapping(snap, st) : ""}` : html`<div class="card pad t-callout ink-2">Your role can see imported recordings but not add files.</div>`}
    ${sectionOf("Saved templates", tpl.length ? html`<div class="list">${tpl.map((t) => html`<div class="row no-lead"><span class="main"><span class="primary">${(SOURCES.find((s) => s.id === t.source) || {}).label || t.source}</span><span class="secondary">${Object.keys(t.columnMap || {}).length} columns mapped${t.lastRun ? ` · last used ${t.lastRun.slice(0, 10)}` : ""}</span></span></div>`)}</div>` : html`<p class="hint">None yet — your first import saves one.</p>`)}
    ${sectionOf("Imported", recs.length ? html`<div class="list">${recs.slice(0, 12).map((r) => html`<div class="row no-lead"><span class="main"><span class="primary">${r.date} · ${r.source || "CSV"}${r.robot ? " (robot)" : ""}</span><span class="secondary">${num((r.cows || []).length)} cows${r.unmatched ? ` · ${r.unmatched} not matched` : ""}</span></span></div>`)}</div>` : html`<p class="hint">No recordings imported yet.</p>`, recs.length || "")}
  </div>`);
  node.querySelectorAll("[data-src]").forEach((b) => (b.onclick = () => { st.source = b.dataset.src; st.parsed = null; st.map = null; st.file = ""; rerender(); }));
  const take = (text, name) => {
    const parsed = parseCsv(text); if (!parsed.headers.length || !parsed.rows.length) { toast("That file has no rows we can read"); return; }
    st.parsed = parsed; st.file = name;
    const saved = tpl.find((t) => t.source === st.source);
    st.map = saved && sameHeaders(saved.headers, parsed.headers) ? { ...saved.columnMap } : guessMap(parsed.headers);
    rerender();
  };
  const fi = node.querySelector("[data-file]"); if (fi) fi.onchange = async () => { const f = fi.files[0]; if (f) take(await f.text(), f.name); };
  const rd = node.querySelector("[data-read]"); if (rd) rd.onclick = () => take(node.querySelector("[data-paste]").value, "Pasted text");
  node.querySelectorAll("[data-map]").forEach((s) => (s.onchange = () => { const v = s.value === "" ? null : +s.value; if (v == null) delete st.map[s.dataset.map]; else st.map[s.dataset.map] = v; rerender(); }));
  const go = node.querySelector("[data-import]"); if (go) go.onclick = () => doImport(snap, st, rerender);
  const cancel = node.querySelector("[data-cancel]"); if (cancel) cancel.onclick = () => { st.parsed = null; st.map = null; st.file = ""; rerender(); };
  return node;
}
const sectionOf = (label, body, right = "") => html`<div class="section">${groupLabel(label, right)}${body}</div>`;
const sameHeaders = (a, b) => Array.isArray(a) && a.length === b.length && a.every((h, i) => String(h).toLowerCase() === String(b[i]).toLowerCase());

function preview(snap, st) { return toRecording(st.parsed, st.map, finder(snap.ix), snap.today); }

function mapping(snap, st) {
  const src = SOURCES.find((s) => s.id === st.source); const r = preview(snap, st);
  const need = st.map.cowNo != null || st.map.tag != null;
  return html`<div class="section">${groupLabel("3. Match the columns", `${st.parsed.rows.length} rows`)}
    <div class="form-group import-map">${FIELDS.filter((f) => f.key !== "lastMilked" || src.robot).map((f) => html`<div class="field"><label>${f.label}</label><select data-map="${f.key}"><option value="">— not in this file —</option>${st.parsed.headers.map((h, i) => html`<option value="${i}" ${raw(st.map[f.key] === i ? "selected" : "")}>${h}</option>`)}</select></div>`)}</div>
    <div class="card pad" style="margin-top:12px"><p class="t-callout" style="margin:0"><b>${r.cows.length} cows matched</b>${r.unmatched.length ? ` · ${r.unmatched.length} not found (${r.unmatched.slice(0, 5).map((u) => u.cowNo || "?").join(", ")}${r.unmatched.length > 5 ? "…" : ""})` : ""}</p>
      <p class="hint" style="margin:4px 0 0">Recording date ${r.date}${r.cows[0] ? ` · e.g. cow ${r.cows[0].cowNo}: ${[r.cows[0].litres != null ? r.cows[0].litres + " L" : null, r.cows[0].scc != null ? "SCC " + r.cows[0].scc + "k" : null].filter(Boolean).join(", ")}` : ""}</p></div>
    <div class="act-grid" style="margin-top:12px"><button type="button" class="btn" data-import ${raw(need && r.cows.length ? "" : "disabled")}>${need ? (r.cows.length ? `Import ${r.cows.length} cows` : "No cows matched") : "Match the cow number or tag"}</button><button type="button" class="btn secondary" data-cancel>Start again</button></div></div>`;
}

function doImport(snap, st, rerender) {
  const src = SOURCES.find((s) => s.id === st.source); const r = preview(snap, st);
  add(snap.lid, "recordings", { date: r.date, at: src.robot ? nowStr() : null, source: st.source, robot: !!src.robot, cows: r.cows, unmatched: r.unmatched.length, file: st.file });
  const saved = snap.data.imports.find((t) => !t.deleted && t.source === st.source);
  const tpl = { source: st.source, columnMap: st.map, headers: st.parsed.headers, lastRun: nowStr() };
  if (saved) update(snap.lid, "imports", saved, tpl); else add(snap.lid, "imports", tpl);
  toast(`${r.cows.length} cows imported${r.unmatched.length ? ` · ${r.unmatched.length} not matched` : ""}`);
  st.parsed = null; st.map = null; st.file = ""; rerender();
}
