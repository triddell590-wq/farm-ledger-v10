// Feed cost and margin cards (Tom, 10 Nov): cost a head and margin over feed for every feed group,
// shown the same way on Feed & silage, Herd → Groups, Money and Today. Only for people who can see
// the money. "Feed used" is worked out from the rations and is never added to money out — the feed
// invoices in Money are the money spent — so nothing is counted twice.
import { html, raw } from "../../core/html.js";
import { icon } from "../../ui/icons.js";
import { canRead } from "../../core/policy.js";
import { moneyText, num } from "../../ui/format.js";
import { groupLabel } from "../../screens/common.js";
import { vatOf } from "../../services/vat.js";
import { pitGeom, silageList } from "./model/feed.js";
import { classOf } from "./model/animals.js";
import { groupCosts, feedCheck } from "./model/feed-costs.js";
import { moneyCard, moneyPrompt } from "../money-card.js";

const p2 = (v) => moneyText(v, true);
const signed = (v) => `${v < 0 ? "−" : ""}${p2(Math.abs(v))}`;

/** Everything the cards need, from a beef snap. null when this person can't see money. */
export function costsFor(snap) {
  if (!canRead(snap.role, "finance")) return null;
  const { s, data, ix, today, meta } = snap;
  const blockKg = pitGeom(silageList(meta.silage)[0] || {})?.blockKg || 0;
  const mealPrice = +s.meal.pricePerTonne || 0, silagePrice = +s.meal.silagePerTonne || 0;
  const valuePerKgLive = (+s.price.perKgDead || 0) * ((+s.processor.ko.Steer || 55) / 100);
  // no scales? the herd's target gain for the class most of the group are in (cows have none)
  const targetGain = (members) => { const by = {}; for (const a of members) { const c = classOf(ix, a, today); by[c] = (by[c] || 0) + 1; } const top = Object.entries(by).sort((x, y) => y[1] - x[1])[0]?.[0]; return top ? +s.dlwgTarget[top] || null : null; };
  const c = groupCosts({ feedGroups: data.feedGroups, adjust: data.feedAdjust, data, ix, today, blockKg, mealPrice, silagePrice, valuePerKgLive, targetGain });
  const check = feedCheck(data.finance, { from: c.from, today, mealFedKg: c.meal, mealPrice }, (e) => vatOf(e).net);
  return { ...c, check, mealPrice, silagePrice, valuePerKgLive, byGroup: new Map(c.rows.map((r) => [r.group.id, r])) };
}

/** One group's line, for Herd → Groups: "£1.52 a head a day · margin £0.84 a head a day". */
export function groupCostLine(r) {
  if (!r) return "";
  const parts = [];
  if (r.headDay != null) parts.push(`${p2(r.headDay)} a head a day`);
  if (r.marginHeadDay != null) parts.push(`margin ${signed(r.marginHeadDay)} a head a day`);
  if (r.marginHeadDay != null && r.gainSource !== "weighed") parts.push({ eye: "(from weights by eye)", expected: "(from your expected gain)", target: "(from the target gain)" }[r.gainSource]);
  return parts.join(" · ");
}

/** The full section: two headline cards, every group, and the invoices-against-feed check. */
export function costSection(snap, k, { lid, title = "Feed cost and margin", showCheck = true } = {}) {
  if (!k) return "";
  if (!k.rows.length) return html`<div class="section">${groupLabel(title, "this month")}<div class="card pad ink-2">Set what each group eats in Herd → Groups to see feed cost per head and margin per group.</div></div>`;
  if (!k.priced) return html`<div class="section">${groupLabel(title, "this month")}<a class="card pad fc-prompt" href="#/l/${lid}/feed#prices"><b>Add a meal price and a silage value</b><span>to see what each group's feed costs a head and its margin.</span>${raw(icon("chevron"))}</a></div>`;
  const ck = k.check;
  return html`<div class="section fc" id="costs">${groupLabel(title, `this month · ${k.days} day${k.days === 1 ? "" : "s"}`)}
    <div class="tiles">
      <div class="num-tile"><span class="label">Feed used</span><span class="value">${moneyText(k.cost)}</span><span class="delta">${p2(k.dayCost)} a day now${k.heads ? ` · ${p2(k.dayCost / k.heads)} a head` : ""}</span></div>
      <div class="num-tile"><span class="label">Margin over feed</span><span class="value ${k.marginDay == null ? "" : k.marginDay >= 0 ? "ok-ink" : "late-ink"}">${k.marginDay == null ? "—" : `${signed(k.marginDay)}`}</span><span class="delta">${k.marginDay == null ? (k.valuePerKgLive ? "set an expected gain" : "add today's £/kg price") : k.estimated ? "a day · estimate" : "a day, from weighings"}</span></div></div>
    <div class="list fc-groups" style="margin-top:12px">${k.rows.map((r) => html`<a class="row no-lead" href="#/l/${lid}/groups"><span class="main"><span class="primary">${r.group.name}</span>
        <span class="secondary">${r.heads} head · ${r.headDay != null ? `${p2(r.headDay)} a head a day` : "no feed today"}${r.gain != null ? ` · ${r.gainSource === "weighed" ? "gaining" : "about"} ${num(r.gain, 2)} kg a day${{ weighed: " (weighed)", eye: " (by eye)", expected: " (your estimate)", target: " (target)" }[r.gainSource]}` : ""}</span>
        <span class="secondary">${moneyText(r.cost)} this month</span></span>
        <span class="fc-v"><b class="${r.marginHeadDay == null ? "" : r.marginHeadDay >= 0 ? "ok-ink" : "late-ink"}">${r.marginHeadDay == null ? "—" : signed(r.marginHeadDay)}</b><span>${r.marginHeadDay == null ? (r.gain == null ? "no gain set" : "add a price") : r.gainSource === "weighed" ? "margin a head a day" : "margin a head a day (est.)"}</span></span></a>`)}</div>
    ${showCheck ? html`<div class="card pad fc-check" style="margin-top:12px"><b>Feed invoices against feed used</b>
      <span>Feed invoices this month (ex VAT): <b>${moneyText(ck.bought)}</b>${ck.invoices ? ` from ${ck.invoices} invoice${ck.invoices === 1 ? "" : "s"}` : ""}</span>
      ${ck.fed != null ? html`<span>Meal fed this month: <b>${moneyText(ck.fed)}</b></span>
      <span class="${Math.abs(ck.diff) < 50 ? "" : ck.diff > 0 ? "" : "due-ink"}">${Math.abs(ck.diff) < 50 ? "About the same — invoices and rations agree." : ck.diff > 0 ? `${moneyText(ck.diff)} more bought than fed — likely still in the bin, or feed for other stock.` : `${moneyText(-ck.diff)} more fed than bought — an invoice may be missing, or a ration is too high.`}</span>` : ""}
      <span class="ink-2">Feed used is worked out from the rations and is never added to Money — your invoices are the money spent, so nothing is counted twice.</span></div>` : ""}</div>`;
}

/** Today: one tap-through card with the day's feed cost and margin. */
export function costTodayCard(snap, k) {
  if (!k || !k.rows.length) return "";
  if (!k.priced) return moneyPrompt("Feed cost and margin", "Add a meal price and a silage value to see what feeding costs a head and the margin.", `#/l/${snap.lid}/feed#prices`);
  return moneyCard({ title: "Feed cost and margin", href: `#/l/${snap.lid}/feed#costs`, open: "Each group's cost and margin",
    lines: [["Feed", `${p2(k.dayCost)} a day`], ["Per head", `${k.heads ? p2(k.dayCost / k.heads) : "—"} a day`],
      [k.estimated ? "Margin over feed (est.)" : "Margin over feed", k.marginDay == null ? "set an expected gain" : `${signed(k.marginDay)} a day`, k.marginDay == null ? "" : k.marginDay >= 0 ? "ok" : "late"]] });
}
