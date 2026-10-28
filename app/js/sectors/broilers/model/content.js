// Broilers content: breed objectives, legal tiers, Red Tractor wording, antibiotic classes,
// NI bank holidays, the poultry disease banner and region rule records (design/01 §17.1).
// Everything here is content (dated, sourced), never hard-coded inside the screens.

// Breed objectives, as-hatched, metric. Weekly rows from Research C (Broilers tool 2); the app
// interpolates days in between. Builder note: the full daily tables should replace these when
// the current PDFs are obtained from Aviagen / Cobb-Vantress (BUILD-LOG known gap).
export const BREED_STANDARDS = [
  {
    id: "ross308-2022", hybrid: "Ross 308", edition: "Ross 308 Broiler Performance Objectives 2022 (Aviagen)",
    source: "Research C Broilers tool 2 (weekly rows; days in between interpolated)",
    days: [
      { d: 0, wtG: 44, cumFcr: null, feedG: 0 }, { d: 7, wtG: 213, cumFcr: 0.78, feedG: 35 }, { d: 14, wtG: 533, cumFcr: 1.005, feedG: 67 },
      { d: 21, wtG: 1012, cumFcr: 1.142, feedG: 105 }, { d: 28, wtG: 1616, cumFcr: 1.269, feedG: 145 }, { d: 35, wtG: 2296, cumFcr: 1.399, feedG: 180 },
      { d: 42, wtG: 2998, cumFcr: 1.531, feedG: 207 }, { d: 49, wtG: 3681, cumFcr: 1.663, feedG: 225 },
    ],
  },
  {
    id: "cobb500-2018", hybrid: "Cobb 500", edition: "Cobb 500 Broiler Performance & Nutrition Supplement L-2114-08 (2018)",
    source: "Research C Broilers tool 2 (weekly rows; check the current supplement from cobb-vantress.com)",
    days: [
      { d: 0, wtG: 42, cumFcr: null, feedG: 0 }, { d: 7, wtG: 193, cumFcr: 1.03, feedG: null }, { d: 14, wtG: 528, cumFcr: 1.22, feedG: null },
      { d: 21, wtG: 1018, cumFcr: 1.37, feedG: null }, { d: 28, wtG: 1615, cumFcr: 1.5, feedG: null }, { d: 35, wtG: 2273, cumFcr: 1.61, feedG: null },
      { d: 42, wtG: 2952, cumFcr: 1.76, feedG: null }, { d: 49, wtG: 3617, cumFcr: 1.91, feedG: null },
    ],
  },
];
export const standardById = (id) => BREED_STANDARDS.find((s) => s.id === id) || BREED_STANDARDS[0];
export const standardForHybrid = (h) => BREED_STANDARDS.find((s) => s.hybrid === h) || null;

// Welfare of Farmed Animals Regs (NI) 2012 Sch. 5 paras 12–14 and Red Tractor Chicken v5.1.
export const DENSITY_TIERS = [
  { kg: 33, key: "notify", label: "33 — tell DAERA 15 working days before going above" },
  { kg: 38, key: "rt", label: "38 — Red Tractor planned maximum" },
  { kg: 39, key: "approval", label: "39 — above needs DAERA approval" },
  { kg: 42, key: "max", label: "42 — legal maximum" },
];

export const RT_VERSION = { name: "Red Tractor Chicken", version: "5.1 (modified)", effective: "2025-02-01" };
export const RT_HEADER = "Based on Red Tractor Chicken Standards version 5.1 (modified), effective 1 February 2025. Not endorsed by Red Tractor. Audited in Northern Ireland by NIFCC.";
export const RT_NOTE = "Red Tractor expects to consult on new poultry standards from November 2026 — this checklist will update when they are published.";

// Red Tractor Chicken v5.1 antibiotic rules (Research B): by active substance.
export const BANNED = ["ceftiofur", "cefquinome", "cefotaxime", "ceftriaxone", "cefoperazone", "vancomycin", "avoparcin", "teicoplanin", "colistin", "polymyxin"];
export const LAST_RESORT = ["tylosin", "tilmicosin", "tylvalosin", "erythromycin", "spiramycin", "tulathromycin", "gamithromycin", "enrofloxacin", "marbofloxacin", "danofloxacin", "difloxacin", "flumequine"];
export function antibioticFlag(text) {
  const t = String(text || "").toLowerCase();
  if (BANNED.some((x) => t.includes(x))) return { level: "late", text: "Not allowed under Red Tractor Chicken (3rd/4th-generation cephalosporins, glycopeptides, colistin)" };
  if (LAST_RESORT.some((x) => t.includes(x))) return { level: "due", text: "Last resort only (macrolide or fluoroquinolone): record your vet's reason" };
  return null;
}

/** Poultry lines of the farm-wide disease banner (01-platform §16.1). */
export const DISEASE_BANNER = [
  { id: "ai-2026", species: ["poultry"], level: "info", text: "Bird flu: no housing order in NI · lifted 15 May 2026. Report any suspicion to DAERA.", checkedOn: "2026-10-15", source: "DAERA, via Research B verification pass" },
];
// Region rule values (design/01 §17.1) are read through the shared loader
// content/region-rules.js. Broiler keys not yet in the shared records (broilerDensity,
// broilerSalmonella, fci, feedWithdrawal — asked of the Coordinator) fall back to the values
// below, with their sources; a shared record with the same key always wins.
import { regionRule as sharedRule } from "../../../content/region-rules.js";
const FALLBACK = {
  inventories: { birdsCountMonthDay: "06-01", reminderMonthDay: "05-25", perEstablishment: true, survey: "NISRA online survey" }, // DAERA / NISRA (Research B verification pass)
  broilerDensity: { notifyAbove: 33, approvalAbove: 39, legalMax: 42, notifyWorkingDays: 15, approvalCrops: 7 }, // WoFA Regs (NI) 2012 Sch. 5 paras 12–14
  broilerSalmonella: { windowDays: 21, longWindowDays: 42, longAgeDays: 82, swabPairs: 2, noLitterDays: 2, warnDaysBefore: 3, keepYears: 2 }, // Reg. (EU) 200/2012 Annex pt 2.1(a)
  fci: { hoursBefore: 24 }, // Reg. (EC) 853/2004 Annex II Sec. III
  feedWithdrawal: { lawHours: 12, schemeHours: 9 }, // Sch. 5 para 4; Red Tractor Chicken v5.1
  authority: { name: "DAERA", densityBody: "DAERA" },
};
let REGION = "NI";
/** The ledger's region (set when a snapshot is built). */
export function useRegion(r) { REGION = r || "NI"; }
export function regionRule(key, region = REGION) {
  const shared = sharedRule(key, region) || (region !== "NI" ? sharedRule(key, "NI") : null);
  const base = FALLBACK[key] || null;
  if (!shared) return base;
  const out = { ...(base || {}), ...shared };
  if (key === "inventories" && shared.pigsAndBirdsOn) out.birdsCountMonthDay = shared.pigsAndBirdsOn;
  return out;
}

// NI bank holidays (content; substitutes applied in model/dates.js).
export const NI_FIXED_HOLIDAYS = ["01-01", "03-17", "07-12", "12-25", "12-26"];

export const CULL_REASONS = [["legs", "Legs"], ["runt", "Small / runt"], ["ascites", "Ascites"], ["injury", "Injury"], ["other", "Other"]];
export const HOUSE_CHECKS = ["Feeders", "Drinkers", "Lights", "Ventilation"];
export const TURNAROUND_STEPS = [
  ["litterOut", "Litter out"], ["washed", "Washed"], ["disinfected", "Disinfected"], ["swabs", "Hygiene swabs"], ["dry", "Dry"],
  ["pest", "Pest control"], ["waterLines", "Water lines sanitised"], ["rebedded", "Re-bedded"], ["preheat", "Pre-heat on"], ["placed", "Chicks placed"],
];
export const SALM_LABS = ["AFBI Stormont", "AFBI Omagh"]; // editable list in settings (guess-level: confirm DAERA-approved labs)
export const SALM_RESULTS = [["pending", "Waiting for result"], ["negative", "Negative"], ["SE", "S. Enteritidis"], ["ST", "S. Typhimurium"], ["mST", "Monophasic S. Typhimurium"], ["other", "Other Salmonella"]];
