// Printable registers for Paperwork and the inspector pack (design/12 §8). Each returns
// { title, headers, rows, note, top } — one table per record kind. Pure.
import { addDays } from "../../../core/dates.js";
import { cowLabel, lactation, onFarm } from "./cows.js";
import { quartersText, okLabel, datePart, timePart } from "./milking.js";
import { rolling } from "./quality.js";
import { herdMastitis } from "./mastitis.js";
import { breedName } from "../../beef/model/tags.js";
import { RT_HEADER } from "./content.js";

const who = (c, id) => c.people?.[id] || "";
const cow = (c, id) => { const a = c.ix.byId.get(id); return a ? cowLabel(a) : ""; };
const tagOf = (c, id) => c.ix.byId.get(id)?.tag || "";
const desc = (x, y) => String(y.date || "").localeCompare(String(x.date || ""));

export const REGISTERS = {
  register: { title: "Herd register (MC3)", build(c) {
    const rows = [...c.data.animals].filter((a) => !a.deleted).sort((x, y) => String(x.dob || "").localeCompare(String(y.dob || ""))).map((a) => [a.tag || "", a.cowNo || "", a.dob || "", a.sex || "", breedName(a.breed), a.damTag || (a.damId ? tagOf(c, a.damId) : ""), a.bornInHerd ? "Born here" : a.onDate || "", a.fromText || "", a.offDate || "", a.offTo || ""]);
    return { headers: ["Tag", "Cow no.", "Born", "Sex", "Breed", "Dam", "Date on", "From", "Date off", "To"], rows, note: c.s.registerMode === "nifais" ? "Herd register kept on NIFAIS Online — this is a working copy. Keep 10 years." : "Keep 10 years." };
  } },
  medicine: { title: "Medicine use (administration record)", build(c) {
    const rows = c.data.medicines.filter((m) => !m.deleted).sort(desc).map((m) => [m.date, (m.animalIds || []).map((id) => cow(c, id)).join(", "), m.productName || "", m.batch || "", m.dose || "", m.doses > 1 ? `${m.doses} × every ${m.intervalH} h` : "1", m.reason || "", m.quarters?.length ? quartersText(m.quarters) : "", m.milkOkFrom ? okLabel(c.s, m.milkOkFrom) : "", m.meatOkFrom || "", m.givenBy || ""]);
    return { headers: ["Date", "Cows", "Product", "Batch", "Dose", "Course", "Reason", "Quarters", "Milk OK from", "Meat OK from", "Given by"], rows, note: "Keep 5 years (Red Tractor AM.6)." };
  } },
  withhold: { title: "Milk withhold record", build(c) {
    const rows = c.data.milkWithhold.filter((w) => !w.deleted).sort(desc).map((w) => [w.date, cow(c, w.animalId), quartersText(w.quarters) || "All", w.productName || "", w.wdMilkHours ? `${w.wdMilkHours} h` : "", w.dryCow ? `Calving + ${w.afterCalvingHours} h` : okLabel(c.s, w.okFrom), (w.marks || []).join(", "), w.releasedByName || "", w.releasedAt ? `${datePart(w.releasedAt)} ${timePart(w.releasedAt)}` : ""]);
    return { headers: ["Treated", "Cow", "Quarters", "Product", "Milk withdrawal", "Milk OK from", "Marked with", "Released by", "Released"], rows };
  } },
  tank: { title: "Bulk tank log", build(c) {
    const rows = c.data.tankLog.filter((r) => !r.deleted).sort((x, y) => (y.date + (y.time || "")).localeCompare(x.date + (x.time || ""))).map((r) => [r.date, r.milking || "", r.time || "", (+r.tempC).toFixed(1), r.collected ? "Yes" : "", r.receiptTemp ?? "", r.litres || "", r.action || "", r.byName || ""]);
    return { headers: ["Date", "Milking", "Time", "°C", "Collected", "Receipt °C", "Litres", "Action if high", "By"], rows, note: `Limit ${c.s.tankLimit} °C (${c.s.collection === "alternate" ? "alternate-day" : "daily"} collection).` };
  } },
  quality: { title: "Milk quality results", build(c) {
    const q = c.data.milkQuality.filter((r) => !r.deleted);
    const rows = [...q].sort(desc).map((r) => [r.date, r.tbc ?? "", r.scc ?? "", r.fat ?? "", r.protein ?? "", r.lactose ?? "", r.inhibitory || "", rolling(q, "tbc", r.date)?.value ?? "", rolling(q, "scc", r.date)?.value ?? "", r.action || "", r.vetInformed || ""]);
    return { headers: ["Date", "TBC k", "SCC k", "Fat %", "Protein %", "Lactose %", "Inhibitory", "TBC 2-mo geo", "SCC 3-mo geo", "Action", "Vet told"], rows, note: "Legal limits: TBC 100k (2-month geometric mean), SCC 400k (3-month geometric mean)." };
  } },
  mastitis: { title: "Mastitis cases", build(c) {
    const rows = c.data.mastitis.filter((m) => !m.deleted).sort(desc).map((m) => [m.date, cow(c, m.animalId), quartersText(m.quarters), m.grade || "", m.organism || "", m.productName || "", m.okFrom ? okLabel(c.s, m.okFrom) : "", m.recurrence ? "Yes" : "", m.failure ? "Yes" : "", m.vetToldAt || "", m.outcome || ""]);
    return { headers: ["Date", "Cow", "Quarter", "Grade", "Organism", "Treatment", "Milk OK from", "Recurrence", "Failure", "Vet told", "Outcome"], rows };
  } },
  dryoffs: { title: "Drying off", build(c) {
    const rows = c.data.dryOffs.filter((d) => !d.deleted).sort(desc).map((d) => [d.date, cow(c, d.animalId), d.lastScc ?? "", d.cmt || "", d.treatment || "", d.vetReason || "", d.vet || "", [d.productName, d.batch].filter(Boolean).join(" · "), d.expectedCalving || ""]);
    return { headers: ["Date", "Cow", "Last SCC k", "CMT", "Treatment", "Vet's reason", "Vet", "Product · batch", "Expected calving"], rows, note: "Antibiotic dry-cow therapy only on the vet's reason for that cow (EU 2019/6 Art. 107)." };
  } },
  machine: { title: "Milking machine", build(c) {
    const rows = c.data.parlourService.filter((r) => !r.deleted).sort(desc).map((r) => [r.date, r.type, r.technician || "", r.faults || "", r.rectified || ""]);
    return { headers: ["Date", "Type", "Technician", "Faults", "Put right"], rows, note: "ISO 6690 test and liner changes every 12 months (Red Tractor MP.15, MP.16)." };
  } },
  scores: { title: "Mobility and BCS sessions", build(c) {
    const rows = c.data.scoreSessions.filter((r) => !r.deleted).sort(desc).map((r) => { const sc = (r.scores || []).map((x) => +x.score); const lame = sc.filter((x) => x >= 2).length; return [r.date, r.method === "bcs" ? "BCS 1–5" : "Mobility 0–3 (AHDB)", r.scorer || "", sc.length, r.method === "bcs" ? (sc.length ? (sc.reduce((t, x) => t + x, 0) / sc.length).toFixed(2) : "") : sc.length ? `${Math.round((lame / sc.length) * 100)}% lame` : "", r.actions || ""]; });
    return { headers: ["Date", "Method", "Scorer", "Cows", "Result", "Actions"], rows, note: "BCS twice a year, kept 2 years (Red Tractor FW.1)." };
  } },
  foottrims: { title: "Foot trimming", build(c) { return { headers: ["Date", "Cow", "Foot", "Lesion", "Treatment", "Block"], rows: c.data.footTrims.filter((r) => !r.deleted).sort(desc).map((r) => [r.date, cow(c, r.animalId), r.foot || "", r.lesion || "", r.treatment || "", r.block ? "Yes" : ""]) }; } },
  training: { title: "Training and induction", build(c) { return { headers: ["Name", "Date", "Training", "Provider", "Left on"], rows: c.data.training.filter((r) => !r.deleted).sort(desc).map((r) => [r.name, r.date, r.training, r.provider || "", r.leftOn || ""]), note: "Keep 2 years after a person leaves (Red Tractor PL.2)." }; } },
  abfailures: { title: "Antibiotic failures (DP.4 / DP.6)", build(c) {
    const rows = c.data.mastitis.filter((m) => !m.deleted && m.failure).sort(desc).map((m) => [m.date, cow(c, m.animalId), quartersText(m.quarters), m.productName || "", m.vetToldAt || "not yet"]);
    const forms = c.data.abFailures.filter((f) => !f.deleted).map((f) => [f.date, "Investigation form", f.summary || "", f.vet || "", ""]);
    return { headers: ["Date", "Cow / record", "Quarter / summary", "Treatment / vet", "Vet told"], rows: [...rows, ...forms] };
  } },
  movements: { title: "Movements", build(c) { return { headers: ["Date", "Direction", "Animals", "To / from", "Register", "NIFAIS"], rows: c.data.movements.filter((r) => !r.deleted).sort(desc).map((r) => [r.date, r.direction === "on" ? "On" : "Off", (r.animalIds || []).map((id) => tagOf(c, id) || cow(c, id)).join(", "), r.place || "", r.registerDone ? "✓" : "", r.nifaisDone ? "✓" : ""]) }; } },
  deaths: { title: "Deaths and fallen stock", build(c) { return { headers: ["Date", "Animal", "Cause", "Collected by", "TSE test", "NIFAIS"], rows: c.data.deaths.filter((r) => !r.deleted).sort(desc).map((r) => [r.date, tagOf(c, r.animalId) || cow(c, r.animalId), r.cause || "", r.collector || "", r.tse ? "Yes" : "", r.nifaisDone ? "✓" : ""]), note: "Fallen stock collection records kept 2 years (FS.3)." }; } },
  calvings: { title: "Calvings", build(c) { return { headers: ["Date", "Cow", "Lactation", "Ease", "Calves", "Colostrum"], rows: c.data.calvings.filter((r) => !r.deleted).sort(desc).map((r) => [r.date, cow(c, r.damId), r.lactation || "", r.ease || "", (r.calves || []).map((k) => `${k.sex || ""}${k.alive === false ? " (dead)" : ""}`).join(", "), r.colostrum ? `${r.colostrum.litres || ""} L ${r.colostrum.time || ""}${r.colostrum.brix ? ` · Brix ${r.colostrum.brix}%` : ""}` : ""]) }; } },
  breeding: { title: "Heats, serves and PDs", build(c) {
    const r = [...c.data.heats.filter((x) => !x.deleted).map((x) => [x.date, cow(c, x.animalId), "Seen bulling", x.sign || "", ""]), ...c.data.services.filter((x) => !x.deleted).map((x) => [x.date, cow(c, x.animalId), "Served", x.sireText || "", x.technician || ""]), ...c.data.pds.filter((x) => !x.deleted).map((x) => [x.date, cow(c, x.animalId), `PD ${x.result}`, x.daysPregnant ? `${x.daysPregnant} days` : "", x.vet || ""])];
    return { headers: ["Date", "Cow", "Event", "Detail", "By"], rows: r.sort((a, b) => String(b[0]).localeCompare(String(a[0]))) };
  } },
  tb: { title: "TB tests", build(c) { return { headers: ["Date", "Type", "Animals", "Result", "Vet"], rows: c.data.tbTests.filter((r) => !r.deleted).sort(desc).map((r) => [r.date, r.type || "Herd test", r.count || "", r.result || "", r.vet || ""]) }; } },
  vetops: { title: "Vet visits", build(c) { return { headers: ["Date", "Vet", "Why", "Cows", "Notes"], rows: c.data.vetOps.filter((r) => !r.deleted).sort(desc).map((r) => [r.date, r.vet || "", r.reason || "", (r.animalIds || []).map((id) => cow(c, id)).join(", "), r.notes || ""]) }; } },
};

/** AH.2 annual collation for the vet review (last 12 months). */
export function collation(c) {
  const from = addDays(c.today, -365); const inY = (r) => !r.deleted && r.date > from;
  const m = herdMastitis(c.ix, c.data, c.today);
  const mob = c.data.scoreSessions.filter((r) => inY(r) && r.method !== "bcs").sort((a, b) => a.date.localeCompare(b.date));
  const lastMob = mob[mob.length - 1]; const sc = lastMob ? lastMob.scores.map((x) => +x.score) : [];
  const deaths = c.data.deaths.filter(inY); const calves = c.data.animals.filter((a) => a.bornInHerd && a.dob > from);
  const calfDeaths = deaths.filter((d) => { const a = c.ix.byId.get(d.animalId); return a && a.dob && (new Date(d.date) - new Date(a.dob)) / 864e5 < 183; });
  const culls = c.data.animals.filter((a) => a.offDate > from && /cull|slaughter|factory/i.test(a.offTo || a.offReason || ""));
  const meds = c.data.medicines.filter(inY); const byReason = {}; meds.forEach((x) => { byReason[x.reason || "Other"] = (byReason[x.reason || "Other"] || 0) + 1; });
  const cows = c.data.animals.filter((a) => onFarm(a) && lactation(c.ix, a) > 0).length;
  const rows = [
    ["Cows (milking + dry)", cows],
    ["Clinical mastitis cases", `${m.cases}${m.ratePer100 != null ? ` (${m.ratePer100.toFixed(0)} per 100 cows; target ≤ 30)` : ""}`],
    ["Lameness (last mobility session)", lastMob ? `${Math.round((sc.filter((x) => x >= 2).length / Math.max(1, sc.length)) * 100)}% lame (score 2–3) on ${lastMob.date}` : "Not scored"],
    ["Deaths (all cattle)", deaths.length],
    ["Calves born / died under 6 months", `${calves.length} / ${calfDeaths.length}`],
    ["Culls", culls.length],
    ["Treatments", `${meds.length}${Object.keys(byReason).length ? " — " + Object.entries(byReason).map(([k, v]) => `${k} ${v}`).join(", ") : ""}`],
    ["Dry-offs with antibiotic", `${c.data.dryOffs.filter((d) => inY(d) && /antibiotic/i.test(d.treatment || "")).length} of ${c.data.dryOffs.filter(inY).length}`],
  ];
  return { title: "Annual health and performance collation (AH.2)", headers: ["Measure", "Last 12 months"], rows, note: RT_HEADER };
}
export function buildRegister(key, c) { const R = REGISTERS[key]; if (!R) return null; return { title: R.title, ...R.build(c), who }; }
