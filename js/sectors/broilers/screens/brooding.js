// Brooding checklist, days 0–3 and day 7 (design/15 §5): pre-heat and litter temperature,
// ready-for-chicks checks, chicks arrived (delivery note), crop-fill at 8 h and 24 h, chick
// behaviour days 1–3, the 7-day weight and mortality. Each row shows when it's due, the reading,
// the time and who. A chick quality complaint can be sent to the integrator in days 0–7.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel, backLink, emptyState } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { pill, n0, pc, dm, when, note, lawNote } from "../ui.js";
import { currentCrop, cropDay, dateOfDay, mort7Pct, listOf } from "../model/crop.js";
import { stdOf, stdWt } from "../model/growth.js";
import { addHours, at, timePart } from "../model/time.js";

export default async function brooding(ctx) {
  const cropId = ctx.match?.groups?.cropId;
  return liveScreen(ctx, { title: "Brooding", tab: "crop", paint: (snap) => paint(snap, cropId) });
}

/** The crop the brooding screen shows: the route's, else the youngest crop placed in the last 10 days (or due). */
function pick(snap, cropId) {
  if (cropId) return snap.ix.cropById.get(cropId) || null;
  const cur = snap.ix.houses.map((h) => currentCrop(snap.ix, h.id)).filter(Boolean).sort((a, b) => b.placedDate.localeCompare(a.placedDate));
  return cur.find((c) => cropDay(c, snap.today) <= 10) || null;
}

function paint(snap, cropId) {
  const { ix, s, today, lid } = snap; const L = (h) => `#/l/${lid}/${h}`;
  const back = backLink(L(cropId ? "crop" : "more"), cropId ? "Crop" : "More");
  const crop = pick(snap, cropId);
  if (!crop) return html`<div>${back}${largeTitle("Brooding set-up", "Days 0–3 and day 7")}
    ${emptyState({ sector: "broilers", title: "No chicks in brooding", body: "The checklist opens for each crop from pre-heat to day 7. Start a crop when chicks are placed.", action: ix.houses.length && canWrite(snap.role, "crops") ? "Start a crop" : null, actAttr: `data-flow="startCrop"` })}
    ${targets(snap)}</div>`;
  const house = ix.houseById.get(crop.houseId) || {}; const b = ix.brooding.get(crop.id) || {}; const day = cropDay(crop, today);
  const std = stdOf(crop, s); const can = canWrite(snap.role, "brooding");
  const placedAt = at(crop.placedDate, crop.placedTime || b.chicksArrived?.time || "06:00");
  const by = (x) => (x?.by ? ` · ${String(x.by).split(" ")[0]}` : "");
  const ca = b.chicksArrived || {};
  const beh = b.behaviour || {};
  const rows = [
    { k: "preheat", when: `${when(addHours(placedAt, -48))} – ${when(addHours(placedAt, -24))}`, t: "Pre-heat on · litter temperature", done: !!b.preheat, v: b.preheat ? `${dm(b.preheat.date)}${b.preheat.time ? " " + b.preheat.time : ""} · litter ${b.preheat.litterC ?? "—"} °C${b.preheat.airC ? ` · air ${b.preheat.airC} °C` : ""}${by(b.preheat)}` : "Target 28–30 °C litter, 30–33 °C air", lv: b.preheat && +b.preheat.litterC && +b.preheat.litterC < 28 ? "due" : null },
    { k: "prep", when: when(addHours(placedAt, -4)), t: "Ready for chicks", done: !!b.prep, v: b.prep ? ["flushed", "paper", "drinkers"].map((x) => (b.prep[x] ? { flushed: "lines flushed", paper: "feed on paper", drinkers: "drinker height" }[x] : null)).filter(Boolean).join(" · ") + by(b.prep) : "Water lines flushed · feed on paper · drinker height" },
    { k: null, when: when(placedAt), t: "Chicks arrived", done: !!ca.n || !!crop.placed, v: `${n0(ca.n || crop.placed)} on the delivery note${ca.hatchery || crop.hatchery ? ` · ${ca.hatchery || crop.hatchery}` : ""}${ca.parentFlock || crop.parentFlock ? ` · flock ${ca.parentFlock || crop.parentFlock}` : ""}${ca.doa != null ? ` · ${ca.doa} DOA` : ""}` },
    { k: "cropFill8h", when: when(addHours(placedAt, 8)), t: "Crop-fill at 8 hours", done: b.cropFill8h != null, v: b.cropFill8h != null ? `${b.cropFill8h}% of 100 chicks · ${timePart(b.cropFill8hAt)}` : `Feel 100 chicks · target ${s.cropFill8h}% or more`, lv: b.cropFill8h != null && b.cropFill8h < s.cropFill8h ? "due" : null },
    { k: "cropFill24h", when: when(addHours(placedAt, 24)), t: "Crop-fill at 24 hours", done: b.cropFill24h != null, v: b.cropFill24h != null ? `${b.cropFill24h}% · ${timePart(b.cropFill24hAt)}` : `Target ${s.cropFill24h}% or more`, lv: b.cropFill24h != null && b.cropFill24h < s.cropFill24h ? "due" : null },
    { k: "behaviour", when: `${dm(dateOfDay(crop, 1))} – ${dm(dateOfDay(crop, 3))}`, t: "Chick behaviour, days 1–3", done: ["d1", "d2", "d3"].every((d) => beh[d]), v: ["d1", "d2", "d3"].map((d) => (beh[d] ? `D${d.slice(1)} ${{ spread: "spread", huddled: "huddled", panting: "panting", draught: "draught" }[beh[d].spread] || beh[d].spread}` : null)).filter(Boolean).join(" · ") || "Spread · huddled (cold) · panting (hot)", lv: ["d1", "d2", "d3"].some((d) => beh[d] && beh[d].spread !== "spread") ? "due" : null },
    { k: "day7", when: dm(dateOfDay(crop, 7)), t: "7-day weight and mortality", done: !!b.day7, v: b.day7 ? `${n0(b.day7.g)} g vs ${n0(stdWt(std, 7))} g ${std.hybrid} · mortality ${pc(b.day7.mortPct, 2)}` : `${std.hybrid} objective ${n0(stdWt(std, 7))} g · mortality so far ${pc(mort7Pct(ix, crop), 2)}`, lv: b.day7 && (b.day7.g < stdWt(std, 7) * 0.95 || b.day7.mortPct > s.mort7TargetPct) ? "due" : null },
  ];
  const n = rows.filter((r) => r.done).length;
  return html`<div>${back}
    ${largeTitle("Brooding", `${house.name || ""} · crop ${crop.no || ""} · ${day < 0 ? `chicks ${dm(crop.placedDate)}` : `day ${day}`} · ${n} of ${rows.length} done`)}
    <div class="list br-brood-list">${rows.map((r) => {
      const inner = html`<span class="tile ${r.done ? (r.lv ? "due" : "ok") : ""}">${raw(icon(r.done ? (r.lv ? "alert" : "check") : "clock"))}</span><span class="main"><span class="primary">${r.t}</span><span class="secondary">${r.when}</span><span class="secondary">${r.v}</span></span>${r.done && r.lv ? pill("due", "Check") : ""}`;
      return r.k && can ? html`<button type="button" class="row" data-flow="brooding" data-arg="${flowArg({ cropId: crop.id, step: r.k })}">${inner}<span class="chev">${raw(icon("chevron"))}</span></button>` : html`<div class="row">${inner}</div>`;
    })}</div>
    ${b.complaint ? html`<div class="section">${groupLabel("Chick quality complaint")}<div class="card pad t-callout">Sent ${dm(b.complaint.at)} · ${b.complaint.what}</div></div>` : ""}
    ${can && day <= 7 ? html`<button type="button" class="btn secondary br-mt" data-flow="complaint" data-arg="${flowArg({ cropId: crop.id })}">${raw(icon("alert"))}${b.complaint ? "Update the chick complaint" : "Chick quality complaint"}</button>` : ""}
    ${lawNote("Crop-fill and temperature targets are breed company guidance, not law — change them in Broiler settings.")}
    ${targets(snap)}</div>`;
}

function targets(snap) {
  const s = snap.s;
  return html`<div class="section">${groupLabel("Targets")}<div class="card pad br-rules"><ul><li>Pre-heat 24–48 hours before: litter 28–30 °C, air 30–33 °C</li><li>Crop-fill: ${s.cropFill8h}% at 8 hours, ${s.cropFill24h}% at 24 hours</li><li>7-day mortality ${s.mort7TargetPct}% or under</li><li>Dark period from day 7: at least 6 hours, 4 unbroken</li></ul></div>${note("Breed company guidance (Aviagen / Cobb). Edit the targets in Broiler settings.")}</div>`;
}
export { listOf };
