// Food Chain Information for one thin or clear-out (design/15 §8; Reg. 853/2004 Annex II Sec. III
// as confirmed in Research B's follow-up). Pre-filled from records; the app's printable layout
// follows the FSS model poultry FCI form order. Abattoirs may accept their own template.
import { listOf, cropDay, dateOfDay, deathsByDate, cumMortPct, aliveStart, waterChangePct } from "./crop.js";
import { medsForFci, fciSendBy, sampleFor, salmResultText, arrivalOf } from "./paper.js";
import { datePart, addDays, dayLabel, whenLabel } from "./time.js";
import { cropResults } from "./results.js";

/** Build the FCI document. thin: thins record (planned or done). prevCrop: last cleared crop in the house (feedback). */
export function buildFci({ ix, s, crop, thin, house, keeper = {}, ledger = {}, prevCrop = null, today = null }) {
  const catchDate = datePart(thin.catchAt); const age = cropDay(crop, catchDate);
  const upTo = today && today < catchDate ? Math.max(0, cropDay(crop, today)) : age; // only days that have happened
  const deaths = deathsByDate(ix, crop);
  const days = []; for (let d = 0; d <= Math.max(0, upTo); d++) { const date = dateOfDay(crop, d); const e = deaths.get(date); const a = aliveStart(ix, crop, date); days.push({ day: d, date, dead: e?.dead || 0, culled: e?.culled || 0, pct: a ? ((e?.total || 0) / a) * 100 : 0, cum: cumMortPct(ix, crop, date) }); }
  const smp = sampleFor(ix, crop, { date: catchDate, day: age }, s);
  const meds = medsForFci(ix, crop);
  const flags = []; for (let d = 1; d <= upTo; d++) { const w = waterChangePct(ix, crop, dateOfDay(crop, d)); if (w != null && Math.abs(w) >= s.waterAlertPct) flags.push(`Day ${d}: water ${w < 0 ? "down" : "up"} ${Math.abs(w).toFixed(0)}%`); }
  const fb = prevCrop ? cropResults(ix, prevCrop) : null;
  const arrival = thin.arrivalAt || arrivalOf(thin.catchAt, s);
  return {
    kind: thin.kind, thinId: thin.id, cropId: crop.id, sendBy: fciSendBy(thin.catchAt, s, thin.arrivalAt), arrival,
    holding: { keeper: keeper.name || ledger.farmName || "", address: keeper.address || "", holdingNo: s.holdingNo || "", establishmentNo: house?.establishmentNo || s.establishmentNo || "", registerNo: s.registerNo || "" },
    flock: { house: house?.name || "", crop: crop.no || "", hybrid: crop.hybrid || s.hybrid, placedDate: crop.placedDate, placed: +crop.placed || 0, ageAtSlaughter: age, birds: +thin.birds || 0, catchAt: thin.catchAt, processor: thin.processor || s.processor || "" },
    mortality: { days, cumPct: days.length ? days[days.length - 1].cum : 0, asOfDay: upTo },
    medicines: meds.map((m) => ({ date: m.date, product: m.product, reason: m.reason || "", days: +m.days || 1, wdEnd: m.wdEnd, ok: m.wdEnd <= catchDate })),
    disease: thin.diseaseText || crop.diseaseText || "None known",
    salmonella: smp ? { date: smp.date, result: salmResultText(smp.result), resultCode: smp.result, lab: smp.lab || "" } : null,
    previous: fb && prevCrop ? { crop: prevCrop.no, cleared: prevCrop.clearedDate, doaPct: fb.doaPct, rejPct: fb.rejPct, footpad: fb.footpad, hockPct: fb.hockPct } : null,
    production: flags.length ? flags : ["No drops in water or feed recorded"],
    vet: { name: s.vetName || "", address: s.vetAddress || "" },
  };
}
/** What is missing before the FCI can be sent: [text] */
export function fciGaps(doc) {
  const g = [];
  if (!doc.salmonella) g.push("Salmonella result and sampling date");
  else if (doc.salmonella.resultCode === "pending") g.push("Salmonella result (still waiting)");
  if (!doc.vet.name) g.push("Your vet's name and address (Broilers settings)");
  if (!doc.holding.establishmentNo && !doc.holding.holdingNo) g.push("Holding or establishment number (Houses or settings)");
  if (doc.medicines.some((m) => !m.ok)) g.push("A medicine withdrawal ends after the catch");
  return g;
}
/** Plain text for sharing (email / WhatsApp) — the PDF is the printed view. */
export function fciText(doc) {
  const M = doc.mortality.days; const last = M.slice(-7);
  return [
    `FOOD CHAIN INFORMATION — broilers (${doc.kind === "clear" ? "clear-out" : "thin"})`,
    `Holding: ${doc.holding.keeper}${doc.holding.address ? ", " + doc.holding.address : ""} · establishment ${doc.holding.establishmentNo || "—"} · holding ${doc.holding.holdingNo || "—"}`,
    `Flock: ${doc.flock.house} · crop ${doc.flock.crop} · ${doc.flock.hybrid} · placed ${doc.flock.placedDate} (${doc.flock.placed}) · age at slaughter ${doc.flock.ageAtSlaughter} days`,
    `Catch ${doc.flock.catchAt.replace("T", " ")} · ${doc.flock.birds} birds · ${doc.flock.processor}`,
    `Cumulative mortality ${doc.mortality.cumPct.toFixed(2)}%. Last 7 days: ${last.map((d) => `d${d.day} ${d.dead + d.culled}`).join(", ")}`,
    `Medicines: ${doc.medicines.length ? doc.medicines.map((m) => `${m.product} from ${m.date} (${m.days} d), withdrawal ends ${m.wdEnd}`).join("; ") : "None this crop"}`,
    `Diseases that may affect meat safety: ${doc.disease}`,
    `Salmonella: ${doc.salmonella ? `${doc.salmonella.result}, sampled ${doc.salmonella.date}${doc.salmonella.lab ? " (" + doc.salmonella.lab + ")" : ""}` : "NOT YET SAMPLED"}`,
    `Previous inspection results: ${doc.previous ? `crop ${doc.previous.crop}: DOA ${fmt(doc.previous.doaPct)}%, rejections ${fmt(doc.previous.rejPct)}%, footpad ${fmt(doc.previous.footpad)}, hock burn ${fmt(doc.previous.hockPct)}%` : "none recorded"}`,
    `Production data indicating disease: ${doc.production.join("; ")}`,
    `Private vet: ${doc.vet.name || "—"}${doc.vet.address ? ", " + doc.vet.address : ""}`,
  ].join("\n");
}
const fmt = (v) => (v == null ? "—" : (+v).toFixed(2).replace(/\.?0+$/, ""));
