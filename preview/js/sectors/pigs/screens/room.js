// Room screen (design/13 §5.2): today's check, 7-day readings, pens grid, alarm, enrichment,
// deaths; Death · Treat · Pigs out · Readings. Farrowing rooms show the crate grid (§5.4) and
// open the crate card (also from #…/crate/<roomId>/<n>). Empty rooms show the wash cycle (§5.5).
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { daysBetween } from "../model/dates.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { dm, d2, spark, pctText, n0, plural, kvRows } from "../ui.js";
import { roomFacts, binFacts } from "../model/facts.js";
import { WASH, WASH_WORD, waterSeries, tempRange, KIND_NAME } from "../model/rooms.js";
import { roomLitterTotals } from "../model/litters.js";
import { batchName } from "../model/batches.js";
import { crateGridHtml, crateSheet } from "../flows/farrowing.js";

const WASH_HELP = { emptied: "All pigs out", soaked: "Soaked down", washed: "Pressure washed", disinfected: "Product and dilution recorded", dried: "Left to dry", ready: "Ready for pigs" };

export default async function room(ctx) {
  const g = ctx.match.groups; const id = g.id || g.roomId; let opened = !g.crate;
  return liveScreen(ctx, { title: "Room", tab: "rooms", paint: (snap) => {
    const x = roomFacts(snap.c).find((r) => r.room.id === id); const lid = snap.lid;
    if (!x) return html`<div>${backLink(`#/l/${lid}/rooms`, "Rooms")}${largeTitle("Room not found")}</div>`;
    const r = x.room; const f = x.f; const b = x.batch; const ops = canWrite(snap.role, "deaths");
    const sub = [];
    if (r.kind === "farrowing" && (x.litters.length || x.sowsIn.length)) { const t = roomLitterTotals(x.litters); sub.push(x.tile.stage, `${t.litters} of ${x.sowsIn.length || t.litters} farrowed`, `${n0(t.alive)} piglets`); }
    else if (f) sub.push(`${batchName(b)} · day ${f.days}`, plural(f.onFarm, "pig"), r.pens?.length ? plural(r.pens.length, "pen") : null);
    else if (x.sowsIn.length) sub.push(plural(x.sowsIn.length, "sow"));
    else sub.push(KIND_NAME[r.kind], x.tile.stage);
    const line2 = f && r.kind !== "weaner" ? `Est. ${Math.round(f.est)} kg${f.fromTarget ? " (target)" : ""}${f.shipDate ? " · ship from " + dm(f.shipDate) : ""}` : f ? `Est. ${Math.round(f.est)} kg · FCR ${f.fcr ? f.fcr.toFixed(2) + " est" : "—"}` : "";
    const chk = x.check; const occupied = x.pigs > 0 || !!b;
    const bin = binFacts(snap.c).find((y) => (y.bin.roomIds || []).includes(r.id));
    const wser = waterSeries(snap.data.readings, r.id, snap.today); const tr = tempRange(snap.data.readings, r.id, snap.today);
    const enr = snap.data.enrichment.filter((e) => e.roomId === r.id).sort((a, c) => c.date.localeCompare(a.date))[0];
    const A = (flow, label, arg, ic) => html`<button type="button" class="btn secondary" data-flow="${flow}" data-arg="${flowArg(arg)}">${ic ? raw(icon(ic, { size: 20 })) : ""}${label}</button>`;
    const pens = r.pens || []; const per = pens.length && f ? Math.floor(f.onFarm / pens.length) : null; const extra = pens.length && f ? f.onFarm - per * pens.length : 0;
    return html`<div>${backLink(`#/l/${lid}/rooms`, "Rooms")}${largeTitle(r.name, [sub.filter(Boolean).join(" · "), line2].filter(Boolean).join("\n"))}
      ${r.house && r.house !== r.name ? html`<p class="pg-line" style="margin-top:-6px">${r.house}</p>` : ""}
      ${occupied ? html`<div class="section"><div class="list">${chk ? html`<div class="row"><span class="tile ok">${raw(icon("check"))}</span><span class="main"><span class="primary">Today's check</span><span class="secondary">✓ ${chk.time || ""} ${chk.by ? chk.by.split(" ")[0] : ""}${x.issues.size ? ` · issues in pen ${[...x.issues].join(", ")}` : " · all OK"}</span></span>${ops ? html`<button type="button" class="text-btn" data-flow="check" data-arg="${flowArg({ roomId: r.id })}">Again</button>` : ""}</div>` : html`<button type="button" class="row" ${ops ? raw(`data-flow="check" data-arg='${flowArg({ roomId: r.id })}'`) : ""}><span class="tile">${raw(icon("check"))}</span><span class="main"><span class="primary">Today's check</span><span class="secondary">Not done yet · the law asks for once a day</span></span>${ops ? html`<span class="btn" style="width:auto;height:44px;padding:0 18px">Check</span>` : ""}</button>`}</div></div>` : ""}
      ${r.kind === "farrowing" ? html`<div class="section">${groupLabel("Crates", r.crates || "")}<p class="pg-note" style="margin:0 4px 10px">Ringed = due to farrow. Tap a crate for the crate card.</p><div data-crates>${crateGridHtml(snap, r)}</div>
        ${x.pwm != null ? html`<p class="pg-note">Pre-weaning mortality in this room: <b class="${x.pwm * 100 > snap.s.targets.pwm ? "pg-ink-due" : ""}">${pctText(x.pwm)}</b> · target ${snap.s.targets.pwm}%</p>` : ""}</div>` : ""}
      ${occupied ? html`<div class="section">${groupLabel("Readings · 7 days")}<div class="list">
        <div class="row no-lead pg-kv"><span class="main"><span class="primary">Water</span></span>${spark(wser)}<span class="v ${x.wAlert ? "due" : ""}">${x.wc ? `${x.wc.change > 0 ? "+" : "−"}${Math.abs(Math.round(x.wc.change * 100))}% today` : "—"}${x.wAlert ? " ⚠" : ""}</span></div>
        <div class="row no-lead pg-kv"><span class="main"><span class="primary">Temperature</span></span><span class="v">${tr ? `min ${tr.min ?? "—"} · max ${tr.max ?? "—"} °C` : "not read today"}</span></div>
        <div class="row no-lead pg-kv"><span class="main"><span class="primary">Feed${bin ? " · " + bin.bin.name : ""}</span></span><span class="v ${bin?.level === "due" ? "due" : ""}">${bin ? (bin.daysLeft != null ? `~${Math.max(0, Math.floor(bin.daysLeft))} days left` : "—") : "no bin set"}</span></div></div></div>` : ""}
      ${pens.length && r.kind !== "farrowing" ? html`<div class="section">${groupLabel("Pens", x.issues.size ? "● = issue at last check" : "")}<div class="pg-pens">${pens.map((p, i) => { return html`<div class="pg-pen ${x.issues.has(+p.no) ? "iss" : ""}">${p.no}<small>${per != null ? per + (i < extra ? 1 : 0) + " pigs" : p.areaM2 ? p.areaM2 + " m²" : ""}</small></div>`; })}</div>
        ${x.space ? html`<p class="pg-note">Space: ${x.space.word === "✓" ? "within the legal minimum" : x.space.word === "Tight" ? "tight" : "over the legal minimum"} — ${n0(f.onFarm)} pigs, ${n0(x.space.allowed)} allowed in ${x.space.area} m² at ${Math.round(f.est)} kg. <a href="#/l/${lid}/tools/space">Space per pen</a></p>` : ""}</div>` : ""}
      ${!b && !x.sowsIn.length && !x.litters.length ? washHtml(snap, x) : ""}
      <div class="section"><div class="list">
        ${r.mechVent !== false ? html`<div class="row no-lead pg-kv"><span class="main"><span class="primary">Alarm test · ${r.house || r.name}</span></span><span class="v ${x.alarm.level === "late" ? "late" : x.alarm.level === "ok" ? "ok" : "due"}">${x.alarm.last ? `${d2(x.alarm.last.date)} (${x.alarm.days} d)` : "never"}${x.alarm.level === "late" ? " ⚠" : ""}</span>${canWrite(snap.role, "alarmTests") ? html`<button type="button" class="text-btn" data-flow="alarm" data-arg="${flowArg({ house: r.house || r.name })}">Test</button>` : ""}</div>` : ""}
        ${occupied ? html`<div class="row no-lead pg-kv"><span class="main"><span class="primary">Enrichment</span></span><span class="v wrap">${enr ? `${enr.material} · ${d2(enr.date)}` : chk?.enrichmentOk ? "OK at today's check" : "none recorded"}</span>${ops ? html`<button type="button" class="text-btn" data-flow="enrich" data-arg="${flowArg({ roomId: r.id })}">Add</button>` : ""}</div>` : ""}
        ${f ? html`<a class="row no-lead pg-kv" href="#/l/${lid}/batch/${b.id}"><span class="main"><span class="primary">Deaths in batch</span></span><span class="v ${f.mortPct * 100 > f.targetMort ? "due" : ""}">${f.died} (${pctText(f.mortPct)})</span><span class="chev">${raw(icon("chevron"))}</span></a>
          <a class="row no-lead pg-kv" href="#/l/${lid}/batch/${b.id}"><span class="main"><span class="primary">Batch ${batchName(b)}</span><span class="secondary">FCR, growth, feed, ship date</span></span><span class="chev">${raw(icon("chevron"))}</span></a>` : ""}</div></div>
      ${ops && occupied ? html`<div class="pg-acts">${A("death", "Death", { roomId: r.id }, "alert")}${A(r.kind === "farrowing" ? "treatSow" : "treat", "Treat", { roomId: r.id, batchId: b?.id }, "syringe")}${r.kind === "farrowing" ? A("weaned", "Wean", { roomId: r.id }, "scale") : A("pigsOut", "Pigs out", { batchId: b?.id }, "truck")}${A("readings", "Readings", { roomId: r.id }, "water")}</div>` : ""}
      ${ops && !occupied && x.wash.ready ? html`<div class="pg-acts">${r.kind === "farrowing" ? A("intoCrate", "Sows into crates", {}, "birth") : A("pigsIn", "Pigs in", { roomId: r.id }, "truck")}${r.kind !== "farrowing" ? A("moveBatch", "Move a batch here", { toRoomId: r.id }, "house") : ""}</div>` : ""}
    </div>`;
  }, after: (node, snap) => {
    node.querySelector(".large-title .context")?.style.setProperty("white-space", "pre-line");
    node.querySelectorAll("[data-crates] [data-crate]").forEach((b) => (b.onclick = () => { if (canWrite(snap.role, "litters")) crateSheet(snap, { roomId: id, crate: +b.dataset.crate }); }));
    node.querySelectorAll("[data-wash]").forEach((b) => (b.onclick = async () => (await import("../flows/rooms.js")).washSheet(snap, { roomId: id, stage: b.dataset.wash })));
    if (!opened) { opened = true; if (canWrite(snap.role, "litters")) setTimeout(() => crateSheet(snap, { roomId: id, crate: +g.crate }), 350); }
  } });
}

function washHtml(snap, x) {
  const w = x.wash; const at = w.at || {}; const i = WASH.indexOf(w.stage); const can = canWrite(snap.role, "rooms");
  const by = x.room.wash?.by || {};
  return html`<div class="section pg-wash">${groupLabel(`Wash cycle${w.emptyDays != null ? ` · empty ${plural(w.emptyDays, "day")}` : ""}`)}
    <div class="list">${WASH.map((s, j) => { const done = at[s] || (s === "ready" && w.ready); const next = j === i + 1;
      return html`<div class="row no-lead"><span class="main"><span class="primary">${WASH_WORD[s]}</span><span class="secondary">${done && at[s] ? `${dm(String(at[s]).slice(0, 10))} ${String(at[s]).slice(11, 16)}${by[s] ? " · " + by[s].split(" ")[0] : ""}${s === "disinfected" && x.room.wash?.product ? ` · ${x.room.wash.product}${x.room.wash.dilution ? " " + x.room.wash.dilution : ""}` : ""}` : WASH_HELP[s]}</span></span>
        ${done ? html`<span class="done">✓</span>` : next && can ? html`<span class="next"><button type="button" class="btn" data-wash="${s}">${s === "ready" ? "Mark ready" : "Done"}</button></span>` : html`<span class="ink-3">—</span>`}</div>`; })}</div>
    <p class="pg-note">Cleaning and disinfecting between batches is Red Tractor BI.12 — this list is the evidence. A room takes pigs only when it's Ready, unless you choose “Fill anyway”.</p></div>`;
}
export { kvRows, daysBetween, el };
