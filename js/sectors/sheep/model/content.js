// Seasonal parasite and disease content (design/11 §7, §19). This is CONTENT: when the region
// content bundle is online it replaces these lines and their "updated" dates. Months are 1–12.
export const SEASONAL = [
  { key: "nematodirus", months: [3, 4, 5], title: "Nematodirus", text: "AFBI: Nematodirus hatch risk is high in spring. Watch lambs for scour and check the AFBI forecast.", updated: "2026-10-02", source: "AFBI Nematodirus forecast" },
  { key: "fluke", months: [10, 11, 12, 1, 2], title: "Fluke", text: "AFBI forecast: high fluke risk this winter. Plan a fluke dose at housing.", updated: "2026-10-02", source: "AFBI fluke forecast" },
  { key: "fly", months: [5, 6, 7, 8, 9], title: "Fly strike", text: "Fly strike risk is up in warm, damp weather. Check dirty back ends daily.", updated: "2026-10-02", source: "Research C (seasonal guidance)" },
];
export const DISEASE_BANNER = { key: "bluetongue", species: ["cattle", "sheep"], level: "info", title: "Bluetongue", text: "No NI cases this season. Live ruminants can't come direct from GB.", updated: "2026-10-15", source: "DAERA (Research B verification pass)" };
export const BTV_NOTE = "Allowed in NI under a DAERA general licence.";
export function seasonalFor(today) { const m = +today.slice(5, 7); return SEASONAL.filter((x) => x.months.includes(m)); }
