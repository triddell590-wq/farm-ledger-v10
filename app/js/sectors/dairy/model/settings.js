// Dairy settings and targets (design/12 §12). Everything a processor, vet or region decides is
// a setting with an editable default, never hard-coded (design/12 §17). Region pack: NI.

// Finance doc holding the milk price profile (kind "prices": skipped by every money total, and
// readable only by owner/manager/accountant like all £ — design/01 §15).
export const PRICE_PROFILE_ID = "dairy-price-profile";

export const DEFAULTS = {
  milkingSystem: "Parlour", // "Parlour" | "Robot"
  milkingTimes: ["06:00", "16:30"], // parlour: one entry per milking (am/pm)
  calvingPattern: "All year", // "Spring block" | "Autumn block" | "All year"
  breedingStart: "", // block herds: first day of the breeding season (YYYY-MM-DD)
  breedingWeeks: 12,
  dryOffStart: "", // block herds: first dry-off date shown outside the breeding season
  vwp: 42, // voluntary waiting period, days after calving
  dryPeriod: 60,
  pdFrom: 30, pdTo: 35, // scan window, days after service
  heatFrom: 18, heatTo: 24, // repeat window after a heat or serve
  heiferServeMonths: 13,
  gestation: { HOL: 281, FR: 281, JER: 279, AYR: 279, MB: 285, AA: 283, HER: 285, LIM: 289, CH: 287, BB: 282, SIM: 287, other: 282 },
  processor: "", // milk buyer name (onboarding answer "milkBuyer")
  collection: "daily", // "daily" -> 8 °C, "alternate" -> 6 °C
  tankLogOn: true,
  bands: { sccWarn: 200, tbcWarn: 30, nearLegalPct: 85 },
  price: { basePpl: null, baseFat: 4.0, baseProtein: 3.3, fatPer01: 0, proteinPer01: 0, sccBands: [], tbcBands: [], deductPpl: 0 },
  matureKg: 650,
  birthKg: 40,
  calfPlan: { lPerFeed: 3, feedsPerDay: 2, gPerL: 150, feedTimes: ["07:00", "17:00"] },
  mobilityWeeks: 6,
  cullWeights: { age: 1, scc: 1, cases: 1, daysOpen: 1, lameness: 1, yield: 1 },
  registerMode: "onfarm", // "onfarm" | "nifais" (design/12 §18)
  tbIntervalMonths: 12,
  tbLastDate: "",
  slurry: { capacityM3: 0, cows: null, youngstock: null, calves: null, perCowWk: 0.37, perYoungWk: 0.19, perCalfWk: 0.08, extraWk: 0, targetWeeks: 22 },
  heiferMaxCalvingMonths: 24,
};

// Where each default comes from (shown beside the setting).
export const SOURCES = {
  vwp: "Common farm choice 42–50 days",
  dryPeriod: "Standard practice; editable",
  tank: "Red Tractor Dairy MP.6/7; Reg. 853/2004 cooling (≤ 8 °C daily, ≤ 6 °C alternate-day collection)",
  quality: "Reg. (EC) 853/2004: TBC ≤ 100,000/ml (2-month geometric mean), SCC ≤ 400,000/ml (3-month geometric mean)",
  bands: "Processor bands are your processor's — defaults only warn (NI processor bands are not published)",
  growth: "CAFRE / AHDB heifer targets",
  slurry: "Guide figures only — check against the NI Nitrates Action Programme tables for your stock",
  gestation: "Breed society averages; editable",
  weighTape: "Heinrichs, Rogers & Cooper 1992, J Dairy Sci 75:3576 (Holstein heifers), as recalled — check against your own tape",
};

const n = (v, d) => (v === "" || v == null || Number.isNaN(+v) ? d : +v);

/** Merge defaults, onboarding answers (ledger.settings) and saved settings (meta settings). */
export function dairySettings(ledger, meta = {}) {
  const on = ledger?.settings || {}; meta = meta || {};
  const s = { ...DEFAULTS, ...meta };
  s.milkingSystem = meta.milkingSystem || on.milkingSystem || DEFAULTS.milkingSystem;
  s.calvingPattern = meta.calvingPattern || on.calvingPattern || DEFAULTS.calvingPattern;
  s.processor = meta.processor || on.milkBuyer || "";
  s.herdNo = meta.herdNo || on.herdNo || "";
  s.region = ledger?.region || "NI";
  for (const k of ["gestation", "bands", "price", "calfPlan", "cullWeights", "slurry"]) s[k] = { ...DEFAULTS[k], ...(meta[k] || {}) };
  for (const k of ["vwp", "dryPeriod", "pdFrom", "pdTo", "heatFrom", "heatTo", "matureKg", "birthKg", "mobilityWeeks", "breedingWeeks", "tbIntervalMonths", "heiferServeMonths"]) s[k] = n(s[k], DEFAULTS[k]);
  if (!Array.isArray(s.milkingTimes) || !s.milkingTimes.length) s.milkingTimes = DEFAULTS.milkingTimes;
  s.robot = s.milkingSystem === "Robot";
  s.block = /block/i.test(s.calvingPattern);
  s.tankLimit = s.collection === "alternate" ? 6 : 8;
  return s;
}

export function gestationDays(s, sireBreed) {
  const k = String(sireBreed || "").toUpperCase();
  return s.gestation[k] ?? s.gestation.other ?? 282;
}
