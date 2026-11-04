// Broilers settings and targets (design/15 §15). Every value a processor, vet, breed company or
// farmer decides is an editable setting with a default; legal values come from content.
import { standardForHybrid, BREED_STANDARDS } from "./content.js";

export const DEFAULTS = {
  hybrid: "Ross 308", breedStdId: "ross308-2022",
  processor: "", processorPlant: "", fciEmail: "", moduleSize: 100,
  farmLimitKgM2: 38, // Red Tractor planned maximum (design/15 §15)
  targetDensity: 38, // planned density for new crops (Research B broiler_crop target_density_kg_m2)
  nonMainsWater: false, // Red Tractor: non-mains water tested every 6 months
  plannedThinDay: 31, plannedClearDay: 38, plannedThinBirdsPct: 20,
  checkTimes: { am: "10:00", pm: "20:00" }, lateAfterHours: 2,
  mortalityMultiple: 3, mortalitySpikePct: 0.3, cropTolerancePct: 5,
  weightAlertPct: 3, weightAlertDays: 3, waterAlertPct: 10,
  cropFill8h: 80, cropFill24h: 95, mort7TargetPct: 1,
  weighDays: [7, 14, 21, 28, 35],
  organic: false, longLife: false, // slaughter age ≥ 82 days or organic → 6-week Salmonella window
  salmDerogation: false, salmDerogationDate: "",
  labs: ["AFBI Stormont", "AFBI Omagh"],
  rhi: false, freeRange: false,
  feedOffHours: 9, arrivalHoursAfterCatch: 0,
  litterScoreHigh: 4,
  vetName: "", vetAddress: "", vetPhone: "", daeraPhone: "",
  registerNo: "", establishmentNo: "", holdingNo: "",
  crewName: "", crewGlaa: "",
  waterMeterSlot: "am", // when the water meter is read (design/15 §4: AM only by default)
  lpgTankLitres: 0,
};

const n = (v, d) => (v === "" || v == null || Number.isNaN(+v) ? d : +v);

/** Merge defaults, onboarding answers (ledger.settings) and saved settings (meta settings). */
export function broilerSettings(ledger, meta = {}) {
  const on = ledger?.settings || {}; meta = meta || {};
  const s = { ...DEFAULTS, ...meta };
  s.hybrid = meta.hybrid || (on.breed && on.breed !== "Other" ? on.breed : null) || DEFAULTS.hybrid;
  const std = meta.breedStdId ? BREED_STANDARDS.find((x) => x.id === meta.breedStdId) : standardForHybrid(s.hybrid);
  s.breedStdId = std ? std.id : DEFAULTS.breedStdId;
  s.processor = meta.processor || on.processor || "";
  s.registerNo = meta.registerNo || on.registerNo || "";
  s.birdsPerCrop = n(meta.birdsPerCrop ?? on.birdsPerCrop, null);
  s.housesPlanned = n(on.houses, 1);
  s.checkTimes = { ...DEFAULTS.checkTimes, ...(meta.checkTimes || {}) };
  for (const k of ["moduleSize", "farmLimitKgM2", "plannedThinDay", "plannedClearDay", "plannedThinBirdsPct", "mortalityMultiple", "mortalitySpikePct", "cropTolerancePct", "weightAlertPct", "weightAlertDays", "waterAlertPct", "cropFill8h", "cropFill24h", "feedOffHours", "arrivalHoursAfterCatch", "lateAfterHours", "mort7TargetPct", "lpgTankLitres", "targetDensity"]) s[k] = n(s[k], DEFAULTS[k]);
  if (!Array.isArray(s.labs) || !s.labs.length) s.labs = DEFAULTS.labs;
  if (!Array.isArray(s.weighDays)) s.weighDays = DEFAULTS.weighDays;
  return s;
}

// Where each default comes from (shown beside the setting).
export const SOURCES = {
  farmLimitKgM2: "Red Tractor Chicken v5.1: planned maximum 38 kg/m² for standard indoor birds",
  mortalitySpikePct: "Red Tractor: investigate if house mortality is over 0.3% in 24 hours",
  mortalityMultiple: "A starting guess — your own early warning, not a rule",
  weightAlertPct: "A starting guess — set your own",
  waterAlertPct: "A starting guess — set your own",
  cropFill: "Breed company guidance (crop-fill ≥ 80% at 8 h, ≥ 95% at 24 h) — editable",
  feedOffHours: "Red Tractor ≤ 9 hours; the law (Sch. 5 para 4) ≤ 12 hours",
};
