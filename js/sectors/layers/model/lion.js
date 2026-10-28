// British Lion Code checklist (design/14 §9.2) with auto-evidence from the ledger, plus the
// optional RSPCA Assured list. Ticks/notes for manual items live in meta/lion (owner/manager).
import { addDays, daysBetween, addMonths } from "../../../core/dates.js";
import { sortedHouses, flockIn } from "./flock.js";
import { salmonella } from "./health.js";
import { storeStatus } from "./eggs.js";

const recent = (list, today, days) => (list || []).some((x) => (x.date || "") >= addDays(today, -days));
/** Items: { id, text, auto?(c) -> { ok, note } } */
export const LION_ITEMS = [
  { id: "passport", text: "Flock passport for every flock (rearer, vaccinations, feed, medicines, movements)", auto: (c) => { const fl = live(c); const ok = fl.length > 0 && fl.every((f) => f.rearer && f.hatchDate); return { ok, note: ok ? "Every flock has rearer and hatch date" : "Add rearer and hatch date to each flock" }; } },
  { id: "seVacc", text: "Hens vaccinated against S. Enteritidis and S. Typhimurium", auto: (c) => { const fl = live(c); const has = (f, re) => (c.data.vaccinations || []).some((v) => v.flockId === f.id && v.date && re.test(v.disease || "")); const ok = fl.length > 0 && fl.every((f) => has(f, /enteritidis/i) && has(f, /typhimurium/i)); return { ok, note: ok ? "Recorded on each flock passport" : "Add the S.E. and S.T. doses from the rearer's certificate" }; } },
  { id: "salm", text: "Salmonella sampling on time (NCP + Lion)", auto: (c) => { const fl = live(c); const st = fl.map((f) => salmonella(c, f)); const ok = st.every((x) => x.exempt || x.level !== "late"); return { ok, note: ok ? "No sample overdue" : "A sample is overdue" }; } },
  { id: "store", text: "Eggs stored below 20 °C at a constant temperature", auto: (c) => { const s = storeStatus(c); const ok = !!s.last && !s.over.length && daysBetween(s.last.date, c.today) <= 2; return { ok, note: s.last ? (s.over.length ? `Over ${c.s.storeMax} °C on ${s.over.length} day(s) this week` : `Last logged ${s.last.date}: max ${s.last.max} °C`) : "Start logging the egg store" }; } },
  { id: "collect", text: "Eggs collected at least twice a week", auto: (c) => { const n = (c.data.eggDeliveries || []).filter((x) => x.date > addDays(c.today, -7)).length; return { ok: n >= 2, note: `${n} collection${n === 1 ? "" : "s"} in the last 7 days` }; } },
  { id: "ufas", text: "UFAS feed with delivery records and retained samples", auto: (c) => { const d = (c.data.feedDeliveries || []).filter((x) => x.date > addDays(c.today, -60)); const ok = d.length > 0 && d.every((x) => x.ufas && x.sample); return { ok, note: d.length ? `${d.length} deliveries in 60 days${ok ? ", all UFAS with samples" : " — some without UFAS or sample"}` : "No feed deliveries recorded" }; } },
  { id: "noProtein", text: "No mammalian or avian protein in feed" },
  { id: "visitors", text: "Visitor log kept", auto: (c) => ({ ok: recent(c.data.visitors, c.today, 90), note: recent(c.data.visitors, c.today, 90) ? "Visitors logged in the last 90 days" : "No visitors logged in 90 days" }) },
  { id: "rodent", text: "Documented rodent control by a qualified controller, with site risk assessment", auto: (c) => ({ ok: recent(c.data.rodentVisits, c.today, 92), note: recent(c.data.rodentVisits, c.today, 92) ? "Controller visit in the last 3 months" : "No controller visit in 3 months" }) },
  { id: "biosec", text: "Biosecurity: zones, PPE, foot dips, vehicle disinfection, no standing water on range" },
  { id: "plan", text: "Veterinary Health and Welfare Plan per flock, reviewed yearly", auto: (c) => { const ok = recent(c.data.healthPlans, c.today, 365); return { ok, note: ok ? "Reviewed within 12 months" : "No review in the last 12 months" }; } },
  { id: "eggTest", text: "At least 20 eggs a quarter tested per farm (packer arranges)" },
  { id: "records", text: "Records kept 2 years", auto: () => ({ ok: true, note: "The app keeps every record; print any range" }) },
  { id: "alarm", text: "Alarm tested at least weekly", auto: (c) => ({ ok: recent(c.data.alarmTests, c.today, 7), note: recent(c.data.alarmTests, c.today, 7) ? "Tested this week" : "Not tested in 7 days" }) },
];
export const RSPCA_ITEMS = [
  { id: "r-enrich", text: "Enrichment provided and recorded (pecking objects, bales)" },
  { id: "r-feather", text: "Feather scoring recorded", auto: (c) => ({ ok: recent((c.data.samples || []).filter((x) => x.kind === "feather"), c.today, 45), note: "Monthly feather scores" }) },
  { id: "r-range", text: "Range access and range-use records (free range)" },
  { id: "r-light", text: "Lighting programme with a continuous dark period" },
];
function live(c) { return sortedHouses(c).map((h) => flockIn(c, h.id)).filter(Boolean); }

export function evaluate(c, items, meta = {}) {
  return items.map((it) => {
    const a = it.auto ? it.auto(c) : null; const m = meta.items?.[it.id] || {};
    const ok = m.ok != null ? m.ok : a ? a.ok : null;
    return { ...it, ok, note: m.note || a?.note || "", auto: !!a, by: m.byName, at: m.at };
  });
}
export function audits(meta = {}, today) {
  const internalDue = meta.internalAudit ? addMonths(meta.internalAudit, 6) : today;
  const independentDue = meta.independentAudit ? addMonths(meta.independentAudit, 18) : null;
  return { internalDue, independentDue, internalLate: internalDue < today, independentLate: independentDue ? independentDue < today : false };
}
