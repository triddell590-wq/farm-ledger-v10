// Eggs tab (design/14 §6): Production (the legal producer record) · Packer (collections, the
// packer reconciler, size mix) · Store (egg store temperature, Lion below 20 °C) · Money (money
// roles) · Farm gate (small flocks selling ungraded eggs, setting). Route #/l/<id>/eggs/<seg>.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { canRead, canWrite } from "../../../core/policy.js";
import { addDays, daysBetween } from "../../../core/dates.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../../screens/common.js";
import { liveScreen, segBar, remember, flowArg } from "./live.js";
import { dm, d2, n0, n1, pounds, pill, table, linkRow, bars, okCard, headRow } from "../ui.js";
import { sortedHouses, flockIn, series, sum } from "../model/flock.js";
import { reconcile, sizeMix, collectionGap, nextCollection, storeStatus, farmGateStock, weekStart, isoWeek } from "../model/eggs.js";
import { GRADES, RULES } from "../model/content.js";
import { statementCard } from "./statement.js";

const SEGS = [["production", "Production"], ["packer", "Packer"], ["store", "Store"], ["money", "Money"], ["farm-gate", "Farm gate"]];

export default async function eggs(ctx) {
  const routed = ctx.match?.groups?.seg;
  return liveScreen(ctx, { title: "Eggs", depth: routed ? 1 : 0, tab: routed ? "eggs" : null, paint: (snap) => paint(snap, routed), after: (node, snap, repaint) => {
    const s = node.querySelector("[data-segs]"); if (s) s.replaceWith(segBar("seg", segsFor(snap), current(snap, routed), (v) => { remember(snap.lid, "eggSeg", v); if (routed) location.hash = `#/l/${snap.lid}/eggs/${v}`; else repaint(); }));
    node.querySelector("[data-query]")?.addEventListener("click", (e) => sendQuery(snap, e.currentTarget.dataset.query));
  } });
}
function segsFor(snap) { return SEGS.filter(([k]) => (k !== "money" || canRead(snap.role, "finance")) && (k !== "farm-gate" || snap.s.farmGate || snap.s.smallFlock)); }
function current(snap, routed) { const ok = segsFor(snap).map((x) => x[0]); const want = routed || remember(snap.lid, "eggSeg") || "production"; return ok.includes(want) ? want : "production"; }

async function paint(snap, routed) {
  const seg = current(snap, routed); const L = (h) => `#/l/${snap.lid}/${h}`;
  const body = await { production, packer, store, money, "farm-gate": farmGate }[seg](snap);
  const hens = sortedHouses(snap.c).length;
  return html`<div>${routed ? backLink(L("eggs"), "Eggs") : ""}${largeTitle("Eggs", [snap.s.packer || null, snap.s.producerCode || null, hens ? null : "no houses yet"].filter(Boolean).join(" · "))}
    <div data-segs></div>${body}</div>`;
}

// ---- Production: the producer daily record (§6.1, §19) ----
function production(snap) {
  const c = snap.c; const L = (h) => `#/l/${snap.lid}/${h}`; const T = snap.today;
  const rows = []; const hs = sortedHouses(c);
  for (const h of hs) { const f = flockIn(c, h.id); if (!f) continue; for (const d of series(c, f).filter((x) => x.date > addDays(T, -14) && !x.partial)) rows.push({ h, d }); }
  rows.sort((a, b) => b.d.date.localeCompare(a.d.date) || String(a.h.order).localeCompare(String(b.h.order)));
  if (!rows.length) return emptyState({ sector: "layers", title: "No daily sheets yet", body: "Eggs produced each day come from the daily sheet — fill it for each house and this register writes itself.", action: canWrite(snap.role, "days") && hs.length ? "Fill today's sheet" : null, actAttr: 'data-flow="sheet"' });
  const wk = (from) => rows.filter((r) => r.d.date >= from && r.d.date <= addDays(from, 6));
  const thisMon = weekStart(T); const lastMon = addDays(thisMon, -7);
  const tot = (list) => ({ eggs: sum(list, (r) => r.d.eggsTotal), sec: sum(list, (r) => r.d.seconds), floor: sum(list, (r) => r.d.floor), notForSale: sum(list.filter((r) => r.d.withheld || r.d.classB), (r) => r.d.eggsTotal) });
  const a = tot(wk(thisMon)), b = tot(wk(lastMon));
  const status = (d) => (d.withheld ? html`<span class="due">Not for sale</span>` : d.classB ? html`<span class="due">Class B</span>` : "");
  return html`<div>
    <div class="ly-tiles ly-tiles2"><div class="num-tile"><span class="label">This week so far</span><span class="value">${n0(a.eggs)}</span><span class="delta">${n1(a.eggs ? (a.sec / a.eggs) * 100 : 0)}% seconds · ${n0(a.floor)} floor</span></div>
      <div class="num-tile"><span class="label">Week ${isoWeek(lastMon)}</span><span class="value">${n0(b.eggs)}</span><span class="delta">${n0(b.eggs / 12)} dozen${b.notForSale ? ` · ${n0(b.notForSale)} not for sale` : ""}</span></div></div>
    <div class="section">${groupLabel("Last 14 days", "eggs per house")}${table([["Date"], ["House"], ["Hens", "n"], ["Eggs", "n"], ["2nds", "n"], ["Floor", "n"], [""]], rows.map(({ h, d }) => [d2(d.date), h.name.replace("House ", "H"), n0(d.alive), html`<b>${n0(d.eggsTotal)}</b>`, n0(d.seconds), n0(d.floor), status(d)]))}</div>
    <div class="section"><div class="list">${linkRow(L("reg/production"), "Egg production register", "Producer daily records — print for the Egg Marketing Inspector", "", "records")}</div>
    <p class="ly-cap">Hens placed (date, number, age), eggs produced and graded each day, and eggs sold (number, grade, best before, buyer) — kept from the flock record, the daily sheet and the collections.</p></div></div>`;
}

// ---- Packer: collections + the reconciler (§6.1, §6.2) ----
function packer(snap) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const T = snap.today; const w = canWrite(snap.role, "packerStatements");
  const sts = [...snap.data.packerStatements].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const cols = [...snap.data.eggDeliveries].sort((a, b) => b.date.localeCompare(a.date));
  const gap = collectionGap(snap.c); const nc = nextCollection(snap.s, T);
  const acts = html`<div class="ly-acts">${w ? html`<button type="button" class="btn" data-flow="statement">${raw(icon("document"))}Add a statement</button>` : ""}${canWrite(snap.role, "eggDeliveries") ? html`<button type="button" class="btn secondary" data-flow="collection">${raw(icon("layers"))}Egg collection</button>` : ""}</div>`;
  if (!sts.length && !cols.length) return html`<div>${emptyState({ sector: "layers", title: "No collections yet", body: "Record each packer collection, or add the weekly statement, to check what you were paid.", action: w ? "Add a statement" : null, actAttr: 'data-flow="statement"' })}</div>`;
  const mix = sizeMix(sts);
  return html`<div>
    ${sts[0] ? statementCard(snap, sts[0]) : ""}
    ${mix && sts.length > 1 ? html`<p class="ly-cap">Size mix vs last 4 weeks: ${Object.entries(mix.delta).filter(([, v]) => v).map(([k, v]) => `${k} ${v > 0 ? "▲" : "▼"}${Math.abs(v)}%`).join(" · ") || "no change"}</p>` : ""}
    ${acts}
    <div class="section">${groupLabel("Collections", nc ? `next ${daysBetween(T, nc) === 0 ? "today" : dm(nc).split(" ")[0]}` : "")}
      ${gap?.flag ? html`<div class="ly-banner due" style="margin-bottom:8px">${raw(icon("clock"))}<span>Eggs not collected for ${gap.gap} days — Lion needs at least twice a week.</span></div>` : ""}
      ${cols.length ? html`<div class="list">${cols.slice(0, 10).map((x) => html`<div class="row no-lead"><span class="main"><span class="primary">${dm(x.date)} · ${n0(x.eggs)} eggs</span><span class="secondary">${[x.packer, x.docketNo ? `docket ${x.docketNo}` : null, x.storeTemp != null ? `store ${x.storeTemp} °C` : null, x.bestBefore ? `best before ${d2(x.bestBefore)}` : null].filter(Boolean).join(" · ")}</span></span>${x.classB ? pill("late", "Class B") : ""}</div>`)}</div>` : okCard("No collections recorded.")}</div>
    ${sts.length ? html`<div class="section">${groupLabel("Statements")}<div class="list">${sts.slice(0, 12).map((st) => { const r = reconcile(snap.c, st); return linkRow(L(`statement/${st.id}`), `Week ${st.week} · ${n0(st.counted)} eggs`, `${st.packer || ""} · you collected ${n0(r.collected)}`, r.flag ? pill("due", `${r.diff > 0 ? "+" : "−"}${n1(Math.abs(r.pct))}%`) : pill("ok", "Matches")); })}</div></div>` : ""}
    <div class="section">${groupLabel("Grade bands")}${table([["Grade"], ["Weight"]], GRADES.map((g) => [g.id, g.label.split(" · ")[1]]))}<p class="ly-cap">EU/UK egg marketing standard.</p></div>
  </div>`;
}

// ---- Store temperatures (§6.1) ----
function store(snap) {
  const st = storeStatus(snap.c); const max = +snap.s.storeMax || 20; const w = canWrite(snap.role, "storeTemps");
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(snap.today, i - 13)).map((d) => st.list.find((x) => x.date === d));
  if (!st.list.length) return emptyState({ sector: "layers", title: "No store temperatures yet", body: `Read the min/max thermometer in the egg store each day. Lion needs eggs kept below ${max} °C at a constant temperature.`, action: w ? "Log today's temperature" : null, actAttr: 'data-flow="storeTemp"' });
  return html`<div>
    <div class="card" style="padding:0"><div class="ly-stat"><span class="k">Today<small>${st.today ? `min ${st.today.min} °C` : "not logged yet"}</small></span><span class="v ${st.today && +st.today.max >= max ? "late" : st.today ? "ok" : "due"}">${st.today ? `${st.today.max} °C` : "—"}</span></div>
      <div class="ly-stat"><span class="k">Over ${max} °C in the last 7 days</span><span class="v ${st.over.length ? "due" : "ok"}">${st.over.length ? `${st.over.length} day${st.over.length > 1 ? "s" : ""}` : "None"}</span></div>
      <div class="ly-stat"><span class="k">Highest each day, last 14 days<small>red = ${max} °C or over</small></span><span>${bars(last14.map((x) => (x ? +x.max : 0)), { max: Math.max(max + 4, ...last14.map((x) => +x?.max || 0)), mark: max })}</span></div></div>
    ${w ? html`<button type="button" class="btn" style="margin-top:12px" data-flow="storeTemp">${raw(icon("temp"))}Log egg store temperature</button>` : ""}
    <div class="section">${groupLabel("Readings")}${table([["Date"], ["Min °C", "n"], ["Max °C", "n"], ["By"]], st.list.slice(0, 21).map((x) => [d2(x.date), n1(x.min), +x.max >= max ? html`<span class="due">${n1(x.max)}</span>` : n1(x.max), (x.byName || "").split(" ")[0]]))}</div>
    <div class="section"><div class="list">${linkRow(`#/l/${snap.lid}/reg/store`, "Egg store temperature record", "Print or CSV for the Lion auditor", "", "records")}</div></div></div>`;
}

// ---- Money (money roles; §6.3) ----
async function money(snap) { const m = await import("./money.js"); return m.moneyBody(snap); }

// ---- Farm gate (ungraded eggs, §19) ----
function farmGate(snap) {
  const fg = farmGateStock(snap.c, snap.today, RULES.ungraded.NI.maxDays); const w = canWrite(snap.role, "farmGate");
  const sales = snap.data.farmGate.filter((x) => x.kind === "sale").sort((a, b) => b.date.localeCompare(a.date));
  return html`<div>
    <div class="ly-banner">${raw(icon("info"))}<span>${RULES.ungraded.NI.text}</span></div>
    <div class="section"><div class="card" style="padding:0"><div class="ly-stat"><span class="k">Farm-gate stock<small>${fg.oldest ? `oldest laid ${dm(fg.oldest)}` : "none in stock"}</small></span><span class="v">${n0(fg.left)}</span></div>
      <div class="ly-stat"><span class="k">Over 28 days old</span><span class="v ${fg.old ? "late" : "ok"}">${n0(fg.old)}</span></div></div></div>
    ${w ? html`<div class="ly-acts"><button type="button" class="btn" data-flow="farmGate" data-arg='${flowArg({ kind: "sale" })}'>Eggs sold</button><button type="button" class="btn secondary" data-flow="farmGate" data-arg='${flowArg({ kind: "stock" })}'>Eggs into stock</button></div>` : ""}
    ${sales.length ? html`<div class="section">${groupLabel("Sales")}${table([["Date"], ["Eggs", "n"]], sales.slice(0, 20).map((x) => [d2(x.date), n0(x.eggs)]))}</div>` : ""}</div>`;
}

/** Share the reconciler difference with the packer (§6.2). */
export function sendQuery(snap, id) {
  const st = snap.data.packerStatements.find((x) => x.id === id); if (!st) return;
  const r = reconcile(snap.c, st);
  const text = `Hello — about the statement for week ${st.week} (w/c ${d2(st.weekStart)}). Our daily sheets show ${n0(r.collected)} eggs sent; your statement counts ${n0(r.counted)} — a difference of ${r.diff > 0 ? "+" : "−"}${n0(Math.abs(r.diff))} (${n1(Math.abs(r.pct))}%). Could you check the count for that week? ${snap.s.producerCode ? `Producer code ${snap.s.producerCode}.` : ""} Thanks, ${snap.s.keeperName || ""}`.trim();
  if (navigator.share) navigator.share({ text }).catch(() => {});
  else import("../../../ui/toast.js").then(({ toast }) => { navigator.clipboard?.writeText(text).then(() => toast("Message copied — paste it into WhatsApp or an email"), () => toast(text)); });
}
export { headRow, pounds };
