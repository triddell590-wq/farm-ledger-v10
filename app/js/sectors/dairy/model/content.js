// Region content the Dairy ledger reads (NI). Kept as content records, not code, so a date or
// rule change is an edit here (later: a fetched, cached content file shared by all ledgers —
// see coordinator/requests.md). Nothing below is hard-coded into the logic.

import { regionRule, ruleRecord, ruleInForce, bannerItems } from "../../../content/region-rules.js";

// On-farm register timings (dairy: first tag within 36 hours, register 7 days, NIFAIS 27 days).
// Read from the shared region content when it carries them (key asked for: "cattleRegisterOnFarm",
// coordinator/requests.md 2026-10-19); until then this content record is the fallback.
const ONFARM_FALLBACK = { NI: { tagHours: 36, birthRegisterDays: 7, birthNifaisDays: 27, moveRegisterHours: 36, moveNifaisDays: 7, deathDays: 7 } };
const ROUTES = {
  NI: { routes: "DAERA Online Services, phone 0300 200 7855, or paper MC1 (births/deaths) / MC2 (moves)", lateBirth: "Late births get NNO status, which restricts moves and may affect slaughter and subsidy.", retentionYears: 10 },
};

/** Notification deadlines for the herd-register mode (design/12 §18), from region content. */
export function registerRules(mode = "onfarm", region = "NI") {
  const on = regionRule("cattleRegisterOnFarm", region) || ONFARM_FALLBACK[region] || ONFARM_FALLBACK.NI;
  const r = ROUTES[region] || ROUTES.NI;
  if (mode === "nifais") {
    const n = regionRule("herdRegisterNifais", region) || { birthDays: 23, moveOffDays: 0, otherEventDays: 3 };
    return { tagHours: on.tagHours, birthNifaisDays: n.birthDays, moveNifaisDays: n.moveOffDays, deathDays: n.otherEventDays, ...r };
  }
  return { ...on, ...r };
}

/** BVD breeding-female movement rule (design/12 §19), from the shared region record. */
export function bvdRule(region = "NI") {
  const r = ruleRecord("bvdBreedingFemale", region);
  return r ? { region, status: r.status, from: r.from || null, ...r.values, source: r.source, checkedOn: r.checkedOn } : null;
}
/** State of a BVD rule record on a date. rule defaults to the region record. */
export function bvdRuleState(rule, today, region = "NI") {
  rule = rule || bvdRule(region);
  if (!rule) return { inForce: false, line: "", rule: null };
  const inForce = rule.status === "in force" ? !rule.from || today >= rule.from : rule.status === "announced" && !!rule.from && today >= rule.from;
  const when = rule.from ? ` (from ${rule.from.slice(8)}/${rule.from.slice(5, 7)}/${rule.from.slice(0, 4)})` : "";
  return { inForce, rule, line: inForce ? `BVD rules: breeding-age females (${rule.minAgeMonths} months+) in an affected herd can't move for breeding${when}.` : `BVD breeding-female rule ${rule.status} — not in force yet.` };
}
export const BVD_BREEDING_FEMALE_RULE = bvdRule("NI");
export { ruleInForce };

/** Farm-wide disease banner items for cattle (01-platform §16.1), from the shared content. */
export const diseaseBanner = (region = "NI") => bannerItems(region, ["dairy"]);

export const BTV_LICENCE_NOTE = "Allowed in NI under a DAERA general licence";
// Phone number deliberately not given: not confirmed by research (open item). Copy points to vet + DAERA.
export const DISEASE_REPORT = { label: "Report a disease suspicion", text: "Phone your vet or your DAERA Direct office straight away — suspected bluetongue must be reported by law. Then mark the holding restricted here until the results come back." };

/** Red Tractor Dairy header (design/12 §8 — exact copy). */
export const RT_HEADER = "Based on Red Tractor Dairy Standards version 5 (modified), effective 1 February 2025. Not endorsed by Red Tractor.";
export const RT_NOTE = "Red Tractor plans changes for 2027 — this checklist will update when the new standard is published.";
export const RT_VERSION = { name: "Red Tractor Dairy", version: "5 (modified)", effective: "2025-02-01" };
