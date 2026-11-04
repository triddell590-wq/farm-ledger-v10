// Service board (design/13 §4.3, Research A challenge 4): this week's batch, the target with
// its formula, where the served sows came from, and who is still to serve.
import { html } from "../../../core/html.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { pill } from "../ui.js";
import { breedingTiles } from "../model/week.js";
import { weekDates, weekLabel, weekIndex } from "../model/weeks.js";
import { cycleOf, sowLabel } from "../model/sows.js";
import { batchName } from "../model/batches.js";

const WHY = { weaned: "Weaned", gilt: "Gilts in heat", return: "Returns", "empty scan": "Empty at scan" };

export default async function service(ctx) {
  return liveScreen(ctx, { title: "Service", tab: "sows", paint: (snap) => {
    const t = breedingTiles(snap.c); const days = weekDates(snap.today, snap.s.weekStart);
    const batch = snap.data.batches.find((b) => b.serveDate && weekIndex(b.serveDate) === weekIndex(snap.today));
    const bn = batch ? batchName(batch) : `B${snap.c.nextNo}`;
    const served = snap.data.services.filter((s) => s.date >= days[0] && s.date <= days[6] && (s.serviceNo || 1) === 1);
    // where each served sow came from (her state before this service)
    const from = {}; for (const sv of served) { const s = snap.ix.byId.get(sv.sowId); if (!s) continue; const c = cycleOf(snap.s, snap.ix, s, sv.date); const why = c.litters.length === 0 ? "gilt" : c.returnedAt ? "return" : c.scan?.result === "-" ? "empty scan" : "weaned"; from[why] = (from[why] || 0) + 1; }
    const still = {}; for (const x of t.stillToServe) still[x.why] = (still[x.why] || 0) + 1;
    const rows = ["weaned", "gilt", "return", "empty scan"].filter((k) => from[k] || still[k]);
    const short = t.target - t.served; const fill = Math.round((t.served * snap.s.targets.farrowRate) / 100);
    const can = canWrite(snap.role, "services");
    return html`<div>${backLink(`#/l/${snap.lid}/sows`, "Sows")}${largeTitle(`Serve ${bn}`, `${weekLabel(snap.today)} · target ${t.target} · served ${t.served}`)}
      <div class="card pad"><div class="pg-progress ${t.served >= t.target ? "" : "due"}"><i style="width:${Math.min(100, (t.served / (t.target || 1)) * 100)}%"></i></div>
        <div class="pg-formula">Target = farrowing places ÷ expected farrowing rate = ${snap.s.farrowingPlaces} ÷ ${(snap.s.targets.farrowRate / 100).toFixed(2)} = ${t.target}</div></div>
      ${short > 0 && t.served > 0 ? html`<div class="info-card" style="margin-top:12px"><span>${short} short of target — ${bn} may fill ${fill} of ${snap.s.farrowingPlaces} crates. Bring in gilts?</span></div>` : ""}
      <div class="section">${groupLabel("Where they come from")}<div class="list">${rows.length ? rows.map((k) => html`<div class="row no-lead pg-kv"><span class="main"><span class="primary">${WHY[k]}</span></span><span class="v">${(from[k] || 0) + (still[k] || 0)} → ${from[k] || 0} served</span></div>`) : html`<div class="row no-lead"><span class="main"><span class="secondary">No sows to serve this week yet.</span></span></div>`}</div></div>
      <div class="section">${groupLabel("Still to serve", t.stillToServe.length || "")}<div class="list">${t.stillToServe.length ? t.stillToServe.map((x) => html`<button type="button" class="row" ${can ? html`data-flow="served" data-arg="${flowArg({ sowId: x.sow.id })}"` : ""}><span class="pg-no">${sowLabel(x.sow)}</span><span class="main"><span class="primary">P${x.c.parity}</span><span class="secondary">${x.why === "weaned" ? `weaned ${x.c.weanedDays} d ago` : x.why}</span></span>${x.why === "return" ? pill("late", "Return") : x.why === "weaned" && x.c.weanedDays > 7 ? pill("due", `${x.c.weanedDays} d`) : ""}</button>`) : html`<div class="row no-lead"><span class="main"><span class="secondary">Nobody waiting.</span></span></div>`}</div></div>
      <div class="section">${groupLabel("Served this week", served.length || "")}<div class="list">${served.length ? served.map((sv) => { const s = snap.ix.byId.get(sv.sowId); return html`<a class="row" href="#/l/${snap.lid}/sow/${sv.sowId}"><span class="pg-no">${s ? sowLabel(s) : "?"}</span><span class="main"><span class="primary">${sv.date.slice(8)}/${sv.date.slice(5, 7)} ${sv.time || ""}</span><span class="secondary">${sv.kind || "AI"}${sv.boar ? " · Boar " + sv.boar : ""}</span></span></a>`; }) : html`<div class="row no-lead"><span class="main"><span class="secondary">None yet.</span></span></div>`}</div></div>
      ${can ? html`<button type="button" class="btn" style="margin-top:16px" data-flow="served">Record a service</button>` : ""}</div>`;
  } });
}
