// The production week (design/13 §3.1): events on the week strip and the "This week" tiles.
// Events are worked out from the records and the batch calendar — nothing is typed twice.
import { addDays, daysBetween } from "./dates.js";
import { weekDates } from "./weeks.js";
import { cycleOf, onFarm, toServe } from "./sows.js";
import { serveTarget, isServeWeek, weekIndex, mondayOfIndex } from "./weeks.js";
import { batchName } from "./batches.js";
import { washState } from "./rooms.js";

const live = (a) => (a || []).filter((r) => !r.deleted);
export const VERB = { Ser: "Serve", Scn: "Scan", Mov: "Move to farrowing", Far: "Farrow", Wean: "Wean", Ship: "Ship", Wash: "Wash", In: "Pigs in", Feed: "Feed delivery", Vet: "Vet visit" };

/** Sows' cycles once per snapshot (shared by the week, the sow list and duties). */
export function cycles(c) {
  if (c._cycles) return c._cycles;
  c._cycles = live(c.data.sows).filter(onFarm).map((sow) => ({ sow, c: cycleOf(c.s, c.ix, sow, c.today) }));
  return c._cycles;
}
const median = (a) => { const s = [...a].sort(); return s[Math.floor((s.length - 1) / 2)]; };

/** Map of date -> [{ v: verb, b: label, n }] for the 7 days of the week holding `iso`. */
export function weekEvents(c, iso) {
  const days = weekDates(iso, c.s.weekStart); const inW = (d) => d >= days[0] && d <= days[6];
  const ev = new Map(days.map((d) => [d, []]));
  const put = (d, v, b, n = 1) => { if (!inW(d)) return; const list = ev.get(d); const x = list.find((e) => e.v === v && e.b === b); if (x) x.n += n; else list.push({ v, b, n }); };
  const bn = (id) => batchName(c.ix.batches.get(id)) || "";
  if (c.s.breeding) {
    for (const { c: cy } of cycles(c)) {
      if (cy.first && ["served", "inpig", "farrowing"].includes(cy.status)) {
        const b = bn(cy.first.batchId);
        put(cy.dates.scanFrom, "Scn", b); put(cy.dates.move, "Mov", b); put(cy.dates.due, "Far", b);
      }
    }
    for (const sv of live(c.data.services)) if (sv.serviceNo === 1 || !sv.serviceNo) put(sv.date, "Ser", bn(sv.batchId));
    // weaning: per farrowing batch, the median farrow date + lactation; next service ≈ wean + 4 d
    const byBatch = new Map();
    for (const l of live(c.data.litters)) if (!l.weaned) { const k = l.batchId || "?"; byBatch.set(k, [...(byBatch.get(k) || []), l.farrowedAt]); }
    for (const [bid, dates] of byBatch) { const w = addDays(median(dates), c.s.lactation); put(w, "Wean", bn(bid)); if (w >= c.today) put(addDays(w, 4), "Ser", "next"); }
    for (const l of live(c.data.litters)) if (l.weaned?.date) put(l.weaned.date, "Wean", bn(l.batchId));
  }
  for (const t of live(c.data.tasks)) if (t.pig?.kind === "ship" && !t.done) put(t.due, "Ship", bn(t.pig.batchId), +t.pig.n || 0);
  for (const m of live(c.data.moves)) { if (m.direction === "off" && m.toSlaughter) put(m.date, "Ship", bn(m.batchId), +m.n || 0); if (m.direction === "on") put(m.date, "In", bn(m.batchId), +m.n || 0); }
  for (const r of c.data.rooms) { const w = washState(r, c.today); if (!w.inUse) for (const [st, at] of Object.entries(w.at || {})) if (st !== "emptied") put(String(at).slice(0, 10), "Wash", r.name); }
  if (!c.s.breeding) {
    for (const d of live(c.data.feedDeliveries)) put(d.date, "Feed", d.ration || "");
    for (const v of live(c.data.vetVisits)) put(v.date, "Vet", v.vet || "");
  }
  return { days, ev };
}

/** "This week" tiles for breeding farms (design/13 §3.1). */
export function breedingTiles(c) {
  const days = weekDates(c.today, c.s.weekStart); const end = days[6]; const start = days[0];
  const cy = cycles(c);
  const due = cy.filter((x) => x.c.dates && ["served", "inpig", "farrowing"].includes(x.c.status) && x.c.dates.due >= start && x.c.dates.due <= end);
  const servedThisWeek = new Set(live(c.data.services).filter((s) => s.date >= start && s.date <= end).map((s) => s.sowId));
  const target = serveTarget(c.s.farrowingPlaces, c.s.targets.farrowRate);
  const scan = cy.filter((x) => x.c.status === "served" && x.c.dates && x.c.dates.scanFrom <= end && x.c.dates.scanTo >= start);
  const returns = cy.filter((x) => x.c.status === "served" && x.c.days >= c.s.returnFrom - 3 && x.c.days <= c.s.returnTo);
  const toWean = live(c.data.litters).filter((l) => !l.weaned && addDays(l.farrowedAt, c.s.lactation) <= end);
  const ships = live(c.data.tasks).filter((t) => t.pig?.kind === "ship" && !t.done && t.due >= start && t.due <= end);
  const farrowRoom = due[0]?.c.inCrate ? c.ix.rooms.get(due[0].c.inCrate.roomId)?.name : "";
  const serveWeek = isServeWeek(c.today, c.s.interval, c.anchorIdx);
  let nextServe = null; if (!serveWeek) for (let i = weekIndex(c.today) + 1; i < weekIndex(c.today) + 6; i++) if (isServeWeek(mondayOfIndex(i), c.s.interval, c.anchorIdx)) { nextServe = mondayOfIndex(i); break; }
  return {
    serveWeek, nextServe,
    due, toFarrow: due.filter((x) => !live(c.data.litters).some((l) => l.sowId === x.sow.id && l.farrowedAt >= x.c.first.date)).length, farrowRoom,
    served: servedThisWeek.size, target, stillToServe: toServe(c.s, c.ix, live(c.data.sows), c.today).filter((x) => !servedThisWeek.has(x.sow.id)),
    scan: scan.length, returns: returns.length, toWean: toWean.length, toWeanSows: toWean, ship: ships.reduce((t, x) => t + (+x.pig.n || 0), 0), ships,
  };
}

/** Deaths this week and mortality headline (one compact line under the room board). */
export function weekDeaths(c) {
  const days = weekDates(c.today, c.s.weekStart);
  const inW = (d) => d >= days[0] && d <= days[6];
  const piglets = live(c.data.litters).reduce((t, l) => t + (l.deaths || []).filter((d) => inW(d.date)).reduce((s, d) => s + (+d.n || 0), 0), 0);
  const others = live(c.data.deaths).filter((d) => inW(d.date)).reduce((t, d) => t + (+d.n || 0), 0);
  return { n: piglets + others };
}
export { daysBetween };
