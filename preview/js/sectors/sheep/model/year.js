// The sheep year (design/11 §3.1): one setting — rams in — drives every stage.
//   Tupping   rams in → rams out
//   Scanning  rams out → lambing start (scan window rams in + 80…100)
//   Lambing   rams in + gestation − 5 → rams out + gestation + 5
//   Grazing   lambing end → weaning (lambing start + weaningDays)
//   Weaning & sales  weaning → next rams in
import { addDays, daysBetween } from "../../../core/dates.js";

export const STAGES = ["tupping", "scanning", "lambing", "grazing", "weaning"];
export const STAGE_NAMES = { tupping: "Tupping", scanning: "Scanning", lambing: "Lambing", grazing: "Grazing", weaning: "Weaning & sales" };
export const STAGE_SHORT = { tupping: "Tupping", scanning: "Scanning", lambing: "Lambing", grazing: "Grazing", weaning: "Weaning" };

const mmdd = (iso) => iso.slice(5, 10);
/** Planned rams-in date of the cycle containing `today` (latest planned date ≤ today). */
export function plannedRamsIn(s, today) {
  const md = s.ramsIn || "10-15"; const y = +today.slice(0, 4);
  const thisYear = `${y}-${md}`;
  return thisYear <= today ? thisYear : `${y - 1}-${md}`;
}
/**
 * The cycle for today. events: the ledger's events (actual "ramsIn" events move the dates).
 * Returns { ramsIn, ramsOut, actual, scanFrom, scanTo, lambFrom, lambTo, weaning, nextRamsIn, crop }.
 */
export function cycleFor(s, today, events = []) {
  let planned = plannedRamsIn(s, today);
  // an actual rams-in up to 30 days before the next planned date starts the new cycle early
  const nextPlanned = `${+planned.slice(0, 4) + 1}-${mmdd(planned)}`;
  const ins = events.filter((e) => e.kind === "ramsIn" && e.date && !e.deleted).map((e) => e.date).sort();
  const early = ins.find((d) => d <= today && d >= addDays(nextPlanned, -30));
  if (early) planned = nextPlanned;
  const actual = ins.filter((d) => Math.abs(daysBetween(planned, d)) <= 45).sort()[0] || null;
  return cycleFrom(actual || planned, s, !!actual, events);
}
export function cycleFrom(ramsIn, s, actual = false, events = []) {
  const outs = events.filter((e) => e.kind === "ramsOut" && e.date >= ramsIn && daysBetween(ramsIn, e.date) <= 120 && !e.deleted).map((e) => e.date).sort();
  const ramsOut = outs[0] || addDays(ramsIn, s.ramsOutDays ?? 36);
  const g = +s.gestation || 147;
  const lambFrom = addDays(ramsIn, g - 5), lambTo = addDays(ramsOut, g + 5);
  const weaning = addDays(lambFrom, +s.weaningDays || 100);
  const nextRamsIn = `${+ramsIn.slice(0, 4) + 1}-${s.ramsIn || mmdd(ramsIn)}`;
  return { ramsIn, ramsOut, ramsOutActual: !!outs[0], actual, scanFrom: addDays(ramsIn, 80), scanTo: addDays(ramsIn, 100), lambFrom, lambTo, weaning: weaning > lambTo ? weaning : addDays(lambTo, 14), nextRamsIn, crop: +lambFrom.slice(0, 4) };
}
/** Which stage today is in, day number within it and progress through the whole year (0–1). */
export function stageOf(cy, today) {
  const bounds = [cy.ramsIn, cy.ramsOut, cy.lambFrom, cy.lambTo, cy.weaning, cy.nextRamsIn];
  let i = 0; // tupping [ramsIn, ramsOut]; scanning (ramsOut, lambFrom); lambing [lambFrom, lambTo]; grazing (lambTo, weaning); weaning [weaning, next)
  if (today > cy.ramsOut) i = 1; if (today >= cy.lambFrom) i = 2; if (today > cy.lambTo) i = 3; if (today >= cy.weaning) i = 4;
  const start = i === 1 ? addDays(cy.ramsOut, 1) : i === 3 ? addDays(cy.lambTo, 1) : bounds[i];
  const total = daysBetween(cy.ramsIn, cy.nextRamsIn) || 365;
  return { index: i, stage: STAGES[i], day: daysBetween(start, today) + 1, start, progress: Math.max(0, Math.min(1, daysBetween(cy.ramsIn, today) / total)), segments: STAGES.map((st, k) => ({ stage: st, from: k === 1 ? addDays(cy.ramsOut, 1) : k === 3 ? addDays(cy.lambTo, 1) : bounds[k], to: k === 0 ? cy.ramsOut : k === 2 ? cy.lambTo : addDays(bounds[k + 1], -1) })) };
}

/** Raddle cycles: one colour per 17 days from rams in, with the lambing window each gives. */
export function raddleCycles(cy, s, today) {
  const order = s.raddleOrder?.length ? s.raddleOrder : ["Yellow", "Red", "Blue", "Green", "Black"];
  const g = +s.gestation || 147; const out = [];
  const n = Math.max(1, Math.ceil((daysBetween(cy.ramsIn, cy.ramsOut) + 1) / 17));
  for (let i = 0; i < Math.min(n, order.length); i++) {
    const from = addDays(cy.ramsIn, 17 * i); let to = addDays(from, 16); if (to > cy.ramsOut) to = cy.ramsOut;
    out.push({ i, colour: order[i], from, to, lambFrom: addDays(from, g - 5), lambPeak: addDays(from, g), lambTo: addDays(to, g + 5), current: today >= from && today <= to });
  }
  const cur = out.find((c) => c.current) || null;
  const next = cur ? out[cur.i + 1] || null : out.find((c) => c.from > today) || null;
  return { cycles: out, current: cur, next, nextChange: next ? next.from : null };
}
/** Lambing dates from raddle marks (tool): start = mark + gestation − 5, peak + gestation, end + 5. */
export function lambingFromMark(markDate, gestation = 147) {
  return { from: addDays(markDate, gestation - 5), peak: addDays(markDate, gestation), to: addDays(markDate, gestation + 5) };
}
