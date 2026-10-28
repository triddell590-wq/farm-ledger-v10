// Pigs ledger settings (design/13 §13). Onboarding answers live on ledger.settings
// (pigSystem, batchInterval, sows, finisherPlaces, herdMark); the full set lives in meta/settings
// (owner/manager only). pigSettings() merges both over the defaults so every screen and rule
// reads one object.
export const SYSTEMS = {
  ftf: "Farrow-to-finish",
  breeding: "Breeding (breeder-weaner)",
  finishing: "Finishing only",
};
const SYS_FROM_SETUP = { "Farrow-to-finish": "ftf", Breeding: "breeding", "Finishing only": "finishing" };
const INTERVAL_FROM_SETUP = { Weekly: 1, "2-weekly": 2, "3-weekly": 3, "4-weekly": 4, "5-weekly": 5 };

// Targets: AHDB Agrosoft averages (Research A/C), editable. Benchmarks shown beside KPIs.
export const DEFAULT_TARGETS = { pwsy: 28, bornAlive: 14.6, pwm: 12, farrowRate: 86, fcr: 2.47, dlwg: 885, mort: 4, feedDays: 99, rearFcr: 1.6, rearMort: 3, rearDlwg: 550 }; // rearDlwg (7–35 kg) is a guess, editable

export const DEFAULTS = {
  system: "ftf", interval: 3, weekStart: 1, farrowingPlaces: 24, lactation: 28, moveDays: 5, gestation: 114,
  scanFrom: 28, scanTo: 35, returnFrom: 18, returnTo: 24, killOut: 76, bandMin: 80, bandMax: 100, targetLive: 115,
  waterDrop: 15, checkBy: "12:00", downtimeH: 48, feedWithdrawH: 8, ironDays: [1, 3],
  contract: { on: false, integrator: "", basis: "per pig place per week", integratorOwns: true, rate: null },
  leadDays: 3, smallHerd: false, estDeadKg: null, herdMark: "", gateCode: "",
};

export function pigSettings(ledger, meta = {}) {
  const l = (ledger && ledger.settings) || {};
  const m = meta || {};
  const sows = +l.sows || 0;
  const s = { ...DEFAULTS, ...m };
  s.system = m.system || SYS_FROM_SETUP[l.pigSystem] || (sows ? "ftf" : +l.finisherPlaces ? "finishing" : DEFAULTS.system);
  s.interval = +(m.interval || INTERVAL_FROM_SETUP[l.batchInterval] || DEFAULTS.interval);
  s.herdMark = m.herdMark || l.herdMark || "";
  s.sowsSetup = sows; s.finisherPlaces = +(m.finisherPlaces ?? l.finisherPlaces) || 0;
  s.smallHerd = m.smallHerd ?? (sows > 0 && sows <= 20 && s.system !== "finishing");
  s.targets = { ...DEFAULT_TARGETS, ...(m.targets || {}) };
  s.contract = { ...DEFAULTS.contract, ...(m.contract || {}) };
  s.breeding = s.system !== "finishing"; // has sows
  s.finishing = s.system !== "breeding"; // grows pigs to slaughter
  s.intake = m.intake || null; // custom feed intake table (else model/bins.js default)
  return s;
}

/** Tabs for the system (design/13 §2.1). */
export function tabSetFor(s) {
  if (s.smallHerd) return "small";
  return s.system === "finishing" ? "finishing" : "breeding";
}
