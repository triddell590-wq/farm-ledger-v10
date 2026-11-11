// Small herd → Sales & feed (design/13 §2.1, §3.3): pigs sold and feed bought, in plain words;
// cost per pig so far and money in for those who may see money. No batches, no FCR.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite, canRead } from "../../../core/policy.js";
import { addDays } from "../model/dates.js";
import { largeTitle, groupLabel } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { d2, n0, pounds } from "../ui.js";
import { notifyState } from "../model/paperwork.js";
import { aliveNow } from "../model/litters.js";

export default async function sales(ctx) {
  return liveScreen(ctx, { title: "Sales & feed", depth: 0, paint: (snap) => {
    const money = canRead(snap.role, "finance"); const yr = snap.today.slice(0, 4);
    const sold = snap.data.moves.filter((m) => m.direction === "off").sort((a, b) => b.date.localeCompare(a.date));
    const feed = snap.data.feedDeliveries.slice().sort((a, b) => b.date.localeCompare(a.date));
    const fin = snap.data.finance || [];
    const amt = (pred) => fin.filter(pred).reduce((t, f) => t + (+f.amount || 0), 0);
    const growing = [...snap.c.bf.values()].filter((f) => !f.final).reduce((t, f) => t + f.onFarm, 0) + snap.data.litters.filter((l) => !l.weaned).reduce((t, l) => t + aliveNow(l), 0);
    const costs6 = amt((f) => f.kind === "expense" && f.date >= addDays(snap.today, -183));
    return html`<div>${largeTitle("Sales & feed", `${n0(sold.filter((m) => m.date.startsWith(yr)).reduce((t, m) => t + m.n, 0))} pigs sold this year`)}
      ${money ? html`<div class="pg-bt"><div class="num-tile"><span class="label">Sold this year</span><span class="value">${pounds(amt((f) => f.kind === "revenue" && f.date.startsWith(yr)))}</span></div><div class="num-tile"><span class="label">Cost per pig so far</span><span class="value">${pounds(costs6 / (growing || 1))}</span><span class="delta">last 6 months ÷ ${n0(growing)} pigs</span></div></div>` : ""}
      ${canWrite(snap.role, "moves") ? html`<div class="pg-acts"><button type="button" class="btn secondary" data-flow="sold">${raw(icon("truck"))}Pigs sold</button><button type="button" class="btn secondary" data-flow="feedBought">${raw(icon("feed"))}Feed bought</button></div>` : ""}
      <div class="section">${groupLabel("Sold")}<div class="list">${sold.length ? sold.slice(0, 20).map((m) => { const n = notifyState(m, snap.today); const f = money ? fin.find((x) => x.moveId === m.id) : null; return html`<div class="row no-lead"><span class="main"><span class="primary">${d2(m.date)} · ${m.n} ${m.category === "weaners" ? "weaners" : "pigs"} to ${m.toName || m.toCode || ""}</span><span class="secondary">${m.notified ? "Move notified" : `Notify the move by ${d2(n.by)}`}${m.liveKg ? ` · ${n0(m.liveKg)} kg` : ""}</span></span>${f ? html`<span class="v">${pounds(f.amount)}</span>` : ""}</div>`; }) : html`<div class="row no-lead"><span class="main"><span class="secondary">Nothing sold yet.</span></span></div>`}</div></div>
      <div class="section">${groupLabel("Feed bought")}<div class="list">${feed.length ? feed.slice(0, 20).map((d) => { const f = money ? fin.find((x) => x.feedDeliveryId === d.id) : null; return html`<div class="row no-lead"><span class="main"><span class="primary">${d2(d.date)} · ${d.bags ? `${d.bags} bags` : `${(d.kg / 1000).toFixed(1)} t`} ${d.ration || ""}</span><span class="secondary">${d.supplier || ""}</span></span>${f ? html`<span class="v">${pounds(f.amount)}</span>` : ""}</div>`; }) : html`<div class="row no-lead"><span class="main"><span class="secondary">No feed recorded yet.</span></span></div>`}</div></div></div>`;
  } });
}
