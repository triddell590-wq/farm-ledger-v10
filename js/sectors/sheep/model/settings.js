// Sheep settings and targets (design/11 §13). Defaults < onboarding answers (ledger.settings)
// < saved targets (meta/settings, owner/manager only). Guesses are labelled in SOURCES so the
// Targets screen can say so.
export const RADDLE_COLOURS = {
  Yellow: "#E2B92B", Red: "#C8352B", Blue: "#2F62C8", Green: "#2E8A4A", Black: "#222222", Orange: "#E07A1F", Purple: "#7A4FB0",
};
export const FLOCK_TYPES = { lowland: "Lowland", upland: "Upland", hill: "Hill", early: "Early lambing" };
// Default rams-in day by flock type (hill ~1 month later; early lambing July/Aug) — design §3.1.
export const RAMS_IN_BY_TYPE = { lowland: "10-15", upland: "10-25", hill: "11-15", early: "07-25" };
// BCS targets by stage and flock type (Research C §6).
export const BCS_TARGETS = {
  tupping: { lowland: [3, 3.5], upland: [3, 3], hill: [2.5, 3], early: [3, 3.5] },
  lambing: { lowland: [3, 3], upland: [2.5, 2.5], hill: [2, 2.5], early: [3, 3] },
  weaning: { lowland: [2.5, 3], upland: [2.5, 3], hill: [2, 2.5], early: [2.5, 3] },
  scanning: { lowland: [3, 3], upland: [2.5, 3], hill: [2.5, 2.5], early: [3, 3] },
};

export const DEFAULTS = {
  ramsIn: null, // "MM-DD"; null = from flock type / lambing month
  ramsOutDays: 36, // two cycles + 2 days (design default 15 Oct → 20 Nov)
  flockType: "lowland",
  raddleOrder: ["Yellow", "Red", "Blue", "Green", "Black"],
  gestation: 147,
  weaningDays: 100, // weaning = lambing start + 100 d
  housedOrMilked: false,
  individualLambs: false,
  quarantineDays: 28,
  fecThreshold: 500,
  drenchCheckDays: 10,
  draftKg: 42, koPct: 45, maxCarcase: 21.5,
  lameTarget: 2, abortionTrigger: 2, barrenTarget: 4, lossTarget: 12, firstCycleAlert: 60, firstCycleTarget: 85,
  ramGuideMature: 40, ramGuideLamb: 25,
  growthTarget: 280, growthWeanBelow: 200,
  inventoryDeadline: "", // yearly, from DAERA's November letter
  shedNightFrom: "18:00",
  pens: 12,
  targetEwes: null,
  mealPrice: 350, // £/t
  meal: { single: { weeks: 4, peak: 0.5 }, twin: { weeks: 6, peak: 0.7 }, triplet: { weeks: 8, peak: 0.9 } },
  abattoirKm: 65,
};
export const SOURCES = {
  fecThreshold: "Guess — a common vet figure. Your vet sets this.",
  abortionTrigger: "Guess — when to call the vet. Edit to suit.",
  maxCarcase: "Guess — set your processor's maximum.",
  koPct: "Typical lamb kill-out (guess). Edit to match your kill sheets.",
  meal: "Guide figures based on DAERA/AHDB late-pregnancy feeding tables (editable).",
  ramGuide: "Research C guidance: 1 mature ram per 40 ewes, 1 ram lamb per 25 (editable).",
  lossTarget: "DAERA: losses from scanning to weaning under 12%.",
};

/** Merge defaults, onboarding answers and saved targets. */
export function sheepSettings(ledger, meta = {}) {
  const ob = ledger?.settings || {};
  const s = { ...DEFAULTS, ...ob, ...(meta || {}) };
  s.meal = { ...DEFAULTS.meal, ...(meta?.meal || {}) };
  if (!meta?.flockType && ob.terrain) s.flockType = ob.terrain === "Hill" ? "hill" : "lowland";
  if (!s.ramsIn) s.ramsIn = defaultRamsIn(s.flockType, ob.lambingMonth);
  s.flockNo = meta?.flockNo || ob.flockNo || "";
  return s;
}

/** Rams in so lambing starts ~6th of the onboarding "lambing starts" month (142 d earlier). */
export function defaultRamsIn(flockType = "lowland", lambingMonth) {
  if (lambingMonth) {
    const m = +lambingMonth; const lamb = new Date(Date.UTC(2027, m - 1, 6)); lamb.setUTCDate(lamb.getUTCDate() - 142);
    return `${String(lamb.getUTCMonth() + 1).padStart(2, "0")}-${String(lamb.getUTCDate()).padStart(2, "0")}`;
  }
  return RAMS_IN_BY_TYPE[flockType] || RAMS_IN_BY_TYPE.lowland;
}
export const swatch = (colour) => RADDLE_COLOURS[colour] || "#888";
