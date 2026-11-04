// "Inspection ready?" for sheep — self-check based on the NIBL FQAS (design/11 §9.5). Same
// standard header as Beef. Auto items check themselves from the Sheep ledger's records; dated
// items go stale after 12 months; manual items are ticked when in place.
import { addDays, daysBetween } from "../../../core/dates.js";
import { registerLines, cropTagging, inventoryWindow } from "./paperwork.js";

export const FQA_STANDARD = {
  header: "Based on NIBL FQAS Product Standard and Rules 2022 (April 2022 version) and Inspection Checklist (October 2022). Not approved by LMC.",
  footer: "This is a self-check to help you get ready. Only the NIFCC inspector decides.",
  version: "FQAS 2022",
};
export const FQA_SECTIONS = [["1", "Husbandry: stockmanship and welfare"], ["2", "Animal health"], ["4", "Animal traceability"], ["7", "Environmental care"], ["8", "Farm procedures"]];
const ok = (text, href) => ({ status: "ok", text, href });
const warn = (text, href) => ({ status: "warn", text, href });
const fail = (text, href) => ({ status: "fail", text, href });

export const FQA_ITEMS = [
  { id: "stock", s: "1", ref: "1.1", t: "Sheep checked: healthy and thriving", type: "dated" },
  { id: "vetops", s: "1", ref: "1.2", t: "Castration and tail docking recorded (method, age, who)", type: "auto", check: (c) => (c.data.vetOps || []).length ? ok(`${c.data.vetOps.length} operations recorded.`, "paperwork/vetops") : warn("No castration or docking recorded yet. Record them when you do them.", "paperwork/vetops") },
  { id: "training", s: "1", ref: "1.4", t: "Training records for all stockmen and contractors", type: "manual" },
  { id: "welfarecodes", s: "1", ref: "1.5", t: "Sheep welfare code available", type: "manual" },
  { id: "medstore", s: "2", ref: "2.1", t: "Veterinary medicines stored in a locked facility", type: "manual" },
  { id: "vmrusage", s: "2", ref: "2.4", t: "Medicine use records complete (one line per mob dose)", type: "auto", check: (c) => {
    const list = (c.data.medicines || []).filter((m) => m.kind !== "disposal");
    const bad = list.filter((m) => !m.productName || !m.date || !(+m.numberTreated > 0) || m.wdMeatDays == null || m.wdMeatDays === "" || !m.givenBy);
    if (!list.length) return warn("No doses recorded yet.", "paperwork/medicine");
    return bad.length ? fail(`${bad.length} dose${bad.length > 1 ? "s" : ""} missing product, number, withdrawal or who gave it.`, "paperwork/medicine") : ok(`${list.length} dose records complete.`, "paperwork/medicine");
  } },
  { id: "ahp", s: "2", ref: "2.9", t: "Animal Health Plan with a sheep section (vet signed)", type: "dated" },
  { id: "quarantine", s: "2", ref: "2.7", t: "Bought-in sheep quarantined and treated", type: "auto", check: (c) => {
    const ons = (c.data.movements || []).filter((m) => m.kind === "on" && m.date >= addDays(c.today, -365));
    if (!ons.length) return ok("No sheep bought in this year.");
    const none = ons.filter((m) => m.quarantine === false);
    return none.length ? warn(`${none.length} bought-in group${none.length > 1 ? "s" : ""} without quarantine.`, "paperwork/movements") : ok(`${ons.length} bought-in group${ons.length > 1 ? "s" : ""} quarantined.`, "paperwork/movements");
  } },
  { id: "biosec", s: "2", ref: "2.8", t: "Biosecurity: footbath, disinfectant at the yard", type: "manual" },
  { id: "register", s: "4", ref: "4.1", t: "Flock register up to date", type: "auto", check: (c) => {
    const lines = registerLines(c.data).filter((l) => l.date >= addDays(c.today, -365)); const late = lines.filter((l) => l.late);
    const tg = cropTagging(c.data, c.cy, c.s);
    if (tg.untagged && tg.tagBy && tg.tagBy < c.today) return fail(`${tg.untagged} lambs past their tag-by date.`, "paperwork/tagging");
    return late.length ? warn(`${late.length} register line${late.length > 1 ? "s were" : " was"} entered after the deadline this year.`, "paperwork/register") : ok(`${lines.length} lines this year, all on time.`, "paperwork/register");
  } },
  { id: "inventory", s: "4", ref: "4.1", t: "Annual inventory (1–5 December) recorded", type: "auto", check: (c) => {
    const w = inventoryWindow(c.today, c.s); const last = (c.data.inventories || []).filter((i) => i.countDate).sort((a, b) => b.countDate.localeCompare(a.countDate))[0];
    if (last && daysBetween(last.countDate, c.today) <= 400) return last.submittedOn ? ok(`Counted ${last.countDate}, sent ${last.submittedOn}.`, "paperwork/inventory") : warn(`Counted ${last.countDate} but not marked as sent to DAERA.`, "paperwork/inventory");
    return c.today >= w.from ? fail("No inventory recorded for this year.", "paperwork/inventory") : warn("No inventory recorded yet. Count between 1 and 5 December.", "paperwork/inventory");
  } },
  { id: "movedocs", s: "4", ref: "4.3", t: "Movement documents kept and moves notified", type: "auto", check: (c) => {
    const mv = (c.data.movements || []).filter((m) => ["on", "off"].includes(m.kind) && m.date >= addDays(c.today, -365));
    const open = mv.filter((m) => !m.notifiedOn && daysBetween(m.date, c.today) > 7);
    if (!mv.length) return ok("No moves this year.");
    return open.length ? fail(`${open.length} move${open.length > 1 ? "s" : ""} not notified on NIFAIS.`, "paperwork/movements") : ok(`${mv.length} moves, all notified.`, "paperwork/movements");
  } },
  { id: "dip", s: "7", ref: "7.4", t: "Sheep dip: certificate of competence and disposal authorisation", type: "auto", check: (c) => {
    const dips = (c.data.medicines || []).filter((m) => m.dipType);
    if (!dips.length) return ok("No dipping recorded.");
    const bad = dips.filter((m) => (m.dipType === "OP" && !m.operatorCert) || !m.disposalMethod);
    return bad.length ? fail(`${bad.length} dipping record${bad.length > 1 ? "s" : ""} missing the certificate or disposal details.`, "paperwork/medicine") : ok(`${dips.length} dipping records complete.`, "paperwork/medicine");
  } },
  { id: "fallen", s: "8", ref: "8.2", t: "Fallen stock disposed of properly (docket kept)", type: "auto", check: (c) => {
    const d = (c.data.deaths || []).filter((x) => !x.lamb || x.tagged); const bad = d.filter((x) => !x.disposal);
    return !d.length ? ok("No deaths recorded.") : bad.length ? warn(`${bad.length} death${bad.length > 1 ? "s" : ""} without a disposal record.`, "paperwork/deaths") : ok(`${d.length} deaths with disposal recorded.`, "paperwork/deaths");
  } },
  { id: "feedrec", s: "8", ref: "3.3", t: "Feed records kept for 3 years", type: "auto", check: (c) => (c.data.feedRecords || []).length ? ok(`${c.data.feedRecords.length} feed deliveries recorded.`, "paperwork/feed") : warn("No feed deliveries recorded.", "paperwork/feed") },
];
/** Evaluate every item. ticks: meta fqa.items { id: { done, date, by } }. Returns { items, pct }. */
export function fqaStatus(c, ticks = {}) {
  const items = FQA_ITEMS.map((it) => {
    if (it.type === "auto") return { ...it, res: it.check(c) };
    const t = ticks[it.id];
    if (it.type === "dated") { if (!t?.date) return { ...it, res: { status: "fail", text: "Not done yet." } }; const stale = daysBetween(t.date, c.today) > 365; return { ...it, res: { status: stale ? "warn" : "ok", text: stale ? `Last done ${t.date} — over 12 months ago.` : `Done ${t.date}${t.by ? " by " + t.by : ""}.` } }; }
    return { ...it, res: t?.done ? { status: "ok", text: `In place${t.date ? " (ticked " + t.date + ")" : ""}.` } : { status: "fail", text: "Not ticked yet." } };
  });
  const score = items.reduce((n, i) => n + (i.res.status === "ok" ? 1 : i.res.status === "warn" ? 0.5 : 0), 0);
  return { items, pct: Math.round((score / items.length) * 100) };
}
