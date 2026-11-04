// Food Chain Information for one thin or clear-out (design/15 §8). Pre-filled from the records:
// holding, flock, daily and cumulative mortality, medicines with withdrawal end, Salmonella
// result, last crop's processor feedback, production drops, private vet. The send-by clock is
// arrival − 24 h (red once passed). "Send" shares the text (email / WhatsApp) and marks it sent
// with the time; the PDF follows the FSS model poultry FCI form order.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel, backLink } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { kvRows, pill, n0, pc, dm, when, d2, note, warnCard, printDoc, shareText, esc } from "../ui.js";
import { buildFci, fciGaps, fciText } from "../model/fci.js";
import { listOf, lastCrop } from "../model/crop.js";
import { hoursBetween } from "../model/time.js";
import { saveFci } from "../actions.js";

export default async function fci(ctx) {
  const { cropId, thinId } = ctx.match.groups;
  return liveScreen(ctx, { title: "Food Chain Information", tab: "paperwork", paint: (snap) => paint(snap, cropId, thinId), after: wire(cropId, thinId) });
}

function docFor(snap, cropId, thinId) {
  const crop = snap.ix.cropById.get(cropId); if (!crop) return null;
  const thin = listOf(snap.ix.thins, crop.id).find((t) => t.id === thinId); if (!thin) return null;
  const house = snap.ix.houseById.get(crop.houseId) || {};
  const prevCrop = listOf(snap.ix.cropsByHouse, crop.houseId).filter((c) => c.clearedDate && c.clearedDate <= crop.placedDate).pop() || null;
  const doc = buildFci({ ix: snap.ix, s: snap.s, crop, thin, house, keeper: snap.keeper, ledger: snap.ledger, prevCrop, today: snap.today });
  const sent = listOf(snap.ix.fci, crop.id).find((f) => f.thinId === thin.id && f.sentAt) || null;
  return { crop, thin, house, doc, sent };
}

function paint(snap, cropId, thinId) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const back = backLink(L("paperwork"), "Paperwork");
  const x = docFor(snap, cropId, thinId);
  if (!x) return html`<div>${back}${largeTitle("Food Chain Information")}<p class="br-quiet">Plan the thin or clear-out first — the FCI is made for one catch.</p></div>`;
  const { crop, thin, house, doc, sent } = x; const gaps = fciGaps(doc);
  const left = hoursBetween(snap.now, doc.sendBy); const late = !sent && left < 0;
  const clock = sent ? pill("ok", `Sent ${when(sent.sentAt)}`) : late ? pill("late", `Late by ${fmtH(-left)}`) : pill(left <= 24 ? "due" : "neutral", `${fmtH(left)} left`, left <= 24 ? undefined : "");
  const last7 = doc.mortality.days.slice(-7);
  const can = canWrite(snap.role, "fci");
  return html`<div>${back}
    ${largeTitle("Food Chain Information", `${house.name || ""} · crop ${crop.no || ""} · ${thin.kind === "clear" ? "clear-out" : "thin"} ${dm(thin.catchAt)}`)}
    <div class="br-clock ${sent ? "ok" : late ? "late" : left <= 24 ? "due" : ""}"><span>${raw(icon("clock"))}<b>Send by ${when(doc.sendBy)}</b><small>24 hours before the birds arrive at the plant (${when(doc.arrival)})</small></span>${clock}</div>
    ${gaps.length ? html`<div class="section">${gaps.map((g) => warnCard(`Missing: ${g}`, g.startsWith("A medicine") ? "late" : "due"))}</div>` : ""}
    <div class="section">${groupLabel("Holding and flock")}${kvRows([
      ["Keeper", doc.holding.keeper || "—"], ["Establishment / holding", `${doc.holding.establishmentNo || "—"} · ${doc.holding.holdingNo || "—"}`],
      ["Flock", `${doc.flock.house} · crop ${doc.flock.crop} · ${doc.flock.hybrid}`], ["Placed", `${d2(doc.flock.placedDate)} · ${n0(doc.flock.placed)} chicks`],
      ["Age at slaughter", `${doc.flock.ageAtSlaughter} days`], ["Birds", `${n0(doc.flock.birds)} · catch ${when(doc.flock.catchAt)}`], ["Processor", doc.flock.processor || "—"]])}</div>
    <div class="section">${groupLabel("Mortality", `crop ${pc(doc.mortality.cumPct, 2)}${doc.mortality.asOfDay < doc.flock.ageAtSlaughter ? ` to day ${doc.mortality.asOfDay}` : ""}`)}
      <div class="br-tblwrap" tabindex="0" role="region" aria-label="Last 7 days mortality"><table class="br-tbl"><thead><tr><th>Day</th><th>Date</th><th>Dead</th><th>Culled</th><th>Daily %</th><th>Cum. %</th></tr></thead>
        <tbody>${last7.map((d) => html`<tr><td>${d.day}</td><td>${d2(d.date)}</td><td>${d.dead}</td><td>${d.culled}</td><td>${d.pct.toFixed(2)}</td><td>${d.cum.toFixed(2)}</td></tr>`)}</tbody></table></div>
      ${note("Last 7 days shown; the PDF has every day of the crop.")}</div>
    <div class="section">${groupLabel("Medicines this crop")}${doc.medicines.length ? kvRows(doc.medicines.map((m) => [`${m.product} · ${d2(m.date)}`, `withdrawal ends ${d2(m.wdEnd)}`, m.ok ? "ok" : "late", null, `${m.days} day${m.days > 1 ? "s" : ""}${m.reason ? ` · ${m.reason}` : ""}`])) : html`<p class="br-quiet">None this crop.</p>`}</div>
    <div class="section">${groupLabel("Health and food safety")}${kvRows([
      ["Salmonella", doc.salmonella ? `${doc.salmonella.result} · ${d2(doc.salmonella.date)}` : "Not sampled", !doc.salmonella || doc.salmonella.resultCode === "pending" ? "due" : ["SE", "ST", "mST"].includes(doc.salmonella.resultCode) ? "late" : "ok", L(`salm/${crop.id}`)],
      ["Diseases that may affect meat safety", doc.disease],
      ["Previous inspection results", doc.previous ? `crop ${doc.previous.crop}: rejections ${doc.previous.rejPct ?? "—"}% · footpad ${doc.previous.footpad ?? "—"}` : "none recorded"],
      ["Production data", doc.production.join("; ")],
      ["Private vet", doc.vet.name ? `${doc.vet.name}${doc.vet.address ? `, ${doc.vet.address}` : ""}` : "add in Broiler settings", doc.vet.name ? "" : "due", doc.vet.name ? null : L("br-settings")]])}</div>
    <div class="section br-acts br-acts2"><button type="button" class="btn secondary" data-pdf>${raw(icon("print"))}Print or PDF</button>${can ? html`<button type="button" class="btn" data-send>${raw(icon("share"))}${sent ? "Send again" : "Send to processor"}</button>` : ""}</div>
    ${can && !sent ? html`<button type="button" class="text-btn br-mt" data-mark>Already sent another way — mark as sent</button>` : ""}
    ${note(`Sent to: ${snap.s.fciEmail || "the processor's FCI address (add it in Contract)"}. The PDF follows the FSS model poultry FCI form; your abattoir may accept its own template.`)}
  </div>`;
}
const fmtH = (h) => (h >= 48 ? `${Math.floor(h / 24)} days` : h >= 1 ? `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min` : `${Math.max(0, Math.round(h * 60))} min`);

function wire(cropId, thinId) {
  return (node, snap) => {
    const x = docFor(snap, cropId, thinId); if (!x) return;
    const { crop, thin, doc } = x;
    node.querySelector("[data-pdf]")?.addEventListener("click", () => printDoc({ title: "Food Chain Information", __html: fciHtml(doc) }));
    node.querySelector("[data-send]")?.addEventListener("click", async () => {
      const r = await shareText(`FCI ${doc.flock.house} ${thin.kind}`, fciText(doc));
      if (!r) { toast("Couldn't share. Print the PDF or mark it sent."); return; }
      saveFci(snap, crop, thin, doc, { method: r === "copied" ? "copied" : "shared" });
      toast(r === "copied" ? "FCI copied — paste it to the processor · marked sent" : "FCI sent · time recorded");
    });
    node.querySelector("[data-mark]")?.addEventListener("click", () => { saveFci(snap, crop, thin, doc, { method: "other" }); toast("FCI marked as sent"); });
  };
}

/** Printable FCI (FSS model poultry FCI order). */
export function fciHtml(doc) {
  const e = esc; const row = (k, v) => `<tr><th style="text-align:left;width:38%">${e(k)}</th><td>${e(v)}</td></tr>`;
  return `<div class="ph"><b>Food Chain Information — broilers (${doc.kind === "clear" ? "clear-out" : "thin"})</b><span>Send by ${e(doc.sendBy.replace("T", " "))}</span></div>
  <h3>1. Holding</h3><table>${row("Keeper", doc.holding.keeper)}${row("Address", doc.holding.address)}${row("Establishment number", doc.holding.establishmentNo)}${row("Holding number", doc.holding.holdingNo)}${row("Bird Register number", doc.holding.registerNo)}</table>
  <h3>2. Flock</h3><table>${row("House / crop", `${doc.flock.house} · crop ${doc.flock.crop}`)}${row("Hybrid", doc.flock.hybrid)}${row("Placed", `${doc.flock.placedDate} · ${doc.flock.placed}`)}${row("Age at slaughter (days)", doc.flock.ageAtSlaughter)}${row("Birds sent", doc.flock.birds)}${row("Catch", doc.flock.catchAt.replace("T", " "))}${row("Processor", doc.flock.processor)}</table>
  <h3>3. Mortality (daily and cumulative)</h3><table><thead><tr><th>Day</th><th>Date</th><th>Dead</th><th>Culled</th><th>Daily %</th><th>Cumulative %</th></tr></thead><tbody>${doc.mortality.days.map((d) => `<tr><td>${d.day}</td><td>${d.date}</td><td>${d.dead}</td><td>${d.culled}</td><td>${d.pct.toFixed(2)}</td><td>${d.cum.toFixed(2)}</td></tr>`).join("")}</tbody></table>
  <h3>4. Veterinary medicines and treatments</h3><table><thead><tr><th>Started</th><th>Product</th><th>Reason</th><th>Days</th><th>Withdrawal ends</th></tr></thead><tbody>${doc.medicines.map((m) => `<tr><td>${m.date}</td><td>${e(m.product)}</td><td>${e(m.reason)}</td><td>${m.days}</td><td>${m.wdEnd}</td></tr>`).join("") || `<tr><td colspan="5">None this crop</td></tr>`}</tbody></table>
  <h3>5. Health</h3><table>${row("Diseases that may affect the safety of meat", doc.disease)}${row("Salmonella (NCP) result and sampling date", doc.salmonella ? `${doc.salmonella.result} · ${doc.salmonella.date}${doc.salmonella.lab ? " · " + doc.salmonella.lab : ""}` : "Not yet sampled")}${row("Previous ante/post-mortem results", doc.previous ? `Crop ${doc.previous.crop}: DOA ${doc.previous.doaPct ?? "—"}%, rejections ${doc.previous.rejPct ?? "—"}%, footpad ${doc.previous.footpad ?? "—"}, hock burn ${doc.previous.hockPct ?? "—"}%` : "None recorded")}${row("Production data that may indicate disease", doc.production.join("; "))}</table>
  <h3>6. Private veterinarian</h3><table>${row("Name", doc.vet.name)}${row("Address", doc.vet.address)}</table>
  <div class="pf">Declaration: the information above is correct to the best of my knowledge. Signed ____________________ Date ________. Printed from Farm Ledger on ${new Date().toLocaleDateString("en-GB")}.</div>`;
}
export { lastCrop };
