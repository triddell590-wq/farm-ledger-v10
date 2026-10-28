// Cattle ear tags, breeds, colours and sex codes (NI). Pure functions, no DOM.
// Tag maths kept exactly as v9.14 (Tom's tags pass it): UK/XI + lead digit + 6-digit herd +
// 4-digit animal + check digit, where check = ("9" + herd + animal) mod 7 + 1.

export function tagCheckDigit(herd6, animal4) { return (Number("9" + herd6 + animal4) % 7) + 1; }

/** Parse a full tag. Returns null for short / management numbers. */
export function parseTag(str) {
  const m = String(str || "").toUpperCase().match(/(XI|UK)\s*([09])\s*(\d{6})\s*(\d{4})\s*(\d)?/);
  if (!m) return null;
  const expected = tagCheckDigit(m[3], m[4]);
  const check = m[5] != null ? Number(m[5]) : null;
  return {
    country: m[1], lead: m[2], herd: m[3], animal: m[4], check, expected, valid: check === expected,
    formatted: `${m[1]} ${m[2]} ${m[3]} ${m[4]} ${check != null ? check : expected}`,
  };
}
export const normTag = (t) => String(t || "").replace(/\s+/g, "").toLowerCase();
/** The five digits farmers read aloud (animal number + check digit). */
export function last5(tag) { const d = String(tag || "").replace(/\D/g, ""); return d.slice(-5); }
/** Split a tag for display: { head, tail } where tail is the read-aloud part (bold). */
export function tagParts(tag) {
  const p = parseTag(tag);
  if (p && p.check != null) return { head: `${p.country} ${p.lead} ${p.herd}`, tail: `${p.animal} ${p.check}` };
  const s = String(tag || "").trim();
  return { head: "", tail: s };
}
/** Search: matches full tag, last digits, management number or name. */
export function tagMatches(a, q) {
  q = String(q || "").trim().toLowerCase(); if (!q) return true;
  const digits = q.replace(/\D/g, "");
  if (digits && digits.length >= 3 && String(a.tag || "").replace(/\D/g, "").endsWith(digits)) return true;
  if (normTag(a.tag).includes(normTag(q))) return true;
  if (a.mgmtNo && String(a.mgmtNo).toLowerCase().includes(q)) return true;
  return !!(a.name && a.name.toLowerCase().includes(q));
}
/** Next tag in a tag book: same herd, animal number + 1, fresh check digit. */
export function nextTag(tag) {
  const p = parseTag(tag); if (!p) return "";
  const n = String((Number(p.animal) + 1) % 10000).padStart(4, "0");
  return `${p.country} ${p.lead} ${p.herd} ${n} ${tagCheckDigit(p.herd, n)}`;
}

export const DAERA_BREEDS = [["AA", "Aberdeen Angus"], ["AU", "Aubrac"], ["AYR", "Ayrshire"], ["BB", "Belgian Blue"], ["BRB", "British Blue"], ["CH", "Charolais"], ["DAQ", "Blonde d'Aquitaine"], ["DEX", "Dexter"], ["FKV", "Fleckvieh"], ["FR", "Friesian"], ["GAL", "Galloway"], ["HER", "Hereford"], ["HI", "Highland"], ["HOL", "Holstein"], ["JER", "Jersey"], ["LIM", "Limousin"], ["LUI", "Luing"], ["MB", "Montbeliarde"], ["NOR", "Normande"], ["PAR", "Parthenaise"], ["SAL", "Salers"], ["SBR", "Brown Swiss"], ["SH", "Shorthorn"], ["SHB", "Beef Shorthorn"], ["SIM", "Simmental"], ["ST", "Stabiliser"], ["WB", "Welsh Black"]];
export const DAERA_COLOURS = [["B", "Black"], ["BL", "Blue"], ["BR", "Brindle"], ["D", "Dun"], ["R", "Red"], ["RN", "Roan"], ["BW", "Black & White"], ["BLW", "Blue & White"], ["DW", "Dun & White"], ["RW", "Red & White"], ["W", "White"]];
// Mart / herd-list abbreviations seen in v9 (kept so old records still code correctly).
const LEGACY = { AAX: "AA", AN: "AA", LIMX: "LIM", LM: "LIM", LMX: "LIM", CHX: "CH", CHA: "CH", SIMX: "SIM", SM: "SIM", SMX: "SIM", BBX: "BB", HF: "HOL", HFX: "HOL", FRX: "FR", HO: "HOL", HE: "HER", HEX: "HER", SA: "SAL", SAX: "SAL", SHX: "SH", BA: "DAQ", BAX: "DAQ", AUX: "AU", PA: "PAR", JE: "JER", JEX: "JER", GA: "GAL", DX: "DEX" };

/** DAERA breed code from a code, a name, or "Charolais X" style text. */
export function breedCode(b) {
  if (!b) return "";
  const u = String(b).trim().toUpperCase();
  if (DAERA_BREEDS.some(([c]) => c === u)) return u;
  if (LEGACY[u]) return LEGACY[u];
  const plain = u.replace(/\s*(X|CROSS)$/, "");
  const byName = DAERA_BREEDS.find(([, n]) => n.toUpperCase() === plain);
  if (byName) return byName[0];
  if (LEGACY[plain]) return LEGACY[plain];
  return u;
}
export function breedName(b) {
  const c = breedCode(b); const hit = DAERA_BREEDS.find(([k]) => k === c);
  const t = String(b || "").trim().toUpperCase();
  const cross = /\s(X|CROSS)$/.test(t) || (/X$/.test(t) && LEGACY[t] != null);
  return hit ? hit[1] + (cross ? " cross" : "") : String(b || "");
}
export function colourName(c) { const hit = DAERA_COLOURS.find(([k, n]) => k === String(c || "").toUpperCase() || n.toUpperCase() === String(c || "").toUpperCase()); return hit ? hit[1] : String(c || ""); }
export function colourCode(c) { const hit = DAERA_COLOURS.find(([k, n]) => k === String(c || "").toUpperCase() || n.toUpperCase() === String(c || "").toUpperCase()); return hit ? hit[0] : String(c || ""); }

/** DAERA sex code for the register: F female, M male (steer/bullock), B bull. */
export function sexCode(s) {
  s = String(s || "").toLowerCase();
  if (/heifer|cow|female|^f$/.test(s)) return "F";
  if (/steer|bullock|^m$/.test(s)) return "M";
  if (/bull|^b$/.test(s)) return "B";
  if (/male/.test(s)) return "M";
  return "";
}
export const isFemale = (a) => sexCode(a.sex) === "F";
