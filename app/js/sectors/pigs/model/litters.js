// Litters and the crate card (design/13 §5.4): counts per litter, fostering both ways,
// piglet deaths with cause, iron/teeth/tail tasks, weaning rules (Schedule 8 paras 38–39).
import { daysBetween } from "./dates.js";

export const DEATH_CAUSES = ["Overlaid", "Starved / weak", "Scour", "Splay leg", "Low viability", "Other"];
const sum = (a, k = "n") => (a || []).reduce((t, x) => t + (+x[k] || 0), 0);
export const diedIn = (l) => sum(l.deaths);
export const fosteredOn = (l) => sum(l.fosterOn);
export const fosteredOff = (l) => sum(l.fosterOff);
/** Alive now = born alive − died + fostered on − fostered off (never below 0). */
export function aliveNow(l) { return Math.max(0, (+l.bornAlive || 0) - diedIn(l) + fosteredOn(l) - fosteredOff(l)); }
export const totalBorn = (l) => (+l.bornAlive || 0) + (+l.stillborn || 0) + (+l.mummified || 0);
export const lactationDay = (l, today) => (l.weaned?.date ? daysBetween(l.farrowedAt, l.weaned.date) : daysBetween(l.farrowedAt, today));

/** Pre-weaning mortality = piglet deaths ÷ (born alive + fostered on − fostered off). */
export function preWeanMortality(litters) {
  let dead = 0, base = 0;
  for (const l of litters) { dead += diedIn(l); base += (+l.bornAlive || 0) + fosteredOn(l) - fosteredOff(l); }
  return base ? dead / base : null;
}

/**
 * Weaning age rules: under 21 days cannot be saved; 21–27 days needs a reason and the
 * "specialised, cleaned housing" tick; 28+ fine. Returns { ok, level, text }.
 */
export function weaningCheck(ageDays, { cleanedHousing = false, reason = "" } = {}) {
  if (ageDays < 21) return { ok: false, level: "late", text: `Piglets are ${ageDays} days old. The law doesn't allow weaning before 21 days.` };
  if (ageDays < 28) {
    if (cleanedHousing && reason) return { ok: true, level: "due", text: `Weaned at ${ageDays} days into specialised, cleaned housing: ${reason}.` };
    return { ok: false, level: "late", text: "Weaning before 28 days is only allowed if pigs go to specially cleaned housing (then 21 days minimum). Tick the housing box and give a reason." };
  }
  return { ok: true, level: "ok", text: "" };
}

/** Teeth and tail are never routine (Research B): rules for the chips on the crate card. */
export function procedureCheck(kind, ageDays, { evidence = false, vet = false } = {}) {
  if (kind === "teeth") {
    if (!evidence) return { ok: false, text: "Teeth only where there's evidence of injury to teats or other piglets' ears and tails. Tick “injuries seen”." };
    if (ageDays > 7) return { ok: false, text: "Teeth reduction only within 7 days of birth." };
    return { ok: true };
  }
  if (kind === "tail") {
    if (!evidence) return { ok: false, text: "Tail docking is never routine — only with evidence of injury and after other measures were tried." };
    if (ageDays > 7 && !vet) return { ok: false, text: "After 7 days of age only a vet may dock tails, with anaesthetic and pain relief." };
    return { ok: true };
  }
  return { ok: true };
}

/** Daily suckling-pig mortality summary (Red Tractor AH.2): [{ date, n, causes{} }] newest first. */
export function sucklingDeathsByDay(litters) {
  const m = new Map();
  for (const l of litters) for (const d of l.deaths || []) {
    const r = m.get(d.date) || { date: d.date, n: 0, causes: {} };
    r.n += +d.n || 0; r.causes[d.cause] = (r.causes[d.cause] || 0) + (+d.n || 0); m.set(d.date, r);
  }
  return [...m.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Room totals for a farrowing room: litters currently in it (not weaned). */
export function roomLitterTotals(litters) {
  const live = litters.filter((l) => !l.weaned);
  return { litters: live.length, alive: live.reduce((t, l) => t + aliveNow(l), 0), pwm: preWeanMortality(live) };
}
