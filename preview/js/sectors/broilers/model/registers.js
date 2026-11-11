// Broilers registers and prints (design/15 §11): the Schedule 5 house record per crop, medicines
// (withdrawal vs thin/clear), alarm and generator tests, visitors, environment log, turnaround and
// litter out, water tests, training, Salmonella results, FCI copies, feed deliveries, thins and
// clear-outs, density notices and Bird Register returns. Each returns a printable document
// { title, top, headers, rows, note } that ui.js prints or downloads as CSV.
import { listOf, cropDay, dateOfDay, deathsByDate, aliveEnd, cumMortPct, cullTotal, cropEvents } from "./crop.js";
import { withdrawalEnd, salmResultText, turnaroundDays } from "./paper.js";
import { plannedMax, densityNeeds } from "./density.js";
import { TURNAROUND_STEPS, CULL_REASONS } from "./content.js";
import { datePart, addDays } from "./time.js";

const live = (l) => (l || []).filter((r) => !r.deleted);
const hName = (ix, id) => ix.houseById.get(id)?.name || "";
const cropLabel = (ix, id) => { const c = ix.cropById.get(id); return c ? `${hName(ix, c.houseId)} crop ${c.no || ""}`.trim() : ""; };
const byDateDesc = (a, b) => String(b.date || b.catchAt || "").localeCompare(String(a.date || a.catchAt || ""));
const num = (v, dp = 0) => (v == null || v === "" || Number.isNaN(+v) ? "" : (+v).toFixed(dp));

export const DOCS = [
  ["house", "House records (Schedule 5)", "Every AM and PM check, deaths and culls with cause"],
  ["medicines", "Medicines (in water)", "Withdrawal against the thin and clear-out"],
  ["alarms", "Alarm and generator tests", "Weekly, generator on load"],
  ["visitors", "Visitors", "Who came on, last poultry contact"],
  ["environment", "Environment log", "Temperature, humidity, ammonia, CO₂"],
  ["turnaround", "Turnaround and litter out", "Cleaning steps and manure exports"],
  ["water", "Water tests", "Non-mains water every 6 months"],
  ["training", "Training certificates", "Meat chicken welfare certificate (Sch. 5 para 2)"],
  ["salmonella", "Salmonella results", "Boot swabs before every slaughter · 2 years"],
  ["fci", "Food Chain Information", "Copies of every FCI sent"],
  ["feed", "Feed deliveries", "Mill, ration, batch, tonnes"],
  ["thins", "Thins and clear-outs", "Birds out, crew, docket figures"],
  ["density", "Density notices", "DAERA notice and approval per crop"],
  ["birdreg", "Bird Register returns", "1 June count per establishment"],
];
export const docTitle = (k) => DOCS.find((d) => d[0] === k)?.[1] || k;

/** Schedule 5 para 10 house record for one crop: one row per day — placed, dead and culled with cause, remaining. */
export function houseRecord(c, crop) {
  const { ix } = c; const h = ix.houseById.get(crop.houseId) || {};
  const deaths = deathsByDate(ix, crop); const last = crop.clearedDate || c.today; const n = Math.max(0, cropDay(crop, last));
  const rows = [];
  for (let d = 0; d <= n; d++) {
    const date = dateOfDay(crop, d); const e = deaths.get(date); const checks = e?.checks || [];
    const culls = {}; for (const ch of checks) for (const [k] of CULL_REASONS) culls[k] = (culls[k] || 0) + (+ch.culls?.[k] || 0);
    const thinned = listOf(ix.thins, crop.id).filter((t) => t.status === "done" && datePart(t.catchAt) === date).reduce((s, t) => s + (+t.birds || 0), 0);
    const slots = ["am", "pm"].map((sl) => { const x = checks.find((ch) => ch.slot === sl); return x ? `${x.time || "✓"}${x.byName ? " " + x.byName.split(" ")[0] : ""}` : ""; });
    rows.push([date, d, slots[0], slots[1], e?.dead || 0, CULL_REASONS.map(([k, l]) => (culls[k] ? `${l} ${culls[k]}` : "")).filter(Boolean).join(", "), e?.culled || 0, checks.map((x) => x.causeNote).filter(Boolean).join("; "), thinned || "", aliveEnd(ix, crop, date), num(cumMortPct(ix, crop, date), 2)]);
  }
  return { title: `House record — ${h.name || ""} crop ${crop.no || ""}`, top: [["House", h.name || ""], ["Usable area", `${h.usableM2 || ""} m²`], ["Hybrid", crop.hybrid || c.s.hybrid], ["Placed", `${crop.placedDate} · ${crop.placed || 0} chicks`], ["Hatchery", crop.hatchery || ""]],
    headers: ["Date", "Day", "AM check", "PM check", "Found dead", "Culled by reason", "Culled", "Cause notes", "Thinned", "Remaining", "Crop mortality %"], rows: rows.reverse(),
    note: "Welfare of Farmed Animals Regulations (NI) 2012, Schedule 5 para 10: deaths with cause, culls with cause and birds remaining, every day." };
}

export function registerDoc(c, key, { cropId } = {}) {
  const { ix, data, s } = c;
  switch (key) {
    case "house": { const crop = cropId ? ix.cropById.get(cropId) : ix.crops.slice(-1)[0]; return crop ? houseRecord(c, crop) : { title: "House records (Schedule 5)", headers: ["Date"], rows: [] }; }
    case "medicines": {
      const rows = live(data.medicines).sort(byDateDesc).map((m) => { const crop = ix.cropById.get(m.cropId); const ev = crop ? cropEvents(ix, crop, s).find((e) => e.date >= m.date) : null; const end = withdrawalEnd(m);
        return [m.date, hName(ix, m.houseId), m.product || "", m.active || "", m.reason || "", m.dose || "", m.days || 1, m.wdDays ?? "", end, ev ? `${ev.kind === "clear" ? "clear" : "thin"} ${ev.date}${end > ev.date ? " — CLASH" : " ✓"}` : "", m.vet || "", m.vetReason || "", m.byName || ""]; });
      return { title: "Medicines (in water)", headers: ["Date", "House", "Product", "Active", "Reason", "Dose", "Days", "Withdrawal (days)", "Withdrawal ends", "Next slaughter", "Vet", "Last-resort reason", "Given by"], rows, note: "Keep medicine records 5 years (Red Tractor)." };
    }
    case "alarms": return { title: "Alarm and generator tests", headers: ["Date", "Time", "Test", "Worked", "On load (min)", "Action", "By"], rows: live(data.alarmTests).sort(byDateDesc).map((a) => [a.date, a.time || "", { generator: "Generator on load", alarm: "Alarm", both: "Generator and alarm" }[a.kind] || a.kind, a.ok === false ? "No" : "Yes", a.onLoadMinutes ?? "", a.action || "", a.by || a.byName || ""]), note: "Weekly (Red Tractor); alarm and back-up at least every 7 days where ventilation is mechanical." };
    case "visitors": return { title: "Visitors", headers: ["Date", "Time", "Name", "Company", "Reason", "Last poultry contact", "Vehicle", "Rules read", "Boots changed"], rows: live(data.visitors).sort(byDateDesc).map((v) => [v.date, v.time || "", v.name || "", v.company || "", v.reason || "", v.lastPoultryContact || "", v.vehicle || "", v.readRules ? "Yes" : "", v.bootsChanged ? "Yes" : ""]) };
    case "environment": return { title: "Environment log", headers: ["Date", "Check", "House", "Day", "Temp °C", "Humidity %", "NH₃ ppm", "CO₂ ppm", "Outside °C", "Litter F/M/B", "Source"], rows: live(data.checks).sort((a, b) => byDateDesc(a, b) || String(b.slot).localeCompare(String(a.slot))).map((x) => [x.date, String(x.slot || "").toUpperCase(), hName(ix, x.houseId), x.day ?? "", x.tempC ?? "", x.rh ?? "", x.nh3 ?? "", x.co2 ?? "", x.outsideC ?? "", x.litter ? `${x.litter.front || "-"}/${x.litter.middle || "-"}/${x.litter.back || "-"}` : "", x.source || "manual"]), note: "Above 33 kg/m²: ammonia 20 ppm or under, CO₂ 3,000 ppm or under, humidity 70% or under over 48 h when outside is below 10 °C (Sch. 5 para 13)." };
    case "turnaround": {
      const rows = [];
      for (const t of live(data.turnarounds).sort((a, b) => String(b.clearedDate).localeCompare(String(a.clearedDate)))) {
        const d = turnaroundDays(t, c.today);
        for (const [k, l] of TURNAROUND_STEPS) { const st = (t.steps || []).find((x) => x.key === k && x.at); if (!st) continue;
          const extra = k === "litterOut" && t.litterOut ? `${t.litterOut.t || ""} t · ${t.litterOut.haulier || ""} · ${t.litterOut.dest || ""}${t.litterOut.docket ? " · docket " + t.litterOut.docket : ""}` : [st.product, st.dilution, st.who, st.result, st.litterType, st.tonnes ? st.tonnes + " t" : "", st.note].filter(Boolean).join(" · ");
          rows.push([st.at, hName(ix, t.houseId), t.clearedDate, l, extra, st.by || "", t.placedDate ? `${d.days} days` : `${d.days} so far`]); }
      }
      return { title: "Turnaround and litter out", headers: ["Date", "House", "Cleared", "Step", "Details", "By", "Days empty"], rows, note: "Red Tractor: at least 5 days between flocks for cleaning. Litter out is your manure export record (31 January return)." };
    }
    case "water": return { title: "Water tests", headers: ["Sampled", "Lab", "Result", "Note"], rows: live(data.waterTests).sort(byDateDesc).map((w) => [w.date, w.lab || "", w.result || "", w.note || ""]), note: "Non-mains water tested every 6 months (Red Tractor)." };
    case "training": return { title: "Training certificates", headers: ["Person", "Course", "Date", "Expires", "Certificate no."], rows: live(data.training).map((t) => [t.person || "", t.course || "", t.date || "", t.expires || "", t.ref || ""]), note: "The keeper must hold a DAERA-recognised meat chicken welfare certificate (Sch. 5 para 2)." };
    case "salmonella": return { title: "Salmonella results", headers: ["Sampled", "House / crop", "Pairs", "Sampler", "Lab", "Sent to lab", "Window", "Result", "Result date"], rows: live(data.salmSamples).sort(byDateDesc).map((x) => [x.date, cropLabel(ix, x.cropId), x.swabPairs ?? "", x.sampler || "", x.lab || "", x.sentToLabAt || "", x.windowFrom ? `${x.windowFrom} to ${x.windowTo}` : "", salmResultText(x.result), x.resultDate || ""]), note: "National Control Programme (Reg. 200/2012): boot swabs within 3 weeks before every slaughter. Keep results 2 years." };
    case "fci": return { title: "Food Chain Information", headers: ["Send by", "Sent", "House / crop", "For", "Sent to", "Method"], rows: live(data.fci).sort((a, b) => String(b.sendBy).localeCompare(String(a.sendBy))).map((f) => [String(f.sendBy || "").replace("T", " "), String(f.sentAt || "").replace("T", " "), cropLabel(ix, f.cropId), f.kind === "clear" ? "Clear-out" : "Thin", f.sentTo || "", f.method || ""]) };
    case "feed": return { title: "Feed deliveries", headers: ["Date", "House / crop", "Ration", "Tonnes", "Mill", "Batch", "Kind"], rows: live(data.feedDeliveries).sort(byDateDesc).map((f) => [f.date, cropLabel(ix, f.cropId), f.ration || "", num((+f.kg || 0) / 1000, 2), f.mill || "", f.batch || "", f.kind === "return" ? "Return / left" : "Delivery"]), note: "Integrator-owned feed: no prices are kept here." };
    case "thins": return { title: "Thins and clear-outs", headers: ["Catch", "House / crop", "Kind", "Birds", "Avg kg", "Processor", "Feed off", "Crew", "GLAA", "Received", "Total kg", "DOA", "Rejections %", "Footpad", "Hock burn %"], rows: live(data.thins).filter((t) => t.status === "done").sort(byDateDesc).map((t) => { const d = t.docket || {}; return [String(t.catchAt || "").replace("T", " "), cropLabel(ix, t.cropId), t.kind === "clear" ? "Clear-out" : "Thin", t.birds ?? "", t.avgKg ?? "", t.processor || "", String(t.feedOffAt || "").replace("T", " "), t.crew?.name || "", t.crew?.glaa || "", d.received ?? "", d.kg ?? "", d.doa ?? "", d.rejPct ?? "", d.footpad ?? "", d.hockPct ?? ""]; }) };
    case "density": return { title: "Density notices", headers: ["House / crop", "Placed", "Planned max kg/m²", "Tier", "Notice due by", "Told DAERA", "Approval ref."], rows: ix.crops.slice().reverse().map((cr) => { const h = ix.houseById.get(cr.houseId); const area = +h?.usableM2 || 0; const mx = area ? plannedMax(ix, cr, s, area, cr.clearedDate || c.today) : 0; const n = densityNeeds(ix, cr, s, Math.max(mx, cr.clearedDate ? 0 : +cr.targetDensity || 0));
      return [cropLabel(ix, cr.id), cr.placedDate, num(mx, 1), { none: "33 or under — no notice", notify: "Over 33 — notice", approval: "Over 39 — approval", over: "Over 42 — not allowed" }[n.tier], n.tier === "none" ? "" : n.notifyBy, cr.notifiedDaera || "", cr.approvalRef || ""]; }), note: "Sch. 5 paras 12–14: tell DAERA 15 working days before stocking above 33 kg/m²; above 39 needs approval; 42 is the legal maximum." };
    case "birdreg": return { title: "Bird Register returns", headers: ["Year", "Establishment", "Count date", "Birds", "By house", "Sent"], rows: live(data.birdRegisterReturns).sort((a, b) => b.year - a.year).map((r) => [r.year, r.establishmentNo || "", r.countDate || "", r.birds ?? 0, (r.byHouse || []).map((x) => `${x.house} ${x.birds}`).join(", "), r.submittedOn || ""]) };
    default: return null;
  }
}

/** Birds per house on a count date (1 June): alive in placed crops that day. */
export function birdsOn(ix, date) {
  const byHouse = [];
  for (const h of ix.houses) {
    const crop = listOf(ix.cropsByHouse, h.id).find((cr) => cr.placedDate <= date && (cr.clearedDate || addDays(cr.placedDate, (+cr.plannedClearDay || 38) + 1)) > date);
    byHouse.push({ houseId: h.id, house: h.name, day: crop ? cropDay(crop, date) : null, birds: crop ? aliveEnd(ix, crop, date) : 0, est: h.establishmentNo || "" });
  }
  return { byHouse, total: byHouse.reduce((t, x) => t + x.birds, 0) };
}
export { cullTotal };
