// Per-sector words used by the platform screens (design/01 §6.2, §6.3, §7.1, §8). Ledger
// screens themselves live in sectors/<type>/ (Phase 3).
export const META = {
  beef: { short: "Beef", desc: "Sucklers, stores and finishers", unit: "cattle", numberLabel: "Herd number", numberHelp: "NI herd no. (DAERA), e.g. 123456" },
  sheep: { short: "Sheep", desc: "Ewes, lambs, rams", unit: "ewes", numberLabel: "Flock number", numberHelp: "DAERA flock number" },
  dairy: { short: "Dairy", desc: "Milking cows and youngstock", unit: "cows", numberLabel: "Herd number", numberHelp: "NI herd no. (DAERA)" },
  pigs: { short: "Pigs", desc: "Sows, weaners, finishers", unit: "pigs", numberLabel: "Herd mark", numberHelp: "Pig herd mark (DAERA)" },
  layers: { short: "Layers", desc: "Laying hens, eggs", unit: "eggs", numberLabel: "Poultry register no.", numberHelp: "DAERA Bird Register number" },
  broilers: { short: "Broilers", desc: "Meat birds, crop by crop", unit: "birds", numberLabel: "Poultry register no.", numberHelp: "DAERA Bird Register number" },
};
import { SECTOR_NAMES, OLD_DEFAULT_NAMES } from "../core/policy.js";

// Farmer words for each ledger type (review A #42). noun: "herd"/"flock" in "People on this herd";
// settings: the More row for the ledger's own settings; start: the empty-home card (A #19, B #6).
export const WORDS = {
  beef: { noun: "herd", settings: "Herd settings", start: "Add your herd", startBody: "Import your herd list from NIFAIS (a CSV), or add one animal to start." },
  sheep: { noun: "flock", settings: "Flock settings", start: "Add your flock", startBody: "Add your first mob of ewes — a count is enough. Tags come later at tagging or move-off." },
  dairy: { noun: "herd", settings: "Herd settings", start: "Add your herd", startBody: "Import your herd list (NIFAIS or milk recording CSV), or add one cow to start." },
  pigs: { noun: "herd", settings: "Herd settings", start: "Add your pigs", startBody: "Add your rooms and sows, or a batch of growing pigs, to start." },
  layers: { noun: "flock", settings: "Flock settings", start: "Add your first house", startBody: "Add a house and the flock in it — birds placed and the date." },
  broilers: { noun: "flock", settings: "Flock settings", start: "Add your first house", startBody: "Add a house, then start a crop with the chicks placed." },
};
export const ADD_LEDGER = "Add cattle, sheep, pigs or poultry";
/** The name to show for a ledger: what the person called it, or the farmer word for its type. */
export function friendlyName(l) {
  if (!l) return "";
  const def = SECTOR_NAMES[l.type]; if (!def) return l.name || "";
  const n = String(l.name || "").trim();
  if (!n) return def;
  for (const old of OLD_DEFAULT_NAMES[l.type] || []) {
    if (n === old) return def;
    const m = new RegExp("^" + old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " (\\d+)$").exec(n);
    if (m) return `${def} ${m[1]}`;
  }
  return n;
}

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => ({ value: String(i + 1), label: m }));
// Onboarding step 3 fields per sector (design/01 §6.3; review B #5, A #33). Only what a sector
// actually uses: beef and dairy animals come from the herd list import, so no head counts here.
// kind: number (a number field, never a 0-start stepper) | stepper (small counts) | chips | chip | month | text
export const SETUP_FIELDS = {
  beef: [
    { key: "herdNo", label: "Herd number", kind: "text", inputmode: "numeric" },
    { key: "beefTypes", label: "Mainly", kind: "chips", options: ["Suckler", "Store", "Finishing", "Pedigree"] },
    { key: "calvingSeason", label: "Calving season", kind: "chip", options: ["Spring", "Autumn", "All year"] },
  ],
  sheep: [
    { key: "flockNo", label: "Flock number", kind: "text", inputmode: "numeric" },
    { key: "ewes", label: "Breeding ewes", kind: "number", placeholder: "e.g. 250" },
    { key: "lambingMonth", label: "Lambing starts", kind: "month", options: months, value: "3" },
    { key: "terrain", label: "Land", kind: "chip", options: ["Lowland", "Hill"] },
  ],
  dairy: [
    { key: "herdNo", label: "Herd number", kind: "text", inputmode: "numeric" },
    { key: "milkingSystem", label: "Milking", kind: "chip", options: ["Parlour", "Robot"] },
    { key: "calvingPattern", label: "Calving", kind: "chip", options: ["Spring block", "Autumn block", "All year"] },
    { key: "milkBuyer", label: "Milk buyer", kind: "text" },
  ],
  pigs: [
    { key: "herdMark", label: "Herd mark", kind: "text" },
    { key: "sows", label: "Sows", kind: "number", placeholder: "e.g. 120" },
    { key: "finisherPlaces", label: "Finisher places", kind: "number", placeholder: "e.g. 1,000" },
    { key: "pigSystem", label: "System", kind: "chip", options: ["Breeding", "Farrow-to-finish", "Finishing only"] },
    { key: "batchInterval", label: "Batches", kind: "chip", options: ["Weekly", "3-weekly", "4-weekly"] },
  ],
  layers: [
    { key: "registerNo", label: "Poultry register no.", kind: "text" },
    { key: "houses", label: "Houses", kind: "stepper", value: 1, step: 1, min: 1, max: 20 },
    { key: "birdsPerHouse", label: "Birds per house", kind: "number", placeholder: "e.g. 16,000" },
    { key: "layerSystem", label: "System", kind: "chip", options: ["Free range", "Barn", "Colony", "Organic"] },
  ],
  broilers: [
    { key: "registerNo", label: "Poultry register no.", kind: "text" },
    { key: "houses", label: "Houses", kind: "stepper", value: 1, step: 1, min: 1, max: 20 },
    { key: "birdsPerCrop", label: "Chicks placed per crop (all houses)", kind: "number", placeholder: "e.g. 60,000" },
    { key: "processor", label: "Processor", kind: "text" },
    { key: "breed", label: "Breed", kind: "chip", options: ["Ross 308", "Cobb 500", "Other"] },
  ],
};
// A line under a sector's setup fields saying where its animals come from.
export const SETUP_NOTES = {
  beef: "Your cattle come from your herd list — import it from NIFAIS (a CSV) on the Beef herd's home screen, or add them one by one.",
  dairy: "Your cows come from your herd list — import it from NIFAIS or milk recording (a CSV) on the Dairy herd's home screen.",
  layers: "We'll set up each house with its bird places. You add the flock (pullets in) when it arrives.",
  broilers: "We'll set up each house. You start a crop when the chicks arrive.",
};
/** Turn "16,000" / "16000" into 16000; blank or nonsense -> null. */
export function setupNumber(v) { const n = Number(String(v ?? "").replace(/[,\s]/g, "")); return String(v ?? "").trim() && Number.isFinite(n) && n >= 0 ? Math.round(n) : null; }
