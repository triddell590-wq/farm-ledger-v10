// Reading mart dockets and NIFAIS herd lists from photo text (OCR) or pasted text. Ported
// unchanged from v9.14 (parseDocket, parseHerdList) so it reads the same dockets Tom uses.
import { tagCheckDigit, normTag } from "./tags.js";
import { todayStr } from "../../../core/dates.js";
const BREED_CODES = { AA: "Aberdeen Angus", AAX: "Aberdeen Angus cross", AN: "Aberdeen Angus", LIM: "Limousin", LIMX: "Limousin cross", LM: "Limousin", LMX: "Limousin cross", CH: "Charolais", CHX: "Charolais cross", CHA: "Charolais", SIM: "Simmental", SIMX: "Simmental cross", SM: "Simmental", SMX: "Simmental cross", BB: "Belgian Blue", BBX: "Belgian Blue cross", HF: "Holstein Friesian", HFX: "Holstein Friesian cross", FR: "Friesian", FRX: "Friesian cross", HO: "Holstein", HE: "Hereford", HER: "Hereford", HEX: "Hereford cross", SA: "Salers", SAL: "Salers", SAX: "Salers cross", SH: "Shorthorn", SHX: "Shorthorn cross", BA: "Blonde d'Aquitaine", BAX: "Blonde d'Aquitaine cross", AU: "Aubrac", AUX: "Aubrac cross", PA: "Parthenaise", PAR: "Parthenaise", JE: "Jersey", JEX: "Jersey cross", GA: "Galloway", HI: "Highland", DX: "Dexter", MRI: "Meuse-Rhine-Issel" };
export const KNOWN_MARTS = [{ match: /swatragh/i, name: "Swatragh Livestock Market", address: "29 Garvagh Road, Swatragh, Co. Derry, BT46 5QE" }];
export function isoFromParts(d, m, y) {
  if (y.length === 2) y = "20" + y;
  d = String(d).padStart(2, "0"); m = String(m).padStart(2, "0");
  if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return "";
  return `${y}-${m}-${d}`;
}
export function parseDocket(text) {
  const t = String(text || "").replace(/[|]/g, " ");
  const out = { date: "", herdNo: "", statementNo: "", mart: null, animals: [], total: "" };
  const d = t.match(/Date\s*[:.]?\s*(\d{1,2})\s*[\/.]\s*(\d{1,2})\s*[\/.]\s*(\d{2,4})/i);
  if (d) out.date = isoFromParts(d[1], d[2], d[3]);
  const h = t.match(/Herd\s*No\.?\s*[:.]?\s*(\d{6})/i); if (h) out.herdNo = h[1];
  const s = t.match(/Statement\s*Number\s*[:.]?\s*(\d{5,})/i); if (s) out.statementNo = s[1];
  out.mart = KNOWN_MARTS.find((m) => m.match.test(t)) || null;
  const sale = out.date || todayStr();
  const bullocks = /\bBK\b/.test(t);
  const lines = t.split(/\r?\n/);
  const seen = new Set();
  lines.forEach((line) => {
    const re = /(?:[Xx]\s*[Il1!tT|]?|[Il1!tT|])\s*[0Oo]\s*(\d{6})\s*(\d{4})([^\/\n]{1,6}?)\s*[\/.]\s*(\d{1,2})\s*[\/.]\s*(\d{2,4})/g;
    let m;
    while ((m = re.exec(line))) {
      const herd = m[1], animal = m[2];
      if (seen.has(herd + animal)) continue;
      seen.add(herd + animal);
      const expected = tagCheckDigit(herd, animal);
      // Between the animal number and the first "/" sit the check digit and the
      // day of birth, often run together ("724" = check 7, day 24).
      const raw = m[3]; const squashed = raw.replace(/\s+/g, "");
      let day = "", readCheck = null;
      if (squashed.length >= 3) { readCheck = squashed[0]; day = squashed.slice(1).replace(/\D/g, ""); }
      else if (squashed.length === 2) {
        if (!/\d/.test(squashed[0]) || /\s/.test(raw.trim()) || Number(squashed) > 31) { readCheck = squashed[0]; day = squashed.slice(1); }
        else day = squashed;
      } else day = squashed;
      let dob = isoFromParts(day || "0", m[4], m[5]);
      let dobFlag = "";
      if (dob && dob > sale) { // e.g. 26 misread as 28
        const fixed = sale.slice(0, 4) + dob.slice(4);
        dob = fixed <= sale ? fixed : dob; dobFlag = "Year looked wrong, check date of birth";
      }
      if (!dob) dobFlag = "Couldn't read date of birth";
      const checkMismatch = readCheck != null && /\d/.test(readCheck) && Number(readCheck) !== expected;
      const rest = line.slice(m.index + m[0].length).toUpperCase();
      const sc = rest.replace(/[^A-Z0-9 ]/g, " ").match(/(?:^|\s)(?:Y\s*|N\s*){0,2}([MFB])\s*(BLW|BW|DW|RW|RN|BR|BL|B|D|R|W)(?![A-Z])/);
      const sexLetter = sc ? sc[1] : "";
      const colour = sc ? sc[2] : "";
      // Marts print DAERA sex codes: F = female, M = male (bullock/steer), B = bull.
      const sex = sexLetter === "F" ? "Heifer" : sexLetter === "M" ? "Steer" : sexLetter === "B" ? "Bull" : (bullocks ? "Steer" : "");
      const before = line.slice(0, m.index);
      const lotM = before.match(/(\d{3,4})\s*\W{0,3}\s*$/);
      const wt = rest.match(/\b(\d{2,4})\.\d\b/);
      const pr = rest.match(/\b(\d{1,2},\d{3}\.\d{2}|\d{3,5}\.\d{2})\b/);
      out.animals.push({
        tag: `XI 0 ${herd} ${animal} ${expected}`, checkMismatch, dob, dobFlag, sex, colour,
        fqa: /F\s*Q/.test(rest), lot: lotM ? lotM[1] : "",
        weight: wt ? wt[1] : "", price: pr ? pr[1].replace(/,/g, "") : "",
      });
    }
  });
  const money = (t.match(/\b\d{1,2},\d{3}\.\d{2}\b/g) || []).map((v) => Number(v.replace(/,/g, "")));
  const n = out.animals.length;
  if (n) {
    if (out.animals.every((a) => a.price)) out.total = String(out.animals.reduce((s, a) => s + Number(a.price), 0));
    else if (money.length === n) out.total = String(money.reduce((s, v) => s + v, 0));
    else if (money.length === 2 * n) out.total = String(money.reduce((s, v) => s + v, 0) / 2);
  }
  return out;
}
export function parseHerdList(text) {
  const out = [];
  const seen = new Set();
  const dateRe = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/g;
  const pageHasUkTags = /\bU\s?K\s?\d/i.test(text); // if so, ignore lines without one (headers, footers)
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.replace(/[|_]/g, " ").replace(/\s+/g, " ").trim();
    if (!line) return;
    const dates = [...line.matchAll(dateRe)].map((m) => {
      let d = m[1], mo = m[2], y = m[3];
      if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
      if (y.length !== 4 || Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }).filter(Boolean).sort();
    if (!dates.length) return;
    const noDates = line.replace(dateRe, " ");
    let tag = null, tagText = null;
    const uk = noDates.match(/\bU\s?K\s?(\d[\d ]{8,18}\d)/i);
    if (uk) { tag = ("UK" + uk[1]).replace(/\s+/g, " ").trim(); tagText = uk[0]; }
    else if (!pageHasUkTags) {
      const m = noDates.match(/\b\d[\d ]{4,16}\d\b/);
      if (m) { tag = m[0].replace(/\s+/g, " ").trim(); tagText = m[0]; }
    }
    if (!tag || seen.has(normTag(tag))) return;
    seen.add(normTag(tag));
    const rest = noDates.replace(tagText, " ");
    let sex = "";
    if (/\b(female|heifer|cow)\b/i.test(rest) || /\bF\b/.test(rest)) sex = "Heifer";
    else if (/\b(steer|bullock)\b/i.test(rest)) sex = "Steer";
    else if (/\b(male|bull)\b/i.test(rest) || /\bM\b/.test(rest)) sex = "Bull";
    let breed = "";
    for (const t of rest.toUpperCase().match(/\b[A-Z]{2,4}\b/g) || []) { if (BREED_CODES[t]) { breed = BREED_CODES[t]; break; } }
    out.push({ tag, dob: dates[0], sex: sex || "Heifer", breed });
  });
  return out;
}

/**
 * Kill sheet (factory) → per-animal dead weight, grade and £/kg (design/10 §6.4). Processors'
 * layouts differ and none is published, so this is deliberately generic: for each animal on the
 * sale it finds the line holding its tag's last 5 digits (animal no. + check digit, spaces
 * ignored) and reads from that line (or the next one, if wrapped): a EUROP grade like "R3",
 * "U-4L", "O+3"; a carcase weight 100–650 kg; a price 2.00–12.00 £/kg or 200–1200 p/kg.
 * Returns { [animalId]: { deadKg?, grade?, pricePerKg? } } for the animals found. The farmer
 * checks every line before saving (the sheet says so).
 */
export function parseKillSheet(text, animals) {
  const lines = String(text || "").toUpperCase().replace(/[|]/g, " ").split(/\r?\n/);
  const out = {};
  for (const a of animals || []) {
    const d = String(a.tag || "").replace(/\D/g, ""); if (d.length < 5) continue;
    const key = d.slice(-5);
    const i = lines.findIndex((l) => l.replace(/\s+/g, "").includes(key));
    if (i < 0) continue;
    // drop the tag itself (and any herd-number run of digits) before reading numbers
    let rest = (lines[i] + " " + (lines[i + 1] || "")).replace(/(?:UK|XI)?\s*[09]?\s*\d{6}\s*\d{4}\s*\d?/g, " ");
    rest = rest.replace(/\b\d{5,}\b/g, " ");
    const r = {};
    const g = rest.match(/(?:^|\s)([EUROP][+\-=]?\s?[1-5][LH+\-=]?)(?=\s|$)/);
    if (g) r.grade = g[1].replace(/\s/g, "");
    const nums = [...rest.replace(g ? g[0] : "\u0000", " ").matchAll(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(P\b|P\/KG)?/g)].map((m) => ({ v: Number(m[1].replace(",", ".")), p: !!m[2], dec: /[.,]/.test(m[1]) }));
    const price = nums.find((n) => !n.p && n.dec && n.v >= 2 && n.v <= 12) || nums.find((n) => n.p && n.v >= 200 && n.v <= 1200);
    if (price) r.pricePerKg = price.p ? Math.round(price.v) / 100 : price.v;
    const kg = nums.find((n) => n !== price && n.v >= 100 && n.v <= 650 && !(n.p));
    if (kg) r.deadKg = kg.v;
    if (Object.keys(r).length) out[a.id] = r;
  }
  return out;
}
