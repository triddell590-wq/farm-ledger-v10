// The simple dated logs (model/logs.js) as lists (#/l/<id>/logs/<kind>): alarm tests, visitors,
// rodent control, feed deliveries, bird movements, vet health plan, manure, housing periods,
// biosecurity. Each has an Add button (workers can add the operational ones), the newest entries,
// and Print / CSV of the register. Alarm tests also show each house's last test against 7 days.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { daysBetween } from "../../../core/dates.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { dm, n0, pill, kvRows, docButtons } from "../ui.js";
import { LOGS } from "../model/logs.js";
import { buildRegister } from "../model/registers.js";
import { sortedHouses, flockIn } from "../model/flock.js";


const HOUSE_LOGS = ["feed", "alarm", "manure"]; // these live under Houses; the rest under Paperwork
export default async function logs(ctx) {
  const kind = ctx.match.groups.kind;
  return liveScreen(ctx, { title: LOGS[kind]?.title || "Log", tab: HOUSE_LOGS.includes(kind) ? "houses" : "more", paint: (snap) => paint(snap, kind), after: (node, snap) => {
    const s = node.querySelector("[data-docs]"); if (s && LOGS[kind]) s.replaceWith(docButtons(() => buildRegister(snap.c, kind, { from: "2000-01-01" })));
  } });
}

function paint(snap, kind) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const Lg = LOGS[kind];
  const back = HOUSE_LOGS.includes(kind) ? backLink(L("houses"), "Houses") : backLink(L("layers-paperwork"), "Paperwork");
  if (!Lg) return html`<div>${back}${largeTitle("Not found")}</div>`;
  const list = [...(snap.data[Lg.coll] || [])].sort((a, b) => String(b.date || b.from).localeCompare(String(a.date || a.from)));
  const hn = (id) => (id ? snap.data.houses.find((h) => h.id === id)?.name || "" : "All houses");
  const can = canWrite(snap.role, Lg.coll);
  const add = can ? html`<button type="button" class="btn" data-flow="log" data-arg='${flowArg({ kind })}'>${raw(icon("plus"))}Add ${Lg.one}</button>` : "";
  return html`<div>${back}${largeTitle(Lg.title, Lg.sub)}
    ${kind === "alarm" ? alarmState(snap) : ""}
    ${kind === "manure" ? manureNotes(snap) : ""}
    ${add}
    <div class="section">${groupLabel("Recorded", list.length || "")}
      ${list.length ? html`<div class="list">${list.slice(0, 40).map((r) => row(kind, r, hn))}</div>${list.length > 40 ? html`<p class="ly-cap">Showing the latest 40 — print or CSV for all ${n0(list.length)}.</p>` : ""}`
        : emptyState({ sector: "layers", title: `No ${Lg.one}s yet`, body: Lg.sub, action: null })}</div>
    ${list.length ? html`<div class="section"><div data-docs></div></div>` : ""}</div>`;
}

function row(kind, r, hn) {
  const t = (title, sub, right = "") => html`<div class="row no-lead"><span class="main"><span class="primary">${title}</span><span class="secondary">${sub}</span></span>${right}</div>`;
  const by = r.byName ? ` · ${r.byName}` : "";
  switch (kind) {
    case "alarm": return t(`${dm(r.date)} · ${hn(r.houseId)}`, `${r.what || "Alarm"}${r.action ? ` · ${r.action}` : ""}${by}`, r.result === "Fault found" ? pill("late", "Fault") : pill("ok", "Working"));
    case "visitors": return t(`${r.name}${r.company ? ` · ${r.company}` : ""}`, `${dm(r.date)} ${r.timeIn || ""} · ${r.reason || ""} · other poultry: ${(r.lastPoultry || "").toLowerCase()}`, r.lastPoultry === "Within 72 hours" ? pill("due", "< 72 h") : "");
    case "rodent": return t(`${dm(r.date)} · ${r.controller || ""}`, `${r.findings || ""}${r.report ? ` · report ${r.report}` : ""}`, r.findings === "Heavy activity" ? pill("due", "Heavy") : "");
    case "feed": return t(`${dm(r.date)} · ${n0(r.kg)} kg`, `${hn(r.houseId)}${r.ration ? ` · ${r.ration}` : ""}${r.mill ? ` · ${r.mill}` : ""}${r.ticket ? ` · ${r.ticket}` : ""}`, !r.ufas || !r.sample ? pill("due", !r.ufas ? "Not UFAS" : "No sample") : "");
    case "moves": return t(`${dm(r.date)} · ${r.direction === "in" ? "In" : "Out"} ${n0(r.n)}`, `${hn(r.houseId)} · ${{ placement: "pullets placed", depop: "spent hens", pullets: "pullets", spent: "spent hens" }[r.kind] || r.kind || ""}${r.est ? ` · ${r.est}` : ""}`, r.direction === "out" && !r.fci ? pill("due", "FCI?") : "");
    case "healthPlan": return t(`${dm(r.date)} ${String(r.date).slice(0, 4)} · ${r.vet || ""}`, `${hn(r.houseId)}${r.next ? ` · next review ${dm(r.next)} ${r.next.slice(0, 4)}` : ""}${r.note ? ` · ${r.note}` : ""}`);
    case "manure": return t(`${dm(r.date)} · ${r.tonnes} t`, `${hn(r.houseId)} · ${r.destination || ""}${r.ref ? ` · ${r.ref}` : ""}`, r.heapCovered === false ? pill("due", "Heap") : "");
    case "housing": return t(`${r.reason || "Kept in"} · ${hn(r.houseId)}`, `${dm(r.from)} – ${r.to ? dm(r.to) : "still in"}`);
    case "biosecurity": { const n = Object.keys(r).filter((k) => /^c\d$/.test(k) && r[k]).length; return t(dm(r.date), `${n} checks ticked${by}`); }
    default: return t(dm(r.date), "");
  }
}

function alarmState(snap) {
  const c = snap.c; const T = snap.today; const every = +snap.s.alarmEveryDays || 7;
  const hs = sortedHouses(c).filter((h) => flockIn(c, h.id) || snap.data.alarmTests.some((a) => a.houseId === h.id));
  if (!hs.length) return "";
  const last = (h) => [...snap.data.alarmTests].filter((a) => !a.houseId || a.houseId === h.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  return html`<div class="section">${kvRows(hs.map((h) => { const l = last(h); const age = l ? daysBetween(l.date, T) : null; const late = age == null || age > every;
    return [h.name, l ? (age === 0 ? "Today" : `${age} day${age === 1 ? "" : "s"} ago`) : "Never", late ? "late" : age >= every - 1 ? "due" : "ok", null, l ? `${dm(l.date)} · ${l.result}` : "No test recorded"]; }))}
    <p class="ly-cap">Test the ventilation alarm at least every ${every} days (legal).</p></div>`;
}

function manureNotes(snap) {
  const places = snap.data.houses.reduce((t, h) => t + (+h.places || 0), 0);
  const yr = snap.today.slice(0, 4); const t = snap.data.manure.filter((m) => String(m.date).startsWith(yr)).reduce((a, m) => a + (+m.tonnes || 0), 0);
  return html`<div class="section">${kvRows([
    ["Out this year", `${n0(t)} t`, null, null, "Goes into the farm's nitrogen and phosphorus balance"],
    ["Bird places", n0(places), places >= 40000 ? "due" : "", null, places >= 40000 ? "40,000 places or more: the unit needs a PPC permit — keep its date and conditions with your documents" : "Under 40,000 places: no PPC permit needed"],
  ])}<p class="ly-cap">Field heaps: cover within 24 hours and move within 120 days. Keep each export's form reference.</p></div>`;
}
