// Silage pit and fodder budget (design/10 §8). Pit geometry kept from v9.14 (feet, blocks cut
// by the shear grab) so Tom's pit setup carries straight over; metres are accepted too. Pure.
import { addDays, daysBetween } from "../../../core/dates.js";
import { classOf, onFarm } from "./animals.js";

export const FT3_M3 = 0.0283168;
export const PIT_DEFAULTS = { lenFt: 110, widFt: 23, htFt: 12, grabFt: 4, biteFt: 2.5, blockHtFt: 2.5, density: 700 };
const n = (v) => { const x = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return isFinite(x) ? x : 0; };

/** v9 pit geometry. Accepts v9 names (lenFt/widFt/htFt) and the v10 synthetic names (lengthFt…). */
export function pitGeom(p) {
  p = p || {};
  const L = n(p.lenFt ?? p.lengthFt), W = n(p.widFt ?? p.widthFt), H = n(p.htFt ?? p.heightFt);
  if (!(L > 0 && W > 0 && H > 0)) return null;
  const grab = n(p.grabFt ?? p.blockWFt) > 0 ? n(p.grabFt ?? p.blockWFt) : PIT_DEFAULTS.grabFt;
  const bite = n(p.biteFt ?? p.blockDFt) > 0 ? n(p.biteFt ?? p.blockDFt) : PIT_DEFAULTS.biteFt;
  const bh = n(p.blockHtFt) > 0 ? n(p.blockHtFt) : PIT_DEFAULTS.blockHtFt;
  const blockM3 = grab * bite * bh * FT3_M3;
  const weighed = n(p.blockKg) > 0 ? n(p.blockKg) : null;
  const density = weighed ? weighed / blockM3 : n(p.density) > 0 ? n(p.density) : PIT_DEFAULTS.density;
  const volM3 = L * W * H * FT3_M3;
  const across = Math.max(1, Math.round(W / grab)), high = Math.max(1, Math.round(H / bh)), deep = Math.max(1, Math.round(L / bite));
  return { L, W, H, grab, bite, bh, density, volM3, tonnes: (volM3 * density) / 1000, blockKg: blockM3 * density, across, high, deep, blocks: across * high * deep };
}
/** Fresh tonnes a pit holds when full. */
export const pitTonnes = (p) => { const g = pitGeom(p); return g ? g.tonnes : n(p?.pitTonnes); };

/**
 * Stock left: every pit's tonnes minus what's been eaten, plus bales. Eaten = blocks ticked off
 * ("Used today") + tonnes typed + (for the first pit, as v9 did) silage in the feed-group rations
 * since the pit was opened. feed = { feedGroups, adjust, data, today } (optional).
 */
export function silageStock(silage, feed) {
  const pits = silageList(silage);
  let full = 0, used = 0, rationT = 0;
  pits.forEach((p, i) => {
    const g = pitGeom(p); const t = pitTonnes(p); full += t;
    if (g) used += Math.min(g.blocks, n(p.usedBlocks)) * g.blockKg / 1000;
    used += n(p.usedT);
    if (i === 0 && feed && (p.openedOn || silage?.openedOn)) { rationT = silageEatenKg(feed.feedGroups, feed.adjust, feed.data, p.openedOn || silage.openedOn, feed.today, g ? g.blockKg : 0) / 1000; used += rationT; }
  });
  const bales = (silage?.bales || []).reduce((s, b) => s + n(b.count) * n(b.kg) / 1000, 0);
  return { fullT: full + bales, usedT: used, rationT, leftT: Math.max(0, full - used) + bales, bales, pits };
}
/** Pits as a list (v9 kept one pit object; v10 keeps pits[]). */
export function silageList(silage) {
  if (!silage) return [];
  if (Array.isArray(silage.pits)) return silage.pits;
  if (pitGeom(silage) || n(silage.pitTonnes)) return [{ name: "Silage pit", ...silage }];
  return [];
}

const CLASS_KEY = { cow: "cow", bull: "bull", heifer: "heifer", store: "store", weanling: "weanling", calf: "calf", finisher: "finisher" };
/** Head on farm by class, for the fodder budget. */
export function headByClass(data, ix, today) {
  const out = {}; for (const a of data.animals) if (onFarm(a)) { const k = CLASS_KEY[classOf(ix, a, today)] || "store"; out[k] = (out[k] || 0) + 1; }
  return out;
}
/** Fodder budget: run-out date and short/spare against turnout. heads overrides for "what if". */
export function fodderBudget({ leftT, heads, rates, today, turnout }) {
  const perDay = Object.entries(heads).reduce((s, [k, h]) => s + h * ((rates[k] ?? 1) / 30.4), 0);
  if (!perDay) return { perDay: 0, daysLeft: null, runOut: null, short: null };
  const daysLeft = Math.floor(leftT / perDay);
  const runOut = addDays(today, daysLeft);
  const short = turnout ? daysBetween(runOut, turnout) : null; // >0 = days short
  return { perDay, daysLeft, runOut, short, shortT: short > 0 ? short * perDay : 0 };
}

/** Meal today from feed groups (v9: group.animalIds + dated rations {from, meal kg/head}). */
export function mealToday(feedGroups, adjust, data, today) {
  let kg = 0; const rows = [];
  const live = new Set(data.animals.filter(onFarm).map((a) => a.id));
  for (const g of feedGroups || []) {
    if (g.deleted) continue;
    const r = (g.rations || []).filter((x) => x.from <= today).sort((a, b) => b.from.localeCompare(a.from))[0];
    const heads = (g.animalIds || []).filter((id) => live.has(id)).length;
    let meal = r ? n(r.meal) * heads : 0;
    const adj = (adjust || []).find((x) => !x.deleted && x.groupId === g.id && x.date === today);
    if (adj && adj.meal != null && adj.meal !== "") meal = n(adj.meal);
    kg += meal; rows.push({ group: g, heads, perHead: r ? n(r.meal) : 0, meal });
  }
  return { kg, rows };
}

/** Meal calculator (design/10 §8.3): editable table, kg/head/day for a 500 kg steer. Guide only. */
export const MEAL_TABLE = { good: { 0.8: 2, 1.0: 3, 1.2: 4.5 }, average: { 0.8: 3, 1.0: 4.5, 1.2: 6 }, poor: { 0.8: 4, 1.0: 5.5, 1.2: 7 } };
export function mealFor(quality, gain) { const t = MEAL_TABLE[quality] || MEAL_TABLE.average; const ks = Object.keys(t).map(Number).sort((a, b) => a - b); const k = ks.reduce((p, c) => (Math.abs(c - gain) < Math.abs(p - gain) ? c : p), ks[0]); return t[k]; }

/** v9 ration maths: silage kg eaten by the feed groups from `from` to `today` inclusive. */
export function rationSilageKg(r, heads, blockKg) {
  if (!r) return 0;
  if (n(r.blocks) > 0) return blockKg ? (n(r.blocks) / (n(r.every) > 1 ? n(r.every) : 1)) * blockKg : 0;
  return n(r.silage) * heads;
}
export const silageEatenKg = (feedGroups, adjust, data, from, today, blockKg) => feedEaten(feedGroups, adjust, data, from, today, blockKg).silage;
/** Meal and silage kg fed by the groups from `from` to `today` inclusive (v9 rations + day adjustments). */
export function feedEaten(feedGroups, adjust, data, from, today, blockKg) {
  const out = { meal: 0, silage: 0 }; if (!from) return out;
  const adj = new Map((adjust || []).filter((a) => !a.deleted).map((a) => [a.groupId + "|" + a.date, a]));
  for (const g of feedGroups || []) {
    if (g.deleted) continue; const ids = new Set(g.animalIds || []);
    const rs = (g.rations || []).slice().sort((a, b) => a.from.localeCompare(b.from)); if (!rs.length) continue;
    let d = rs[0].from < from ? from : rs[0].from;
    for (let i = 0; d <= today && i < 3660; d = addDays(d, 1), i++) {
      const r = rs.filter((x) => x.from <= d).pop(); if (!r) continue;
      const heads = (data?.animals || []).filter((a) => ids.has(a.id) && (!a.offDate || a.offDate > d) && (!a.dob || a.dob <= d)).length;
      let sil = rationSilageKg(r, heads, blockKg), meal = n(r.meal) * heads; const a = adj.get(g.id + "|" + d);
      if (a && a.silage != null && a.silage !== "") sil = n(a.silage);
      if (a && a.meal != null && a.meal !== "") meal = n(a.meal);
      out.silage += sil; out.meal += meal;
    }
  }
  return out;
}
