// NI Bird Register return, 1 June (design/15 §21): birds alive in placed crops on the count date,
// one entry per establishment number (the new name for the flock code), split by house. The
// NISRA online survey is filled in by the farmer from the letter's access code; the app keeps
// the figures and the date sent.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel, backLink } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { kvRows, n0, dm, note, lawNote, shareText } from "../ui.js";
import { birdsOn } from "../model/registers.js";
import { regionRule } from "../model/content.js";
import { daysBetween } from "../model/time.js";

/** The count to show: this year's 1 June until its return is recorded, then next year's. */
export function birdRegYear(snap) {
  const y = +snap.today.slice(0, 4); const md = regionRule("inventories").birdsCountMonthDay || "06-01";
  const sent = (snap.data.birdRegisterReturns || []).some((r) => !r.deleted && r.year === y);
  return snap.today > `${y}-${md}` && sent ? y + 1 : y;
}
/** Entries per establishment number: [{ est, houses: [{house, day, birds}], birds }] */
export function byEstablishment(snap, date) {
  const b = birdsOn(snap.ix, date); const m = new Map();
  for (const x of b.byHouse) { const k = x.est || snap.s.establishmentNo || ""; if (!m.has(k)) m.set(k, { est: k, houses: [], birds: 0 }); const e = m.get(k); e.houses.push(x); e.birds += x.birds; }
  return [...m.values()];
}

export default async function birdreg(ctx) {
  return liveScreen(ctx, { title: "Bird Register", tab: "paperwork", paint,
    after: (node, snap) => node.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => { const r = await shareText("Bird Register", b.dataset.copy); toast(r === "copied" ? "Figures copied" : r ? "Shared" : "Couldn't copy"); })) });
}

function paint(snap) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const y = birdRegYear(snap); const md = regionRule("inventories").birdsCountMonthDay || "06-01"; const date = `${y}-${md}`;
  const ests = byEstablishment(snap, date); const future = snap.today < date;
  const done = (snap.data.birdRegisterReturns || []).filter((r) => !r.deleted && r.year === y);
  const can = canWrite(snap.role, "birdRegisterReturns");
  const far = future && daysBetween(snap.today, date) > 42;
  const last = (snap.data.birdRegisterReturns || []).filter((r) => !r.deleted).sort((a, b) => b.year - a.year)[0];
  return html`<div>${backLink(L("paperwork"), "Paperwork")}${largeTitle(`Bird Register · ${dm(date).slice(4)} ${y}`, far ? "Next count" : future ? "Expected count from your crop plans" : "Birds alive on the count date")}
    <div class="info-card">${raw(icon("info"))}<span>Count birds on 1 June — one entry for each establishment number. Have your 12-digit access code from the NISRA letter ready.</span></div>
    ${far ? html`<div class="section">${groupLabel("On 1 June")}<p class="br-quiet">The count is worked out from your crops on the day — come back from 25 May. Last return: ${done.length ? "sent" : last ? `${last.year}, ${n0(last.birds)} birds, sent ${dm(last.submittedOn)}` : "none recorded"}.</p></div>` : ests.map((e) => { const sent = done.find((r) => (r.establishmentNo || "") === e.est); const text = `Bird Register ${y} · establishment ${e.est || "—"} · broilers on 1 June: ${e.birds}`;
      return html`<div class="section">${groupLabel(`Establishment ${e.est || "— add it in Houses"}`, sent ? `sent ${dm(sent.submittedOn)}` : "")}
        ${kvRows([["Birds on 1 June", n0(e.birds), "", null, future ? "birds alive in crops placed by then — check on the day" : "alive in placed crops that day"], ...e.houses.map((x) => [x.house, n0(x.birds), "", null, x.day != null ? `day ${x.day}` : "empty"])])}
        <div class="br-acts br-acts2"><button type="button" class="btn secondary" data-copy="${text}">${raw(icon("copy"))}Copy the figures</button>${can ? html`<button type="button" class="btn${sent ? " secondary" : ""}" data-flow="birdReturn" data-arg="${flowArg({ year: y, birds: e.birds, establishmentNo: e.est, byHouse: e.houses.map((x) => ({ house: x.house, birds: x.birds })) })}">${raw(icon("check"))}${sent ? "Sent again" : "Mark as sent"}</button>` : ""}</div></div>`; })}
    ${note("Open the NISRA online survey from the link in your letter. If no crop is in the houses on 1 June the count is 0 and the return is still recorded.")}
    ${lawNote("The 1 June count for the NI Bird Register is collected by NISRA's online survey, one entry per establishment number. Farm Ledger reminds you from 25 May.")}
    <a class="btn secondary br-mt" href="${L("paperwork/birdreg")}">Past returns</a></div>`;
}
