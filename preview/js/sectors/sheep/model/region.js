// Region rule records (design/01 §17.1) — re-exported from the shared, Coordinator-owned
// content module so Sheep never hard-codes deadlines or day counts.
export { regionRule, ruleRecord, ruleInForce, rulesFor, bannerItems, useRegionRules, resetRegionRules } from "../../../content/region-rules.js";
