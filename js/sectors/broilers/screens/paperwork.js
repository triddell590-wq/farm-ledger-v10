// Broilers → Paperwork (design/15 §11): "Inspection ready?" against Red Tractor Chicken v5.1
// (modified), Inspector is here, this crop's legal chain — house records, Salmonella, FCI,
// density — and every register, each printable.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { pill, dm, when, n1 } from "../ui.js";
import { currentCrop, cropEvents, cropNo, listOf } from "../model/crop.js";
import { salmStatus, fciSendBy } from "../model/paper.js";
import { plannedMax, densityNeeds } from "../model/density.js";
import { evaluate, summary } from "../model/checklist.js";
import { RT_VERSION } from "../model/content.js";
import { DOCS } from "../model/registers.js";
import { datePart } from "../model/time.js";

const RANK = { late: 0, positive: 0, due: 1, open: 2, waiting: 3, future: 4, ok: 5 };

export default async function paperwork(ctx) {
  return liveScreen(ctx, { title: "Paperwork", tab: "paperwork", depth: 0, paint });
}

function paint(snap) {
  const { ix, s, today, lid } = snap; const L = (h) => `#/l/${lid}/${h}`;
  const sm = summary(evaluate(snap.c, snap.meta.checklist || {}));
  const crops = ix.houses.map((h) => currentCrop(ix, h.id)).filter((c) => c && c.placedDate <= today);
  const rows = [];
  if (crops.length) {
    rows.push({ t: "House records (Schedule 5)", sub: "Every AM and PM check, deaths and culls with cause", lv: "ok", p: "Up to date", href: L(`paperwork/house/${crops[0].id}`) });
    const sal = crops.flatMap((c) => salmStatus(ix, c, s, today).map((x) => ({ ...x, c }))).sort((a, b) => RANK[a.state] - RANK[b.state] || a.window.doBy.localeCompare(b.window.doBy))[0];
    if (sal) rows.push({ t: "Salmonella", sub: sal.sample ? `Sampled ${dm(sal.sample.date)} · ${sal.state === "ok" ? "negative" : sal.state === "positive" ? "POSITIVE" : "waiting for the result"}` : `Boot swabs within ${sal.window.days === 42 ? 6 : 3} weeks before the ${sal.ev.kind === "clear" ? "clear-out" : "thin"} · do by ${dm(sal.window.doBy)}`, lv: { late: "late", positive: "late", due: "due", open: "due", waiting: "info", future: "neutral", ok: "ok" }[sal.state], p: { late: "Late", positive: "Positive", due: "Due", open: "Window open", waiting: "Waiting", future: `From ${dm(sal.window.from).slice(4)}`, ok: "Negative" }[sal.state], href: L(`salm/${sal.c.id}`) });
    const ev = crops.flatMap((c) => cropEvents(ix, c, s).filter((e) => !e.done).map((e) => ({ ...e, c }))).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (ev) {
      const sent = ev.rec && listOf(ix.fci, ev.c.id).some((f) => f.thinId === ev.rec.id && f.sentAt);
      const by = fciSendBy(ev.rec?.catchAt || `${ev.date}T02:00`, s, ev.rec?.arrivalAt);
      rows.push({ t: "Food Chain Information", sub: `${ev.kind === "clear" ? "Clear-out" : "Thin"} ${dm(ev.date)} · ${sent ? "sent" : `send by ${when(by)}`}`, lv: sent ? "ok" : snap.now > by ? "late" : datePart(by) <= today ? "due" : "neutral", p: sent ? "Sent" : snap.now > by ? "Late" : ev.rec ? "Due" : "Plan the catch first", href: ev.rec ? L(`fci/${ev.c.id}/${ev.rec.id}`) : L(`density/${ev.c.id}`) });
    }
    const dn = crops.filter((c) => +ix.houseById.get(c.houseId)?.usableM2).map((c) => { const mx = Math.max(plannedMax(ix, c, s, +ix.houseById.get(c.houseId).usableM2, today), +c.targetDensity || 0); return { c, mx, n: densityNeeds(ix, c, s, mx) }; }).sort((a, b) => b.mx - a.mx)[0];
    if (dn) rows.push({ t: "Density", sub: `Planned ${n1(dn.mx)} kg/m² · ${dn.n.tier === "none" ? "no DAERA notice needed" : dn.n.notifyOk ? `DAERA told ${dm(dn.c.notifiedDaera)}` : `tell DAERA by ${dm(dn.n.notifyBy)}`}`, lv: dn.n.tier === "none" || (dn.n.notifyOk && (!dn.n.needsApproval || dn.n.approvalRef)) ? "ok" : "late", p: dn.n.tier === "none" || dn.n.notifyOk ? "OK" : "Notice", href: L(`density/${dn.c.id}`) });
  }
  const add = canWrite(snap.role, "alarmTests");
  return html`<div>
    ${largeTitle("Paperwork", cropNo(ix) ? `Crop ${cropNo(ix)}` : "")}
    <div class="list"><a class="row" href="${L("rt")}"><span class="tile">${raw(icon("records"))}</span><span class="main"><span class="primary">Inspection ready? ${sm.ok} of ${sm.total}</span><span class="secondary">Based on ${RT_VERSION.name} v${RT_VERSION.version}, 1 Feb 2025. Not endorsed by Red Tractor.</span></span>${sm.gaps ? pill("due", `${sm.gaps} gap${sm.gaps > 1 ? "s" : ""}`) : ""}<span class="chev">${raw(icon("chevron"))}</span></a></div>
    <a class="btn br-mt" href="${L("inspect")}">${raw(icon("shield"))}Inspector is here</a>
    ${rows.length ? html`<div class="section">${groupLabel("This crop")}<div class="list">${rows.map((r) => html`<a class="row no-lead" href="${r.href}"><span class="main"><span class="primary">${r.t}</span><span class="secondary">${r.sub}</span></span>${pill(r.lv, r.p, r.lv === "neutral" ? "" : undefined)}<span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>` : ""}
    <div class="section">${groupLabel("Registers")}<div class="list">${DOCS.filter(([k]) => !["house", "density", "birdreg"].includes(k)).map(([k, t, sub]) => html`<a class="row no-lead" href="${L(`paperwork/${k}`)}"><span class="main"><span class="primary">${t}</span><span class="secondary">${sub}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`)}
      <a class="row no-lead" href="${L("paperwork/house")}"><span class="main"><span class="primary">House records — every crop</span><span class="secondary">Kept 3 years</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
      <a class="row no-lead" href="${L("paperwork/density")}"><span class="main"><span class="primary">Density notices</span><span class="secondary">DAERA notice and approval per crop</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
      <a class="row no-lead" href="${L("birdreg")}"><span class="main"><span class="primary">Bird Register (1 June)</span><span class="secondary">NISRA survey · one entry per establishment number</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div></div>
    ${add ? html`<div class="section">${groupLabel("Record")}<div class="br-acts br-acts2">
      <button type="button" class="btn secondary" data-flow="alarm">${raw(icon("bell"))}Alarm test</button><button type="button" class="btn secondary" data-flow="visitor">${raw(icon("people"))}Visitor</button>
      <button type="button" class="btn secondary" data-flow="water">${raw(icon("water"))}Water test</button><button type="button" class="btn secondary" data-flow="training">${raw(icon("user"))}Training</button></div></div>` : ""}
  </div>`;
}
