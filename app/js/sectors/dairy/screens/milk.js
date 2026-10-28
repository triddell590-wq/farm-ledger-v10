// Dairy → Milk tab (design/12 §7.1): [Tank][Quality][Mastitis][Cheques]. The milk records the
// inspector asks for live here, with the "Inspector is here" button. Cheques only for money roles.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { segmented, wireForm, textField } from "../../../ui/form.js";
import { canRead, canWrite } from "../../../core/policy.js";
import { addDays, daysBetween } from "../../../core/dates.js";
import { num } from "../../../ui/format.js";
import { largeTitle, emptyState } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { sectionOf, kvRows, lineChart, cowRow, cowLabel, dm, pill } from "../ui.js";
import { entrySheet, chipsField } from "../flows/common.js";
import { add, update } from "../actions.js";
import { tankStrip, latestTank, overLimit, rolling, rollingSeries, qualityStatus, inhibitoryFails, LEGAL } from "../model/quality.js";
import { herdMastitis, sccLists, heiferTriggers } from "../model/mastitis.js";
import { partWord, dayLabel, quartersText, milkingsOn } from "../model/milking.js";
import { moneyBody } from "./money.js";

const SEGS = [["tank", "Tank"], ["quality", "Quality"], ["mastitis", "Mastitis"], ["cheques", "Cheques"]];
const segState = new Map();
const flow = (name, fn = "default") => async (snap, extra) => (await import(`../flows/${name}.js`))[fn](snap, extra);

export default async function milk(ctx) {
  const lid = ctx.ledger.id; const routed = ctx.match?.groups?.seg;
  if (routed) segState.set(lid, routed);
  const body = el(html`<div class="dairy-page"></div>`);
  const money = { delta: 0 };
  const { first, stop } = liveSnap(ctx.ledger, (snap) => paint(body, snap, money));
  await first;
  return { el: body, title: "Milk", destroy: stop, tab: "milk", depth: routed ? 1 : 0 };
}

function paint(body, snap, money) {
  const { lid, s } = snap; const segs = SEGS.filter(([k]) => k !== "cheques" || canRead(snap.role, "finance"));
  let seg = segState.get(lid) || "tank"; if (!segs.some(([k]) => k === seg)) seg = "tank";
  const y = window.scrollY;
  const node = el(html`<div>${largeTitle("Milk", [s.processor || null, s.robot ? "robot milking" : `milking ${s.milkingTimes.join(" and ")}`, s.collection === "alternate" ? "alternate-day collection" : "daily collection"].filter(Boolean).join(" · "))}
    <div class="seg-wrap">${segmented("seg", segs.map(([value, label]) => ({ value, label })), seg)}</div><div data-body></div>
    <div class="section"><div class="list"><a class="row" href="#/l/${lid}/parlour-machine"><span class="tile">${raw(icon("settings"))}</span><span class="main"><span class="primary">Milking machine</span><span class="secondary">${s.robot ? "Robot service and tests" : "ISO 6690 test, service, liner changes"}</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div></div>
    <div class="section"><a class="btn" href="#/l/${lid}/inspect">${raw(icon("shield"))}Inspector is here</a></div></div>`);
  const target = node.querySelector("[data-body]");
  target.append({ tank, quality, mastitis, cheques: (sn) => moneyBody(sn, money) }[seg](snap));
  body.replaceChildren(node); if (y) window.scrollTo(0, y);
  wireForm(node.querySelector(".seg-wrap")).onChange(() => { segState.set(lid, node.querySelector("[data-seg] [aria-checked=true]").dataset.value); setTimeout(() => paint(body, snap, money), 160); });
}

// ---- Tank ----------------------------------------------------------------------------
function tank(snap) {
  const { s, lid } = snap; const w = canWrite(snap.role, "tankLog");
  const strip = tankStrip(s, snap.data.tankLog, snap.now, 14);
  const parts = s.robot ? ["day"] : milkingsOn(s, snap.today).map((m) => m.part);
  const over = strip.filter((x) => x.state === "over"); const miss = strip.filter((x) => x.state === "missing");
  const log = snap.data.tankLog.filter((r) => !r.deleted && r.date > addDays(snap.today, -14)).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  const last = latestTank(snap.data.tankLog);
  const days = [...new Set(strip.map((x) => x.date))];
  const mark = { ok: "✓", over: "!", missing: "–", future: "" };
  const node = el(html`<div>
    ${sectionOf(`Tank, last 14 days (${s.robot ? "daily check" : "each milking"})`, html`<div class="card pad">
      ${parts.map((p) => html`${parts.length > 1 ? html`<p class="hint" style="margin:6px 0 4px">${partWord(p)}</p>` : ""}<div class="strip" role="img" aria-label="${partWord(p)} readings: ${strip.filter((x) => x.part === p).map((x) => `${dm(x.date)} ${x.state}`).join(", ")}">${strip.filter((x) => x.part === p).map((x) => html`<i class="${x.state === "ok" ? "" : x.state}" title="${dm(x.date)}${x.rec ? ` ${(+x.rec.tempC).toFixed(1)} °C` : ""}">${mark[x.state]}</i>`)}</div>`)}
      <div class="strip-days">${days.map((d, i) => html`<span>${i % 2 ? "" : +d.slice(8)}</span>`)}</div>
      <p class="t-callout ink-2" style="margin:10px 0 0">${over.length || miss.length ? [over.length ? `${over.length} reading${over.length > 1 ? "s" : ""} over ${s.tankLimit} °C${over.every((x) => x.rec.action) ? " (action noted)" : ""}` : null, miss.length ? `${miss.length} ${s.robot ? "day" : "milking"}${miss.length > 1 ? "s" : ""} not logged` : null].filter(Boolean).join(". ") + "." : log.length ? `Every ${s.robot ? "day" : "milking"} logged and under ${s.tankLimit} °C.` : "No readings yet."}</p></div>
      ${w ? html`<button type="button" class="btn" data-tank style="margin-top:8px">${raw(icon("temp"))}Log tank temp</button>` : ""}`)}
    ${log.length ? sectionOf("Temperature", html`<div class="card pad"><p class="t-head" style="margin:0">${(+last.tempC).toFixed(1)} °C <span class="t-callout ink-2">· last reading · limit ${s.tankLimit} °C (dashed)</span></p>${lineChart(log.map((r) => +r.tempC), { limit: s.tankLimit, max: Math.max(12, ...log.map((r) => +r.tempC)) })}</div>`) : ""}
    ${sectionOf("Readings", log.length ? html`<div class="list">${[...log].reverse().slice(0, 28).map((r) => html`<div class="row no-lead"><span class="main"><span class="primary">${(+r.tempC).toFixed(1)} °C · ${r.date === snap.today ? "today" : dayLabel(r.date)} ${s.robot ? "" : partWord(r.milking || "")}</span><span class="secondary">${[r.time, r.collected ? `collected${r.litres ? " " + num(r.litres) + " L" : ""}${r.receiptTemp != null && r.receiptTemp !== "" ? ` · receipt ${r.receiptTemp} °C` : ""}` : null, r.action ? `Action: ${r.action}` : null, r.byName].filter(Boolean).join(" · ")}</span></span>${overLimit(s, r) ? pill("late", `Over ${s.tankLimit} °C`) : ""}</div>`)}</div>` : html`<p class="hint">Log the tank temperature after each milking (Red Tractor MP.6).</p>`)}
    <div class="section"><a class="row" href="#/l/${lid}/paperwork/tank" style="border-radius:var(--r-lg);background:var(--surface)"><span class="tile">${raw(icon("records"))}</span><span class="main"><span class="primary">Bulk tank log</span><span class="secondary">Print or download for the inspector</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div></div>`);
  const b = node.querySelector("[data-tank]"); if (b) b.onclick = () => flow("tank")(snap);
  return node;
}

// ---- Quality --------------------------------------------------------------------------
function quality(snap) {
  const { s, lid, today } = snap; const w = canWrite(snap.role, "milkQuality");
  const q = snap.data.milkQuality.filter((r) => !r.deleted);
  if (!q.length) {
    const n = el(html`<div>${emptyState({ sector: "dairy", title: "No milk results yet", body: "Add your processor's results each month — or import them — to see your 3-month SCC and 2-month TBC averages.", action: w ? "Add results" : null, actAttr: "data-add" })}</div>`);
    const b = n.querySelector("[data-add]"); if (b) b.onclick = () => qualitySheet(snap);
    return n;
  }
  const fails = inhibitoryFails(q, today);
  const card = (key, label, months) => {
    const r = rolling(q, key); const st = qualityStatus(key, r?.value, s); const series = rollingSeries(q, key).slice(-12);
    const band = key === "scc" ? s.bands.sccWarn : s.bands.tbcWarn;
    return sectionOf(`${label} · rolling ${months}-month average`, html`<div class="card pad"><p class="t-head" style="margin:0"><span class="${st.level === "late" ? "late-ink" : st.level === "due" ? "due-ink" : ""}">${r ? `${r.value}k` : "—"}</span> <span class="t-callout ink-2">· legal limit ${LEGAL[key]}k (dashed) · your band ${band}k</span></p>
      ${series.length > 1 ? lineChart(series.map((x) => x.value), { limit: LEGAL[key], max: LEGAL[key] * 1.1 }) : ""}
      <p class="formula">${st.text ? st.text + ". " : ""}Geometric mean of every result in the last ${months} months (${r?.n || 0} result${r?.n === 1 ? "" : "s"}), as Regulation 853/2004 sets it: exp(mean(ln x)).</p></div>`);
  };
  const node = el(html`<div>
    ${fails.length ? html`<div class="section"><div class="warn-card" style="display:flex;gap:10px;background:var(--late-soft);color:var(--late-ink);border-radius:var(--r-lg);padding:14px 16px">${raw(icon("alert"))}<span><b>${fails.length} antibiotic (inhibitory) fail${fails.length > 1 ? "s" : ""} in 12 months.</b> Last ${dm(fails[fails.length - 1].date)}${fails[fails.length - 1].action ? ` — ${fails[fails.length - 1].action}` : ". Note what happened and tell your vet."}</span></div></div>` : ""}
    ${card("scc", "SCC", 3)}${card("tbc", "TBC", 2)}
    ${sectionOf("Results", html`<div class="list">${[...q].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 24).map((r) => html`<button type="button" class="row no-lead" data-id="${r.id}"><span class="main"><span class="primary">${dayLabel(r.date)}</span><span class="secondary">${[r.scc != null && r.scc !== "" ? `SCC ${r.scc}k` : null, r.tbc != null && r.tbc !== "" ? `TBC ${r.tbc}k` : null, r.fat ? `fat ${r.fat}%` : null, r.protein ? `protein ${r.protein}%` : null, r.lactose ? `lactose ${r.lactose}%` : null].filter(Boolean).join(" · ")}</span></span>${r.inhibitory === "fail" ? pill("late", "Inhibitory fail") : r.inhibitory === "pass" ? pill("ok", "Pass") : ""}</button>`)}</div>
      ${w ? html`<div class="act-grid"><button type="button" class="btn" data-add>Add results</button><a class="btn secondary" href="#/l/${lid}/imports">Import CSV</a></div>` : ""}`, q.length)}</div>`);
  node.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => qualitySheet(snap)));
  node.querySelectorAll("[data-id]").forEach((b) => (b.onclick = () => w && qualitySheet(snap, q.find((x) => x.id === b.dataset.id))));
  return node;
}

export function qualitySheet(snap, r = {}) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "date", label: "Sample date", type: "date", value: r.date || snap.today })}
    ${textField({ name: "scc", label: "SCC (thousands per ml)", value: r.scc ?? "", inputmode: "numeric", placeholder: "186", optional: true })}${textField({ name: "tbc", label: "TBC / Bactoscan (thousands)", value: r.tbc ?? "", inputmode: "numeric", placeholder: "14", optional: true })}
    ${textField({ name: "fat", label: "Butterfat %", value: r.fat ?? "", inputmode: "decimal", optional: true })}${textField({ name: "protein", label: "Protein %", value: r.protein ?? "", inputmode: "decimal", optional: true })}${textField({ name: "lactose", label: "Lactose %", value: r.lactose ?? "", inputmode: "decimal", optional: true })}</div>
    <div class="form-group">${chipsField("inhibitory", "Antibiotic (inhibitory) test", [["pass", "Pass"], ["fail", "Fail"], ["", "Not tested"]], r.inhibitory ?? "pass")}</div>
    <div class="form-group" data-fail hidden>${textField({ name: "action", label: "Action taken", value: r.action || "", placeholder: "Found 214 milked into the tank; vet called" })}${textField({ name: "vetInformed", label: "Vet told on", type: "date", value: r.vetInformed || "", optional: true })}</div></form>`);
  const nn = (v) => (v === "" ? null : +v);
  const es = entrySheet({ title: r.id ? "Milk result" : "Add milk results", body, label: "Save results",
    missing: (v) => (!v.date ? "Add the date" : v.scc === "" && v.tbc === "" && v.fat === "" && v.inhibitory !== "fail" ? "Add at least one result" : v.inhibitory === "fail" && !v.action ? "Note the action taken to save" : null),
    save(v, sh) {
      const data = { date: v.date, scc: nn(v.scc), tbc: nn(v.tbc), fat: nn(v.fat), protein: nn(v.protein), lactose: nn(v.lactose), inhibitory: v.inhibitory || null, action: v.action || "", vetInformed: v.vetInformed || "" };
      if (r.id) update(snap.lid, "milkQuality", r, data); else add(snap.lid, "milkQuality", data);
      sh.close(true, { force: true }); toast(v.inhibitory === "fail" ? "Saved. Tell your vet — the fail is on the record." : "Results saved");
    } });
  const paint = () => { body.querySelector("[data-fail]").hidden = es.form.values().inhibitory !== "fail"; };
  es.form.onChange(paint); paint();
  return es.sheet.done;
}

// ---- Mastitis & SCC -------------------------------------------------------------------
function mastitis(snap) {
  const { lid, today } = snap; const w = canWrite(snap.role, "medicines");
  const h = herdMastitis(snap.ix, snap.data, today); const sl = sccLists(snap.ix, snap.data, today); const ht = heiferTriggers(snap.ix, snap.data, today);
  const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
  const recent = snap.data.mastitis.filter((c) => !c.deleted && c.date > addDays(today, -60)).sort((a, b) => b.date.localeCompare(a.date));
  const histTxt = (x) => x.history.map((r) => `${r.scc}k`).join(" → ");
  const node = el(html`<div>
    ${sectionOf("Herd, last 12 months", html`<div class="card pad">${kvRows([
      ["Clinical cases per 100 cows a year", h.ratePer100 != null ? `${Math.round(h.ratePer100)} (target ≤ 30)` : "—", h.ratePer100 > 30 ? "late" : h.ratePer100 != null ? "ok" : ""],
      ["Cases", num(h.cases)], ["% of herd affected", pct(h.pctAffected)], ["Recurrence (same quarter within 30 days)", pct(h.recurrencePct), h.recurrencePct > 0.1 ? "due" : ""],
      ["Heifers with mastitis in the first month", ht.heifers ? `${ht.clinical} of ${ht.heifers}${ht.clinicalFlag ? " — over 1 in 12" : ""}` : "—", ht.clinicalFlag ? "late" : ""],
      ["Heifers over 200k at first test", ht.tested ? `${ht.highFirst} of ${ht.tested}${ht.highFlag ? " — over 10%" : ""}` : "—", ht.highFlag ? "late" : ""]])}
      <p class="formula">Cases ÷ cows (milking + dry) × 100. AHDB triggers for heifers: more than 1 in 12 with clinical mastitis in the first month, or more than 10% over 200k at the first recording.</p></div>
      ${w ? html`<button type="button" class="btn" data-treat style="margin-top:8px">${raw(icon("syringe"))}Record a mastitis case</button>` : ""}`)}
    ${sectionOf("Over 200k at the last recording", sl.high.length ? html`<div class="list">${sl.high.map((x) => cowRow(snap, x.a, { extra: html`<span class="secondary">${histTxt(x)}</span>` }))}</div>` : html`<p class="hint">${snap.data.recordings.length ? "No cows over 200k." : "Import milk recording to see cow SCCs."}</p>`, sl.high.length || "")}
    ${sl.chronic.length ? sectionOf("Chronic (over 200k at 3 recordings)", html`<div class="list">${sl.chronic.map((x) => cowRow(snap, x.a, { extra: html`<span class="secondary">${histTxt(x)} · think about culling or drying off a quarter</span>` }))}</div>`, sl.chronic.length) : ""}
    ${sl.newInf.length ? sectionOf("New infections since the last recording", html`<div class="list">${sl.newInf.map((x) => cowRow(snap, x.a, { extra: html`<span class="secondary">${histTxt(x)}</span>` }))}</div>`, sl.newInf.length) : ""}
    ${sectionOf("Cases, last 60 days", recent.length ? html`<div class="list">${recent.map((c) => { const a = snap.ix.byId.get(c.animalId); return html`<a class="row cow-row" href="#/l/${lid}/cow/${c.animalId}"><span class="cow-no">${a ? cowLabel(a) : "?"}</span><span class="main"><span class="primary">${quartersText(c.quarters)} · ${c.grade || "case"}</span><span class="secondary">${[dm(c.date), c.productName, c.caseNo ? `case ${c.caseNo} this lactation` : null].filter(Boolean).join(" · ")}</span></span>${c.failure ? pill("late", "Failure") : c.recurrence ? pill("due", "Recurrence") : ""}</a>`; })}</div>` : html`<p class="hint">No cases in the last 60 days.</p>`, recent.length || "")}
    <div class="section"><div class="list">
      <a class="row" href="#/l/${lid}/tools/sdct"><span class="tile">${raw(icon("water"))}</span><span class="main"><span class="primary">Selective dry cow therapy list</span><span class="secondary">Cows to dry off with their last 3 SCCs — the vet decides</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
      <a class="row" href="#/l/${lid}/imports"><span class="tile">${raw(icon("download"))}</span><span class="main"><span class="primary">Import milk recording</span><span class="secondary">NMR / CIS CSV — map the columns once</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
      <a class="row" href="#/l/${lid}/paperwork/mastitis"><span class="tile">${raw(icon("records"))}</span><span class="main"><span class="primary">Mastitis cases register</span><span class="secondary">Print or download</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div></div></div>`);
  const t = node.querySelector("[data-treat]"); if (t) t.onclick = () => flow("treatment")(snap, { reason: "Mastitis" });
  void daysBetween;
  return node;
}
