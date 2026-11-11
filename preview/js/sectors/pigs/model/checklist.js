// Red Tractor Pigs checklist (design/13 §8.7). Versioned content: header and items live here.
// Items with `auto` are evidenced by the ledger's own records; the rest are ticked by the
// owner/manager with a date and note (meta rtChecklist). K = Key standard.
import { addDays, daysBetween } from "./dates.js";
import { alarmState, houses, spaceBadge } from "./rooms.js";
import { qvrState, checkState, notifyState } from "./paperwork.js";
import { crateEntryCheck } from "./sows.js";
import { roomFacts } from "./facts.js";

export const HEADER = "Based on Red Tractor Pigs Standards version 5.2, February 2026. Not endorsed by Red Tractor. Audited in Northern Ireland by NIFCC.";
export const HEADER_NOTE = "If your farm uses the old NIPQA name, it is the same Red Tractor Pigs standard.";
const ok = (text) => ({ state: "ok", text }); const due = (text) => ({ state: "due", text }); const gap = (text) => ({ state: "gap", text });
const L = (c, h) => `#/l/${c.lid}/${h}`;
const live = (a) => a.filter((r) => !r.deleted);

export const SECTIONS = [["dp", "Documents & farm map"], ["ti", "Traceability"], ["ah", "Animal health"], ["hp", "Husbandry"], ["hf", "Housing & farrowing"], ["bi", "Biosecurity"], ["fw", "Feed & water"], ["vc", "Vermin"], ["pl", "People"], ["lt", "Transport"]];

export const ITEMS = [
  { id: "DP.1.1", sec: "dp", key: true, text: "Farm map with usable space per pen, pig numbers by weight, feeder/drinker ratios (new Feb 2026)", auto: (c) => { const r = c.data.rooms.filter((x) => x.kind !== "farrowing"); const noArea = r.filter((x) => !(x.pens || []).some((p) => +p.areaM2)); return !r.length ? gap("Add your rooms and pens") : noArea.length ? due(`${noArea.length} room${noArea.length > 1 ? "s" : ""} without pen areas`) : ok(`Space table from ${r.length} rooms (Tools → Space per pen)`); }, href: (c) => L(c, "tools/space") },
  { id: "DP.2", sec: "dp", text: "Emergency plan", auto: (c) => plan(c, "emergency") },
  { id: "HF.2.1", sec: "dp", text: "Extreme weather contingency plan", auto: (c) => plan(c, "weather") },
  { id: "TI.1", sec: "ti", key: true, text: "Pigs identified (ear tag, tattoo or slap mark — NI: one shoulder)" },
  { id: "TI.2", sec: "ti", key: true, text: "Movement records kept 3 years (PM1)", auto: (c) => { const late = live(c.data.moves).filter((m) => notifyState(m, c.today).level === "late"); return late.length ? gap(`${late.length} move${late.length > 1 ? "s" : ""} not notified within 7 days`) : ok(`${live(c.data.moves).length} moves in the movement book`); }, href: (c) => L(c, "reg/pm1") },
  { id: "TI.3", sec: "ti", key: true, text: "Food Chain Information with every slaughter load", auto: (c) => { const loads = live(c.data.moves).filter((m) => m.direction === "off" && m.toSlaughter); const miss = loads.filter((m) => !m.fci?.withdrawals); return !loads.length ? ok("No slaughter loads yet") : miss.length ? gap(`${miss.length} load${miss.length > 1 ? "s" : ""} without FCI`) : ok(`FCI on all ${loads.length} loads`); } },
  { id: "TI.7", sec: "ti", text: "Breeding stock and semen supplier records kept 6 years", auto: (c) => (live(c.data.semen).length || live(c.data.sows).some((s) => s.source) ? ok("Semen and breeding-stock sources recorded") : c.s.breeding ? due("Add semen and gilt suppliers") : ok("No breeding herd")) },
  { id: "AH.1", sec: "ah", key: true, text: "Veterinary health plan incl. Salmonella control and injurious behaviour action plan", auto: (c) => plan(c, "health") },
  { id: "AH.2", sec: "ah", text: "Mortality (date, location, cause), daily suckling-pig mortality summary, injurious behaviour incidents", auto: (c) => { const d = live(c.data.deaths); const nc = d.filter((x) => !x.cause); return nc.length ? gap(`${nc.length} death${nc.length > 1 ? "s" : ""} without a cause`) : ok(`${d.length} deaths and ${live(c.data.tailBites).length} tail-bite incidents recorded`); }, href: (c) => L(c, "reg/mortality") },
  { id: "AH.9.4", sec: "ah", text: "Euthanasia: checked for signs of life", auto: (c) => { const e = live(c.data.deaths).filter((x) => x.cause === "Put down"); const miss = e.filter((x) => !x.euthanasia?.checked); return miss.length ? gap(`${miss.length} without the check`) : ok(e.length ? `${e.length} recorded with the check` : "None put down"); } },
  { id: "AH.10.1", sec: "ah", key: true, text: "Quarterly vet visit (QVR), never more than 20 weeks apart", auto: (c) => { const q = qvrState(live(c.data.vetVisits), c.today); return !q.last ? gap("No QVR recorded") : q.level === "late" ? gap(`${q.weeks} weeks since the last`) : q.level === "due" ? due(`${q.weeks} weeks — book by ${q.nextBy}`) : ok(`Last ${q.last.date} (${q.last.vet || "vet"})`); }, href: (c) => L(c, "qvr") },
  { id: "AH.5.1", sec: "ah", text: "QVR actions done", auto: (c) => { const open = live(c.data.vetVisits).flatMap((v) => (v.actions || []).filter((a) => !a.done && a.due && a.due < c.today)); return open.length ? gap(`${open.length} action${open.length > 1 ? "s" : ""} past due`) : ok("No overdue actions"); } },
  { id: "AH.12", sec: "ah", key: true, text: "Permanent enrichment", auto: (c) => { const rooms = c.data.rooms.filter((r) => r.batchId); const stale = rooms.filter((r) => !live(c.data.enrichment).some((e) => e.roomId === r.id && daysBetween(e.date, c.today) <= 7) && !live(c.data.roomChecks).some((k) => k.roomId === r.id && k.enrichmentOk && daysBetween(k.date, c.today) <= 1)); return stale.length ? due(`${stale.length} room${stale.length > 1 ? "s" : ""} with no enrichment record this week`) : ok("Enrichment recorded in every occupied room"); }, href: (c) => L(c, "reg/enrichment") },
  { id: "HP.3.1", sec: "hp", key: true, text: "Yearly tail-biting risk assessment + action plan; no routine tail docking", auto: (c) => { const k = checkState(live(c.data.siteChecks), "tailRisk", c.today); return !k.last ? gap("No risk assessment recorded") : k.level === "late" ? gap(`Overdue since ${k.due}`) : ok(`Done ${k.last.date}`); } },
  { id: "HP.4.2", sec: "hp", text: "Teeth: grinding, only on evidence of injury", auto: (c) => { const t = live(c.data.litters).filter((l) => l.tasks?.teeth?.done && !l.tasks.teeth.evidence); return t.length ? gap(`${t.length} litter${t.length > 1 ? "s" : ""} with teeth done but no injury recorded`) : ok("Every teeth record has injury evidence"); } },
  { id: "HF.2.3", sec: "hf", text: "Ventilation alarm tested every week", auto: (c) => { const hs = houses(c.data.rooms.filter((r) => r.mechVent !== false)); const late = hs.filter((h) => alarmState(live(c.data.alarmTests), h, c.today).level === "late"); return !hs.length ? ok("No houses") : late.length ? gap(`Overdue: ${late.join(", ")}`) : ok(`All ${hs.length} houses tested this week`); }, href: (c) => L(c, "reg/alarms") },
  { id: "HF.6", sec: "hf", key: true, text: "Space for growing pigs (Schedule 8 minimums)", auto: (c) => { const over = roomFacts(c).filter((r) => r.space?.level === "late"); return over.length ? gap(`Over: ${over.map((r) => r.room.name).join(", ")}`) : ok("No room over the legal minimum"); }, href: (c) => L(c, "tools/space") },
  { id: "HF.9.2.a", sec: "hf", text: "Sows into the farrowing crate no more than 7 days before farrowing", auto: (c) => { const bad = live(c.data.litters).filter((l) => l.crateEntry && !crateEntryCheck(l.crateEntry, l.farrowedAt).ok && daysBetween(l.farrowedAt, c.today) <= 365); return bad.length ? gap(`${bad.length} sow${bad.length > 1 ? "s" : ""} in early this year`) : ok("Move dates within 7 days"); } },
  { id: "HF.9.5.c", sec: "hf", text: "Nesting material at least 24 h before farrowing", auto: (c) => { const n = live(c.data.litters).filter((l) => daysBetween(l.farrowedAt, c.today) <= 90); const miss = n.filter((l) => !l.nesting); return !n.length ? ok("No farrowings in 90 days") : miss.length ? due(`${miss.length} of ${n.length} litters without the nesting tick`) : ok("Ticked on every litter"); } },
  { id: "BI.1", sec: "bi", key: true, text: "Biosecurity policy", auto: (c) => plan(c, "biosecurity") },
  { id: "BI.2", sec: "bi", text: "Visitor records", auto: (c) => { const v = live(c.data.visitors).filter((x) => daysBetween(x.date, c.today) <= 30); return v.length ? ok(`${v.length} visitors signed in this month`) : due("No visitors recorded this month — print the gate sign"); }, href: (c) => L(c, "gate") },
  { id: "BI.12", sec: "bi", text: "Farrowing rooms cleaned and disinfected between occupancies", auto: (c) => { const f = c.data.rooms.filter((r) => r.kind === "farrowing"); const fill = f.filter((r) => r.wash?.exception); return fill.length ? due(`${fill.length} filled before the wash was finished`) : ok("Wash cycle recorded for every turn-round"); }, href: (c) => L(c, "reg/wash") },
  { id: "BI.14", sec: "bi", text: "Trichinella controlled-housing status", auto: (c) => plan(c, "trichinella") },
  { id: "FW.3", sec: "fw", key: true, text: "Yearly water test (non-mains supply)", auto: (c) => { const k = checkState(live(c.data.siteChecks), "water", c.today); return c.s.mainsWater ? ok("Mains water") : !k.last ? due("No water test recorded") : k.level === "late" ? gap(`Due since ${k.due}`) : ok(`Tested ${k.last.date}`); } },
  { id: "FW.6", sec: "fw", text: "Feed purchase records kept 2 years", auto: (c) => ok(`${live(c.data.feedDeliveries).length} deliveries recorded`), href: (c) => L(c, "reg/feed") },
  { id: "FW.8", sec: "fw", text: "Feed samples kept at least 6 months", auto: (c) => { const r = live(c.data.feedDeliveries).filter((d) => daysBetween(d.date, c.today) <= 183 && !d.sampleKept); return r.length ? due(`${r.length} deliveries without the sample tick`) : ok("Samples kept"); } },
  { id: "VC.1", sec: "vc", key: true, text: "Quarterly vermin survey", auto: (c) => { const k = checkState(live(c.data.siteChecks), "vermin", c.today); return !k.last ? gap("No survey recorded") : k.level === "late" ? gap(`Due since ${k.due}`) : ok(`Last ${k.last.date}, next by ${k.due}`); } },
  { id: "PL.2", sec: "pl", text: "Training records (kept 2 years after leaving)" },
  { id: "LT.4.0", sec: "lt", text: "Feed withdrawn ≤ 8 h before transport and ≤ 12 h before arrival", auto: (c) => { const loads = live(c.data.moves).filter((m) => m.direction === "off" && m.toSlaughter); const miss = loads.filter((m) => !m.feedWithdrawnAt); return miss.length ? due(`${miss.length} load${miss.length > 1 ? "s" : ""} without a feed-off time`) : ok(loads.length ? "Feed-off time on every load" : "No loads yet"); } },
];

function plan(c, kind) {
  const p = live(c.data.plans).filter((x) => x.kind === kind).sort((a, b) => a.signedOn.localeCompare(b.signedOn)).pop();
  if (!p) return gap("Not on file — add it in Paperwork → Plans");
  return daysBetween(p.signedOn, c.today) > 365 ? due(`Signed ${p.signedOn} — review due`) : ok(`Signed ${p.signedOn}${p.by ? " · " + p.by : ""}`);
}

export function evaluate(c, signs = {}) {
  return ITEMS.map((it) => {
    const ev = it.auto ? it.auto(c) : null; const sign = signs[it.id] || null;
    const status = ev ? (ev.state === "ok" ? "ok" : sign?.done && ev.state === "due" ? "ok" : ev.state) : sign?.done ? "ok" : "open";
    return { ...it, ev, sign, status, link: it.href ? it.href(c) : null };
  });
}
export function summary(rows) { const n = rows.length; const done = rows.filter((r) => r.status === "ok").length; const keyGaps = rows.filter((r) => r.key && r.status !== "ok").length; return { n, done, keyGaps }; }
export { addDays };
