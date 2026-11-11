// Tagging, the flock register, movement documents and the annual inventory (design/11 §9).
// Deadlines and day counts come from region rule records (region.js), not from here.
import { addDays, addMonths, daysBetween } from "../../../core/dates.js";
import { regionRule } from "./region.js";
import { cropLambings, lambDate, lambDeaths } from "./lambing.js";
import { mobWithdrawal } from "./health.js";

const R = (k) => regionRule(k) || {};

/** The lamb crop for a cycle: born alive, tagged, untagged, earliest birth, tag-by date. */
export function cropTagging(data, cy, s) {
  const list = cropLambings(data, cy).filter((l) => !l.aborted);
  const born = list.reduce((n, l) => n + (l.lambs || []).filter((x) => x.alive && !x.fosteredFrom).length, 0);
  const dates = list.map(lambDate).filter(Boolean).sort();
  const doc = (data.lambCrops || []).find((c) => !c.deleted && +c.year === cy.crop) || null;
  const taggings = doc?.taggings || [];
  const tagged = taggings.reduce((n, g) => n + (+g.count || 0), 0);
  const died = lambDeaths(data, cy).filter((d) => !d.tagged).reduce((n, d) => n + (+d.number || 1), 0);
  const untagged = Math.max(0, born - died - tagged);
  const earliest = dates[0] || null;
  const t = R("sheepTagging");
  const months = s.housedOrMilked ? t.tagByMonthsHoused ?? 6 : t.tagByMonths ?? 9;
  return { crop: cy.crop, doc, born, tagged, untagged, died, earliest, tagBy: earliest ? addMonths(earliest, months) : null, months, taggings };
}
/** Lost tags waiting for a replacement (28 days in NI). */
export function retagsDue(data) {
  const days = R("sheepTagging").replaceDays ?? 28;
  return (data.events || []).filter((e) => !e.deleted && e.kind === "tagLost" && !e.fittedOn).map((e) => ({ ev: e, due: addDays(e.date, days) }));
}
/** Sheep moved on from GB that still need NI tags (20 days). */
export function importRetags(data) {
  const days = R("sheepTagging").importRetagDays ?? 20;
  return (data.movements || []).filter((m) => !m.deleted && m.kind === "on" && m.fromGB && !m.retaggedOn).map((m) => ({ mv: m, due: addDays(m.date, days) }));
}
/** Quarantine for bought-in sheep: [{mv, until, active}] */
export function quarantines(data, s, today) {
  return (data.movements || []).filter((m) => !m.deleted && m.kind === "on" && m.quarantine !== false).map((m) => { const until = addDays(m.date, +m.quarantineDays || +s.quarantineDays || 28); return { mv: m, until, active: today <= until && !m.quarantineEnded }; });
}

export const DESTS = { farm: "Another farm", market: "Market (CPR)", abattoir: "Abattoir (CPR)", show: "Show", common: "Common grazing", export: "Export centre" };
export const isCpr = (dest) => dest === "market" || dest === "abattoir";
/** Next movement document serial: FL-<flock>-<year>-<0001>. */
export function nextSerial(data, flockNo, date) {
  const y = String(date || "").slice(0, 4);
  const n = (data.movements || []).filter((m) => m.docSerial && String(m.date).startsWith(y)).length + 1;
  return `FL-${flockNo || "000000"}-${y}-${String(n).padStart(4, "0")}`;
}
/** 6-day standstill: the latest move on of these sheep (or any sheep onto the holding) from a market. */
export function standstill(data, mobId, date) {
  const days = R("marketStandstill").days ?? 6;
  const ons = (data.movements || []).filter((m) => !m.deleted && m.kind === "on" && (m.mobId === mobId || !mobId) && m.date <= date && daysBetween(m.date, date) < days).sort((a, b) => b.date.localeCompare(a.date));
  const m = ons.find((x) => x.fromMarket) || ons[0];
  return m ? { since: m.date, until: addDays(m.date, days + 1), fromMarket: !!m.fromMarket, days } : null;
}
/** Is the flock restricted (scab or bluetongue suspicion not cleared)? */
export function restriction(data) {
  const open = (data.diseaseReports || []).filter((r) => !r.deleted && !r.clearedOn && ["scab", "bluetongue"].includes(r.disease)).sort((a, b) => a.date.localeCompare(b.date));
  return open[0] || null;
}
/**
 * Checks before a movement document. Returns [{level:'block'|'warn'|'info', text}].
 * mv: { mob, count, date, dest, km, lambsAtFoot }
 */
export function movementChecks(data, cy, s, mv, untaggedLambs) {
  const out = []; const mob = mv.mob;
  const r = restriction(data);
  if (r) out.push({ level: "block", key: "restricted", text: `Flock restricted (${r.disease === "scab" ? "scab" : "bluetongue"}) since ${r.date}. Moves are stopped until your vet confirms in writing.` });
  if (mob && (mob.class === "ewesWithLambs" || mv.lambsAtFoot) && untaggedLambs > 0) out.push({ level: "block", key: "untagged", text: `${untaggedLambs} lambs aren't tagged yet. NI lambs need a full EID tag set before leaving the farm — there's no slaughter tag in NI.` });
  if (mob && mv.dest !== "abattoir") {
    const st = standstill(data, mob.id, mv.date);
    if (st && st.fromMarket) out.push({ level: "block", key: "standstill", text: `These sheep were at a market on ${st.since}. They can't go to a market until ${st.until}.` });
    else if (st) out.push({ level: "warn", key: "standstill", text: `Sheep came onto the farm on ${st.since}. A ${st.days}-day standstill applies to moves off (not direct to slaughter) until ${st.until}.` });
  }
  if (mob) {
    const w = mobWithdrawal(data, mob.id, mv.date);
    if (w && mv.dest === "abattoir") out.push({ level: "block", key: "withdrawal", text: `${mob.name} is under meat withdrawal until ${w.until}. They can't go for slaughter yet.` });
    else if (w) out.push({ level: "warn", key: "withdrawal", text: `${mob.name} is under meat withdrawal until ${w.until}. Tell the buyer.` });
  }
  if (+mv.km > (+s.abattoirKm || 65)) out.push({ level: "info", key: "km", text: "Over 65 km: the haulier needs transporter authorisation and the driver a certificate of competence." });
  return out;
}

export const EVENT_NAMES = { born: "Born and tagged", on: "Moved on", off: "Moved off", died: "Died", retag: "Retagged", inventory: "Inventory" };
/**
 * Flock register lines in date order (DAERA layout). Each: { date, event, number, serial,
 *  holding, tags, retag, inventory, late, ref }. `late` = entered after its deadline.
 */
export function registerLines(data) {
  const out = []; const mv = R("sheepMovement");
  const entered = (r) => (r?.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : null);
  const late = (r, date, days) => { const e = entered(r); return e && date ? daysBetween(date, e) > days : false; };
  for (const c of data.lambCrops || []) for (const g of c.deleted ? [] : c.taggings || []) out.push({ date: g.date, event: "born", number: +g.count || 0, tags: g.tagFrom ? `${g.tagFrom}${g.tagTo ? " – " + g.tagTo : ""}` : (g.tags || []).join(", "), late: g.enteredOn ? daysBetween(g.date, g.enteredOn) > (mv.birthRegisterDaysAfterTagging ?? 7) : false, ref: c });
  for (const m of data.movements || []) {
    if (m.deleted || !["on", "off"].includes(m.kind)) continue;
    const holding = [m.otherFlock, m.otherName, m.otherAddress].filter(Boolean).join(", ");
    const cpr = m.kind === "off" && isCpr(m.dest);
    out.push({ date: m.date, event: m.kind, number: +m.count || 0, serial: m.docSerial || "", holding, tags: cpr && !(m.tags || []).length ? "CPR list kept" : (m.tags || []).join(", ") || (m.tagFrom ? `${m.tagFrom} – ${m.tagTo || ""}` : ""), late: late(m, m.date, cpr ? (mv.cprRegisterHours ?? 48) / 24 : mv.registerDays ?? 7), ref: m });
  }
  for (const d of data.deaths || []) if (!d.deleted && (!d.lamb || d.tagged)) out.push({ date: d.date, event: "died", number: +d.number || 1, tags: d.tag || "", late: late(d, d.date, mv.registerDays ?? 7), ref: d });
  for (const e of data.events || []) if (!e.deleted && e.kind === "tagLost" && e.fittedOn) out.push({ date: e.fittedOn, event: "retag", number: 1, retag: `${e.tag || "?"} ↔ ${e.newTag || "?"}`, tags: e.newTag || "", ref: e });
  for (const i of data.inventories || []) if (!i.deleted && i.countDate) out.push({ date: i.countDate, event: "inventory", number: +i.total || 0, inventory: `${i.total} on ${i.countDate}`, ref: i });
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
/** Movements still to notify on NIFAIS (7 days in NI). */
export function toNotify(data) {
  const days = R("sheepMovement").notifyDays ?? 7;
  return (data.movements || []).filter((m) => !m.deleted && ["on", "off"].includes(m.kind) && !m.notifiedOn && m.date).map((m) => ({ mv: m, due: addDays(m.date, days) }));
}
/** CPR moves whose tag list photo isn't filed (48 h). */
export function cprListsDue(data) {
  const h = R("sheepMovement").cprRegisterHours ?? 48;
  return (data.movements || []).filter((m) => !m.deleted && m.kind === "off" && isCpr(m.dest) && m.cprList && !m.cprListFiledOn).map((m) => ({ mv: m, due: addDays(m.date, Math.ceil(h / 24)), dueSoon: addDays(m.date, 1) }));
}

/** Inventory dates for the year containing `today` (count 1–5 Dec; info from 15 Nov). */
export function inventoryWindow(today, s) {
  const r = R("inventories"); const y = String(+today.slice(0, 4) - (+today.slice(5, 7) < 6 ? 1 : 0)); // Jan–May belongs to last December's count
  const from = `${y}-${r.sheepCountFrom || "12-01"}`; const dl = s.inventoryDeadline || "";
  // the yearly return date from DAERA's letter belongs to this count if it falls within 90 days after it
  const deadline = dl && dl >= from && daysBetween(from, dl) <= 90 ? dl : null;
  return { year: +y, infoFrom: `${y}-${r.sheepInfoFrom || "11-15"}`, from, to: `${y}-${r.sheepCountTo || "12-05"}`, deadline };
}
/** Inventory categories prefilled from mob counts. */
export function inventoryPrefill(mobs, counts) {
  const c = { ewes: 0, rams: 0, otherAdults: 0, lambs: 0, goats: 0 };
  for (const m of mobs) {
    if (m.deleted || m.active === false) continue; const n = counts.get(m.id) || 0;
    if (m.class === "goats") c.goats += n; else if (m.class === "rams") c.rams += n;
    else if (["ewes", "ewesWithLambs"].includes(m.class)) c.ewes += n; else if (m.class === "hoggets") c.otherAdults += n; else c.lambs += n;
  }
  return c;
}
export const INVENTORY_CATS = { ewes: "Ewes 1 year and over", rams: "Rams", otherAdults: "Other sheep 1 year and over", lambs: "Lambs under 1 year", goats: "Goats" };
/** True when the count date is inside the 1–5 December window. */
export function validCountDate(d, today, s) { const w = inventoryWindow(d || today, s); return !!d && d >= w.from && d <= w.to; }
