// One thin or clear-out (design/15 §7): what is planned (catch, birds, plant, feed off), the paper
// chain before the birds go — Salmonella in its window, FCI sent 24 h before arrival, no medicine
// in withdrawal, feed off ≤ 9 h — and, once done, the processor docket. Route thinId "new-thin" /
// "new-clear" is a planned day with no record yet (from To do and Coming up).
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel, backLink } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { kvRows, pill, n0, n1, dm, when, lawNote } from "../ui.js";
import { cropDay, cropEvents, listOf, aliveEnd } from "../model/crop.js";
import { salmWindow, sampleFor, salmResultText, salmPositive, fciSendBy, feedOffDefault, feedOffLevel, withdrawalClashes, withdrawalEnd } from "../model/paper.js";
import { datePart } from "../model/time.js";

export default async function thin(ctx) {
  const { cropId, thinId } = ctx.match.groups;
  return liveScreen(ctx, { title: "Thin and clear-out", tab: "crop", paint: (snap) => paint(snap, cropId, thinId) });
}

/** The paper chain for a catch: [{ label, text, level, pill }] (shared with the thin sheet's rules). */
export function chainRows(snap, crop, ev) {
  const t = ev.rec; const catchAt = t?.catchAt || `${ev.date}T02:00`; const date = datePart(catchAt);
  const smp = sampleFor(snap.ix, crop, { date, day: ev.day }, snap.s);
  const fci = t ? listOf(snap.ix.fci, crop.id).find((f) => f.thinId === t.id && f.sentAt) : null;
  const sendBy = fciSendBy(catchAt, snap.s, t?.arrivalAt);
  const clash = withdrawalClashes(snap.ix, crop, date);
  const win = salmWindow(date, snap.s, ev.day); const wk = win.days % 7 ? `${win.days} days` : `${win.days / 7} weeks`;
  const sw = snap.today > win.doBy ? { lv: "late", p: "Missing", text: `No sample in the ${wk} before this catch` }
    : snap.today >= win.from ? { lv: "due", p: `Take by ${dm(win.doBy)}`, text: `Boot swabs within ${wk} before this catch` }
    : { lv: "", p: `Opens ${dm(win.from)}`, text: `Boot swabs within ${wk} before this catch` };
  const fo = feedOffLevel(t?.feedOffAt || feedOffDefault(catchAt, snap.s), catchAt);
  return [
    { k: "Feed off", v: `${when(t?.feedOffAt || feedOffDefault(catchAt, snap.s))} · ${fo.text}`, lv: fo.level, p: fo.level === "ok" ? "OK" : fo.level === "due" ? "Over 9 h" : "Over 12 h" },
    { k: "Salmonella", v: smp ? `Sampled ${dm(smp.date)} · ${salmResultText(smp.result)}` : sw.text, lv: !smp ? sw.lv : salmPositive(smp) ? "late" : smp.result === "negative" ? "ok" : "due", p: !smp ? sw.p : salmPositive(smp) ? "Positive" : smp.result === "negative" ? "Negative" : "Waiting", href: `#/l/${snap.lid}/salm/${crop.id}` },
    { k: "FCI", v: fci ? `Sent ${when(fci.sentAt)}${fci.sentTo ? ` to ${fci.sentTo}` : ""}` : `Send by ${when(sendBy)} (24 h before arrival)`, lv: fci ? "ok" : snap.now > sendBy ? "late" : "due", p: fci ? "Sent" : snap.now > sendBy ? "Late" : "Not sent", href: t ? `#/l/${snap.lid}/fci/${crop.id}/${t.id}` : null },
    { k: "Medicines", v: clash.length ? `${clash[0].product}: withdrawal ends ${dm(withdrawalEnd(clash[0]))} — after the catch` : "None in withdrawal", lv: clash.length ? "late" : "ok", p: clash.length ? "Blocks" : "Clear" },
  ];
}

function paint(snap, cropId, thinId) {
  const { ix, s, lid } = snap; const L = (h) => `#/l/${lid}/${h}`;
  const crop = ix.cropById.get(cropId); const back = backLink(L("crop"), "Crop");
  if (!crop) return html`<div>${back}${largeTitle("Crop not found")}</div>`;
  const house = ix.houseById.get(crop.houseId) || {}; const evs = cropEvents(ix, crop, s);
  const ev = thinId.startsWith("new-") ? evs.find((e) => !e.rec && e.kind === thinId.slice(4)) || evs.find((e) => e.kind === thinId.slice(4)) : evs.find((e) => e.rec?.id === thinId);
  if (!ev) return html`<div>${back}${largeTitle("Not found", "This thin or clear-out was removed")}</div>`;
  const t = ev.rec; const kind = ev.kind === "clear" ? "Clear-out" : "Thin"; const done = t?.status === "done";
  const can = canWrite(snap.role, "thins") && !crop.clearedDate;
  const rows = chainRows(snap, crop, ev);
  const d = t?.docket;
  return html`<div>${back}
    ${largeTitle(`${kind} · ${house.name || ""}`, `Crop ${crop.no || ""} · day ${ev.day} · ${dm(ev.date)}${done ? " · done" : t ? " · planned" : " · not planned yet"}`)}
    <div class="section">${kvRows([
      ["Catch", t ? when(t.catchAt) : `${dm(ev.date)} — set the time`],
      ["Birds", done ? n0(t.birds) : ev.kind === "clear" ? `all remaining · ${n0(aliveEnd(ix, crop, snap.today))} now` : t?.birds ? `${n0(t.birds)} planned` : "—"],
      t?.avgKg ? ["Average weight", `${n1(t.avgKg, 2)} kg`] : null,
      ["Processor", [t?.processor || s.processor, t?.destination || s.processorPlant].filter(Boolean).join(" · ") || "—"],
      done && t.crew?.name ? ["Catching crew", `${t.crew.name}${t.crew.glaa ? ` · GLAA ${String(t.crew.glaa).replace(/^GLAA\s*/i, "")}` : ""}`, t.crew.glaa ? "" : "due", null, t.crew.glaa ? "" : "add the GLAA licence number"] : null,
    ])}</div>
    <div class="section">${groupLabel("Before the birds go")}<div class="list br-chain">${rows.map((r) => r.href ? html`<a class="row no-lead" href="${r.href}"><span class="main"><span class="primary">${r.k}</span><span class="secondary">${r.v}</span></span>${pill(r.lv, r.p, "")}<span class="chev">${raw(icon("chevron"))}</span></a>` : html`<div class="row no-lead"><span class="main"><span class="primary">${r.k}</span><span class="secondary">${r.v}</span></span>${pill(r.lv, r.p, "")}</div>`)}</div>
      ${lawNote("Saving is blocked while a medicine withdrawal runs past the catch, without a Salmonella sample in its window, or with feed off more than the legal 12 hours.")}</div>
    ${can && !done ? html`<div class="br-acts br-acts2">${t ? "" : html`<button type="button" class="btn secondary" data-flow="${ev.kind === "clear" ? "planClear" : "planThin"}" data-arg="${flowArg({ cropId: crop.id, day: ev.day })}">Plan the catch</button>`}<button type="button" class="btn" data-flow="${ev.kind === "clear" ? "clear" : "thin"}" data-arg="${flowArg({ cropId: crop.id, thinId: t?.id })}">${raw(icon("truck"))}Record ${kind.toLowerCase()}</button></div>` : ""}
    ${done ? html`<div class="section">${groupLabel("Processor docket")}${d ? kvRows([["Birds received", n0(d.received)], ["Total live kg", n0(d.kg)], ["Average", d.kg && d.received ? `${(d.kg / d.received).toFixed(2)} kg` : "—"], ["Dead on arrival", d.doa ?? "—"], ["Rejections", d.rejPct != null ? `${d.rejPct}%` : "—", d.rejPct > 1.5 ? "due" : ""], ["Footpad score", d.footpad ?? "—"], ["Hock burn", d.hockPct != null ? `${d.hockPct}%` : "—"]]) : html`<p class="br-quiet">Add the processor's figures when the docket comes: birds received, kg, DOAs, rejections, footpad and hock burn.</p>`}
      ${canWrite(snap.role, "thins") ? html`<button type="button" class="btn secondary br-mt" data-flow="docket" data-arg="${flowArg({ cropId: crop.id, thinId: t.id })}">${raw(icon("document"))}${d ? "Edit docket" : "Add docket"}</button>` : ""}</div>` : ""}
    ${done && ev.kind === "clear" ? html`<a class="btn secondary br-mt" href="${L(`turnaround/${crop.houseId}`)}">${raw(icon("clock"))}Turnaround · ${house.name || ""}</a>` : ""}
    ${t ? html`<a class="btn secondary br-mt" href="${L(`fci/${crop.id}/${t.id}`)}">${raw(icon("document"))}Food Chain Information</a>` : ""}
  </div>`;
}
export { cropDay };
