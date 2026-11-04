// Soft checks on numbers (review A #2, drastic idea 3). Pure functions: each takes the typed
// values and returns a list of plain sentences ("£372/kg is a lot — most cattle make £2–£10/kg").
// An empty list means nothing looks odd. Entry sheets show the list in an "Is this right?"
// sheet (ui/sanity.js) with Change / Yes, save — these never block a save.
import { daysBetween } from "./dates.js";

/** Plausible ranges. One table so the tests, the forms and the wording agree. */
export const RANGES = {
  pricePerKg: { min: 2, max: 10 },      // beef £/kg dead weight
  deadKg: { min: 150, max: 550 },       // beef carcase kg
  liveKg: { min: 20, max: 1400 },       // cattle liveweight kg (newborn calf .. mature bull)
  lineTotal: { max: 5000 },             // £ for one animal on a sale
  money: { max: 20000 },                // £ for one money entry
  weightJump: 0.4,                      // >40% change against the last weighing
  doseFactor: 3,                        // dose more than 3x (or under a third of) the label dose
  pastDays: 365,                        // dates more than a year back
  litresPerCow: 70,                     // litres per cow per day (dairy tank / milk sold)
};

const num = (x) => (x === "" || x == null || Number.isNaN(+x) ? null : +x);
const gbp = (n) => "£" + (Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const kg = (n) => `${(+n).toLocaleString("en-GB")} kg`;
const who = (label) => (label ? `${label}: ` : "");

/** £/kg dead weight. */
export function checkPricePerKg(v, label = "") {
  const p = num(v); if (p == null || p <= 0) return [];
  const { min, max } = RANGES.pricePerKg;
  if (p > max) return [`${who(label)}£${p}/kg is high — most cattle make £${min}–£${max}/kg dead. Is it a weight in the price box?`];
  if (p < min) return [`${who(label)}£${p}/kg is low — most cattle make £${min}–£${max}/kg dead.`];
  return [];
}
/** Carcase (dead) weight. */
export function checkDeadKg(v, label = "") {
  const w = num(v); if (w == null || w <= 0) return [];
  const { min, max } = RANGES.deadKg;
  return w < min || w > max ? [`${who(label)}${kg(w)} dead is unusual — most carcases are ${min}–${max} kg.`] : [];
}
/** Liveweight of cattle. */
export function checkLiveKg(v, label = "") {
  const w = num(v); if (w == null || w <= 0) return [];
  const { min, max } = RANGES.liveKg;
  return w < min || w > max ? [`${who(label)}${kg(w)} liveweight is outside ${min}–${max.toLocaleString("en-GB")} kg.`] : [];
}
/** One animal's sale value. */
export function checkLineTotal(total, label = "") {
  const t = num(total); if (t == null) return [];
  return t > RANGES.lineTotal.max ? [`${who(label)}${gbp(t)} for one animal is more than ${gbp(RANGES.lineTotal.max)}.`] : [];
}
/** A beef sale line: { deadKg, pricePerKg, liveKg, price }. */
export function checkSaleLine(l = {}, label = "") {
  const total = num(l.price) || (num(l.deadKg) && num(l.pricePerKg) ? +l.deadKg * +l.pricePerKg : null);
  return [...checkDeadKg(l.deadKg, label), ...checkPricePerKg(l.pricePerKg, label), ...checkLiveKg(l.liveKg, label), ...checkLineTotal(total, label)];
}
/** One money entry. */
export function checkMoney(amount, what = "This entry") {
  const a = num(String(amount ?? "").replace(/[£,]/g, "")); if (a == null) return [];
  return a > RANGES.money.max ? [`${what} is ${gbp(a)} — more than ${gbp(RANGES.money.max)}. Check the decimal point.`] : [];
}
/** A new weight against the animal's last one: { kg, prevKg, prevDate, date }. */
export function checkWeightJump({ kg: w, prevKg, prevDate, date } = {}, label = "") {
  const a = num(w), b = num(prevKg); if (a == null || b == null || a <= 0 || b <= 0) return [];
  const ch = (a - b) / b;
  if (Math.abs(ch) <= RANGES.weightJump) return [];
  const days = prevDate && date ? daysBetween(prevDate, date) : null;
  return [`${who(label)}${kg(a)} is ${Math.round(Math.abs(ch) * 100)}% ${ch > 0 ? "up" : "down"} on the last weight (${kg(b)}${days != null ? `, ${days} day${days === 1 ? "" : "s"} ago` : ""}).`];
}
/**
 * A dose against the product's label dose. dose / labelDose are numbers in the same unit
 * (ml per animal, or ml per kg when perKg). Flags more than 3x or under a third of the label.
 */
export function checkDose(dose, labelDose, { unit = "ml", product = "", label = "" } = {}) {
  const d = num(dose), l = num(labelDose); if (d == null || l == null || d <= 0 || l <= 0) return [];
  const f = RANGES.doseFactor;
  if (d > l * f) return [`${who(label)}${d} ${unit} is more than ${f} times the label dose${product ? ` of ${product}` : ""} (${l} ${unit}).`];
  if (d < l / f) return [`${who(label)}${d} ${unit} is under a third of the label dose${product ? ` of ${product}` : ""} (${l} ${unit}).`];
  return [];
}
/**
 * A record date. future: false flags dates after today (deaths, births, treatments given);
 * dates more than a year back are always flagged.
 */
export function checkDate(date, today, { future = false, what = "This date" } = {}) {
  if (!date || !today) return [];
  const d = daysBetween(today, date);
  if (!future && d > 0) return [`${what} is in the future (${d} day${d === 1 ? "" : "s"} from today).`];
  if (d < -RANGES.pastDays) return [`${what} is more than a year ago.`];
  return [];
}
/** A count against what the house / shed holds. */
export function checkCapacity(n, capacity, { what = "birds", where = "the house" } = {}) {
  const a = num(n), c = num(capacity); if (a == null || c == null || c <= 0) return [];
  return a > c ? [`${a.toLocaleString("en-GB")} ${what} is more than ${where} holds (${c.toLocaleString("en-GB")}).`] : [];
}
/** Eggs in a day against birds in the house (a hen lays at most one a day). */
export function checkEggs(eggs, birds, where = "the house") {
  const e = num(eggs), b = num(birds); if (e == null || b == null || b <= 0) return [];
  return e > b * 1.02 ? [`${e.toLocaleString("en-GB")} eggs is more than the ${b.toLocaleString("en-GB")} hens in ${where} can lay in a day.`] : [];
}
/** Litres in a day against cows in milk. */
export function checkLitres(litres, cows, { days = 1 } = {}) {
  const l = num(litres), c = num(cows); if (l == null || l <= 0 || c == null || c <= 0) return [];
  const per = l / c / Math.max(1, days);
  return per > RANGES.litresPerCow ? [`${l.toLocaleString("en-GB")} litres is ${Math.round(per)} litres a cow a day for ${c} cows. Check the number.`] : [];
}
