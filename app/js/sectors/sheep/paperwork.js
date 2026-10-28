// Sheep → Paperwork (design/11 §9): inspection readiness, this year's duties, the registers.
import { html, raw } from "../../core/html.js";
import { icon } from "../../ui/icons.js";
import { canWrite } from "../../core/policy.js";
import { largeTitle, groupLabel } from "../../screens/common.js";
import { liveScreen } from "./screen.js";
import { pill, short, num, banner } from "./ui.js";
import { cropTagging, toNotify, inventoryWindow, restriction } from "./model/paperwork.js";
import { fqaStatus } from "./model/fqa.js";

const row = (href, label, sub, right = "") => html`<a class="row no-lead" href="${href}"><span class="main"><span class="primary">${label}</span>${sub ? html`<span class="secondary">${sub}</span>` : ""}</span>${right}<span class="chev">${raw(icon("chevron"))}</span></a>`;
export default async function paperwork(ctx) {
  return liveScreen(ctx, { title: "Paperwork", tab: "paperwork", depth: 0, paint: (snap) => {
    const L = (h) => `#/l/${snap.lid}/${h}`;
    const fq = fqaStatus(snap.c, snap.meta.fqa?.items || {});
    const tg = cropTagging(snap.data, snap.cy, snap.s); const nt = toNotify(snap.data); const inv = inventoryWindow(snap.today, snap.s);
    const invDone = snap.data.inventories.find((i) => +i.year === inv.year);
    const invPill = invDone?.submittedOn ? pill("ok", "Sent") : snap.today >= inv.from && snap.today <= inv.to ? pill("due", "Count now") : snap.today >= inv.infoFrom && snap.today < inv.from ? pill("info", "Due soon") : inv.deadline && snap.today > inv.deadline ? pill("late", "Late") : "";
    const r = restriction(snap.data);
    return html`<div>${largeTitle("Paperwork", [snap.s.flockNo ? `Flock ${snap.s.flockNo}` : "Add your flock number in Targets", snap.keeper.name].filter(Boolean).join(" · "))}
      ${r ? banner("late", `Flock restricted (${r.disease}) since ${short(r.date)}`, " Moves are stopped until your vet confirms in writing.") : ""}
      <div class="list">${row(L("paperwork/fqa"), "Inspection ready?", "FQAS self-check — sheep items", html`<span class="kv-v ${fq.pct >= 80 ? "v-ok" : "v-due"}">${fq.pct}%</span>`)}</div>
      <div class="section">${groupLabel("This year")}<div class="list">
        ${row(L("paperwork/inventory"), "Annual inventory", `Count 1–5 Dec${inv.deadline ? ` · send by ${short(inv.deadline)}` : ""}`, invPill)}
        ${row(L("paperwork/tagging"), "Tagging", tg.untagged ? `${tg.untagged} lambs to tag${tg.tagBy ? ` by ${short(tg.tagBy)}` : ""}` : "All lambs tagged", tg.untagged && tg.tagBy && tg.tagBy < snap.today ? pill("late", "Late") : "")}
        ${row(L("paperwork/movements"), "Movements to notify", nt.length ? `${nt.length} waiting for NIFAIS` : "All notified", nt.length ? pill(nt.some((x) => x.due < snap.today) ? "late" : "due", num(nt.length)) : "")}
      </div></div>
      <div class="section">${groupLabel("Registers")}<div class="list">
        ${row(L("paperwork/register"), "Flock register", "DAERA layout · print or share")}
        ${row(L("paperwork/movements"), "Movement documents", `${snap.data.movements.filter((m) => m.docSerial).length} this ledger`)}
        ${row(L("paperwork/medicine"), "Medicine use (mob doses)", "One line per mob dose")}
        ${row("#/farm/medicines", "Medicine purchases / disposal", "Medicine store, shared with the farm")}
        ${row(L("paperwork/deaths"), "Deaths and fallen stock", "")}
        ${row(L("paperwork/vetops"), "Vet operations (castration, docking)", "")}
        ${row(L("paperwork/feed"), "Feed records (3 years)", "")}
      </div></div>
      <div class="section"><a class="btn" href="${L("paperwork/inspect")}">Inspector is here</a></div></div>`;
  } });
}
export { canWrite };
