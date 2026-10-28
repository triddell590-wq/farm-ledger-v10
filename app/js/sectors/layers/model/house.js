// House rules (design/14 §8, §9.3, §10): space check, range check, lighting plan, dusk time,
// days housed, the 1 June Bird Register helper.
import { addDays, daysBetween } from "../../../core/dates.js";
import { SPACE, LIGHT_TEMPLATE, AI_STATUS, SYSTEMS } from "./content.js";
import { aliveAt, flockIn, weekOfAge, dateAtWeek, r1 } from "./flock.js";

export const systemName = (v) => SYSTEMS.find((x) => x.v === +v)?.label || "";
export const isFreeRange = (h) => +h?.system === 0 || +h?.system === 1;

/** Space check per house (Sch. 2/3). hens = birds alive. Returns rows [{label, ok, need, have, text}]. */
export function spaceCheck(h, hens) {
  const rows = []; const add = (label, ok, text) => rows.push({ label, ok, text });
  if (!hens) return { rows, ok: true };
  if (+h.system === 3) {
    const need = hens * SPACE.colonyCm2PerHen / 10000; add("Colony space", +h.usableM2 >= need, `${hens.toLocaleString("en-GB")} hens need ${r1(need)} m² at 750 cm² each; you have ${h.usableM2 || 0} m²`);
  } else {
    if (h.usableM2) { const max = Math.floor(+h.usableM2 * SPACE.henPerM2); add("Stocking", hens <= max, hens <= max ? `${hens.toLocaleString("en-GB")} hens · room for ${max.toLocaleString("en-GB")} at 9 per m²` : `${(hens - max).toLocaleString("en-GB")} hens over 9 per m² (max ${max.toLocaleString("en-GB")})`); }
    if (h.nests) { const need = Math.ceil(hens / SPACE.hensPerNest); add("Nests", +h.nests >= need, +h.nests >= need ? `${h.nests} nests · need ${need} (1 per 7 hens)` : `${need - h.nests} nests short (1 per 7 hens)`); }
    else if (h.nestM2) { const need = r1(hens / SPACE.hensPerM2Nest); add("Group nest area", +h.nestM2 >= need, `${h.nestM2} m² · need ${need} m² (1 m² per 120 hens)`); }
    if (h.perchM) { const need = Math.ceil((hens * SPACE.perchCmPerHen) / 100); add("Perch", +h.perchM >= need, +h.perchM >= need ? `${h.perchM} m · need ${need} m (15 cm a hen)` : `${need - h.perchM} m of perch short (15 cm a hen)`); }
    if (h.litterM2) { const need = Math.ceil((hens * SPACE.litterCm2PerHen) / 10000); add("Litter", +h.litterM2 >= need, `${h.litterM2} m² · need ${need} m² (250 cm² a hen)`); }
  }
  if (isFreeRange(h) && h.rangeHa) { const max = Math.floor(+h.rangeHa * SPACE.rangeHensPerHa); add("Range", hens <= max, hens <= max ? `${h.rangeHa} ha · up to ${max.toLocaleString("en-GB")} hens at 2,500 per ha` : `${(hens - max).toLocaleString("en-GB")} hens over 2,500 per ha`); }
  if (isFreeRange(h) && h.rangeMaxM) {
    const lim = +h.sheltersPerHa >= SPACE.sheltersPerHa ? SPACE.rangeMaxMShelters : SPACE.rangeMaxM;
    add("Range distance", +h.rangeMaxM <= lim, `Furthest point ${h.rangeMaxM} m from a pop-hole · limit ${lim} m${lim === 350 ? " (4+ shelters per ha)" : ""}`);
  }
  return { rows, ok: rows.every((r) => r.ok) };
}

/** Lighting plan for a flock: the flock's own plan or the template. [{wk, hours, on, off}] */
export function lightPlan(c, f) {
  const own = (c.data.lightPlans || []).find((p) => p.flockId === f.id);
  return own?.weeks?.length ? { weeks: [...own.weeks].sort((a, b) => a.wk - b.wk), own } : { weeks: LIGHT_TEMPLATE.map(([wk, hours]) => ({ wk, hours })), own: null, template: true };
}
export function hoursAt(plan, wk) { let h = null; for (const p of plan.weeks) if (wk >= p.wk) h = +p.hours; return h; }
/** Next step up/down within `days` days: { date, wk, hours, from } */
export function nextLightStep(c, f, today = c.today, days = 3) {
  const plan = lightPlan(c, f); const wk = weekOfAge(f, today); const cur = hoursAt(plan, wk);
  const nx = plan.weeks.find((p) => p.wk > wk && +p.hours !== cur);
  if (!nx) return null;
  const date = dateAtWeek(f, nx.wk); const gap = daysBetween(today, date);
  return gap >= 0 && gap <= days ? { date, wk: nx.wk, hours: +nx.hours, from: cur } : null;
}
export const darkWarning = (plan) => plan.weeks.filter((p) => 24 - +p.hours < 8).map((p) => p.wk);

/** Sunset (local clock time, HH:MM) at lat/lng for a date — NOAA approximation, offline. */
export function sunset(iso, lat, lng) {
  const d = new Date(iso + "T12:00:00Z"); const start = Date.UTC(d.getUTCFullYear(), 0, 0); const n = Math.floor((d - start) / 86400000);
  const g = (2 * Math.PI / 365) * (n - 1);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const rad = (x) => (x * Math.PI) / 180; const zen = rad(90.833);
  const ha = Math.acos(Math.cos(zen) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl)) * (180 / Math.PI);
  const utcMin = 720 - 4 * (lng - ha) - eqt;
  const off = ukOffsetMin(iso); let m = Math.round(utcMin + off); m = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
/** UK clock offset (BST: last Sunday March → last Sunday October). */
export function ukOffsetMin(iso) {
  const y = +iso.slice(0, 4); const lastSun = (m) => { const d = new Date(Date.UTC(y, m + 1, 0)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };
  return iso >= lastSun(2) && iso < lastSun(9) ? 60 : 0;
}

/** Housing order / AI state: content first, then the farmer's own open housing period with reason AI. */
export function aiState(c, today = c.today) {
  const own = (c.data.housing || []).filter((x) => x.from <= today && (!x.to || x.to >= today)).sort((a, b) => a.from.localeCompare(b.from));
  const aiOwn = own.find((x) => x.reason === "AI housing order");
  const on = !!(AI_STATUS.housingOrder || aiOwn);
  const from = AI_STATUS.housingOrder ? AI_STATUS.orderFrom : aiOwn?.from || null;
  return { on, aipz: !!AI_STATUS.aipz || on, from, daysHoused: on && from ? daysBetween(from, today) + 1 : null, near: !!AI_STATUS.outbreakWithin10km, content: AI_STATUS, housedNow: own };
}

/** 1 June Bird Register: birds by establishment number from each house's birds alive that day. */
export function birdRegister(c, year) {
  const date = `${year}-06-01`; const byEst = new Map();
  for (const h of c.data.houses || []) {
    const f = flockIn(c, h.id, date); const n = f ? aliveAt(c, f, date) : 0;
    const est = h.establishmentNo || c.s.establishmentNo || "—";
    if (!byEst.has(est)) byEst.set(est, { establishmentNo: est, birds: {}, total: 0 });
    const e = byEst.get(est); e.birds[h.id] = n; e.total += n;
  }
  return [...byEst.values()];
}
