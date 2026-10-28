// Red Tractor Chicken v5.1 (modified) inspection checklist — "based on", never "endorsed by"
// (design/15 §11). Items are evidenced from records where the app holds them; the rest are
// ticked by the owner/manager (meta "checklist"). Wording is the app's own summary.
import { RT_VERSION } from "./content.js";
import { houseState, listOf, cropEvents, cumMortPct, cropDay, currentCrop } from "./crop.js";
import { plannedMax, densityNeeds } from "./density.js";
import { salmStatus, feedOffLevel, turnaroundDays } from "./paper.js";
import { antibioticFlag } from "./content.js";
import { addDays, daysBetween } from "./time.js";

const G = { rec: "Records and people", welfare: "Stocking and welfare", env: "House environment", feed: "Feed and water", med: "Medicines", bio: "Biosecurity, hygiene and food safety" };
const cur = (c) => c.ix.houses.map((h) => ({ h, crop: currentCrop(c.ix, h.id) })).filter((x) => x.crop);
const lastCleared = (c) => c.ix.crops.filter((x) => x.clearedDate).slice(-1)[0] || null;
const yes = (note) => ({ ok: true, note }); const no = (note) => ({ ok: false, note }); const na = (note) => ({ ok: null, note });

export const ITEMS = [
  { id: "inspect2x", g: "welfare", text: "Birds inspected at least twice a day; deaths and culls recorded with cause", auto: (c) => { const miss = []; for (const { h, crop } of cur(c)) for (let d = crop.placedDate; d < c.today; d = addDays(d, 1)) for (const sl of ["am", "pm"]) if (!listOf(c.ix.checks, crop.id).some((x) => x.date === d && x.slot === sl)) miss.push(`${h.name} ${d.slice(5)} ${sl.toUpperCase()}`); return cur(c).length ? (miss.length ? no(`${miss.length} check${miss.length > 1 ? "s" : ""} missing (${miss.slice(0, 2).join(", ")})`) : yes("Every AM and PM check recorded this crop")) : na("No crop in the houses"); } },
  { id: "areas", g: "rec", text: "Usable floor area recorded for every house", auto: (c) => (c.ix.houses.length && c.ix.houses.every((h) => +h.usableM2 > 0) ? yes(`${c.ix.houses.length} house${c.ix.houses.length > 1 ? "s" : ""}`) : no("Add usable m² for each house")) },
  { id: "training", g: "rec", text: "Keeper holds a DAERA-recognised meat chicken welfare certificate (Sch. 5 para 2)", auto: (c) => ((c.data.training || []).some((t) => !t.deleted && /welfare/i.test(t.course || "")) ? yes("Certificate on file") : no("Add the certificate in Training")) },
  { id: "induction", g: "rec", text: "Staff induction and training records kept", auto: (c) => ((c.data.training || []).filter((t) => !t.deleted).length ? yes(`${(c.data.training || []).filter((t) => !t.deleted).length} record(s)`) : null) },
  { id: "records5", g: "rec", text: "Records kept for 5 years (medicines) and 3 years (house records)", auto: () => yes("Kept in the app; nothing is hard-deleted by workers") },
  { id: "healthPlan", g: "rec", text: "Veterinary health and welfare plan, reviewed with the vet each year" },
  { id: "glaa", g: "rec", text: "Catching crews from a GLAA-licensed labour provider", auto: (c) => { const t = (c.data.thins || []).filter((x) => !x.deleted && x.status === "done" && x.date >= addDays(c.today, -120)); return t.length ? (t.every((x) => x.crew?.glaa) ? yes("Licence number on every recent thin and clear") : no("A recent thin has no GLAA licence number")) : null; } },
  { id: "density", g: "welfare", text: "Planned stocking density 38 kg/m² or under", auto: (c) => { const r = cur(c).map(({ h, crop }) => ({ h, kg: +h.usableM2 ? plannedMax(c.ix, crop, c.s, +h.usableM2, c.today) : 0 })); return r.length ? (r.every((x) => x.kg <= 38) ? yes(r.map((x) => `${x.h.name} ${x.kg.toFixed(1)}`).join(" · ") + " kg/m²") : no(r.filter((x) => x.kg > 38).map((x) => `${x.h.name} ${x.kg.toFixed(1)} kg/m²`).join(", "))) : na("No crop in the houses"); } },
  { id: "notice", g: "welfare", text: "DAERA told 15 working days before stocking above 33 kg/m²; approval held above 39", auto: (c) => { const r = cur(c).filter(({ h }) => +h.usableM2).map(({ h, crop }) => densityNeeds(c.ix, crop, c.s, plannedMax(c.ix, crop, c.s, +h.usableM2, c.today))); return r.length ? (r.every((n) => n.notifyOk && (!n.needsApproval || n.approvalRef)) ? yes(r.some((n) => n.tier !== "none") ? "Notice dates recorded" : "No notice needed (33 kg/m² or under)") : no("Notice or approval missing")) : na("No crop in the houses"); } },
  { id: "spike", g: "welfare", text: "Mortality over 0.3% in 24 hours investigated with the vet" },
  { id: "tolerance", g: "welfare", text: "Crop mortality within the 5% tolerance (vet advice if over)", auto: (c) => { const l = lastCleared(c); if (!l) return null; const m = cumMortPct(c.ix, l, l.clearedDate); return m <= c.s.cropTolerancePct ? yes(`Last crop ${m.toFixed(1)}%`) : no(`Last crop ${m.toFixed(1)}% — vet advice needed`); } },
  { id: "lighting", g: "welfare", text: "At least 20 lux; from day 7 a dark period of 6 hours, 4 unbroken", auto: (c) => { const r = cur(c).filter(({ crop }) => cropDay(crop, c.today) >= 8); return r.length ? (r.every(({ crop }) => crop.darkSetAt) ? yes("Dark period set") : no("Dark period not ticked for a crop")) : null; } },
  { id: "enrichment", g: "welfare", text: "Enrichment provided (perches, pecking objects)" },
  { id: "culling", g: "welfare", text: "Culling done promptly by trained people, method agreed with the vet" },
  { id: "feedback", g: "welfare", text: "Processor footpad and hock burn feedback reviewed with the vet each crop", auto: (c) => { const l = lastCleared(c); return l ? (l.feedbackReviewed ? yes(`Crop ${l.no || ""} reviewed`) : no(`Crop ${l.no || ""} not reviewed yet`)) : null; } },
  { id: "envLimits", g: "env", text: "Ammonia 20 ppm or under and CO₂ 3,000 ppm or under at bird height", auto: (c) => { const xs = cur(c).flatMap(({ crop }) => listOf(c.ix.checks, crop.id)); if (!xs.some((x) => x.nh3 != null && x.nh3 !== "")) return null; const bad = xs.filter((x) => +x.nh3 > 20 || +x.co2 > 3000); return bad.length ? no(`${bad.length} reading(s) over the limit this crop`) : yes("All readings within limits this crop"); } },
  { id: "envRecorded", g: "env", text: "Temperature, humidity, ammonia and CO₂ recorded", auto: (c) => { const xs = cur(c).flatMap(({ crop }) => listOf(c.ix.checks, crop.id)); return xs.length ? (xs.filter((x) => x.tempC != null && x.tempC !== "").length >= xs.length * 0.8 ? yes("On the AM/PM checks") : no("Many checks have no house readings")) : null; } },
  { id: "humidity", g: "env", text: "Humidity: 48-hour average 70% or under when outside is below 10 °C" },
  { id: "generator", g: "env", text: "Generator tested on load every week", auto: (c) => { const last = (c.data.alarmTests || []).filter((x) => !x.deleted && ["generator", "both"].includes(x.kind)).map((x) => x.date).sort().pop(); return last && daysBetween(last, c.today) <= 7 ? yes(`Last ${last}`) : no(last ? `Last ${last}` : "Not recorded"); } },
  { id: "alarm", g: "env", text: "Alarms and back-up ventilation tested every 7 days", auto: (c) => { const last = (c.data.alarmTests || []).filter((x) => !x.deleted && ["alarm", "both"].includes(x.kind)).map((x) => x.date).sort().pop(); return last && daysBetween(last, c.today) <= 7 ? yes(`Last ${last}`) : no(last ? `Last ${last}` : "Not recorded"); } },
  { id: "ventMaint", g: "env", text: "Ventilation system maintenance records kept" },
  { id: "feedOff", g: "feed", text: "Feed withdrawn no more than 9 hours before catching", auto: (c) => { const t = (c.data.thins || []).filter((x) => !x.deleted && x.status === "done" && x.feedOffAt); if (!t.length) return null; const bad = t.filter((x) => feedOffLevel(x.feedOffAt, x.catchAt).level !== "ok"); return bad.length ? no(`${bad.length} catch(es) over 9 hours`) : yes("Every recorded catch within 9 hours"); } },
  { id: "water", g: "feed", text: "Non-mains water tested every 6 months", auto: (c) => { if (!c.s.nonMainsWater) return na("Mains water (setting)"); const last = (c.data.waterTests || []).filter((x) => !x.deleted).map((x) => x.date).sort().pop(); return last && daysBetween(last, c.today) <= 183 ? yes(`Last ${last}`) : no("Water test due"); } },
  { id: "emergencyWater", g: "feed", text: "Emergency water for 24 hours at maximum demand" },
  { id: "feedRecords", g: "feed", text: "Feed deliveries recorded (mill, ration, batch, tonnage)", auto: (c) => { const r = cur(c); if (!r.length) return null; return r.every(({ crop }) => listOf(c.ix.feed, crop.id).length) ? yes("Deliveries on every crop") : no("A crop has no feed deliveries"); } },
  { id: "medRecords", g: "med", text: "Every in-water treatment recorded per house with withdrawal to slaughter", auto: (c) => { const m = (c.data.medicines || []).filter((x) => !x.deleted); return m.length ? (m.every((x) => x.wdDays !== "" && x.wdDays != null) ? yes(`${m.length} treatment(s)`) : no("A treatment has no withdrawal period")) : yes("No treatments recorded"); } },
  { id: "banned", g: "med", text: "No 3rd/4th-generation cephalosporins, glycopeptides or colistin", auto: (c) => { const bad = (c.data.medicines || []).filter((x) => !x.deleted && antibioticFlag(`${x.product} ${x.active || ""}`)?.level === "late"); return bad.length ? no(bad.map((x) => x.product).join(", ")) : yes("None recorded"); } },
  { id: "lastResort", g: "med", text: "Macrolides and fluoroquinolones only as a last resort, with the vet's reason", auto: (c) => { const l = (c.data.medicines || []).filter((x) => !x.deleted && antibioticFlag(`${x.product} ${x.active || ""}`)?.level === "due"); return l.length ? (l.every((x) => x.vetReason) ? yes(`${l.length} with a vet's reason`) : no("Vet's reason missing")) : yes("None used"); } },
  { id: "stewardship", g: "med", text: "Antibiotic use reported for the BPC stewardship data collection (via the integrator)" },
  { id: "visitors", g: "bio", text: "Visitor log kept", auto: (c) => ((c.data.visitors || []).some((v) => !v.deleted && v.date >= addDays(c.today, -60)) ? yes("Visitors recorded in the last 2 months") : null) },
  { id: "biosecurity", g: "bio", text: "Written biosecurity plan including bird flu measures" },
  { id: "pest", g: "bio", text: "Pest control: bait points checked and recorded", auto: (c) => ((c.data.turnarounds || []).some((t) => !t.deleted && (t.steps || []).some((x) => x.key === "pest" && x.at)) ? yes("Recorded at turnaround") : null) },
  { id: "turnaround", g: "bio", text: "At least 5 days between flocks for cleaning and disinfection", auto: (c) => { const t = (c.data.turnarounds || []).filter((x) => !x.deleted && x.placedDate).slice(-1)[0]; if (!t) return null; const d = turnaroundDays(t, c.today); return d.days >= 5 ? yes(`Last turnaround ${d.days} days`) : no(`Last turnaround ${d.days} days`); } },
  { id: "cd", g: "bio", text: "Cleaning and disinfection recorded between crops (product and dilution)", auto: (c) => { const t = (c.data.turnarounds || []).filter((x) => !x.deleted).slice(-1)[0]; if (!t) return null; const st = (t.steps || []).find((x) => x.key === "disinfected" && x.at); return st ? yes(st.product ? `${st.product}${st.dilution ? " " + st.dilution : ""}` : "Recorded") : no("Disinfection not recorded"); } },
  { id: "salmonella", g: "bio", text: "Salmonella boot swabs within 3 weeks before every slaughter (2 pairs)", auto: (c) => { const r = cur(c).flatMap(({ crop }) => salmStatus(c.ix, crop, c.s, c.today)); if (!r.length) return null; const bad = r.filter((x) => x.state === "late" || x.state === "positive"); return bad.length ? no(bad[0].state === "positive" ? "Positive result — processor told?" : "Sample overdue") : yes("On track"); } },
  { id: "fci", g: "bio", text: "Food Chain Information sent 24 hours before birds arrive", auto: (c) => { const t = (c.data.thins || []).filter((x) => !x.deleted && x.status === "done"); if (!t.length) return null; const sent = (c.data.fci || []).filter((f) => !f.deleted && f.sentAt); const miss = t.filter((x) => !sent.some((f) => f.thinId === x.id)); return miss.length ? no(`${miss.length} thin/clear without an FCI marked sent`) : yes("Every thin and clear"); } },
  { id: "fallen", g: "bio", text: "Fallen stock stored covered and collected by an approved service" },
  { id: "contingency", g: "bio", text: "Emergency and contingency plan (power, water, feed, fire) on display" },
];
export const GROUPS = G;

/** Evaluate every item: [{ ...item, state: ok|gap|na|open, note, by, at, auto }] */
export function evaluate(c, ticks = {}) {
  return ITEMS.map((it) => {
    const a = it.auto ? it.auto(c) : null; const t = ticks?.[it.id];
    if (a && a.ok === true) return { ...it, state: "ok", note: a.note, auto: true };
    if (a && a.ok === null) return { ...it, state: "na", note: a.note, auto: true };
    if (a && a.ok === false) return { ...it, state: t?.ok ? "ok" : "gap", note: a.note + (t?.ok ? " · ticked by " + (t.by || "") : ""), auto: true, by: t?.by, at: t?.at };
    return { ...it, state: t?.ok ? "ok" : "open", note: t?.ok ? `Ticked ${t.at ? String(t.at).slice(0, 10) : ""}${t.by ? " by " + t.by : ""}` : "", by: t?.by, at: t?.at };
  });
}
export function summary(list) { const counted = list.filter((x) => x.state !== "na"); return { ok: counted.filter((x) => x.state === "ok").length, total: counted.length, gaps: list.filter((x) => x.state === "gap").length }; }
export const CHECKLIST_VERSION = RT_VERSION;
