// Feed cost and margin over feed per feed group (Tom, 10 Nov). Pure.
// Money keeps only real invoices; this is "feed used" — what each group ate, valued at the meal
// price and a silage value per tonne — for cost per head and margin per group. It is never added to
// money out, so nothing is counted twice. A monthly check lines up feed invoices against meal fed.
import { addDays, daysBetween } from "../../../core/dates.js";
import { feedEaten, mealToday, feedMembers } from "./feed.js";
import { onFarm, dlwg } from "./animals.js";

const n = (v) => (isFinite(+v) ? +v : 0);
export const monthStart = (today) => `${today.slice(0, 7)}-01`;
/** Money entries that are feed bought (meal, nuts, concentrates, minerals…), not the price record. */
export const isFeedInvoice = (e) => e && !e.deleted && e.kind === "expense" && /feed|meal|nuts|concentrate|ration|blend/i.test(`${e.category || ""}`);

/**
 * Per feed group, from `from` to `today`: meal and silage fed and what they cost; today's cost a
 * head; margin over feed a head a day = (average daily gain of the group's cattle × value of a kg
 * live) − today's feed cost a head. valuePerKgLive = £/kg dead × kill-out %.
 */
// Weighing is optional (Tom, 20 Nov): gain comes from weights when there are any (two 14+ days
// apart — scales, tape or judged by eye, which counts as an estimate), otherwise the gain the farmer expects for the group, otherwise the herd's target gain for
// the class most of the group are in (Targets). gainSource says which, so estimates are labelled.
export function groupCosts({ feedGroups, adjust, data, ix, today, blockKg = 0, mealPrice = 0, silagePrice = 0, valuePerKgLive = 0, from = monthStart(today), targetGain = () => null }) {
  const tday = mealToday(feedGroups, adjust, data, today, blockKg);
  const days = daysBetween(from, today) + 1;
  const rows = [];
  for (const r of tday.rows) {
    if (!r.ration) continue;
    const g = r.group; const eaten = feedEaten([g], adjust, data, from, today, blockKg);
    const costOf = (meal, sil) => (meal / 1000) * mealPrice + (sil / 1000) * silagePrice;
    const dayCost = costOf(r.meal, r.silage); const headDay = r.heads ? dayCost / r.heads : null;
    const ids = new Set(feedMembers(g, data));
    const members = (data.animals || []).filter((a) => ids.has(a.id) && onFarm(a));
    const dl = members.map((a) => dlwg(ix, a)).filter((d) => d && isFinite(d.value)); const gains = dl.map((d) => d.value);
    const expected = +g.expectedGain > 0 ? +g.expectedGain : null; const target = targetGain(members);
    const gain = gains.length ? gains.reduce((t, v) => t + v, 0) / gains.length : expected ?? (target > 0 ? target : null);
    const gainSource = gains.length ? (dl.some((d) => d.byEye) ? "eye" : "weighed") : expected != null ? "expected" : gain != null ? "target" : null;
    const valueHeadDay = gain != null && valuePerKgLive ? gain * valuePerKgLive : null;
    const marginHeadDay = valueHeadDay != null && headDay != null ? valueHeadDay - headDay : null;
    rows.push({ group: g, heads: r.heads, mealDay: r.meal, silageDay: r.silage, dayCost, headDay,
      meal: eaten.meal, silage: eaten.silage, cost: costOf(eaten.meal, eaten.silage), gain, gainSource, weighed: gains.length, valueHeadDay, marginHeadDay,
      marginDay: marginHeadDay != null ? marginHeadDay * r.heads : null });
  }
  const tot = (k) => rows.reduce((t, x) => t + (x[k] || 0), 0);
  const withMargin = rows.filter((x) => x.marginDay != null);
  const estimated = withMargin.some((x) => x.gainSource !== "weighed");
  return { from, days, rows, estimated, cost: tot("cost"), dayCost: tot("dayCost"), meal: tot("meal"), silage: tot("silage"), heads: tot("heads"),
    marginDay: withMargin.length ? withMargin.reduce((t, x) => t + x.marginDay, 0) : null, priced: !!(mealPrice || silagePrice) };
}

/** This month: feed invoices (net of VAT where known) against the meal fed, valued at the meal price. */
export function feedCheck(finance, { from, today, mealFedKg, mealPrice }, netOf = (e) => n(e.amount)) {
  const inv = (finance || []).filter((e) => isFeedInvoice(e) && e.date >= from && e.date <= today);
  const bought = inv.reduce((t, e) => t + netOf(e), 0);
  const fed = mealPrice ? (mealFedKg / 1000) * mealPrice : null;
  return { invoices: inv.length, bought, fed, diff: fed != null ? bought - fed : null };
}
void addDays;
