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

/** Who a feed group feeds. Linked to a herd group (Tom, 5 Nov: feed set from Herd → Groups) it's
 *  whoever is in that group, so moving cattle in or out changes the feed; otherwise the picked cattle. */
export function feedMembers(g, data) {
  if (g && g.groupId) return (data?.animals || []).filter((a) => a.groupId === g.groupId).map((a) => a.id);
  return g?.animalIds || [];
}
/** The feed group for a herd group: the one linked to it, else (feed groups made before the link
 *  existed) one with the same name or exactly the same cattle on farm — linked when next saved. */
export function feedForGroup(feedGroups, group, data) {
  const live = (feedGroups || []).filter((f) => !f.deleted); if (!group) return null;
  const linked = live.find((f) => f.groupId === group.id); if (linked) return linked;
  const free = live.filter((f) => !f.groupId);
  const name = String(group.name || "").trim().toLowerCase();
  const byName = name && free.find((f) => String(f.name || "").trim().toLowerCase() === name); if (byName) return byName;
  if (!data) return null;
  const on = new Set((data.animals || []).filter(onFarm).map((a) => a.id));
  const mine = (data.animals || []).filter((a) => on.has(a.id) && a.groupId === group.id).map((a) => a.id).sort().join();
  return (mine && free.find((f) => (f.animalIds || []).filter((id) => on.has(id)).sort().join() === mine)) || null;
}
/** The ration in force on `day`. */
export const rationOn = (g, day) => (g?.rations || []).filter((x) => x.from <= day).sort((a, b) => b.from.localeCompare(a.from))[0] || null;

const has = (v) => v != null && v !== "";
/**
 * One day of a ration for a group of `heads`. Rations saved from 10 Nov hold the WHOLE GROUP's
 * amounts (mealGroup, silageGroup kg a day, or blocks every N days) — Tom enters what the batch gets
 * and the per-head figures are worked out. Older rations hold per-head kg (meal, silage) as in v9.
 */
export function rationDay(r, heads, blockKg) {
  if (!r || !heads) return { meal: 0, silage: 0, mealHead: 0, silageHead: 0 };
  const meal = has(r.mealGroup) ? n(r.mealGroup) : n(r.meal) * heads;
  const silage = rationSilageKg(r, heads, blockKg);
  return { meal, silage, mealHead: meal / heads, silageHead: silage / heads };
}

/** Meal and silage today for every feed group (v9: group.animalIds + dated rations; meal day changes). */
export function mealToday(feedGroups, adjust, data, today, blockKg = 0) {
  let kg = 0, silage = 0; const rows = [];
  const live = new Set(data.animals.filter(onFarm).map((a) => a.id));
  for (const g of feedGroups || []) {
    if (g.deleted) continue;
    const r = (g.rations || []).filter((x) => x.from <= today).sort((a, b) => b.from.localeCompare(a.from))[0];
    const heads = feedMembers(g, data).filter((id) => live.has(id)).length;
    const day = rationDay(r, heads, blockKg); let meal = day.meal;
    const adj = (adjust || []).find((x) => !x.deleted && x.groupId === g.id && x.date === today);
    if (adj && has(adj.meal)) meal = n(adj.meal);
    let sil = day.silage; if (adj && has(adj.silage)) sil = n(adj.silage);
    kg += meal; silage += sil;
    rows.push({ group: g, ration: r || null, heads, perHead: heads ? meal / heads : 0, meal, silage: sil, silageHead: heads ? sil / heads : 0, blocks: r && n(r.blocks) > 0 ? n(r.blocks) / (n(r.every) > 1 ? n(r.every) : 1) : 0 });
  }
  return { kg, silage, rows };
}

/** Meal calculator (design/10 §8.3): editable table, kg/head/day for a 500 kg steer. Guide only. */
export const MEAL_TABLE = { good: { 0.8: 2, 1.0: 3, 1.2: 4.5 }, average: { 0.8: 3, 1.0: 4.5, 1.2: 6 }, poor: { 0.8: 4, 1.0: 5.5, 1.2: 7 } };
export function mealFor(quality, gain) { const t = MEAL_TABLE[quality] || MEAL_TABLE.average; const ks = Object.keys(t).map(Number).sort((a, b) => a - b); const k = ks.reduce((p, c) => (Math.abs(c - gain) < Math.abs(p - gain) ? c : p), ks[0]); return t[k]; }

/** v9 ration maths: silage kg eaten by the feed groups from `from` to `today` inclusive. */
export function rationSilageKg(r, heads, blockKg) {
  if (!r || !heads) return 0;
  if (n(r.blocks) > 0) return blockKg ? (n(r.blocks) / (n(r.every) > 1 ? n(r.every) : 1)) * blockKg : 0;
  if (has(r.silageGroup)) return n(r.silageGroup);
  return n(r.silage) * heads;
}
export const silageEatenKg = (feedGroups, adjust, data, from, today, blockKg) => feedEaten(feedGroups, adjust, data, from, today, blockKg).silage;
/** Meal and silage kg fed by the groups from `from` to `today` inclusive (v9 rations + day adjustments). */
export function feedEaten(feedGroups, adjust, data, from, today, blockKg) {
  const out = { meal: 0, silage: 0 }; if (!from) return out;
  const adj = new Map((adjust || []).filter((a) => !a.deleted).map((a) => [a.groupId + "|" + a.date, a]));
  for (const g of feedGroups || []) {
    if (g.deleted) continue; const ids = new Set(feedMembers(g, data));
    const rs = (g.rations || []).slice().sort((a, b) => a.from.localeCompare(b.from)); if (!rs.length) continue;
    let d = rs[0].from < from ? from : rs[0].from;
    for (let i = 0; d <= today && i < 3660; d = addDays(d, 1), i++) {
      const r = rs.filter((x) => x.from <= d).pop(); if (!r) continue;
      const heads = (data?.animals || []).filter((a) => ids.has(a.id) && (!a.offDate || a.offDate > d) && (!a.dob || a.dob <= d)).length;
      const day = rationDay(r, heads, blockKg); let sil = day.silage, meal = day.meal; const a = adj.get(g.id + "|" + d);
      if (a && a.silage != null && a.silage !== "") sil = n(a.silage);
      if (a && a.meal != null && a.meal !== "") meal = n(a.meal);
      out.silage += sil; out.meal += meal;
    }
  }
  return out;
}
