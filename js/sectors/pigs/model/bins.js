// Feed bins (design/13 §9 "Feed bins"): stock, days left and order-by date.
//   daysLeft = binKg ÷ Σ(pigs × intake(kg/day at est. weight)); order-by = empty − lead time
// The intake table is a GUESS (typical ad-lib growing-pig intakes) until the farm enters its
// breeding company's table in settings — Research C noted JSR/PIC/Hermitage tables as a gap.
import { addDays, daysBetween } from "./dates.js";

export const DEFAULT_INTAKE = [
  { upToKg: 15, kgDay: 0.45 }, { upToKg: 30, kgDay: 1.0 }, { upToKg: 50, kgDay: 1.6 },
  { upToKg: 80, kgDay: 2.2 }, { upToKg: 110, kgDay: 2.7 }, { upToKg: 999, kgDay: 3.0 },
];
export const SOW_INTAKE = { dry: 2.6, lactating: 6.5 }; // guess, kg/day
export function intakeAt(kg, table) { const t = table && table.length ? table : DEFAULT_INTAKE; return (t.find((r) => kg <= r.upToKg) || t[t.length - 1]).kgDay; }

/**
 * Bin stock on `today`: last dip (if any) + deliveries since − estimated use since.
 * deliveries/readings for this bin; dailyUse = kg/day now. Returns kg (≥ 0).
 */
export function binStock(bin, deliveries, dips, dailyUse, today) {
  const mine = deliveries.filter((d) => d.binId === bin.id).sort((a, b) => a.date.localeCompare(b.date));
  const dip = dips.filter((r) => r.binId === bin.id && r.kg != null).sort((a, b) => a.date.localeCompare(b.date)).pop();
  const from = dip ? dip.date : mine[0]?.date;
  if (!from) return 0;
  const start = dip ? +dip.kg : 0;
  const added = mine.filter((d) => (dip ? d.date > dip.date : true)).reduce((t, d) => t + (+d.kg || 0), 0);
  const used = dailyUse * Math.max(0, daysBetween(from, today));
  return Math.max(0, start + added - used);
}
export function binForecast(stockKg, dailyUse, leadDays, today) {
  if (!(dailyUse > 0)) return { daysLeft: null, emptyOn: null, orderBy: null, level: "ok" };
  const daysLeft = stockKg / dailyUse; const emptyOn = addDays(today, Math.floor(daysLeft));
  const orderBy = addDays(today, Math.floor(daysLeft - leadDays));
  return { daysLeft, emptyOn, orderBy, level: daysLeft < leadDays + 1 ? "due" : "ok" };
}
