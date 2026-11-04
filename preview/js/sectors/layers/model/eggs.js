// Eggs (design/14 §6): week maths, the packer reconciler, collection gaps, egg store,
// farm-gate stock (28-day rule) and money per dozen / per bird housed.
import { addDays, daysBetween } from "../../../core/dates.js";
import { sum, r1, flockIn, aliveAt, daysFor } from "./flock.js";
import { standardFor, layBand, mid } from "./standards.js";
import { weekOfAge } from "./flock.js";

/** Monday of the week containing iso, and the ISO week number. */
export function weekStart(iso) { const d = new Date(iso + "T12:00:00Z"); const dow = (d.getUTCDay() + 6) % 7; return addDays(iso, -dow); }
export function isoWeek(iso) {
  const d = new Date(iso + "T12:00:00Z"); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); return 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}

/** Eggs the farm sent for packing in a week (Mon–Sun): Σ daily sheets, less withheld days, less farm-gate sales. */
export function collectedInWeek(c, monday) {
  const end = addDays(monday, 6);
  const days = (c.data.days || []).filter((d) => d.date >= monday && d.date <= end && !d.withheld);
  const gate = sum((c.data.farmGate || []).filter((x) => x.kind === "sale" && x.date >= monday && x.date <= end), (x) => x.eggs);
  return sum(days, (d) => d.eggsTotal) - gate;
}

/**
 * Reconcile one statement. st: { weekStart, counted, grades[{grade, eggs, ppd?}], deductions[{label, amount}], paid? }.
 * Money fields come from the finance copy and only for money roles.
 */
export function reconcile(c, st, money = null) {
  const collected = collectedInWeek(c, st.weekStart);
  const counted = +st.counted || sum(st.grades || [], (g) => g.eggs);
  const diff = counted - collected; const pct = collected ? r1((diff / collected) * 100) : null;
  const out = { collected, counted, diff, pct, flag: pct != null && Math.abs(pct) > (+c.s.packerDiffPct || 0.5) };
  if (money) {
    const lines = (money.lines || []).map((l) => ({ ...l, amount: l.amount != null ? +l.amount : lineAmount(l.eggs, l.ppd) }));
    const gross = sum(lines, (l) => l.amount); const ded = sum(money.deductions || [], (d) => d.amount);
    const paid = money.amount != null ? +money.amount : Math.round((gross - ded) * 100) / 100;
    out.money = { lines, gross: Math.round(gross * 100) / 100, deductions: money.deductions || [], dedTotal: ded, paid, avgPpd: counted ? r1((paid / (counted / 12)) * 100) : null };
  }
  return out;
}
/** Line amount: eggs ÷ 12 × pence per dozen ÷ 100. */
export const lineAmount = (eggs, ppd) => Math.round(((+eggs || 0) / 12) * (+ppd || 0)) / 100;

/** Size mix (% of graded eggs, excluding seconds) and change vs the mean of up to 4 earlier statements. */
export function sizeMix(statements) {
  const mixOf = (st) => { const g = (st.grades || []).filter((x) => x.grade !== "Seconds"); const n = sum(g, (x) => x.eggs); const o = {}; g.forEach((x) => (o[x.grade] = n ? (x.eggs / n) * 100 : 0)); return o; };
  const sorted = [...statements].sort((a, b) => b.weekStart.localeCompare(a.weekStart)); if (!sorted.length) return null;
  const now = mixOf(sorted[0]); const prev = sorted.slice(1, 5).map(mixOf);
  const delta = {}; for (const k of Object.keys(now)) { const p = prev.length ? sum(prev, (m) => m[k] || 0) / prev.length : null; delta[k] = p == null ? null : Math.round(now[k] - p); }
  return { now, delta };
}

/** Days since the last packer collection, and the gap alert (Lion: collect at least twice a week). */
export function collectionGap(c, today = c.today) {
  const last = [...(c.data.eggDeliveries || [])].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) return null;
  const gap = daysBetween(last.date, today); return { last, gap, flag: gap > (+c.s.collectGapDays || 3) };
}
/** Next collection day from settings (weekday numbers). */
export function nextCollection(s, today) {
  const days = (s.collectionDays || []).map(Number); if (!days.length) return null;
  for (let i = 0; i < 8; i++) { const d = addDays(today, i); if (days.includes(new Date(d + "T12:00:00Z").getUTCDay())) return d; }
  return null;
}
export function storeStatus(c, today = c.today) {
  const list = [...(c.data.storeTemps || [])].sort((a, b) => b.date.localeCompare(a.date)); const t = list.find((x) => x.date === today);
  const over = list.filter((x) => x.date > addDays(today, -7) && +x.max >= (+c.s.storeMax || 20));
  return { today: t || null, last: list[0] || null, over, list };
}

/** Farm-gate stock (ungraded eggs): FIFO by lay date; any eggs older than 28 days flagged. */
export function farmGateStock(c, today = c.today, maxDays = 28) {
  const stock = (c.data.farmGate || []).filter((x) => x.kind === "stock").sort((a, b) => a.layDate.localeCompare(b.layDate)).map((x) => ({ layDate: x.layDate, left: +x.eggs || 0 }));
  let sold = sum((c.data.farmGate || []).filter((x) => x.kind === "sale"), (x) => x.eggs);
  for (const s of stock) { const t = Math.min(s.left, sold); s.left -= t; sold -= t; }
  const left = stock.filter((s) => s.left > 0); const old = left.filter((s) => daysBetween(s.layDate, today) > maxDays);
  return { left: sum(left, (s) => s.left), batches: left, old: sum(old, (s) => s.left), oldest: left[0]?.layDate || null };
}

/**
 * Money per dozen and per bird housed (design/14 §6.3). fin = finance records for the flock/house.
 * Returns feed £/dozen, kg feed/dozen, FCR, margin over feed per bird per week, margin per bird housed.
 */
export function flockMoney(c, f, fin, today = c.today) {
  const own = fin.filter((r) => r.flockId === f.id || (!r.flockId && r.houseId === f.houseId && r.date >= f.placedDate && (!f.depopDate || r.date <= f.depopDate)));
  // Farm-wide money (a packer statement for every house, an electricity bill for the unit) is shared:
  // egg income by this flock's share of the eggs collected in that week, other costs by its share of
  // the birds in lay on the day. Each is marked `shared` so the screen can say so.
  const shared = fin.filter((r) => !r.flockId && !r.houseId && r.date >= f.placedDate && (!f.depopDate || r.date <= f.depopDate) && r.kind !== "prices").map((r) => {
    const egg = r.kind === "revenue" && ["packerStatement", "farmGate", "eggs"].includes(r.source);
    const share = egg ? eggShare(c, f, r.weekStart || addDays(r.date, -6), r.weekStart ? addDays(r.weekStart, 6) : r.date) : birdShare(c, f, r.date);
    return share > 0 ? { ...r, amount: Math.round((+r.amount || 0) * share * 100) / 100, eggs: r.eggs != null ? Math.round(+r.eggs * share) : r.eggs, shared: true } : null;
  }).filter(Boolean);
  const mine = [...own, ...shared];
  const pick = (src) => mine.filter((r) => r.source === src);
  const eggRecs = mine.filter((r) => r.kind === "revenue" && ["packerStatement", "farmGate", "eggs"].includes(r.source));
  const eggsIncome = sum(eggRecs, (r) => r.amount);
  // the price per dozen comes from the eggs those payments were for, not from every egg laid
  const paidRecs = eggRecs.filter((r) => +r.eggs > 0); const eggsPaid = sum(paidRecs, (r) => r.eggs);
  const spent = sum(pick("spentHens"), (r) => r.amount); const pullets = sum(pick("pullets"), (r) => r.amount);
  const feedCost = sum(pick("feed"), (r) => r.amount); const energy = sum(pick("energy"), (r) => r.amount);
  const other = sum(mine.filter((r) => r.kind === "expense" && !["feed", "pullets", "energy"].includes(r.source)), (r) => r.amount);
  const days = daysFor(c, f.id).filter((d) => d.date <= today);
  const eggs = sum(days, (d) => d.eggsTotal); const dozens = eggs / 12;
  const feedKg = sum((c.data.feedDeliveries || []).filter((x) => x.houseId === f.houseId && x.date >= f.placedDate && x.date <= today), (x) => x.kg);
  const eggW = (c.data.samples || []).filter((x) => x.flockId === f.id && x.kind === "eggs").map((x) => x.mean);
  const avgEggKg = (eggW.length ? sum(eggW) / eggW.length : 62) / 1000;
  const placed = +f.placed || 1; const alive = aliveAt(c, f, today, { end: true });
  const weeks = Math.max(1, days.length / 7);
  return {
    eggs, dozens: Math.round(dozens), eggsIncome, feedCost, feedKg,
    feedPerDozen: dozens ? Math.round((feedCost / dozens) * 1000) / 10 : null, // pence
    kgPerDozen: dozens && feedKg ? Math.round((feedKg / dozens) * 100) / 100 : null,
    fcr: eggs && feedKg ? Math.round((feedKg / (eggs * avgEggKg)) * 100) / 100 : null, eggWtAssumed: !eggW.length,
    marginPerBirdWeek: alive ? Math.round(((eggsIncome - feedCost) / alive / weeks) * 100) / 100 : null,
    marginPerBirdHoused: Math.round(((eggsIncome + spent - pullets - feedCost - energy - other) / placed) * 100) / 100,
    pullets, spent, energy, other, avgPpd: eggsPaid ? r1((sum(paidRecs, (r) => r.amount) / (eggsPaid / 12)) * 100) : dozens && eggsIncome ? r1((eggsIncome / dozens) * 100) : null,
  };
}

/** This flock's share of all eggs collected between two dates (daily sheets, every flock). */
export function eggShare(c, f, from, to) {
  const inRange = (c.data.days || []).filter((d) => d.date >= from && d.date <= to);
  const all = sum(inRange, (d) => d.eggsTotal); if (!all) return 0;
  return sum(inRange.filter((d) => d.flockId === f.id), (d) => d.eggsTotal) / all;
}
/** This flock's share of the birds alive on a date, across the flocks in lay that day. */
export function birdShare(c, f, date) {
  const live = (c.data.flocks || []).filter((x) => x.placedDate <= date && (!x.depopDate || x.depopDate > date));
  const tot = sum(live, (x) => aliveAt(c, x, date)); if (!tot || !live.some((x) => x.id === f.id)) return 0;
  return aliveAt(c, f, date) / tot;
}

/**
 * Depop decision (design/14 §10): margin over feed for keeping the flock +0/+4/+8 weeks past
 * the planned depop. eggs from the standard curve × the flock's ratio; price p/dozen; feed
 * £/tonne at g/bird/day. Estimate.
 */
export function depopDecision(c, f, { ppd, feedPerTonne, feedG = 120, ratio = 1, fromWk, birds, weeksList = [0, 4, 8] }) {
  const std = standardFor(f.breedStdId); const out = [];
  for (const extra of weeksList) {
    let eggs = 0, feedKg = 0; let b = birds;
    for (let w = fromWk; w < fromWk + extra; w++) { eggs += 7 * b * (mid(layBand(std, w)) * ratio) / 100; feedKg += (7 * b * feedG) / 1000; b *= 0.998; }
    const margin = (eggs / 12) * (ppd / 100) - (feedKg / 1000) * feedPerTonne;
    out.push({ extra, eggs: Math.round(eggs), margin: Math.round(margin) });
  }
  return out;
}
export { weekOfAge, flockIn };
