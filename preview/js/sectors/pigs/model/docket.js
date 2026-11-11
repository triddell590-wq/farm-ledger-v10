// Feed docket reader (design/13 §7.8): OCR text (or pasted text) of a bulk feed docket →
// { date, supplier, ration, tonnes, pricePerT, docketNo }. Mills lay dockets out differently, so
// each field is looked for on its own; anything not found stays empty for the farmer to type.
const toN = (s) => +String(s).replace(/,(?=\d{3}\b)/g, "").replace(",", ".");

export function parseFeedDocket(text) {
  const t = String(text || ""); const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = { date: null, supplier: null, ration: null, tonnes: null, pricePerT: null, docketNo: null };
  const d = t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (d) out.date = `${d[3].length === 2 ? "20" + d[3] : d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`;
  const kg = t.match(/(\d{1,3}(?:,\d{3})+|\d{3,6})(?:\.\d+)?\s*kg\b/i);
  const tn = t.match(/(\d{1,2}(?:[.,]\d{1,3})?)\s*(?:t|tonnes?|tons?|mt)\b(?!\s*[/]|\s*per)/i);
  if (kg) out.tonnes = Math.round(toN(kg[1]) / 10) / 100; else if (tn) out.tonnes = toN(tn[1]);
  const ppt = t.match(/£\s?(\d{2,4}(?:[.,]\d{1,2})?)\s*(?:\/\s*t\b|per\s*(?:t|tonne))/i) || t.match(/(?:price|rate)[^\d£\n]{0,12}£?\s?(\d{2,4}(?:[.,]\d{1,2})?)/i);
  if (ppt) out.pricePerT = toN(ppt[1]);
  const no = t.match(/(?:docket|ticket|delivery note|dn|invoice)\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z]{0,3}\d{3,10})/i);
  if (no) out.docketNo = no[1];
  const ration = lines.find((l) => /(pellet|nut|meal|crumb|ration|creep|finisher|grower|weaner|sow|starter|link)/i.test(l) && !/docket|ticket|£/i.test(l));
  if (ration) out.ration = ration.replace(/\s*\d+(?:[.,]\d+)?\s*(?:t|tonnes?|kg)\b.*$/i, "").replace(/^(product|ration|feed)\s*[:\-]\s*/i, "").trim().slice(0, 60) || null;
  const sup = lines.find((l) => /(feeds?|mills?|agri|nutrition|ltd|limited)/i.test(l) && !/pellet|nut|crumb|ration/i.test(l));
  if (sup) out.supplier = sup.replace(/\b(ltd|limited)\.?$/i, "").trim().slice(0, 40);
  return out;
}
