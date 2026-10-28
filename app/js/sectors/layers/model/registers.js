// Printable registers (design/14 §6.1, §9.1, §19): each returns { title, top[[k,v]], headers[], rows[][], note }.
import { addDays } from "../../../core/dates.js";
import { sortedHouses, flockIn, series, weekOfAge, aliveAt, dm, weekly, deadOf } from "./flock.js";
import { standardFor } from "./standards.js";
import { LOGS, logRows } from "./logs.js";
import { spaceCheck, systemName, birdRegister } from "./house.js";

export const REGISTERS = [
  ["production", "Egg production register", "Producer daily records (DAERA Egg Marketing)"],
  ["collections", "Packer collections", "Date, eggs, grades, docket, store temperature"],
  ["store", "Egg store temperatures", "Daily min/max, Lion below 20 °C"],
  ["passports", "Flock passports", "Rearer, vaccinations, feed, medicines, movements, Salmonella"],
  ["salmonella", "Salmonella results", "Kept 2 years"],
  ["mortality", "Mortality at inspection", "Daily inspection, deaths and culls — kept 3 years"],
  ["medicines", "Medicines", "Whole-house treatments with egg withdrawal"],
  ["moves", "Bird movements", "Pullets in, spent hens out"],
  ["alarm", "Alarm tests", "Weekly"],
  ["visitors", "Visitors", "Poultry unit log"],
  ["rodent", "Rodent control", "Controller reports"],
  ["feed", "Feed deliveries and retained samples", "UFAS"],
  ["healthPlan", "Vet health and welfare plan", "Per flock, yearly"],
  ["space", "Space check", "Hens, nests, perch, litter, range"],
  ["birdRegister", "Bird Register 1 June", "Birds per establishment number"],
  ["biosecurity", "AI biosecurity log", "Daily while an order is in force"],
];

export function buildRegister(c, key, { from, to } = {}) {
  to = to || c.today; from = from || addDays(to, -365);
  const hn = (id) => (c.data.houses || []).find((h) => h.id === id)?.name || "";
  const inRange = (d) => d >= from && d <= to;
  const top = [["Keeper", c.s.keeperName || c.ledger?.farmName || ""], ["Producer code", c.s.producerCode || "—"], ["Period", `${dm(from)} ${from.slice(0, 4)} – ${dm(to)} ${to.slice(0, 4)}`]];
  if (key === "production") {
    const flocks = (c.data.flocks || []).filter((f) => f.placedDate <= to && (!f.depopDate || f.depopDate >= from));
    const fl = flocks.map((f) => `${hn(f.houseId)}: placed ${f.placedDate}, ${(+f.placed || 0).toLocaleString("en-GB")} hens, ${weekOfAge(f, f.placedDate)} weeks old`).join("; ");
    const rows = [];
    for (const f of flocks) for (const d of series(c, f).filter((x) => inRange(x.date))) {
      const sold = [...(c.data.eggDeliveries || []).filter((x) => x.date === d.date && (!x.houseIds?.length || x.houseIds.includes(f.houseId)))];
      const graded = d.graded ? ["XL", "L", "M", "S"].map((g) => (d.graded[g] ? `${g} ${d.graded[g]}` : "")).filter(Boolean).join(", ") : "";
      rows.push([d.date, hn(f.houseId), d.alive, d.eggsTotal, d.seconds || 0, d.floor || 0, graded, d.withheld ? "Not for sale (withdrawal)" : d.classB ? "Class B" : "",
        sold.map((x) => `${x.eggs} ${x.grades?.length ? x.grades.map((g) => g.grade).join("/") : "ungraded"} · BB ${x.bestBefore || ""} · ${x.buyer || x.packer || ""}`).join("; ")]);
    }
    rows.sort((a, b) => b[0].localeCompare(a[0]) || a[1].localeCompare(b[1]));
    return { title: "Egg production register", top: [...top, ["Flocks", fl || "—"]], headers: ["Date", "House", "Hens", "Eggs produced", "Seconds", "Floor", "Graded on farm", "Status", "Eggs sold (number, grade, best before, buyer)"], rows, note: "Kept by the app for every flock; DAERA egg leaflet producer records. Retention: 12 months (legal period unconfirmed); Lion 2 years." };
  }
  if (key === "collections") return { title: "Packer collections", top, headers: ["Date", "Packer", "Eggs", "Trays", "Grades", "Docket", "Store °C", "Best before", "Class"], rows: (c.data.eggDeliveries || []).filter((x) => inRange(x.date)).sort((a, b) => b.date.localeCompare(a.date)).map((x) => [x.date, x.packer || "", x.eggs, x.trays || "", (x.grades || []).map((g) => `${g.grade} ${g.eggs}`).join(", "), x.docketNo || "", x.storeTemp ?? "", x.bestBefore || "", x.classB ? "B" : "A"]) };
  if (key === "store") return { title: "Egg store temperatures", top, headers: ["Date", "Min °C", "Max °C", "Below 20 °C?", "By"], rows: (c.data.storeTemps || []).filter((x) => inRange(x.date)).sort((a, b) => b.date.localeCompare(a.date)).map((x) => [x.date, x.min, x.max, +x.max < (+c.s.storeMax || 20) ? "Yes" : "No", x.byName || ""]) };
  if (key === "salmonella") return { title: "Salmonella results", top, headers: ["Date", "Time", "House", "Age (wk)", "Sampler", "Sample", "Lab", "Result", "Result date", "Confirmatory"], rows: (c.data.salmSamples || []).filter((x) => x.date >= addDays(to, -730)).sort((a, b) => b.date.localeCompare(a.date)).map((x) => { const f = (c.data.flocks || []).find((y) => y.id === x.flockId); return [x.date, x.time || "", hn(f?.houseId), f ? weekOfAge(f, x.date) : "", x.sampler === "official" ? "Official (DAERA)" : "Operator", x.sampleType || "", x.lab || "", x.result || "", x.resultDate || "", x.confirmatory ? "Yes" : ""]; }), note: "Kept 2 years (Salmonella NCP)." };
  if (key === "mortality") {
    const rows = []; for (const f of c.data.flocks || []) for (const d of series(c, f).filter((x) => x.date >= addDays(to, -1095) && x.date <= to)) rows.push([d.date, hn(f.houseId), d.inspectedBy || d.byName || "", (d.checks || []).join(", "), d.dead || 0, d.culled || 0, (d.deaths || []).map((x) => `${x.cause} ${x.n}`).join(", "), d.alive]);
    return { title: "Mortality at inspection", top, headers: ["Date", "House", "Inspected by", "Checks", "Dead", "Culled", "Causes", "Hens at start"], rows: rows.sort((a, b) => b[0].localeCompare(a[0])), note: "Kept 3 years (Welfare of Farmed Animals Regs (NI) 2012)." };
  }
  if (key === "medicines") return { title: "Medicines — poultry", top, headers: ["Date", "House", "Product", "Batch", "Dose / route", "Reason", "Eggs OK from", "Meat OK from", "Given by", "Prescribing vet"], rows: (c.data.medicines || []).filter((x) => inRange(x.date)).sort((a, b) => b.date.localeCompare(a.date)).map((m) => [m.date, hn(m.houseId), m.productName || "", m.batch || "", m.dose || "", m.reason || "", m.eggsOkFrom || "none", m.meatOkFrom || "none", m.givenBy || "", m.vet || ""]) };
  if (key === "passports") {
    const rows = (c.data.flocks || []).sort((a, b) => b.placedDate.localeCompare(a.placedDate)).map((f) => {
      const v = (c.data.vaccinations || []).filter((x) => x.flockId === f.id && x.date).map((x) => `${x.disease} ${x.date}${x.batch ? " b." + x.batch : ""}`).join("; ");
      const s = (c.data.salmSamples || []).filter((x) => x.flockId === f.id).map((x) => `${x.date} ${x.result}`).join("; ");
      return [hn(f.houseId), standardFor(f.breedStdId).breed, f.hatchDate || "", `${f.rearer || ""} ${f.rearerEst || ""}`.trim(), f.placedDate, f.placed, v, f.feedSource || "", s, f.depopDate ? `${f.depopDate} · ${f.numberOut || ""} to ${f.destination || ""}` : ""];
    });
    return { title: "Flock passports", top, headers: ["House", "Breed", "Hatch", "Rearer + est. no.", "Placed", "Number", "Vaccinations", "Feed source", "Salmonella", "Depop"], rows };
  }
  if (key === "space") {
    const rows = []; for (const h of sortedHouses(c)) { const f = flockIn(c, h.id); const n = f ? aliveAt(c, f, to) : 0; const sc = spaceCheck(h, n); sc.rows.forEach((r) => rows.push([h.name, systemName(h.system), n, r.label, r.ok ? "Within limits" : "Shortfall", r.text])); }
    return { title: "Space check", top, headers: ["House", "System", "Hens", "Check", "Result", "Detail"], rows, note: "Welfare of Farmed Animals Regs (NI) 2012, Sch. 2/3. DAERA checks the house still meets the system on your producer code." };
  }
  if (key === "birdRegister") {
    const yr = +to.slice(0, 4); const saved = (c.data.birdRegisterReturns || []).filter((x) => x.year >= yr - 2);
    const rows = saved.length ? saved.map((x) => [x.year, x.establishmentNo, x.countDate, Object.entries(x.birds || {}).map(([id, n]) => `${hn(id)} ${n}`).join(", "), x.total, x.submittedOn || "not sent"]) : birdRegister(c, yr).map((x) => [yr, x.establishmentNo, `${yr}-06-01`, Object.entries(x.birds).map(([id, n]) => `${hn(id)} ${n}`).join(", "), x.total, "not saved"]);
    return { title: "Bird Register — 1 June", top, headers: ["Year", "Establishment no.", "Count date", "Birds by house", "Total", "Sent"], rows };
  }
  if (LOGS[key]) { const L = LOGS[key]; const list = (c.data[L.coll] || []).filter((x) => inRange(x.date || x.from)); return { title: L.title, top, headers: L.cols.map((x) => x[0]), rows: logRows(key, list, hn) }; }
  return { title: key, top, headers: [], rows: [] };
}

/** Flock weekly sheet (design/14 §5.3). */
export function weeklySheet(c, f) {
  return { title: `Flock weekly sheet — ${(c.data.houses || []).find((h) => h.id === f.houseId)?.name || ""}`, top: [["Breed", standardFor(f.breedStdId).breed], ["Placed", f.placedDate], ["Birds placed", f.placed]],
    headers: ["Wk", "Hen-day %", "Std", "Egg wt g", "Feed g/b/d", "Water L/1000", "Deaths", "Cum mort %", "Seconds %", "Floor eggs"],
    rows: weekly(c, f).map((w) => [w.wk, w.henDay ?? "", w.std ? `${w.std[0]}–${w.std[1]}` : "", w.eggWt ?? "", w.feedG ?? "", w.waterPer1000 ?? "", w.deaths, w.cumMort, w.secondsPct ?? "", w.floor]), note: `Standard: ${standardFor(f.breedStdId).edition}.` };
}
/** Flock passport as a printable pack (design/14 §5.4): one section each for the flock, vaccinations, medicines, moves, Salmonella. */
export function passportDoc(c, f) {
  const h = (c.data.houses || []).find((x) => x.id === f.houseId); const std = standardFor(f.breedStdId);
  const title = `Flock passport — ${h?.name || ""} · ${std.breed}`;
  const top = [["Keeper", c.s.keeperName || c.ledger?.farmName || ""], ["Producer code", h?.producerCode || c.s.producerCode || "—"], ["Establishment no.", h?.establishmentNo || c.s.establishmentNo || "—"]];
  const flock = { title, top, headers: ["Rearer", "Rearer est. no.", "Hatch date", "Breed", "Placed", "Number placed", "Age at placing (wk)", "Feed source", "Planned depop", "Depopulated"],
    rows: [[f.rearer || "", f.rearerEst || "", f.hatchDate || "", std.breed, f.placedDate, f.placed, f.ageAtPlacement ?? weekOfAge(f, f.placedDate), f.feedSource || "", f.plannedDepop || "", f.depopDate ? `${f.depopDate} · ${f.numberOut || ""} out` : ""]] };
  const vacc = { title: "Vaccinations", headers: ["Disease", "Product", "Date", "Age (wk)", "Batch", "Source"], rows: (c.data.vaccinations || []).filter((v) => v.flockId === f.id && v.date).sort((a, b) => a.date.localeCompare(b.date)).map((v) => [v.disease, v.product || "", v.date, weekOfAge(f, v.date), v.batch || "", v.source === "rearer" ? "Rearer certificate" : "On farm"]), note: "Lion: S. Enteritidis and S. Typhimurium vaccination required." };
  const meds = { title: "Medicines", headers: ["Date", "Product", "Batch", "Reason", "Eggs OK from", "Meat OK from", "Vet"], rows: (c.data.medicines || []).filter((m) => m.flockId === f.id || (!m.flockId && m.houseId === f.houseId && m.date >= f.placedDate)).sort((a, b) => a.date.localeCompare(b.date)).map((m) => [m.date, m.productName || "", m.batch || "", m.reason || "", m.eggsOkFrom || "none", m.meatOkFrom || "none", m.vet || ""]) };
  const moves = { title: "Movements", headers: ["Date", "Direction", "Birds", "What", "Establishment", "FCI sent"], rows: (c.data.birdMoves || []).filter((m) => m.flockId === f.id).sort((a, b) => a.date.localeCompare(b.date)).map((m) => [m.date, m.direction === "in" ? "In" : "Out", m.n, m.kind || "", m.est || "", m.fci ? "Yes" : ""]) };
  const salm = { title: "Salmonella results", headers: ["Date", "Sampler", "Sample", "Lab", "Result", "Result date"], rows: (c.data.salmSamples || []).filter((x) => x.flockId === f.id).sort((a, b) => a.date.localeCompare(b.date)).map((x) => [x.date, x.sampler === "official" ? "Official (DAERA)" : "Operator", x.sampleType || "", x.lab || "", x.result || "", x.resultDate || ""]), note: `Standard: ${std.edition}.` };
  return { title, sections: [flock, vacc, meds, moves, salm] };
}

/** Inspector pack (design/14 §9.1, §19): the registers an inspector asks for, the production register first. */
export const INSPECTORS = {
  emi: { label: "Egg Marketing Inspector", sub: "DAERA — unannounced; collects producer records", keys: ["production", "collections", "store", "moves"] },
  lion: { label: "Lion auditor", sub: "British Lion Code of Practice audit", keys: ["production", "passports", "salmonella", "store", "collections", "feed", "visitors", "rodent", "healthPlan", "alarm", "medicines"] },
  vet: { label: "DAERA vet or welfare inspector", sub: "Welfare, medicines, Salmonella NCP", keys: ["mortality", "medicines", "salmonella", "space", "alarm", "moves", "biosecurity"] },
};
export function inspectorPack(c, who, opts = {}) {
  const I = INSPECTORS[who] || INSPECTORS.emi;
  return { title: `Inspection pack — ${I.label}`, sections: I.keys.map((k) => buildRegister(c, k, opts)) };
}
export { deadOf };
