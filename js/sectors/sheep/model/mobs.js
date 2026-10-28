// Mobs (design/11 §5.1). A mob's count is DERIVED from dated records, never typed over:
//   events countCheck {count, reason}   sets the count (also written when a mob is created)
//   events split {n, toMobId}           −n here, +n there
//   events merge {toMobId}              everything here moves there
//   lambCrops taggings {mobId, count}   + lambs (births are registered when tagged)
//   deaths {mobId, number}              − number
//   movements off {mobId, count}        − count (sales, moves off the holding)
//   movements on {mobId, count}         + count (buy in, moves on)
// One chronological pass over every change gives each mob's count on any date.
export const CLASSES = { ewes: "Ewes", eweLambs: "Ewe lambs", hoggets: "Hoggets", rams: "Rams", lambs: "Lambs", ewesWithLambs: "Ewes with lambs", goats: "Goats" };
export const EWE_CLASSES = ["ewes", "ewesWithLambs"];

/** Every count change as { date, seq, mobId, kind, set?, delta?, to?, all? } in date order. */
export function changes(data) {
  const out = []; let seq = 0;
  const t = (r) => (r.createdAt ? +new Date(r.createdAt) : 0);
  for (const e of data.events || []) {
    if (e.deleted || !e.mobId) continue;
    if (e.kind === "countCheck") out.push({ date: e.date, t: t(e), mobId: e.mobId, kind: "set", set: +e.counts?.count || 0, ref: e });
    else if (e.kind === "split") out.push({ date: e.date, t: t(e), mobId: e.mobId, kind: "move", n: +e.counts?.n || 0, to: e.toMobId, ref: e });
    else if (e.kind === "merge") out.push({ date: e.date, t: t(e), mobId: e.mobId, kind: "merge", to: e.toMobId, ref: e });
  }
  for (const c of data.lambCrops || []) for (const g of c.deleted ? [] : c.taggings || []) if (g.mobId) out.push({ date: g.date, t: 0, mobId: g.mobId, kind: "delta", delta: +g.count || 0, ref: g });
  for (const d of data.deaths || []) if (!d.deleted && d.mobId) out.push({ date: d.date, t: t(d), mobId: d.mobId, kind: "delta", delta: -(+d.number || 1), ref: d });
  for (const m of data.movements || []) {
    if (m.deleted || !m.mobId || !m.date) continue;
    if (m.kind === "off") out.push({ date: m.date, t: t(m), mobId: m.mobId, kind: "delta", delta: -(+m.count || 0), ref: m });
    if (m.kind === "on") out.push({ date: m.date, t: t(m), mobId: m.mobId, kind: "delta", delta: +m.count || 0, ref: m });
  }
  out.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.t - b.t);
  out.forEach((c) => (c.seq = seq++));
  return out;
}
/** Counts per mob on `date` (inclusive; default all). Returns Map mobId -> n. */
export function countsAt(data, date = "9999-12-31") {
  const m = new Map();
  for (const mob of data.mobs || []) m.set(mob.id, 0);
  for (const c of changes(data)) {
    if (c.date > date) break;
    const cur = m.get(c.mobId) || 0;
    if (c.kind === "set") m.set(c.mobId, c.set);
    else if (c.kind === "delta") m.set(c.mobId, cur + c.delta);
    else if (c.kind === "move") { const n = Math.min(cur, c.n); m.set(c.mobId, cur - n); if (c.to) m.set(c.to, (m.get(c.to) || 0) + n); }
    else if (c.kind === "merge") { m.set(c.mobId, 0); if (c.to) m.set(c.to, (m.get(c.to) || 0) + cur); }
  }
  for (const [k, v] of m) if (v < 0) m.set(k, 0);
  return m;
}
/** Count history for one mob: [{date, count, kind, ref}] (for the mob screen chart and trail). */
export function countHistory(data, mobId) {
  const out = []; const m = new Map();
  for (const c of changes(data)) {
    const before = new Map(m); const cur = m.get(c.mobId) || 0;
    if (c.kind === "set") m.set(c.mobId, c.set);
    else if (c.kind === "delta") m.set(c.mobId, Math.max(0, cur + c.delta));
    else if (c.kind === "move") { const n = Math.min(cur, c.n); m.set(c.mobId, cur - n); if (c.to) m.set(c.to, (m.get(c.to) || 0) + n); }
    else if (c.kind === "merge") { m.set(c.mobId, 0); if (c.to) m.set(c.to, (m.get(c.to) || 0) + cur); }
    if (c.mobId === mobId || c.to === mobId) out.push({ date: c.date, count: m.get(mobId) || 0, was: before.get(mobId) || 0, kind: c.kind, ref: c.ref });
  }
  return out;
}
export const activeMobs = (data) => (data.mobs || []).filter((m) => !m.deleted && m.active !== false);

/** Flock totals by class for the mob strip ("6 mobs · 240 ewes · 6 rams · 0 lambs"). */
export function totals(data, counts) {
  const t = { mobs: 0, ewes: 0, rams: 0, eweLambs: 0, hoggets: 0, lambs: 0, goats: 0, all: 0 };
  for (const m of activeMobs(data)) {
    const n = counts.get(m.id) || 0; t.mobs++; t.all += n;
    if (EWE_CLASSES.includes(m.class)) t.ewes += n;
    else if (m.class === "rams") t.rams += n; else if (m.class === "eweLambs") t.eweLambs += n;
    else if (m.class === "hoggets") t.hoggets += n; else if (m.class === "lambs") t.lambs += n; else if (m.class === "goats") t.goats += n;
  }
  return t;
}
/**
 * Ewes put to the ram this cycle: ewes in mobs that had a rams-in or raddle record in the cycle,
 * counted on the rams-in date; if none recorded, every ewe mob on that date.
 */
export function ewesToRam(data, cy) {
  const at = countsAt(data, cy.ramsIn); // a mob made after rams in falls back to its count now
  const inCycle = (e) => e.date >= cy.ramsIn && e.date < cy.nextRamsIn;
  const ids = new Set();
  for (const e of data.events || []) if (!e.deleted && inCycle(e) && (e.kind === "raddle" || e.kind === "ramsIn")) { if (e.mobId) ids.add(e.mobId); (e.mobIds || []).forEach((i) => ids.add(i)); }
  const mobs = (data.mobs || []).filter((m) => !m.deleted && (ids.size ? ids.has(m.id) && m.class !== "rams" : EWE_CLASSES.includes(m.class)));
  const now = countsAt(data);
  return mobs.reduce((n, m) => n + (at.get(m.id) || now.get(m.id) || 0), 0);
}
/** Rams: mob counts of class rams, split into working / resting using individual ram records. */
export function ramSummary(data) {
  const counts = countsAt(data);
  const mobN = activeMobs(data).filter((m) => m.class === "rams").reduce((n, m) => n + (counts.get(m.id) || 0), 0);
  const ind = (data.sheep || []).filter((x) => !x.deleted && x.class === "ram" && (x.status || "on") === "on");
  const resting = ind.filter((r) => r.resting).length;
  const ramLambs = ind.filter((r) => r.ramLamb).length;
  const total = Math.max(mobN, ind.length);
  const mots = ind.map((r) => (r.mot || []).slice().sort((a, b) => b.date.localeCompare(a.date))[0]).filter(Boolean);
  const lastMot = mots.map((m) => m.date).sort().pop() || null;
  return { total, working: Math.max(0, total - resting), resting, ramLambs, mature: Math.max(0, total - resting - ramLambs), individuals: ind, lastMot, allMotOk: ind.length > 0 && ind.every((r) => (r.mot || []).some((m) => m.ok)) };
}
/** Ewes per ram against the guide (1:40 mature, 1:25 ram lambs). */
export function ewesPerRam(ewes, rams, s) {
  const mature = rams.mature ?? rams.working ?? 0, lambs = rams.ramLambs || 0; const working = mature + lambs;
  if (!working) return { ratio: null, ok: false, capacity: 0 };
  const capacity = mature * (+s.ramGuideMature || 40) + lambs * (+s.ramGuideLamb || 25);
  return { ratio: Math.round(ewes / working), ok: ewes <= capacity, capacity };
}
/** The field a mob is on and since when (latest fieldMove event, else the mob's own field). */
export function mobField(data, mob) {
  const mv = (data.events || []).filter((e) => !e.deleted && e.kind === "fieldMove" && e.mobId === mob.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  return mv ? { name: mv.toField, since: mv.date } : { name: mob.fieldName || "", since: null };
}
/** Field history for a mob (newest first). */
export const fieldHistory = (data, mobId) => (data.events || []).filter((e) => !e.deleted && e.kind === "fieldMove" && e.mobId === mobId).sort((a, b) => b.date.localeCompare(a.date));
