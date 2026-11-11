// One movement document (design/11 §9.3): the document itself (keeper, flock, destination,
// number, tags, haulier, serial), its checks, the 7-day NIFAIS tick and the CPR tag-list photo
// tick. Print / save as PDF / share from here. No prices on this screen — they live in finance.
import { html, raw } from "../../core/html.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { canWrite } from "../../core/policy.js";
import { addDays, daysBetween } from "../../core/dates.js";
import { largeTitle, backLink, groupLabel } from "../../screens/common.js";
import { liveScreen } from "./screen.js";
import { short, num, kvRows, pill, printDoc, banner } from "./ui.js";
import { DESTS, isCpr } from "./model/paperwork.js";
import { regionRule } from "./model/region.js";
import * as A from "./actions.js";
import { photoStrip } from "../../ui/photo-strip.js";

/** The printable movement document for one record. */
export function movementDoc(snap, m) {
  const k = snap.keeper; const flock = snap.s.flockNo || k.flockNo || "";
  const off = m.kind === "off";
  const rows = [
    ["Document serial", m.docSerial || "—"], ["Date of movement", m.date], ["Direction", off ? "Moved off this holding" : "Moved on to this holding"],
    [off ? "Departure flock" : "Destination flock", `${flock} · ${k.name || snap.ledger.farmName || ""}${k.address ? " · " + k.address : ""}`],
    [off ? "Destination" : "Came from", [DESTS[m.dest] || (off ? "" : "Another holding"), m.otherFlock, m.otherName, m.otherAddress].filter(Boolean).join(" · ")],
    ["Number of sheep", String(m.count)], ["Of which lambs", m.lambs ? "Yes" : "No"],
    ["Tag numbers", m.cprList ? "CPR — the market/abattoir tag list is the record (photo kept)" : (m.tags || []).join(", ") || (m.tagFrom ? `${m.tagFrom} – ${m.tagTo || ""}` : "—")],
    ["Haulier / transporter no.", [m.haulier, m.transporterNo].filter(Boolean).join(" · ") || "—"], ["Distance", m.km ? `${m.km} km` : "—"],
  ];
  return { title: `Sheep movement document ${m.docSerial || ""}`.trim(), top: [["Flock", flock], ["Keeper", k.name || ""]], headers: ["", ""], rows, note: "Notify NIFAIS within 7 days of the move. Keep this document with your flock register for 3 years." };
}

export default async function movement(ctx) {
  const id = ctx.match.groups.id;
  return liveScreen(ctx, { title: "Movement document", tab: "paperwork", paint: (snap) => {
    const m = snap.data.movements.find((x) => x.id === id);
    if (!m) return html`<div>${backLink(`#/l/${snap.lid}/paperwork/movements`, "Movements")}${largeTitle("Movement not found")}<p class="t-callout ink-2">It may have been removed.</p></div>`;
    const mv = regionRule("sheepMovement") || {}; const due = addDays(m.date, mv.notifyDays ?? 7); const late = !m.notifiedOn && snap.today > due;
    const cprDue = addDays(m.date, Math.ceil((mv.cprRegisterHours ?? 48) / 24)); const cpr = m.kind === "off" && isCpr(m.dest) && m.cprList;
    const can = canWrite(snap.role, "movements"); const doc = movementDoc(snap, m);
    return html`<div>${backLink(`#/l/${snap.lid}/paperwork/movements`, "Movements")}${largeTitle(m.kind === "off" ? `Off: ${num(m.count)} to ${m.otherName || DESTS[m.dest] || "?"}` : `On: ${num(m.count)} from ${m.otherName || m.otherFlock || "?"}`, `${short(m.date)}${m.docSerial ? " · " + m.docSerial : ""}`)}
      ${late ? banner("late", "Not notified on NIFAIS", ` It was due by ${short(due)}.`) : ""}
      <div class="section">${groupLabel("Jobs for this move")}<div class="list">
        <div class="row no-lead"><span class="main"><span class="primary">Notified on NIFAIS</span><span class="secondary">${m.notifiedOn ? `Done ${short(m.notifiedOn)}` : `Within 7 days · by ${short(due)}`}</span></span>${m.notifiedOn ? pill("ok", "Done") : can ? html`<button type="button" class="text-btn" data-tick="notifiedOn">Mark done</button>` : pill(late ? "late" : "due", "To do")}</div>
        ${cpr ? html`<div class="row no-lead"><span class="main"><span class="primary">Photo the ${m.dest === "abattoir" ? "abattoir's" : "market's"} tag list</span><span class="secondary">${m.cprListFiledOn ? `Filed ${short(m.cprListFiledOn)}` : `Within 48 hours · by ${short(cprDue)}`}</span></span>${m.cprListFiledOn ? pill("ok", "Filed") : can ? html`<button type="button" class="text-btn" data-tick="cprListFiledOn">Mark filed</button>` : pill("due", "To do")}</div>` : ""}
        ${m.kind === "on" && m.fromGB ? html`<div class="row no-lead"><span class="main"><span class="primary">Re-tag with NI tags</span><span class="secondary">${m.retaggedOn ? `Done ${short(m.retaggedOn)}` : `Within 20 days · by ${short(addDays(m.date, 20))}`}</span></span>${m.retaggedOn ? pill("ok", "Done") : can ? html`<button type="button" class="text-btn" data-tick="retaggedOn">Mark done</button>` : ""}</div>` : ""}
        ${m.kind === "on" && m.quarantine !== false ? html`<div class="row no-lead"><span class="main"><span class="primary">Quarantine</span><span class="secondary">${+m.quarantineDays || snap.s.quarantineDays} days · until ${short(addDays(m.date, +m.quarantineDays || +snap.s.quarantineDays || 28))}</span></span>${m.quarantineEnded ? pill("ok", "Ended") : can && daysBetween(m.date, snap.today) >= 0 ? html`<button type="button" class="text-btn" data-tick="quarantineEnded">End now</button>` : ""}</div>` : ""}
      </div></div>
      <div data-photos></div>
      <div class="section">${groupLabel("The document")}${kvRows(doc.rows.map(([k, v]) => [k, "", "", v]))}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0"><button type="button" class="btn secondary" data-print>${raw(icon("print", { size: 20 }))} Print or PDF</button><button type="button" class="btn secondary" data-share>${raw(icon("share", { size: 20 }))} Share</button></div>
      <p class="foot-note">${doc.note}</p></div>`;
  }, after: (node, snap) => {
    const m = snap.data.movements.find((x) => x.id === id); if (!m) return;
    // Photos: the market / abattoir tag list (CPR moves) and any paperwork. A tag-list photo files the job.
    const cpr = m.kind === "off" && isCpr(m.dest) && m.cprList;
    const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "movements", id: m.id, label: `Movement ${m.docSerial || m.date}` }, title: cpr ? "Tag list photos" : "Photos", hint: cpr ? "Files the 48-hour job" : "",
      onChange: (n) => { if (n > 0 && cpr && !m.cprListFiledOn && canWrite(snap.role, "movements")) { A.markMovement(snap.lid, m, { cprListFiledOn: snap.today }); toast("Tag list filed"); } } });
    node.querySelector("[data-photos]").replaceWith(strip.node);
    node.querySelectorAll("[data-tick]").forEach((b) => (b.onclick = () => { const f = b.dataset.tick; A.markMovement(snap.lid, m, { [f]: snap.today }); toast("Saved", { action: "Undo", onAction: () => A.markMovement(snap.lid, m, { [f]: null }) }); }));
    const doc = movementDoc(snap, m);
    node.querySelector("[data-print]").onclick = () => printDoc(doc);
    node.querySelector("[data-share]").onclick = async () => {
      const text = `${doc.title}\n${doc.rows.map(([k, v]) => `${k}: ${v}`).join("\n")}`;
      try { if (navigator.share) { await navigator.share({ title: doc.title, text }); return; } } catch (e) { return; }
      try { await navigator.clipboard.writeText(text); toast("Copied — paste it into a message"); } catch (e) { printDoc(doc); }
    };
  } });
}
