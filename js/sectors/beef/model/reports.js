// Printable registers and reports (design/10 §9.1, §9.4) as plain tables, plus margins (§11)
// and the sire report (§12). Pure: each doc is { title, top[[k,v]], headers[], rows[][], note }.
import { usesNifaisRegister } from "./region.js";
import { priceBook, isEntry } from "./prices.js";
import { ddmmyy, daysBetween, addDays } from "../../../core/dates.js";
import { MC3_HEADERS, MED_HEADERS, MEDPUR_HEADERS, DISP_HEADERS, mc3Row, medRow, medPurRow, dispRow, registerAnimals, useRecords, disposalRecords, medPurchases, isFirstUseOfSupplier } from "./registers.js";
import { onFarm, classOf, dlwg, lastWeight } from "./animals.js";
import { scYearReport } from "./breeding.js";
import { deadlineAnimals, finishingFacts } from "./finishing.js";
import { tagParts, normTag } from "./tags.js";
import { schemeYear, schemeYearLabel, SC_PAYMENT, BCRS_PAYMENT } from "./rules.js";

const EASE = { 1: "Easy", 2: "Some help", 3: "Hard", 4: "Vet", 5: "Caesar" };
export const REGISTERS = {
  register: "Herd register (MC3)", medicine: "Medicine use", medpurchases: "Medicine purchases", disposal: "Medicine disposal", movements: "Movements",
  deaths: "Deaths and fallen stock", vetops: "Vet operations", tbtests: "TB tests", feedrecords: "Feed records (3 years)", calvings: "Calving report", sc: "SC Scheme check", "finishing-list": "Finishing list",
};

function top(c) { const k = c.keeper || {}; return [["Keeper", k.name || ""], ["Address", k.address || ""], ["Herd no.", k.herdNo || c.s?.herdNo || ""]]; }

/** Build a register / report. opts: { from, to, onFarmOnly, includeDisposals, money } */
export function buildDoc(kind, c, opts = {}) {
  const { data, ix, today } = c; const inRange = (d) => (!opts.from || d >= opts.from) && (!opts.to || d <= opts.to);
  if (kind === "register") {
    const list = registerAnimals(data.animals, opts).filter((a) => opts.includeDisposals !== false || !a.offDate);
    return { title: "Herd register (MC3 layout)", top: [...top(c), opts.from || opts.to ? ["Dates", `${opts.from ? ddmmyy(opts.from) : "start"} – ${opts.to ? ddmmyy(opts.to) : "today"}`] : null].filter(Boolean), headers: MC3_HEADERS, rows: list.map(mc3Row), landscape: true,
      note: `${(c.s && usesNifaisRegister(c.s)) ? "Herd register kept on NIFAIS Online — this is a working copy. " : "Kept as an electronic register — "}keep for 10 years after the last entry.` };
  }
  if (kind === "medicine") return { title: "Animal medicine record (use)", top: top(c), headers: MED_HEADERS, rows: useRecords(data.medicines).filter((m) => inRange(m.date)).sort((a, b) => a.date.localeCompare(b.date)).map(medRow), landscape: true, note: "Keep for 5 years." };
  if (kind === "medpurchases") { const all = data.purchases; return { title: "Animal medicine record (purchases)", top: top(c), headers: MEDPUR_HEADERS, rows: medPurchases(all).filter((p) => inRange(p.date)).sort((a, b) => String(a.date).localeCompare(String(b.date))).map((p) => medPurRow(p, isFirstUseOfSupplier(p, all))), note: "Supplier address shown on first use. Keep for 5 years." }; }
  if (kind === "disposal") return { title: "Animal medicine record (disposal)", top: top(c), headers: DISP_HEADERS, rows: disposalRecords(data.medicines).filter((m) => inRange(m.disposalDate || m.date)).map(dispRow), note: "Keep for 5 years." };
  if (kind === "movements") {
    const rows = data.movements.filter((m) => ["on", "off"].includes(m.kind) && inRange(m.date)).sort((a, b) => a.date.localeCompare(b.date))
      .map((m) => [ddmmyy(m.date), m.kind === "on" ? "On" : m.death ? "Died" : "Off", (m.animalIds || []).map((id) => ix.byId.get(id)?.tag || "").join(", "), m.kind === "on" ? m.from || "" : m.to || "", m.lot || "", m.mc2Serial || "", m.nifaisNotified === "n/a" ? "n/a" : m.nifaisNotified ? ddmmyy(m.nifaisNotified) : "Not yet"]);
    return { title: "Movements on and off", top: top(c), headers: ["Date", "On/off", "Animals", "From / to", "Lot", "MC2 serial", "NIFAIS notified"], rows, note: "Moves must be in the register within 36 hours and notified to NIFAIS within 7 days (same day if NIFAIS is your register)." };
  }
  if (kind === "deaths") return { title: "Deaths and fallen stock", top: top(c), headers: ["Date", "Animal", "Age (months)", "Cause", "Found at inspection", "Disposal", "Docket", "TSE test", "NIFAIS notified"],
    rows: data.deaths.filter((d) => inRange(d.date)).sort((a, b) => a.date.localeCompare(b.date)).map((d) => { const a = ix.byId.get(d.animalId); return [ddmmyy(d.date), d.tag || "", a?.dob ? Math.floor(daysBetween(a.dob, d.date) / 30.4375) : "", d.cause === "Other" ? d.causeText || "Other" : d.cause, d.foundAtInspection ? "Yes" : "No", d.disposal || "", d.docketNo || "", d.tseRequired ? (d.tseDone ? `Phoned ${ddmmyy(d.tseDone)}` : "Required") : "Not needed", d.nifaisNotified ? ddmmyy(d.nifaisNotified) : "Not yet"]; }) };
  if (kind === "vetops") return { title: "Veterinary operations", top: top(c), headers: ["Date", "Animals", "Operation", "Age (days)", "Done by", "Anaesthetic", "Analgesic", "Conditions"],
    rows: data.vetOps.filter((v) => inRange(v.date)).sort((a, b) => a.date.localeCompare(b.date)).map((v) => [ddmmyy(v.date), (v.animalTags || []).map((t) => tagParts(t).tail).join(", "), v.operation, v.ageDays ?? "", v.operator || "", v.anaesthetic ? "Yes" : "No", v.analgesic ? "Yes" : "No", v.conditions || ""]) };
  if (kind === "tbtests") return { title: "TB tests", top: top(c), headers: ["Test date", "Reading", "Type", "Vet", "Presented", "Reactors", "Inconclusive", "Herd status after", "Next due"],
    rows: data.tbTests.filter((t) => t.date && inRange(t.date)).sort((a, b) => a.date.localeCompare(b.date)).map((t) => { const r = Object.values(t.results || {}); return [ddmmyy(t.date), ddmmyy(t.readingDate), t.testType || "Herd test", t.vet || "", Object.values(t.presented || {}).filter(Boolean).length || t.headCount || "", r.filter((x) => x === "reactor").length, r.filter((x) => x === "IR").length, t.herdStatus || "", ddmmyy(t.nextDue)]; }) };
  if (kind === "feedrecords") { const from = opts.from || addDays(today, -365 * 3); return { title: "Purchased feed (last 3 years)", top: top(c), headers: ["Date", "What", "Supplier", "Amount", "£"],
    rows: (data.finance || []).filter((e) => !e.deleted && e.kind === "expense" && /feed/i.test(e.category || "") && e.date >= from).sort((a, b) => a.date.localeCompare(b.date)).map((e) => [ddmmyy(e.date), e.note || e.category, e.supplier || "", e.qty || "", opts.money === false ? "" : (+e.amount || 0).toFixed(2)]), note: "Keep the receipts or invoices with this list for 3 years (FQAS 3.2)." }; }
  if (kind === "calvings") {
    const rows = []; for (const [damId, list] of ix.calvings) for (const cv of list) { if (!inRange(cv.date)) continue; const dam = ix.byId.get(damId); for (const k of cv.calves || [{}]) { const calf = k.animalId && ix.byId.get(k.animalId); rows.push([ddmmyy(cv.date), dam ? [dam.mgmtNo, dam.name].filter(Boolean).join(" ") || dam.tag : "", EASE[cv.ease] || "", calf?.tag || "", calf?.sex || k.sex || "", cv.sireText || calf?.sireText || "", k.birthKg || calf?.birthKg || "", k.alive === false ? "Stillborn" : "Alive"]); } }
    return { title: "Calving report", top: top(c), headers: ["Date", "Dam", "Ease", "Calf tag", "Sex", "Sire", "Birth kg", "Born"], rows: rows.sort((a, b) => a[0].split("/").reverse().join("").localeCompare(b[0].split("/").reverse().join(""))) };
  }
  if (kind === "sc") { const y = opts.year || schemeYear(today); const r = scYearReport(data, ix, y); return { title: `Suckler Cow Scheme check ${schemeYearLabel(y)}`, top: top(c), headers: ["Calving date", "Cow", "Qualifies?", "Why not"], rows: r.map((x) => [ddmmyy(x.date), x.dam ? [x.dam.mgmtNo, x.dam.name].filter(Boolean).join(" ") || x.dam.tag : "", x.qualifies ? "Yes" : "No", x.reasons.join("; ")]), note: `${r.filter((x) => x.qualifies).length} of ${r.length} calvings qualify. Self-check only; DAERA decides.` }; }
  if (kind === "finishing-list") {
    const list = deadlineAnimals(data, ix, today).map((a) => ({ a, f: finishingFacts(data, c.s, ix, a, today) })).sort((x, y) => (x.f.nearest?.left ?? 9999) - (y.f.nearest?.left ?? 9999));
    return { title: "Finishing list", top: top(c), headers: ["Tag", "Age (mo)", "Last kg", "kg/day", "BCRS", "Spec", "Est. carcase", "Ready by", ...(opts.money !== false && c.s.price?.perKgDead ? ["Value £"] : [])],
      rows: list.map(({ a, f }) => [a.tag, a.dob ? Math.floor(daysBetween(a.dob, today) / 30.4375) : "", f.lw ? f.lw.kg : "", f.gain ? f.gain.toFixed(2) : "", f.bcrs ? ddmmyy(f.bcrs.date) : "n/a", ddmmyy(f.spec), f.estCarcase ? Math.round(f.estCarcase) : "", ddmmyy(f.readyBy), ...(opts.money !== false && c.s.price?.perKgDead ? [f.estCarcase ? Math.round(f.estCarcase * c.s.price.perKgDead) : ""] : [])]) };
  }
  return null;
}

/** TB test list for the vet (§9.4): animals on the farm in crush order by group, tag order inside
 *  a group, with blank reading columns to fill in by hand on the day. */
export function tbVetList(c, test) {
  const { data, ix, today } = c; const day = test?.date || today;
  const live = data.animals.filter((a) => onFarm(a) || (test?.presented || {})[a.id]);
  const gname = (a) => ix.groups.get(a.groupId)?.name || "No group";
  live.sort((x, y) => gname(x).localeCompare(gname(y)) || String(x.tag).localeCompare(String(y.tag)));
  const rows = live.map((a, i) => [i + 1, gname(a), a.tag || "", a.sex || "", a.dob ? Math.floor(daysBetween(a.dob, day) / 30.4375) : "", "", "", "", "", ""]);
  return { title: `TB test list — ${ddmmyy(day)}`, top: [...top(c), ["Test", test?.testType || "Herd test"], ["Vet", test?.vet || ""], ["Head", String(rows.length)]],
    headers: ["#", "Group", "Tag", "Sex", "Age (mo)", "Avian day 1", "Bovine day 1", "Avian day 3", "Bovine day 3", "Result"], rows, landscape: true,
    note: "Reading 72 hours after the test day. Mark each animal Clear, Reactor or Inconclusive." };
}

/** Margin report (§9.4, §11) for owners, managers and accountants. Takes margins() output. */
export function marginDoc(c, m) {
  const f = (v) => (v == null ? "—" : `£${Math.round(v).toLocaleString("en-GB")}`);
  const rows = [
    ["Money in: livestock sales", f(m.salesIn)], ["Money out: stock bought", f(m.purchases)], ["Money out: running costs", f(m.costs)],
    ["Running costs — suckler share", f(m.suckCost)], ["Running costs — finishing share", f(m.finCost)],
    ["Cows (average over the year)", String(m.cows)], ["Cost per cow", f(m.costPerCow)], ["Calves weaned", String(m.weaned)], ["Cost per calf weaned", f(m.costPerCalf)],
    ["Kg gained (weighings)", String(Math.round(m.kgGained))], ["Cost per kg gained", m.costPerKg == null ? "—" : `£${m.costPerKg.toFixed(2)}`],
    ["Head sold", String(m.perHead.length)], ["Margin per head sold (average)", f(m.avgMargin)],
    ["Suckler Cow Scheme (estimate)", f(m.sc)], ["BCRS (estimate)", f(m.bcrs)],
    ...m.perHead.map((x) => [`Sold ${x.tag || "?"}`, `${f(x.sale)} − bought ${f(x.bought)} − costs ${f(x.cost)} = ${f(x.margin)}`]),
  ];
  return { title: `Margin report ${m.year}`, top: top(c), headers: ["Measure", "Value"], rows,
    note: "Costs not tagged to a group are split by livestock-unit days (editable in Targets). Scheme money is an estimate until DAERA pays." };
}

/** Sire report: sires with ≥ minN calves. */
export function sireReport(data, ix, minN = 5) {
  const by = new Map();
  for (const a of data.animals) {
    const sire = a.sireId ? (ix.byId.get(a.sireId)?.name || ix.byId.get(a.sireId)?.tag) : a.sireText; if (!sire || !a.dob) continue;
    const k = String(sire).trim(); if (!by.has(k)) by.set(k, []); by.get(k).push(a);
  }
  const avg = (l) => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : null);
  const out = [];
  for (const [sire, kids] of by) {
    if (kids.length < minN) continue;
    const ease = avg(kids.map((k) => +k.calvingEase).filter((x) => x > 0)); const birth = avg(kids.map((k) => +k.birthKg).filter((x) => x > 0));
    const w200 = avg(kids.map((k) => { const w = (ix.weights.get(k.id) || []).find((x) => { const d = daysBetween(k.dob, x.date); return d >= 150 && d <= 280; }); return w ? ((w.kg - (+k.birthKg || 40)) / daysBetween(k.dob, w.date)) * 200 + (+k.birthKg || 40) : null; }).filter(Boolean));
    const g = avg(kids.map((k) => dlwg(ix, k)?.value).filter((x) => x != null));
    const book = priceBook(data.finance); const sale = avg(kids.map((k) => book.sale.get(k.id)?.price).filter((x) => x > 0));
    out.push({ sire, n: kids.length, ease: ease != null ? Math.round(ease * 10) / 10 : null, birth: birth != null ? Math.round(birth) : null, w200: w200 != null ? Math.round(w200) : null, dlwg: g != null ? Math.round(g * 100) / 100 : null, sale });
  }
  return out.sort((a, b) => b.n - a.n);
}

const LU_CLASS = { cow: "cow", bull: "bull", heifer: "heifer", finisher: "finisher", store: "store", weanling: "weanling", calf: "calf" };
/** Margins for a herd year (calendar year) — design/10 §11. Approximations are labelled in the UI. */
export function margins(c, year) {
  const { data, s, ix } = c; const from = `${year}-01-01`, to = `${year}-12-31`; const end = to < c.today ? to : c.today;
  const fin = (data.finance || []).filter((e) => isEntry(e) && e.date >= from && e.date <= to);
  const costs = fin.filter((e) => e.kind === "expense" && e.category !== "Animal Purchase").reduce((t, e) => t + (+e.amount || 0), 0);
  const purchases = fin.filter((e) => e.kind === "expense" && e.category === "Animal Purchase").reduce((t, e) => t + (+e.amount || 0), 0);
  const salesIn = fin.filter((e) => e.kind === "revenue" && e.category === "Livestock Sales").reduce((t, e) => t + (+e.amount || 0), 0);
  // livestock-unit days in the year, split suckler (cows, bulls, calves) vs finishing (the rest)
  let luSuck = 0, luFin = 0, cowDays = 0;
  for (const a of data.animals) {
    const start = [a.onDate || a.dob || from, from].sort().pop(); const stop = [a.offDate || end, end].sort()[0]; if (stop < start) continue;
    const days = daysBetween(start, stop) + 1; const cls = LU_CLASS[classOf(ix, a, stop)] || "store"; const lu = (s.luRates[cls] ?? 0.6) * days;
    if (["cow", "bull", "calf"].includes(cls)) luSuck += lu; else luFin += lu; if (cls === "cow") cowDays += days;
  }
  const luAll = luSuck + luFin || 1; const suckCost = costs * (luSuck / luAll), finCost = costs * (luFin / luAll);
  const cows = cowDays / Math.max(1, daysBetween(from, end) + 1);
  const weaned = data.animals.filter((a) => a.bornInHerd && a.dob && addDays(a.dob, 200) >= from && addDays(a.dob, 200) <= to && (!a.offDate || daysBetween(a.dob, a.offDate) >= 200)).length;
  let kgGained = 0; for (const list of ix.weights.values()) for (let i = 1; i < list.length; i++) if (list[i].date >= from && list[i].date <= to && list[i].kg > list[i - 1].kg) kgGained += list[i].kg - list[i - 1].kg;
  const finHeadDays = luFin ? luFin : 1; const perLuDay = finCost / finHeadDays;
  const book = priceBook(data.finance); const sold = (data.sales || []).filter((x) => x.date >= from && x.date <= to).flatMap((x) => (x.lines || []).map((l) => ({ ...l, price: book.sale.get(l.animalId)?.price || 0, date: x.date, kind: x.kind })));
  const perHead = sold.map((l) => { const a = ix.byId.get(l.animalId); const held = a ? daysBetween([a.onDate || a.dob || from, from].sort().pop(), l.date) : 0; const cls = a ? LU_CLASS[classOf(ix, a, l.date)] || "store" : "store"; const cost = held * perLuDay * (s.luRates[cls] ?? 0.6); return { tag: l.tag, sale: +l.price || 0, bought: book.bought.get(l.animalId) || 0, cost, margin: (+l.price || 0) - (book.bought.get(l.animalId) || 0) - cost, kind: l.kind }; }).filter((x) => x.sale);
  const scYear = schemeYear(to <= c.today ? to : c.today); const sc = scYearReport(data, ix, scYear).filter((x) => x.qualifies).length * SC_PAYMENT;
  const bcrs = sold.filter((l) => l.bcrs?.eligible).length * BCRS_PAYMENT;
  return { year, costs, purchases, salesIn, suckCost, finCost, cows: Math.round(cows * 10) / 10, costPerCow: cows >= 1 ? suckCost / cows : null, weaned, costPerCalf: weaned ? suckCost / weaned : null, kgGained, costPerKg: kgGained ? finCost / kgGained : null, perHead, avgMargin: perHead.length ? perHead.reduce((t, x) => t + x.margin, 0) / perHead.length : null, sc, scYear, bcrs };
}
export { onFarm, lastWeight, normTag };
