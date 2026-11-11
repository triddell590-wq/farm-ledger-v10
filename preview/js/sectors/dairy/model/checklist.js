// Red Tractor Dairy checklist (design/12 §8; Research B "Assurance standards"). Versioned
// content: header and items live here so a new standard is a content change. Items with
// `auto` are evidenced by the ledger's own records; the rest are ticked by the owner/manager
// with a date and note (stored in meta rtChecklist). K = Key standard.
import { addDays, daysBetween } from "../../../core/dates.js";
import { onFarm, groupOf } from "./cows.js";
import { tankStrip } from "./quality.js";
import { yearlyDue, slurryWeeks } from "./tools.js";
import { failures } from "./mastitis.js";

const ok = (text) => ({ state: "ok", text }); const due = (text) => ({ state: "due", text }); const gap = (text) => ({ state: "gap", text });
const L = (c, h) => `#/l/${c.lid}/${h}`;

export const SECTIONS = [
  ["dp", "Documents & procedures"], ["pl", "People"], ["ti", "Traceability"], ["mp", "Milk production"],
  ["ah", "Animal health & welfare"], ["am", "Medicines"], ["fw", "Feed & water"], ["ec", "Environment"], ["fs", "Fallen stock"], ["other", "Vermin, biosecurity, housing"],
];

export const ITEMS = [
  { id: "DP.1", sec: "dp", key: true, text: "Farm map (buildings, water, hazards)" },
  { id: "DP.2", sec: "dp", text: "Contingency plan and out-of-hours contacts" },
  { id: "DP.4", sec: "dp", text: "Vet told of each antibiotic failure within 1 week", auto: (c) => { const f = failures(c.data, c.today); const open = f.filter((x) => !x.vetToldAt && daysBetween(x.date, c.today) > 7); return !f.length ? ok("No treatment failures in 12 months") : open.length ? gap(`${open.length} failure${open.length > 1 ? "s" : ""} not marked "vet told"`) : ok(`${f.length} failure${f.length > 1 ? "s" : ""}, vet told each time`); }, href: (c) => L(c, "paperwork/mastitis") },
  { id: "DP.6", sec: "dp", text: "Investigation form after 2+ antibiotic failures in 12 months", auto: (c) => { const f = failures(c.data, c.today); if (f.length < 2) return ok("Not needed (fewer than 2 failures)"); const done = c.data.abFailures.some((x) => !x.deleted && x.date >= f[f.length - 1].date); return done ? ok("Form completed") : gap("Form needed"); }, href: (c) => L(c, "ab-failures") },
  { id: "PL.1", sec: "pl", key: true, text: "Induction record for every worker", auto: (c) => trained(c, "Induction") },
  { id: "PL.2", sec: "pl", text: "Training records (kept 2 years after a person leaves)", auto: (c) => trained(c), href: (c) => L(c, "training") },
  { id: "TI.1", sec: "ti", key: true, text: "All cattle tagged" , auto: (c) => { const un = c.data.animals.filter((a) => onFarm(a) && !a.tag); return un.length ? gap(`${un.length} without a tag number`) : ok("Every animal has a tag"); } },
  { id: "TI.2", sec: "ti", key: true, text: "Holding register up to date", auto: (c) => { const late = c.data.animals.filter((a) => a.bornInHerd && a.dob && daysBetween(a.dob, c.today) > 7 && !(a.reg || {}).register && c.s.registerMode !== "nifais" && daysBetween(a.dob, c.today) < 60); return late.length ? gap(`${late.length} calf${late.length > 1 ? "ves" : ""} not entered within 7 days`) : ok("Register kept in this app"); }, href: (c) => L(c, "paperwork/register") },
  { id: "MP.6", sec: "mp", text: "Bulk tank temperature checked after each milking", auto: (c) => { const st = tankStrip(c.s, c.data.tankLog, c.now, 14); const miss = st.filter((x) => x.state === "missing").length; const over = st.filter((x) => x.state === "over").length; return miss > 2 ? gap(`${miss} milkings not logged in 14 days`) : miss || over ? due(`${miss} missing, ${over} over limit in 14 days`) : ok("Every milking logged, 14 days"); }, href: (c) => L(c, "milk/tank") },
  { id: "MP.7", sec: "mp", text: "Tank readings compared with tanker receipts", auto: (c) => { const n = c.data.tankLog.filter((r) => !r.deleted && r.collected && r.receiptTemp !== "" && r.receiptTemp != null).length; return n ? ok(`${n} collections with a receipt temperature`) : due("Add the tanker receipt temperature at collections"); } },
  { id: "MP.8", sec: "mp", text: "Milking machine serviced, service sheets kept", auto: (c) => machine(c, "Service") , href: (c) => L(c, "parlour-machine") },
  { id: "MP.15", sec: "mp", text: "Liner changes recorded (12 months)", auto: (c) => machine(c, "Liner change"), href: (c) => L(c, "parlour-machine") },
  { id: "MP.16", sec: "mp", text: "Annual ISO 6690 machine test, faults put right", auto: (c) => machine(c, "ISO 6690 static test"), href: (c) => L(c, "parlour-machine") },
  { id: "MP.23", sec: "mp", key: true, text: "All cows milked daily (robots: daily check)" },
  { id: "MP.24", sec: "mp", key: true, text: "Abnormal milk procedure" },
  { id: "MP.25", sec: "mp", key: true, text: "Unfit milk discarded" },
  { id: "MP.26", sec: "mp", key: true, text: "Treated cows identified and milked separately", auto: (c) => { const n = c.brd.withheld.length; const unmarked = c.brd.withheld.filter((x) => !x.w.marks?.length).length; return unmarked ? gap(`${unmarked} withheld cow${unmarked > 1 ? "s" : ""} with no mark recorded`) : ok(n ? `${n} withheld, all marked` : "No cows withheld now"); }, href: (c) => L(c, "milking") },
  { id: "MP.27", sec: "mp", text: "Relief milkers told which cows are treated", auto: (c) => { const e = (c.data.events || []).filter((x) => !x.deleted && x.type === "parlourShared").map((x) => x.date).sort().pop(); return e ? ok(`Parlour sheet last shared or printed ${e}`) : due("Share or print the parlour sheet for relief milkers"); } },
  { id: "AH.1", sec: "ah", key: true, text: "Herd health plan signed by the vet, reviewed yearly", upload: true },
  { id: "AH.1.1", sec: "ah", text: "Annual health and performance review with the vet", auto: () => due("Use the annual collation below with your vet"), href: (c) => L(c, "paperwork/collation") },
  { id: "AH.1.2", sec: "ah", text: "BVD plan and results", upload: true },
  { id: "AH.1.3", sec: "ah", text: "Johne's management plan declaration (accredited vet)", upload: true },
  { id: "AH.2", sec: "ah", text: "Annual collation: lameness, mastitis, mortality, culls, medicines", auto: () => ok("Generated by the app"), href: (c) => L(c, "paperwork/collation") },
  { id: "AH.8", sec: "ah", key: true, text: "Sick and lame cows treated; euthanasia policy" },
  { id: "HP.1", sec: "ah", key: true, text: "Procedures with pain relief recorded (e.g. disbudding)", auto: (c) => { const d = c.data.animals.filter((a) => a.calf?.disbud?.date); const miss = d.filter((a) => !a.calf.disbud.anaesthetic || !a.calf.disbud.analgesic); return !d.length ? due("No disbudding recorded yet") : miss.length ? gap(`${miss.length} disbudded without both ticks`) : ok(`${d.length} disbudded with anaesthetic and pain relief`); } },
  { id: "AM.3.1", sec: "am", text: "Trained medicine administrator (course within 5 years)", auto: (c) => trained(c, "Medicines") },
  { id: "AM.6", sec: "am", key: true, text: "Administration records with reason (5 years)", auto: (c) => { const m = c.data.medicines.filter((x) => !x.deleted && x.date >= addDays(c.today, -365)); const noR = m.filter((x) => !x.reason); return noR.length ? gap(`${noR.length} treatments without a reason`) : ok(`${m.length} treatments in 12 months, all with a reason`); }, href: (c) => L(c, "paperwork/medicine") },
  { id: "AM.7", sec: "am", text: "Medicine disposal records" },
  { id: "AM.9", sec: "am", key: true, text: "Vet justification for highest-priority antibiotics (HP-CIAs)" },
  { id: "AM.10", sec: "am", key: true, text: "Treated animals identifiable for the whole withdrawal", auto: (c) => (c.brd.withheld.every((x) => x.w.marks?.length) ? ok("Withhold board shows how each cow is marked") : gap("A withheld cow has no mark")) },
  { id: "AM.11", sec: "am", text: "Broken needle record" },
  { id: "FW.1", sec: "fw", key: true, text: "BCS sheets twice a year (kept 2 years)", auto: (c) => { const b = c.data.scoreSessions.filter((x) => !x.deleted && x.method === "bcs" && x.date >= addDays(c.today, -365)); return b.length >= 2 ? ok(`${b.length} BCS sessions in 12 months`) : b.length ? due("1 BCS session in 12 months — need 2") : gap("No BCS session in 12 months"); }, href: (c) => L(c, "scores") },
  { id: "FW.6", sec: "fw", text: "Feed purchase records (2 years)", auto: (c) => { const f = (c.data.finance || []).filter((x) => !x.deleted && x.category === "Feed"); return f.length ? ok(`${f.length} feed purchases recorded`) : due("Record feed deliveries in Feed"); }, href: (c) => L(c, "feed") },
  { id: "FW.8", sec: "fw", text: "Feed samples kept 4 weeks after last use", auto: (c) => { const f = (c.data.finance || []).filter((x) => !x.deleted && x.category === "Feed" && x.date >= addDays(c.today, -60)); const kept = f.filter((x) => x.sampleKept).length; return !f.length ? due("No recent feed deliveries") : kept === f.length ? ok("Samples kept for every recent delivery") : due(`${f.length - kept} recent deliveries without "sample kept"`); } },
  { id: "EC.1.1", sec: "ec", key: true, text: "Slurry storage calculation", auto: (c) => { const r = slurryWeeks(c.s.slurry); return r.weeks == null ? gap("Fill in the slurry calculator") : r.ok ? ok(`${r.weeks.toFixed(1)} weeks of storage (need ${r.target})`) : gap(`${r.weeks.toFixed(1)} weeks — below ${r.target}`); }, href: (c) => L(c, "slurry") },
  { id: "EC.1.2", sec: "ec", key: true, text: "Silage effluent contained" },
  { id: "EC.9", sec: "ec", key: true, text: "Manure management plan" },
  { id: "EC.11", sec: "ec", key: true, text: "Waste transfer notes" },
  { id: "FS.3", sec: "fs", text: "Fallen stock collection records (2 years)", auto: (c) => { const d = c.data.deaths.filter((x) => !x.deleted && x.date >= addDays(c.today, -730)); return d.length ? ok(`${d.length} deaths recorded with collection`) : ok("No deaths in 2 years"); }, href: (c) => L(c, "paperwork/deaths") },
  { id: "VC.1", sec: "other", key: true, text: "Annual vermin site survey" },
  { id: "VC.2", sec: "other", text: "Vermin risk assessment and bait plan" },
  { id: "BI.1", sec: "other", key: true, text: "Farm biosecurity policy" },
  { id: "HF.6.1", sec: "other", key: true, text: "No tethering" },
];

function machine(c, type) {
  const last = c.data.parlourService.filter((x) => !x.deleted && x.type === type).map((x) => x.date).sort().pop();
  if (!last) return gap(`No ${type.toLowerCase()} recorded`);
  const y = yearlyDue(last, c.today); return y.left < 0 ? gap(`Overdue since ${y.due}`) : y.left <= 30 ? due(`Due by ${y.due}`) : ok(`Last ${last}, next by ${y.due}`);
}
function trained(c, kind) {
  const people = c.data.training.filter((x) => !x.deleted && (!kind || String(x.training || "").toLowerCase().includes(kind.toLowerCase())));
  return people.length ? ok(`${people.length} record${people.length > 1 ? "s" : ""}`) : kind ? due(`Add ${kind.toLowerCase()} records in Training`) : due("Add training records");
}

/** Evaluate every item: [{ ...item, ev: {state,text} | null, sign: {done,by,at,note} | null, status }] */
export function evaluate(c, signs = {}) {
  return ITEMS.map((it) => {
    const ev = it.auto ? it.auto(c) : null; const sign = signs[it.id] || null;
    const status = ev ? (ev.state === "ok" ? "ok" : sign?.done && ev.state === "due" ? "ok" : ev.state) : sign?.done ? "ok" : "open";
    return { ...it, ev, sign, status, link: it.href ? it.href(c) : null };
  });
}
export function summary(rows) { const n = rows.length; const done = rows.filter((r) => r.status === "ok").length; const keyGaps = rows.filter((r) => r.key && r.status !== "ok").length; return { n, done, keyGaps }; }
export { groupOf };
