// The sow card (design/13 §4.2, Research C tool 1): this cycle with every date, the litters
// table newest first, lifetime totals, health; Farrowed · Weaned · Served · Cull.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { daysBetween } from "../model/dates.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { dm, d2, pill, n1 } from "../ui.js";
import { cycleOf, sowLabel, sowPill, lifetime, STATUS_WORD, crateEntryCheck } from "../model/sows.js";
import { weekDates } from "../model/weeks.js";
import { batchName } from "../model/batches.js";
import { aliveNow, diedIn } from "../model/litters.js";

const TYPE = { sow: "Sow", gilt: "Gilt", boar: "Boar" };

export default async function sow(ctx) {
  const id = ctx.match.groups.id;
  return liveScreen(ctx, { title: "Sow", tab: "sows", paint: (snap) => {
    const s = snap.ix.byId.get(id); const lid = snap.lid; const back = backLink(`#/l/${lid}/sows`, "Sows");
    if (!s) return html`<div>${back}${largeTitle("Sow not found")}<p class="t-callout ink-2">She may have been removed.</p></div>`;
    const c = cycleOf(snap.s, snap.ix, s, snap.today); const w = canWrite(snap.role, "services");
    const wk = weekDates(snap.today, snap.s.weekStart);
    const p = s.type === "boar" ? null : sowPill(snap.s, c, s, snap.today, wk[6]);
    const room = c.inCrate ? snap.ix.rooms.get(c.inCrate.roomId) : null;
    const lt = lifetime(c.litters);
    const meds = (snap.data.medicines || []).filter((m) => m.sowId === s.id).sort((a, b) => b.date.localeCompare(a.date));
    const sub = [s.tag || (snap.s.herdMark ? `${snap.s.herdMark} ${s.sowNo}` : null), s.type === "boar" ? s.breed : `Parity ${c.parity}`, c.batchId ? batchName(snap.ix.batches.get(c.batchId)) : null].filter(Boolean).join(" · ");
    const status = s.type === "boar" ? "Boar" : c.status === "inpig" || c.status === "farrowing" ? `In pig ${c.days} d` : c.status === "served" ? `Served ${c.days} d ago` : c.status === "suckling" ? `Suckling ${daysBetween(c.last.farrowedAt, snap.today)} d` : STATUS_WORD[c.status];
    // this cycle
    const cyc = [];
    if (c.first) {
      c.services.forEach((sv, i) => cyc.push([i === 0 ? "Served" : "", `${dm(sv.date)}${sv.time ? " " + sv.time : ""} · ${sv.kind || "AI"}${sv.boar ? " · Boar " + sv.boar : ""}${sv.semenBatch ? " · batch " + sv.semenBatch : ""}`]));
      if (c.scan) cyc.push(["Scanned", `${c.scan.result === "+" ? "+ in pig" : c.scan.result === "-" ? "− empty" : "recheck"} · ${dm(c.scan.date)} (${daysBetween(c.first.date, c.scan.date)} d)`]);
      else cyc.push(["Scan", `${d2(c.dates.scanFrom)} – ${d2(c.dates.scanTo)}`, c.days > snap.s.scanTo ? "due" : ""]);
      if (c.status === "served" && c.days <= snap.s.returnTo + 3) cyc.push(["Return check", `${d2(c.dates.returnFrom)} – ${d2(c.dates.returnTo)}`]);
      if (c.inCrate) { const chk = crateEntryCheck(c.inCrate.since || snap.today, c.dates.due); cyc.push(["Moved", `${c.inCrate.since ? dm(c.inCrate.since) : ""} → ${room?.name || "Farrowing"}${c.inCrate.crate ? " C" + c.inCrate.crate : ""}`, chk.ok ? "" : "due"]); }
      else cyc.push(["Move to farrowing", `${dm(c.dates.move)} (no more than 7 days before due)`]);
      cyc.push(["Nesting material", `by ${dm(c.dates.nesting)} (24 h before)`]);
      cyc.push(["Due", `${dm(c.dates.due)} (${snap.s.gestation} d) · range ${d2(c.dates.dueFrom)}–${d2(c.dates.dueTo)}`, c.days >= 117 ? "late" : ""]);
      cyc.push(["Wean", `${dm(c.dates.wean)} (${snap.s.lactation} d)`]);
    } else if (c.status === "suckling") {
      cyc.push(["Farrowed", `${dm(c.last.farrowedAt.slice(0, 10))} · ${aliveNow(c.last)} alive now`]);
      cyc.push(["Wean", `${dm(new Date(new Date(c.last.farrowedAt.slice(0, 10) + "T12:00Z").getTime() + snap.s.lactation * 864e5).toISOString().slice(0, 10))} (${snap.s.lactation} d)`]);
    } else if (c.status === "weaned") cyc.push(["Weaned", `${dm(c.weaned)} · ${c.weanedDays} days ago${c.weanedDays > 7 ? " — not served yet" : ""}`, c.weanedDays > 7 ? "due" : ""]);
    else if (c.status === "empty") cyc.push(["Empty", c.returnedAt ? `Returned ${dm(c.returnedAt)} — serve her` : "Scanned empty — serve her or cull", "due"]);
    else if (c.status === "gilt") cyc.push(["Gilt", s.inHeat ? `In heat ${dm(s.inHeat)} — serve her` : "Not served yet"]);
    const A = (flow, label, arg) => html`<button type="button" class="btn secondary" data-flow="${flow}" data-arg="${flowArg(arg)}">${label}</button>`;
    return html`<div>${back}
      <div class="pg-big-head"><div><h1 class="big" style="margin:0">${sowLabel(s)}</h1><p>${sub}</p>
        <div class="pg-pills"><span class="pill neutral">${status}</span>${room ? html`<span class="pill neutral">${room.name}${c.inCrate.crate ? " · C" + c.inCrate.crate : ""}</span>` : ""}${p && p[1] !== "Suckling" ? pill(p[0], p[1]) : ""}${s.cull?.planned ? pill("info", "Cull planned") : ""}${s.cull?.date ? pill("neutral", `Culled ${d2(s.cull.date)}`) : ""}${s.died ? pill("late", `Died ${d2(s.died)}`) : ""}${s.lostTag && !s.lostTag.replaced ? pill("due", "Tag lost") : ""}</div></div>
        ${canWrite(snap.role, "sows") ? html`<button type="button" class="text-btn" style="margin-left:auto;align-self:flex-start" data-flow="sow" data-arg="${flowArg({ id: s.id })}">Edit</button>` : ""}</div>
      ${s.type !== "boar" ? html`<div class="section">${groupLabel("This cycle")}<div class="list pg-tl">${cyc.length ? cyc.map(([k, v, tone]) => html`<div class="row no-lead"><span class="when" style="width:112px">${k}</span><span class="main"><span class="primary ${tone ? "pg-ink-" + tone : ""}" style="font-weight:500">${v}</span></span></div>`) : html`<div class="row no-lead"><span class="main"><span class="secondary">Nothing recorded this cycle.</span></span></div>`}</div></div>` : ""}
      ${s.type !== "boar" ? html`<div class="section">${groupLabel("Litters", c.litters.length || "")}<div class="card pad">${c.litters.length ? html`<table class="pg-tbl"><thead><tr><th>P</th><th>Farrowed</th><th class="r">BA</th><th class="r">SB</th><th class="r">M</th><th class="r">Wean</th><th class="r">Wt</th></tr></thead><tbody>${[...c.litters].reverse().map((l, i) => html`<tr><td>${c.litters.length - i}</td><td>${d2(l.farrowedAt.slice(0, 10))}</td><td class="r">${l.bornAlive}</td><td class="r">${l.stillborn || 0}</td><td class="r">${l.mummified || 0}</td><td class="r">${l.weaned ? l.weaned.n : aliveNow(l)}${l.weaned ? "" : "*"}</td><td class="r">${l.weaned?.kg ? n1(l.weaned.kg / (l.weaned.n || 1)) + " kg" : "—"}</td></tr>`)}</tbody></table>
        <p class="pg-note">Lifetime: ${lt.bornAlive} born alive · ${lt.weaned} weaned${c.litters.some((l) => !l.weaned) ? " · * alive now, not weaned yet" : ""}${s.parityAtEntry ? ` · came in at parity ${s.parityAtEntry}` : ""}</p>` : html`<p class="t-callout ink-2" style="margin:0">No litters yet.</p>`}</div></div>` : ""}
      <div class="section">${groupLabel("Health")}<div class="list">${meds.length ? meds.slice(0, 8).map((m) => html`<div class="row no-lead"><span class="main"><span class="primary">${m.productName || "Treatment"}</span><span class="secondary">${d2(m.date)} · ${m.reason || ""}${m.withdrawalEndDateMeat && m.withdrawalEndDateMeat >= snap.today ? ` · meat withdrawal to ${d2(m.withdrawalEndDateMeat)}` : ""}</span></span></div>`) : html`<div class="row no-lead"><span class="main"><span class="secondary">No treatments recorded.</span></span></div>`}
        ${c.litters.some((l) => diedIn(l)) ? html`<div class="row no-lead"><span class="main"><span class="secondary">Piglet deaths: ${c.litters.reduce((t, l) => t + diedIn(l), 0)} across ${c.litters.length} litters</span></span></div>` : ""}
        ${s.cull?.reason ? html`<div class="row no-lead"><span class="main"><span class="primary">Cull: ${s.cull.reason}</span><span class="secondary">${s.cull.date ? "Culled " + d2(s.cull.date) : "Planned " + d2(s.cull.on)}</span></span></div>` : ""}</div></div>
      ${w && s.type !== "boar" && !s.cull?.date && !s.died ? html`<div class="pg-acts">${A("farrowing", "Farrowed", c.inCrate ? { roomId: c.inCrate.roomId } : {})}${A("weaned", "Weaned", c.last && !c.last.weaned ? { roomId: c.last.roomId } : {})}${A("served", "Served", { sowId: s.id })}${A("cull", "Cull", { sowId: s.id })}</div>
        <div class="pg-acts">${["served", "inpig"].includes(c.status) ? A("scan", "Scan result", { sowId: s.id }) : ""}${c.status === "served" ? A("returned", "Returned to heat", { sowId: s.id }) : ""}${["served", "inpig"].includes(c.status) && !c.inCrate ? A("intoCrate", "Into farrowing", { sowId: s.id }) : ""}${c.status === "gilt" ? A("heat", "In heat today", { sowId: s.id }) : ""}${A("treatSow", "Treat", { sowId: s.id })}${A("lostTag", s.lostTag && !s.lostTag.replaced ? "Tag replaced" : "Tag lost", { sowId: s.id })}</div>` : ""}
    </div>`;
  } });
}
export { raw, icon };
