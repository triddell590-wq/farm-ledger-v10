// Beef reads dated region rules from the shared content records (design/01 §17.1,
// content/region-rules.js) — nothing here hard-codes NIFAIS-Online deadlines, the market
// standstill or the BVD breeding-female rule. s.region comes from the ledger (data.js).
import { regionRule, ruleRecord, ruleInForce, bannerItems } from "../../../content/region-rules.js";
import { shortDate } from "../../../core/dates.js";

export const regionOf = (s) => (s && s.region) || "NI";

/** NIFAIS Online used as the herd register: { birth, moveOff, other } days, or null (rule absent). */
export function nifaisOnline(s) {
  const r = regionRule("herdRegisterNifais", regionOf(s));
  return r ? { birth: r.birthDays, moveOff: r.moveOffDays, other: r.otherEventDays } : null;
}
/** True when the keeper chose NIFAIS Online and the region has that rule. */
export const usesNifaisRegister = (s) => s.registerMode === "nifais" && !!nifaisOnline(s);
/** Plain-English summary for screens: "births within 23 days, moves off on the day, other events within 3 days". */
export function nifaisOnlineText(s) {
  const n = nifaisOnline(s); if (!n) return "";
  const d = (x) => (x === 0 ? "on the day" : `within ${x} day${x === 1 ? "" : "s"}`);
  return `births ${d(n.birth)}, moves off ${d(n.moveOff)}, other events ${d(n.other)}`;
}

/** Days an animal must wait after a market before going to another (null = no rule). */
export const standstillDays = (s) => regionRule("marketStandstill", regionOf(s))?.days ?? null;

/** BVD breeding-female move rule: null when absent/withdrawn; inForce follows status + date. */
export function bvdFemaleRule(s, today) {
  const r = ruleRecord("bvdBreedingFemale", regionOf(s));
  if (!r || r.status === "withdrawn") return null;
  return { ...r.values, from: r.from || null, fromText: r.from ? shortDate(r.from) : "", status: r.status, inForce: ruleInForce("bvdBreedingFemale", today, regionOf(s)), source: r.source, checkedOn: r.checkedOn };
}

/** Farm-wide disease banner lines for a Beef ledger: [{ id, level, text, source, checkedOn }]. */
export const beefBanner = (s) => bannerItems(regionOf(s), ["beef"]);
