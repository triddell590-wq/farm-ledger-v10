// Region rule records + farm-wide disease banner (design/01-platform §16.1, §17.1).
// SHARED MODULE — owned by the Coordinator. Sector code reads deadlines, day counts and
// dates through regionRule()/ruleInForce() and never hard-codes them. A change here is a
// content update (Research B re-checks the source); later the same records can arrive in a
// downloaded content bundle via useRegionRules() without a code change.
//
// Record: { region, key, status: "announced" | "in force" | "delayed" | "withdrawn",
//           from?, values{}, sectors[], source, checkedOn }
// Region keys match ledger.region (firestore.rules): "NI" today; "ENG", "SCO", "WAL" added as content later.

export const DEFAULT_RULES = [
  { region: "NI", key: "bvdBreedingFemale", status: "announced", from: "2026-03-01", sectors: ["beef", "dairy"],
    values: { minAgeMonths: 12, restrictWeeks: 41 },
    source: "DAERA news: BVD movement restrictions on breeding-age females begin 1 March 2026 (Research B: confirm not delayed)", checkedOn: "2026-10-15" },
  { region: "NI", key: "herdRegisterNifais", status: "in force", sectors: ["beef", "dairy"],
    values: { birthDays: 23, moveOffDays: 0, otherEventDays: 3 },
    source: "DAERA cattle identification — NIFAIS Online used as the herd register (Research B verification pass)", checkedOn: "2026-10-15" },
  { region: "NI", key: "marketStandstill", status: "in force", sectors: ["beef", "sheep", "dairy", "pigs"],
    values: { days: 6, species: ["cattle", "sheep", "goats", "pigs"] },
    source: "DAERA movement rules (Research B)", checkedOn: "2026-10-15" },
  { region: "NI", key: "xiTags", status: "in force", from: "2025-06-30", sectors: ["beef", "sheep", "dairy"],
    values: { prefix: "XI", alsoAccepted: ["UK"], species: ["cattle", "sheep", "goats"] },
    source: "DAERA (Research B verification pass)", checkedOn: "2026-10-15" },
  { region: "NI", key: "inventories", status: "in force", sectors: ["sheep", "pigs", "layers", "broilers"],
    values: { pigsAndBirdsOn: "06-01", perEstablishment: true, sheepCountFrom: "12-01", sheepCountTo: "12-05", sheepInfoFrom: "11-15", returnDeadline: "from DAERA's yearly letter" },
    source: "NISRA June survey (pigs, birds); DAERA sheep & goat inventory (Research B)", checkedOn: "2026-10-15" },
  { region: "NI", key: "freeRangeHousingOrder", status: "in force", sectors: ["layers"],
    values: { keepFreeRangeLabelWholeOrder: true, derogationWeeks: null },
    source: "Reg. (EU) 2023/2465 applies in NI — no 16-week derogation (Research B)", checkedOn: "2026-10-15" },
  { region: "NI", key: "sheepTagging", status: "in force", sectors: ["sheep"],
    values: { tagByMonths: 9, tagByMonthsHoused: 6, replaceDays: 28, importRetagDays: 20, slaughterTag: false },
    source: "DAERA sheep identification (Research B)", checkedOn: "2026-10-15" },
  { region: "NI", key: "sheepMovement", status: "in force", sectors: ["sheep"],
    values: { notifyDays: 7, registerDays: 7, cprRegisterHours: 48, birthRegisterDaysAfterTagging: 7, tseHours: 24, tseOverMonths: 18 },
    source: "DAERA flock register guidance (Research B)", checkedOn: "2026-10-15" },
];

// Farm-wide disease banner items (01 §16.1). level: info | due | late. Info items can be
// dismissed for the day; due/late cannot while in force.
export const DEFAULT_BANNER = [
  { region: "NI", id: "btv-2026", topic: "bluetongue", sectors: ["beef", "sheep", "dairy"], level: "info",
    text: "Bluetongue: no NI cases this season. Live cattle and sheep can't come direct from GB. BTV-3 vaccine allowed under a DAERA general licence.",
    source: "DAERA (Research B verification pass)", checkedOn: "2026-10-15" },
  { region: "NI", id: "ai-2026", topic: "avian influenza", sectors: ["layers", "broilers"], level: "info",
    text: "No housing order in NI · lifted 5 May 2026. AIPZ lifted 15 May 2026.",
    source: "DAERA, May 2026 (Research B)", checkedOn: "2026-10-15" },
];

let RULES = DEFAULT_RULES.slice();
let BANNER = DEFAULT_BANNER.slice();

/** Content update: records with the same region+key (or banner id) replace the old ones. */
export function useRegionRules(records = [], banner = []) {
  for (const r of records) { RULES = RULES.filter((x) => !(x.region === r.region && x.key === r.key)); RULES.push(r); }
  for (const b of banner) { BANNER = BANNER.filter((x) => x.id !== b.id); BANNER.push(b); }
}
/** For tests: back to the built-in records. */
export function resetRegionRules() { RULES = DEFAULT_RULES.slice(); BANNER = DEFAULT_BANNER.slice(); }

/** The full record (any status) or null. */
export function ruleRecord(key, region = "NI") { return RULES.find((x) => x.key === key && x.region === region) || null; }
/** The rule's values, or null when there is no record for the region or it was withdrawn. */
export function regionRule(key, region = "NI") {
  const r = ruleRecord(key, region);
  return r && r.status !== "withdrawn" ? r.values : null;
}
/** True when the rule applies on `today` (YYYY-MM-DD): in force, or announced and its date has come. */
export function ruleInForce(key, today, region = "NI") {
  const r = ruleRecord(key, region);
  if (!r) return false;
  if (r.status === "in force") return !r.from || today >= r.from;
  if (r.status === "announced") return !!r.from && today >= r.from;
  return false;
}
/** Account → About → "Rules this app follows": every record for a region, optionally one sector. */
export function rulesFor(region = "NI", sector) {
  return RULES.filter((r) => r.region === region && (!sector || (r.sectors || []).includes(sector)));
}
/** Banner items for a set of ledger types (Overview passes all the farm's types). */
export function bannerItems(region = "NI", types = []) {
  const want = new Set(types);
  return BANNER.filter((b) => b.region === region && (!types.length || b.sectors.some((s) => want.has(s))));
}
