// Beef settings, targets and the yearly scheme tables (design/10 §15). Yearly values are
// tables keyed by year so next April's change is a content edit, not a code change.
// Region pack: NI. Sources shown beside each target in the UI (SOURCES).
import { addMonths, addDays } from "../../../core/dates.js";

// Suckler Cow Scheme: scheme year 1 Apr – 31 Mar, keyed by the starting year.
export const SC_INTERVAL = { 2025: 415, 2026: 405, 2027: 395, 2028: 385 };
export const SC_HEIFER_MAX_MONTHS = { 2025: 34, 2026: 32, 2027: 30, 2028: 29 };
export const SC_MIN_INTERVAL = 271; // calving interval must be more than 270 days
export const SC_HEIFER_MIN_MONTHS = 21;
export const SC_PAYMENT = 100;
// Beef Carbon Reduction Scheme: max age at slaughter by calendar year.
export const BCRS_MONTHS = { 2024: 30, 2025: 28, 2026: 27, 2027: 26 };
export const BCRS_PAYMENT = 75;
// NI on-farm herd register deadlines in days (region pack, Research B; used when the keeper's
// herd register is this app — NIFAIS Online figures come from content/region-rules.js).
// NI Nitrates Action Programme dates (MM-DD), region pack (Research B shared #8).
export const NAP = { slurryWarnFrom: "10-01", slurryClosedFrom: "10-15", slurryClosedTo: "01-31" };
export const ON_FARM = { tag: 20, nifaisBirth: 27, bvd: 30, registerBirth: 30, society: 27, dna: 60, nifaisMove: 7, nifaisDeath: 7, retag: 28 };
export const BCRS_RESIDENCY = { days: 60, of: 100 };

const lookup = (table, year) => { const ys = Object.keys(table).map(Number).sort((a, b) => a - b); let v = table[ys[0]]; for (const y of ys) if (year >= y) v = table[y]; return v; };
/** Scheme year (start year) a date falls in: 1 Apr – 31 Mar. */
export function schemeYear(iso) { const [y, m] = iso.split("-").map(Number); return m >= 4 ? y : y - 1; }
export const schemeYearLabel = (y) => `${y}/${String(y + 1).slice(2)}`;

export const DEFAULTS = {
  calvingSeason: "Spring",
  bcrsMonths: null, // null = use the yearly table
  processor: { name: "My processor", maxAgeMonths: 30, minCarcase: 280, maxCarcase: 400, maxMoves: 4, ko: { Steer: 55, Heifer: 56, Bull: 57, Cow: 50 } },
  gestation: { AA: 279, HOL: 281, FR: 281, SIM: 284, CH: 285, LIM: 287, other: 283 },
  dlwgTarget: { finisher: 1.0, store: 0.6, calf: 1.0, weanling: 0.8, heifer: 0.7 },
  weighEveryDays: 42,
  fodderRates: { cow: 1.2, bull: 1.3, heifer: 1.0, store: 1.0, weanling: 0.7, calf: 0.7, finisher: 0.9 }, // t fresh silage / head / month
  luRates: { cow: 1.0, bull: 1.0, heifer: 0.6, finisher: 0.8, store: 0.6, weanling: 0.4, calf: 0.4 },
  heiferServeKg: 400,
  targetCarcaseKg: 360,
  pedigree: false, society: "",
  calfChecks: false, navelPrompt: false,
  nextTag: "",
  tbNextDue: "",
  price: { perKgDead: null, enteredOn: null },
  meal: { pricePerTonne: null },
};
export const SOURCES = {
  sc: "DAERA Suckler Cow Scheme 2026/27 rules, checked Oct 2026",
  bcrs: "DAERA Beef Carbon Reduction Scheme, checked Oct 2026",
  gestation: "Breed society average gestation lengths (editable)",
  fodder: "DAERA monthly silage requirement guide (editable)",
  lu: "DAERA livestock unit guide values (editable)",
  dlwg: "AHDB / AFBI typical targets (editable)",
};

/** Merge defaults, onboarding answers (ledger.settings) and saved targets (meta settings). */
export function beefSettings(ledger, meta = {}) {
  const s = { ...DEFAULTS, ...(ledger?.settings || {}), ...(meta || {}) };
  s.processor = { ...DEFAULTS.processor, ...(meta?.processor || {}), ko: { ...DEFAULTS.processor.ko, ...(meta?.processor?.ko || {}) } };
  for (const k of ["gestation", "dlwgTarget", "fodderRates", "luRates", "price", "meal"]) s[k] = { ...DEFAULTS[k], ...(meta?.[k] || {}) };
  if (Array.isArray(ledger?.settings?.beefTypes) && ledger.settings.beefTypes.includes("Pedigree") && meta?.pedigree == null) s.pedigree = true;
  return s;
}

export const scLimitDays = (iso) => lookup(SC_INTERVAL, schemeYear(iso));
export const scHeiferMaxMonths = (iso) => lookup(SC_HEIFER_MAX_MONTHS, schemeYear(iso));
export const bcrsMonths = (year, s) => (s && s.bcrsMonths) || lookup(BCRS_MONTHS, year);

export function gestationDays(s, sireBreed, calfSex) {
  const g = s.gestation[String(sireBreed || "").toUpperCase()] ?? s.gestation.other;
  return g + (calfSex === "Bull" ? 1 : 0);
}

/** Season mode for a date (design/10 §3.1). Returns 'calving'|'breeding'|'sales'|'winter'|'grazing'. */
export function autoMode(season, iso) {
  const md = iso.slice(5); // MM-DD
  if (season === "Autumn") {
    if (md >= "08-01" && md <= "11-30") return "calving";
    if (md >= "12-01" || md <= "02-29") return "breeding";
    if (md >= "03-01" && md <= "05-31") return "sales";
    return "grazing";
  }
  if (season === "All year") {
    if (md >= "09-01" && md <= "11-15") return "sales";
    if (md >= "11-16" || md <= "02-29") return "winter";
    return md <= "05-31" ? "calving" : "breeding";
  }
  if (md >= "02-01" && md <= "05-31") return "calving";
  if (md >= "06-01" && md <= "08-31") return "breeding";
  if (md >= "09-01" && md <= "11-15") return "sales";
  return "winter";
}
export const MODE_NAMES = { calving: "Calving", breeding: "Breeding", sales: "Sales & housing", winter: "Winter feeding", grazing: "Grazing" };

export { addMonths, addDays };
