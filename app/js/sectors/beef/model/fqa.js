// "Inspection ready?" — self-check based on the NIBL FQAS (design/10 §9.2). Items kept from
// v9.14 (Tom's ticks carry over by id). Auto items check themselves from the ledger's records.
// Version and date are content: when LMC publishes a new edition only FQA_STANDARD changes.
import { daysBetween, ddmmyy } from "../../../core/dates.js";
import { useRecords, medPurchases, medUseGaps, medPurGaps, registerGaps } from "./registers.js";
import { parseTag } from "./tags.js";
import { onFarm } from "./animals.js";

export const FQA_STANDARD = {
  header: "Based on NIBL FQAS Product Standard and Rules 2022 (April 2022 version) and Inspection Checklist (October 2022). Not approved by LMC.",
  footer: "This is a self-check to help you get ready. Only the NIFCC inspector decides.",
  version: "FQAS 2022",
};
export const FQA_SECTIONS = [["1", "Husbandry: stockmanship and welfare"], ["2", "Animal health"], ["3", "Animal nutrition"], ["4", "Animal traceability"], ["5", "Housing and handling"], ["6", "Transport"], ["7", "Environmental care"], ["8", "Farm procedures"]];

// type: auto = worked out from records; dated = ticked with a date, stale after 12 months; manual = tick when in place.
export const FQA_ITEMS = [
  { id: "stock", s: "1", t: "Cattle checked: healthy and thriving", type: "dated" },
  { id: "vetops", s: "1", t: "Veterinary operations (anaesthetic and analgesic) recorded", type: "auto", check: (c) => c.data.vetOps.length ? ok(`${c.data.vetOps.length} ${c.data.vetOps.length === 1 ? "operation" : "operations"} recorded.`, "vetops") : warn("No castration or disbudding recorded yet. Record them when you do them.", "vetops", true) },
  { id: "training", s: "1", t: "Training records for all stockmen and contractors", type: "manual" },
  { id: "welfarecodes", s: "1", t: "Revised (2012) beef cattle / sheep welfare codes available", type: "manual" },
  { id: "medstore", s: "2", t: "Veterinary medicines stored in a locked facility", type: "manual" },
  { id: "medexpiry", s: "2", t: "Medicines checked for expiry dates and cross-referenced with the VMR", type: "auto", check: medExpiry },
  { id: "sharps", s: "2", t: "Sharps facility available", type: "manual" },
  { id: "biosec", s: "2", t: "Biosecurity: bucket, brush and DAERA-approved disinfectant", type: "manual" },
  { id: "isolation", s: "2", t: "Isolation facilities", type: "manual" },
  { id: "amcourse", s: "2", t: "Certificate for approved antimicrobial course", type: "manual" },
  { id: "vmrpurchase", s: "2", t: "VMR purchase section fully completed", type: "auto", check: (c) => {
    const all = c.data.purchases; const list = medPurchases(all); const bad = list.map((p) => [p, medPurGaps(p, all)]).filter(([, g]) => g.length);
    if (!list.length) return warn("No medicine purchases recorded. Every medicine on the farm needs a purchase entry.", "medpurchases");
    return bad.length ? fail(bad.slice(0, 4).map(([p, g]) => `${p.productName || "Unnamed"} ${ddmmyy(p.date)}: missing ${g.join(", ")}`).join("; "), "medpurchases") : ok(`${list.length} purchase records complete.`, "medpurchases");
  } },
  { id: "vmrusage", s: "2", t: "VMR usage section fully completed", type: "auto", check: (c) => {
    const list = useRecords(c.data.medicines); const bad = list.map((m) => [m, medUseGaps(m)]).filter(([, g]) => g.length);
    if (!list.length) return warn("No treatments recorded.", "medicine");
    return bad.length ? fail(`${bad.length} treatment${bad.length > 1 ? "s" : ""} missing details, e.g. ${bad.slice(0, 3).map(([m, g]) => `${m.productName || "Unnamed"} ${ddmmyy(m.date)}: ${g.join(", ")}`).join("; ")}`, "medicine") : ok(`${list.length} treatment records complete.`, "medicine");
  } },
  { id: "vmrcop", s: "2", t: "Code of Practice at the front of the VMR signed", type: "manual" },
  { id: "abreview", s: "2", t: "Health, Performance and Antibiotics Usage Review (vet signed)", type: "dated" },
  { id: "ahp", s: "2", t: "Cattle and sheep Animal Health Plan", type: "dated" },
  { id: "vetvisit", s: "2", t: "Vet visit within the last 12 months (signed health plan, receipt or TB test card)", type: "auto", check: (c) => {
    const tb = c.data.tbTests.filter((t) => t.date).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (tb && daysBetween(tb.date, c.today) <= 365) return ok(`TB test ${ddmmyy(tb.date)} counts as a vet visit.`, "tb");
    return null; // fall back to the tick
  }, dated: true },
  { id: "pomvet", s: "2", t: "POMs sourced from a vet who has visited the farm in the past 12 months", type: "manual" },
  { id: "feedstore", s: "3", t: "Feed storage areas", type: "manual" },
  { id: "feedrecords", s: "3", t: "3 years of purchased feed records, with receipts/invoices (incl. minerals, supplements, milk replacer)", type: "auto", check: (c) => {
    const feed = (c.data.finance || []).filter((e) => !e.deleted && e.kind === "expense" && /feed/i.test(e.category || "")).sort((a, b) => a.date.localeCompare(b.date));
    if (!feed.length) return warn("No feed purchases in Money. Log them, and keep the paper receipts for 3 years.", "money", true);
    return warn(`${feed.length} feed purchase${feed.length > 1 ? "s" : ""} in Money since ${ddmmyy(feed[0].date)}. Check you have every receipt, then tick.`, "money", true);
  } },
  { id: "cereal", s: "3", t: "FQA Cereal Scheme registration (only if feeding home-grown grain)", type: "manual", optional: true },
  { id: "warranty", s: "3", t: "Warranty declaration for feed bought from non-assured farms", type: "manual", optional: true },
  { id: "grainpass", s: "3", t: "Grain passport for purchased cereals", type: "manual", optional: true },
  { id: "homemix", s: "3", t: "Home mixing procedures", type: "manual", optional: true },
  { id: "bait", s: "3", t: "Bait plan", type: "manual" },
  { id: "herdrecords", s: "4", t: "Herd records / NIFAIS fully completed and up to date", type: "auto", check: (c) => {
    const herd = c.data.animals.filter((a) => !a.deleted); const bad = herd.map((a) => [a, registerGaps(a)]).filter(([, g]) => g.length);
    const unnotified = c.data.purchases.filter((p) => !p.deleted && p.kind === "livestock" && p.notified === false);
    const overdue = c.overdueNifais || 0; const parts = [];
    if (overdue) parts.push(`${overdue} NIFAIS notification${overdue > 1 ? "s" : ""} overdue`);
    if (unnotified.length) parts.push(`${unnotified.length} movement${unnotified.length > 1 ? "s" : ""} on not marked as notified`);
    if (bad.length) parts.push(`${bad.length} of ${herd.length} animals have gaps, e.g. ${bad.slice(0, 2).map(([a, g]) => `${a.tag}: ${g.join(", ")}`).join("; ")}`);
    if (!c.keeper || !c.keeper.herdNo || !c.keeper.name) parts.push("keeper name / herd number not set");
    return parts.length ? fail(parts.join(". ") + ".", "register") : ok(`All ${herd.length} animals complete in the herd register.`, "register");
  } },
  { id: "tagging", s: "4", t: "All animals tagged in accordance with legislation", type: "auto", check: (c) => {
    const live = c.data.animals.filter(onFarm);
    const badCheck = live.filter((a) => { const p = parseTag(a.tag); return p && !p.valid; }); const short = live.filter((a) => !parseTag(a.tag));
    if (badCheck.length) return fail(`Check digit wrong (probably typed wrong): ${badCheck.slice(0, 4).map((a) => a.tag).join(", ")}.`, "register");
    if (short.length) return warn(`${short.length} animal${short.length > 1 ? "s are" : " is"} recorded with a short number. Record the full tag so it can be checked.`, "register", true);
    return warn("Every tag passes the check-digit test. Tick once you've seen both tags are in on every animal.", "register", true);
  } },
  { id: "housing", s: "5", t: "Livestock housing, calving facilities and handling facilities", type: "manual" },
  { id: "trailer", s: "6", t: "Livestock trailer (owned or borrowed) fit for use", type: "manual", optional: true },
  { id: "transauth", s: "6", t: "Transporter authorisation and certificate of competence (journeys over 65 km)", type: "manual", optional: true },
  { id: "haulier", s: "6", t: "Transport delivery note if using a haulier", type: "manual", optional: true },
  { id: "housekeeping", s: "7", t: "General housekeeping", type: "manual" },
  { id: "slurry", s: "7", t: "Slurry / farmyard manure / round bale / silage storage", type: "manual" },
  { id: "diesel", s: "7", t: "Diesel storage", type: "manual" },
  { id: "ppp", s: "7", t: "Application record for plant protection products (sprays)", type: "manual", optional: true },
  { id: "spraycert", s: "7", t: "Certificate of competence for spraying (own or contractor)", type: "manual", optional: true },
  { id: "nsts", s: "7", t: "NSTS test certificate if sprayer is over 5 years old", type: "manual", optional: true },
  { id: "soil", s: "7", t: "Soil sample results (if phosphate used in previous 4 years)", type: "manual", optional: true },
  { id: "emergency", s: "8", t: "Emergency plan completed and communicated", type: "manual" },
  { id: "complaints", s: "8", t: "Complaints record form", type: "manual" },
  { id: "safety", s: "8", t: "Farm safety considerations signed", type: "manual" },
  { id: "p58", s: "8", t: "Declarations page signed and dated (training, broken needle policy, feed code, vermin plan, welfare in transport, no sewage sludge on grass)", type: "manual" },
];
function ok(detail, link) { return { status: "ok", detail, link }; }
function warn(detail, link, manualToo) { return { status: "warn", detail, link, manualToo }; }
function fail(detail, link) { return { status: "fail", detail, link }; }
function medExpiry(c) {
  const stock = [...medPurchases(c.data.purchases).map((p) => ({ name: p.productName, batch: p.batchNumber, expiry: p.expiryDate })), ...(c.store || []).filter((p) => p.expiry).map((p) => ({ name: p.name, batch: p.batch, expiry: p.expiry }))];
  const expired = stock.filter((p) => p.expiry && p.expiry < c.today);
  const soon = stock.filter((p) => p.expiry && p.expiry >= c.today && daysBetween(c.today, p.expiry) <= 31);
  if (expired.length) return fail(`Past expiry: ${expired.slice(0, 3).map((p) => `${p.name} (batch ${p.batch || "?"}, ${ddmmyy(p.expiry)})`).join("; ")}. Dispose of it and record the disposal, unless it's used up.`, "disposal");
  if (soon.length) return warn(`Expiring within a month: ${soon.map((p) => p.name).join(", ")}.`, "medpurchases");
  return ok(stock.length ? "No recorded medicine is past its expiry date." : "No medicines recorded yet.", "medpurchases");
}

/** Status of one item given the ticks (meta fqa.items) — ok | warn | fail | todo | na. */
export function fqaStatus(it, c, ticks = {}) {
  const tick = ticks[it.id] || null;
  if (tick && tick.na) return { status: "na", detail: "Marked not applicable." };
  if (it.type === "auto") {
    const r = it.check(c);
    if (r) {
      if (r.manualToo && r.status !== "fail" && tick && tick.done) return { ...r, status: "ok", detail: `${r.detail} Ticked ${ddmmyy(tick.date)}.` };
      return r;
    }
  }
  if (!tick || !tick.done) return { status: "todo", detail: "" };
  const dated = it.type === "dated" || it.dated;
  if (dated && daysBetween(tick.date, c.today) > 365) return { status: "fail", detail: `Last done ${ddmmyy(tick.date)}, more than 12 months ago. Needs redoing.` };
  if (dated && daysBetween(tick.date, c.today) > 335) return { status: "warn", detail: `Done ${ddmmyy(tick.date)}. Due again within a month.` };
  return { status: "ok", detail: `${dated ? "Done" : "Ticked"} ${ddmmyy(tick.date)}${tick.note ? " · " + tick.note : ""}${tick.photos ? ` · ${tick.photos} photo${tick.photos > 1 ? "s" : ""}` : ""}` };
}
/** Score = evidenced ÷ applicable (na and optional-untouched items left out). */
export function fqaScore(c, ticks = {}) {
  const res = FQA_ITEMS.map((it) => ({ it, r: fqaStatus(it, c, ticks) }));
  const applicable = res.filter(({ it, r }) => r.status !== "na" && !(it.optional && r.status === "todo"));
  const okN = applicable.filter(({ r }) => r.status === "ok").length;
  return { res, pct: applicable.length ? Math.round((okN / applicable.length) * 100) : 0, ok: okN, total: applicable.length, gaps: applicable.filter(({ r }) => r.status === "fail" || r.status === "warn") };
}
