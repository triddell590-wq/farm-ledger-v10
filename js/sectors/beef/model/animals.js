// One animal's facts, worked out from its record and the herd's other records. Pure.
// Record shape: v9's field names are kept (tag, dob, sex, breed, colour, damTag, onDate,
// fromText, lot, offDate, offTo, disposal, retag) so Tom's migrated animals and new ones are
// the same shape and the Morning Board feed reads both unchanged. v10 adds: name, mgmtNo, eid,
// sireText, bornInHerd, bornInNI, prevMoves, groupId, classOverride, replacement, stockBull,
// replacementTags[], bvd{}, reg{} (births-to-register ticks), nifais{}, flags[], temperament,
// pedigree{}, notes.
import { sexCode, normTag, parseTag, breedName } from "./tags.js";
import { daysBetween, addDays } from "../../../core/dates.js";

export const onFarm = (a) => !a.deleted && !a.offDate && !a.dateOff && a.status !== "gone";
export const ageDays = (a, today) => (a.dob ? daysBetween(a.dob, today) : null);
export const ageMonths = (a, today) => (a.dob ? daysBetween(a.dob, today) / 30.4375 : null);

export function ageText(a, today) {
  const d = ageDays(a, today); if (d == null) return "";
  if (d < 0) return "not born";
  if (d < 28) return `${Math.max(1, Math.floor(d / 7)) === 1 && d < 7 ? d + " d" : Math.floor(d / 7) + " wk"}`;
  const m = Math.floor(d / 30.4375);
  if (m < 36) return `${m} mo`;
  return `${Math.floor(m / 12)} yr`;
}
/** "25 mo 22 d" for the animal card. */
export function ageLong(a, today) {
  if (!a.dob) return "";
  const b = new Date(a.dob + "T12:00:00Z"), n = new Date(today + "T12:00:00Z");
  let m = (n.getUTCFullYear() - b.getUTCFullYear()) * 12 + n.getUTCMonth() - b.getUTCMonth(); let d = n.getUTCDate() - b.getUTCDate();
  if (d < 0) { m -= 1; d += new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 0)).getUTCDate(); }
  return m >= 1 ? `${m} mo ${d} d` : `${d} d`;
}

/** Lists the herd needs over and over, built once per snapshot. */
export function indexHerd(data) {
  const byId = new Map(), byTag = new Map(), kids = new Map();
  for (const a of data.animals) { byId.set(a.id, a); if (a.tag) byTag.set(normTag(a.tag), a); }
  for (const a of data.animals) {
    const dam = a.damId ? byId.get(a.damId) : a.damTag ? byTag.get(normTag(a.damTag)) : null;
    if (dam) { if (!kids.has(dam.id)) kids.set(dam.id, []); kids.get(dam.id).push(a); }
  }
  const weights = new Map();
  const addW = (id, w) => { if (!weights.has(id)) weights.set(id, []); weights.get(id).push(w); };
  for (const w of data.weighings || []) if (!w.deleted && w.animalId && +w.kg > 0 && w.date) addW(w.animalId, { date: w.date, kg: +w.kg, id: w.id });
  for (const a of data.animals) if (+a.lastWeightKg > 0 && a.lastWeightDate) addW(a.id, { date: a.lastWeightDate, kg: +a.lastWeightKg, est: !!a.lastWeightEst, v9: true });
  for (const list of weights.values()) list.sort((x, y) => x.date.localeCompare(y.date));
  // withdrawals by tag (medicine records name animals by tag, as v9 did)
  const wd = new Map();
  for (const m of data.medicines || []) {
    if (m.deleted || m.notUsed || !m.withdrawalEndDateMeat) continue;
    for (const t of m.animalTags || []) { const k = normTag(t); if (!wd.has(k) || wd.get(k).until < m.withdrawalEndDateMeat) wd.set(k, { until: m.withdrawalEndDateMeat, product: m.productName, medId: m.id }); }
  }
  const groups = new Map((data.groups || []).filter((g) => !g.deleted).map((g) => [g.id, g]));
  // calvings per dam: calving records + calves recorded with this dam (v9 had only damTag)
  const calvings = new Map();
  const addC = (damId, c) => { if (!calvings.has(damId)) calvings.set(damId, []); const l = calvings.get(damId); if (!l.some((x) => x.date === c.date)) l.push(c); };
  for (const c of data.calvings || []) if (!c.deleted && c.damId) addC(c.damId, { date: c.date, ease: c.ease, id: c.id, calves: c.calves || [], sireText: c.sireText });
  for (const [damId, list] of kids) for (const k of list) if (k.dob && (k.bornInHerd || !k.onDate)) addC(damId, { date: k.dob, calves: [{ animalId: k.id, sex: k.sex, alive: true }], derived: true });
  for (const l of calvings.values()) l.sort((x, y) => x.date.localeCompare(y.date));
  return { byId, byTag, kids, weights, wd, groups, calvings };
}

export function weightsOf(ix, a) { return ix.weights.get(a.id) || []; }
export function lastWeight(ix, a) { const w = weightsOf(ix, a); return w.length ? w[w.length - 1] : null; }
/** Daily gain between the last two weighings at least 14 days apart (shorter gaps excluded). */
export function dlwg(ix, a) {
  const w = weightsOf(ix, a); if (w.length < 2) return null;
  const last = w[w.length - 1];
  for (let i = w.length - 2; i >= 0; i--) { const days = daysBetween(w[i].date, last.date); if (days >= 14) return { value: (last.kg - w[i].kg) / days, days, from: w[i], to: last }; }
  return null;
}
export function withdrawal(ix, a, today) { const w = ix.wd.get(normTag(a.tag)); return w && w.until >= today ? w : null; }

/** cow | bull | heifer | calf | weanling | store | finisher */
export function classOf(ix, a, today) {
  if (a.classOverride) return a.classOverride;
  const g = a.groupId ? ix.groups.get(a.groupId) : null;
  if (g && g.class) return g.class;
  const sx = sexCode(a.sex); const m = ageMonths(a, today) ?? 0;
  if (sx === "F") { if (/cow/i.test(a.sex) || (ix.calvings.get(a.id) || []).length) return "cow"; return m < 8 ? "calf" : m < 12 ? "weanling" : "heifer"; }
  if (sx === "B" && (a.stockBull || m >= 24)) return "bull";
  return m < 8 ? "calf" : m < 12 ? "weanling" : "store";
}
export const CLASS_NAMES = { cow: "Cows", bull: "Bulls", heifer: "Heifers", calf: "Calves", weanling: "Weanlings", store: "Stores", finisher: "Finishing" };
export const CLASS_ONE = { cow: "cow", bull: "bull", heifer: "heifer", calf: "calf", weanling: "weanling", store: "store", finisher: "finisher" };

/** "Charolais steer · 26 mo · Shed 2" */
export function describe(ix, a, today) {
  const cls = classOf(ix, a, today);
  const sexWord = { F: cls === "cow" ? "cow" : cls === "calf" ? "heifer calf" : "heifer", M: cls === "calf" ? "bull calf" : "steer", B: cls === "calf" ? "bull calf" : "bull" }[sexCode(a.sex)] || (a.sex || "").toLowerCase();
  const g = a.groupId ? ix.groups.get(a.groupId) : null;
  const nCalves = (ix.calvings.get(a.id) || []).length;
  return [[breedName(a.breed), sexWord].filter(Boolean).join(" "), ageText(a, today), cls === "cow" && nCalves ? ordinal(nCalves) + " calf" : null, g ? g.name : null].filter(Boolean).join(" · ");
}
export function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
/** Born and reared in NI (BCRS): born in this herd, or an NI tag (UK 9 / XI). Bought from GB = no. */
export function bornInNI(a) {
  if (a.bornInNI != null) return !!a.bornInNI;
  if (a.bornInHerd) return true;
  const t = String(a.tag || "").replace(/\s+/g, "").toUpperCase();
  if (/^UK[1-8]/.test(t)) return false; // GB herd marks
  const p = parseTag(a.tag); return p ? p.lead === "9" || p.country === "XI" || p.lead === "0" : true;
}
/** Short display name used in lists: "0412 Daisy" or the tag. */
export function shortName(a) {
  const n = [a.mgmtNo, a.name].filter(Boolean).join(" ");
  return n || null;
}
export const daysOnHolding = (a, today) => daysBetween(a.onDate || a.dob || today, today);
export { addDays };
