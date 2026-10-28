// The printable registers (design/11 §9.1 flock register in DAERA layout, movements, mob doses,
// deaths, vet operations, feed). Each shows on screen, prints, and downloads as CSV.
import { html, raw } from "../../core/html.js";
import { icon } from "../../ui/icons.js";
import { canWrite } from "../../core/policy.js";
import { download } from "../../ui/download.js";
import { largeTitle, backLink, emptyState } from "../../screens/common.js";
import { liveScreen } from "./screen.js";
import { short, toHtmlTable, printDoc, csvOf, num } from "./ui.js";
import { registerLines, EVENT_NAMES, DESTS } from "./model/paperwork.js";
import { regionRule } from "./model/region.js";

const TITLES = { register: "Flock register", movements: "Movement documents", medicine: "Medicine use (mob doses)", deaths: "Deaths and fallen stock", vetops: "Vet operations", feed: "Feed records" };
export function registerDoc(snap, doc) {
  const k = snap.keeper; const flock = snap.s.flockNo || k.flockNo || "";
  const top = [["Flock", flock], ["Keeper", k.name || snap.ledger.farmName || ""], ["Address", k.address || ""], ["Production", snap.s.flockType]];
  if (doc === "register") {
    const mv = regionRule("sheepMovement") || {};
    return { title: "Flock register", top, headers: ["Date", "Event", "Number", "Movement doc", "Holding from / to", "Tag numbers", "Replacement old ↔ new", "Inventory"], rows: registerLines(snap.data).map((l) => [l.date, EVENT_NAMES[l.event] + (l.late ? " (entered late)" : ""), l.number, l.serial || "", l.holding || "", l.tags || "", l.retag || "", l.inventory || ""]), note: `Births within ${mv.birthRegisterDaysAfterTagging ?? 7} days of tagging; moves and deaths within ${mv.registerDays ?? 7} days; moves to a market or abattoir within ${mv.cprRegisterHours ?? 48} hours. Keep for 3 years after every animal in it has died or left.` };
  }
  if (doc === "movements") return { title: "Movement documents", top, headers: ["Date", "Serial", "On/off", "Number", "To / from", "Destination", "Haulier", "Notified NIFAIS"], rows: snap.data.movements.filter((m) => ["on", "off"].includes(m.kind)).sort((a, b) => a.date.localeCompare(b.date)).map((m) => [m.date, m.docSerial || "", m.kind === "on" ? "On" : "Off", m.count, [m.otherFlock, m.otherName].filter(Boolean).join(" "), DESTS[m.dest] || "", [m.haulier, m.transporterNo].filter(Boolean).join(" "), m.notifiedOn || "not yet"]) };
  if (doc === "medicine") return { title: "Medicine use record", top, headers: ["Date", "Mob / animals", "Number treated", "Avg weight", "Product", "Batch", "Dose each", "Total", "Withdrawal (days)", "Clear on", "Given by", "Reason"], rows: snap.data.medicines.filter((m) => m.kind !== "disposal").sort((a, b) => a.date.localeCompare(b.date)).map((m) => [m.date, (m.tags || []).length ? m.tags.join(", ") : m.mobName || "", m.numberTreated, m.avgWeight || m.heaviest || "", m.productName, m.batch || "", m.doseEach ? `${m.doseEach} ${m.unit || "ml"}` : "", m.totalDose ? `${m.totalDose} ${m.unit || "ml"}` : "", m.wdMeatDays ?? "", m.withdrawalUntil || "", m.givenBy || "", [m.reason, m.wormerGroup].filter(Boolean).join(" · ")]), note: "One line per mob dose (group treatment)." };
  if (doc === "deaths") return { title: "Deaths and fallen stock", top, headers: ["Date", "Mob", "Number", "Tag", "Cause", "Over 18 months", "Found at inspection", "Disposal", "Docket"], rows: snap.data.deaths.sort((a, b) => a.date.localeCompare(b.date)).map((d) => [d.date, d.mobName || (d.lamb ? "lamb" : ""), d.number || 1, d.tag || "", d.cause || "", d.over18m ? "Yes" : "No", d.foundAtInspection ? "Yes" : "", d.disposal || "", d.docket || ""]) };
  if (doc === "vetops") return { title: "Vet operations", top, headers: ["Date", "Operation", "Method", "Number", "Age (days)", "Pain relief", "Done by"], rows: snap.data.vetOps.sort((a, b) => a.date.localeCompare(b.date)).map((o) => [o.date, o.operation, o.method, o.number, o.ageDays ?? "", o.anaesthetic || "", o.by || ""]) };
  return { title: "Feed records", top, headers: ["Delivered", "Feed", "Supplier", "Batch / docket", "Tonnes"], rows: snap.data.feedRecords.sort((a, b) => a.date.localeCompare(b.date)).map((f) => [f.date, f.feed, f.supplier, f.batch || "", f.tonnes ?? ""]), note: "Keep feed records for 3 years." };
}
const ADD = { vetops: ["vetOpSheet", "Add castration or docking"], feed: ["feedSheet", "Add a feed delivery"], deaths: ["deathSheet", "Record a death"] };
export default async function registers(ctx) {
  const doc = ctx.match.groups.doc;
  return liveScreen(ctx, { title: TITLES[doc], tab: "paperwork", paint: (snap) => {
    const d = registerDoc(snap, doc); const add = ADD[doc] && canWrite(snap.role, "events");
    return html`<div>${backLink(`#/l/${snap.lid}/paperwork`, "Paperwork")}${largeTitle(TITLES[doc], `${d.rows.length} line${d.rows.length === 1 ? "" : "s"}`)}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 16px"><button type="button" class="btn secondary" data-print>${raw(icon("print", { size: 20 }))} Print</button><button type="button" class="btn secondary" data-csv>${raw(icon("download", { size: 20 }))} Download CSV</button></div>
      ${add ? html`<button type="button" class="btn" data-add style="margin-bottom:16px">${ADD[doc][1]}</button>` : ""}
      ${doc === "movements" && snap.data.movements.length ? html`<div class="list" style="margin-bottom:16px">${snap.data.movements.filter((m) => ["on", "off"].includes(m.kind)).sort((a, b) => b.date.localeCompare(a.date)).map((m) => html`<a class="row no-lead" href="#/l/${snap.lid}/movement/${m.id}"><span class="main"><span class="primary">${m.kind === "off" ? "Off" : "On"}: ${num(m.count)} · ${m.otherName || m.otherFlock || ""}</span><span class="secondary">${short(m.date)}${m.docSerial ? " · " + m.docSerial : ""} · ${m.notifiedOn ? "notified" : "not notified yet"}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div>` : ""}
      ${d.rows.length ? html`<div class="table-scroll"><div class="print-view">${raw(toHtmlTable(d))}</div></div>` : emptyState({ sector: "sheep", title: "Nothing recorded yet", body: "Lines appear here as you record the work — no extra typing." })}</div>`;
  }, after: (node, snap) => {
    const d = registerDoc(snap, doc);
    node.querySelector("[data-print]").onclick = () => printDoc(d);
    node.querySelector("[data-csv]").onclick = () => download(`${d.title.toLowerCase().replace(/\W+/g, "-")}-${snap.today}.csv`, csvOf(d), "text/csv");
    const a = node.querySelector("[data-add]"); if (a) a.onclick = async () => (await import("./flows/events.js"))[ADD[doc][0]](snap);
  } });
}
