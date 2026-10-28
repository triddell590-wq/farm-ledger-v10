// Layers content (design/14 §5.1, §7.3, §8.2, §9.2, §19; 01-platform §17.1). Rules, standards
// and wording that change with the industry or the region live here as dated records, never
// inside the logic. A content update is an edit to this file (later: the shared, cached content
// bundle — see coordinator/requests.md).

/**
 * Breed standards. Only the published anchor weeks are typed in; weeks between them are
 * interpolated in model/standards.js. `derived` marks numbers that are not printed by the
 * breeder and were worked out (said on screen).
 */
export const BREED_STANDARDS = [
  {
    id: "hyline-brown-2025", breed: "Hy-Line Brown", edition: "Hy-Line Brown Performance Standards, Dec 2025",
    source: "hyline.com — Brown STD ENG (Dec 2025), via Research C tool 2", peakWeek: 25,
    lay: [[20, 52.5, 55.0], [25, 93.4, 98.1], [30, 93.3, 98.2], [40, 91.9, 97.2], [50, 90.0, 95.6], [60, 87.4, 93.2], [70, 83.6, 89.8], [80, 79.7, 86.1]],
    eggWt: [[26, 55.2, 58.6], [70, 61.2, 65.0]],
    feed: [[20, 110, 118], [80, 110, 118]],
    bw: [[18, 1411, 1492], [30, 1864, 1971], [80, 1960, 2072]],
    // cumulative mortality % from placement: ~2.8% to 60 wk, livability 94.9% to 80 wk
    mort: [[18, 0, 0], [60, 2.8, 2.8], [80, 5.1, 5.1]],
    hhe80: [368, 391],
    notes: "Published weeks 20, 25, 30, 40 … 80; weeks between are drawn as straight lines.",
  },
  {
    id: "lohmann-brown-classic-alt-2021", breed: "Lohmann Brown-Classic", edition: "Lohmann Brown-Classic, Alternative systems, 2021",
    source: "lohmann-breeders.com — LB-Classic Alternative infographic 2021, via Research C tool 2", peakWeek: 26,
    // Lohmann prints peak 94–96% and hen-housed totals (321 @72, 363 @80, 412 @90); the weekly
    // band after peak is derived from those totals (guess, said on screen).
    lay: [[20, 48, 52], [26, 94, 96], [40, 91.5, 93.5], [60, 85.5, 87.5], [72, 80, 82], [80, 77, 79], [90, 72, 74]], derived: ["lay"],
    eggWt: [[26, 56.5, 59.5], [72, 64.5, 66.5]],
    feed: [[20, 115, 125], [90, 115, 125]],
    bw: [[17, 1420, 1420], [30, 1900, 2000], [90, 2000, 2100]],
    mort: [[17, 0, 0], [72, 5.5, 5.5], [90, 8.5, 8.5]],
    hhe80: [356, 363],
    notes: "Lohmann publishes peak lay and hen-housed totals; the weekly band after peak is worked out from those totals (estimate).",
  },
];
export const DEFAULT_BREED = "hyline-brown-2025";

/** Avian influenza state (verified 15 Oct 2026, Research B / design/14 §19). Content, not scraped. */
export const AI_STATUS = {
  region: "NI", housingOrder: false, aipz: false, orderFrom: null, outbreakWithin10km: false,
  liftedLine: "Lifted 5 May 2026. The last two seasons started on 1 November — we'll tell you the day one is declared.",
  checkedOn: "2026-10-15", source: "DAERA (Research B verification pass)",
};
import { regionRule } from "../../../content/region-rules.js";

/** Free-range labelling during a housing order, from the shared region rules (01-platform §17.1). */
export function freeRangeText(region = "NI") {
  const r = regionRule("freeRangeHousingOrder", region);
  if (r?.keepFreeRangeLabelWholeOrder) return `eggs stay free range for the whole order${region === "NI" ? " (NI)" : ""}`;
  if (r?.derogationWeeks) return `eggs stay free range for the first ${r.derogationWeeks} weeks of an order`;
  return "check the free-range labelling rule for your region";
}
/** 1 June bird inventory date ("MM-DD") from the shared region rules. */
export function birdCountDay(region = "NI") { return regionRule("inventories", region)?.pigsAndBirdsOn || "06-01"; }

/**
 * Layers-only rule values. Not yet in the shared content/region-rules.js (asked of the Coordinator
 * 2026-10-20: keys layersSalmonellaNcp, eggMarketing); same values, sources in design/14 §7.3, §19.
 */
export const RULES = {
  freeRangeHousingOrder: { NI: { keepsLabel: true, text: "eggs stay free range for the whole order (NI)", source: "Reg. (EU) 2023/2465", checkedOn: "2026-10-15" }, ENG: { keepsLabel: null, weeks: 16, text: "England: 16-week rule (unconfirmed)" } },
  inventories: { NI: { birds: { month: 6, day: 1, remindDaysBefore: 7, text: "Count birds on 1 June for the NI Bird Register" } } },
  emi: { NI: { minHens: 350, text: "Registration with the DAERA Egg Marketing Inspectorate is required at 350 laying hens or more." } },
  ungraded: { NI: { maxDays: 28, text: "Ungraded eggs can be sold at the farm gate, door to door or at a local market within 28 days of lay — not in honesty boxes or vending machines away from the farm." } },
  salmonella: { NI: { firstFromWk: 22, firstByWk: 26, everyWeeks: 15, noticeDays: 14, retentionYears: 2 } },
};
export const AI_CHECKS = ["Foot dips changed", "Wild birds can't reach feed or water", "Feed covered", "Visitors signed in", "Vehicle wheels disinfected"];

export const LION_HEADER = "Based on the British Lion Code of Practice, Version 8 (June 2023, as amended; 2026 summary). Not endorsed by the British Egg Industry Council.";
export const RSPCA_HEADER = "Based on RSPCA Assured standards for laying hens — edition to be confirmed before release (Research B could not confirm).";

/** Egg weight grades (EU/UK marketing standard). */
export const GRADES = [{ id: "XL", min: 73, label: "XL · 73 g and over" }, { id: "L", min: 63, max: 73, label: "L · 63–73 g" }, { id: "M", min: 53, max: 63, label: "M · 53–63 g" }, { id: "S", max: 53, label: "S · under 53 g" }];
export const STATEMENT_GRADES = ["XL", "L", "M", "S", "Seconds"];

export const DEATH_CAUSES = ["Found dead (unknown)", "Pecking / vent", "Smothered", "Peritonitis", "Prolapse", "Predator", "Culled — sick", "Culled — injured"];
export const CHECKS = ["Birds", "Water", "Feed", "Lights", "Alarm panel"];
export const SYSTEMS = [{ v: 0, label: "Organic", short: "organic" }, { v: 1, label: "Free range", short: "free range" }, { v: 2, label: "Barn", short: "barn" }, { v: 3, label: "Colony", short: "colony" }];
export const SALM_POSITIVE = ["S. Enteritidis", "S. Typhimurium", "Monophasic S. Typhimurium"];
export const SALM_RESULTS = ["Negative", ...SALM_POSITIVE, "Other Salmonella", "Awaiting result"];
export const SAMPLE_TYPES = ["2 pairs boot swabs", "150 g faeces", "Dust"];
export const MITE_SCORES = ["None", "Few", "Some", "Many", "Heavy"];

/** Lighting template (guess — replace with your breed guide's programme). wk -> hours. */
export const LIGHT_TEMPLATE = [[17, 10], [18, 11], [19, 12], [20, 13], [21, 14], [22, 15], [24, 16]];

/** Space limits (Welfare of Farmed Animals Regs (NI) 2012 Sch. 2/3, Research B). */
export const SPACE = { henPerM2: 9, hensPerNest: 7, hensPerM2Nest: 120, perchCmPerHen: 15, litterCm2PerHen: 250, colonyCm2PerHen: 750, rangeHensPerHa: 2500, rangeMaxM: 150, rangeMaxMShelters: 350, sheltersPerHa: 4, ppcPlaces: 40000 };

export const REFERENCE_PRICE = { pPerDozen: 153, label: "UK farmgate, Q2 2026", note: "Entered as a guide; the app never fetches prices." };
