// Lambing shed, pens, the season and the lamb funnel (design/11 §4, §5.4, §5.5).
import { addDays, daysBetween } from "../../../core/dates.js";
import { countsAt, ewesToRam } from "./mobs.js";

export const DEATH_CAUSES = ["Stillborn", "Weak at birth", "Starvation", "Hypothermia", "Watery mouth", "Joint ill", "Misadventure (lain on)", "Unknown"];
export const EWE_PROBLEMS = ["No milk", "Prolapse", "Bad mother", "Mastitis"];
export const LAMB_AGES = { "<48h": "Under 48 hours", "2-7d": "2–7 days", older: "Older" };

const dt = (l) => new Date(l.datetime || (l.date ? l.date + "T12:00:00" : 0));
export const lambDate = (l) => (l.datetime || l.date || "").slice(0, 10);
export const live = (list) => (list || []).filter((l) => !l.deleted);
/**
 * The funnel to show: this cycle's crop once it has two steps, else last year's (in tupping the
 * new crop has only "ewes to the ram"). Returns { main, other, mainCy, otherCy }.
 */
export function shownFunnel(data, cy, prevCy, today, olderCy = null) {
  const f = funnel(data, cy, today); const g = funnel(data, prevCy, today);
  if (f.enough || !g.enough) return { main: f, other: g, mainCy: cy, otherCy: prevCy };
  // showing last year's crop: compare it with the crop before (the new crop only has "ewes to the ram")
  return olderCy ? { main: g, other: funnel(data, olderCy, today), mainCy: prevCy, otherCy: olderCy } : { main: g, other: f, mainCy: prevCy, otherCy: cy };
}
/** Lambings in this cycle's crop (from rams in + 100 days to next rams in). */
export function cropLambings(data, cy) { const from = addDays(cy.ramsIn, 100); return live(data.lambings).filter((l) => lambDate(l) >= from && lambDate(l) < cy.nextRamsIn); }

export function sumLambs(list) {
  let ewes = 0, born = 0, alive = 0, dead = 0, aborted = 0, assisted = 0, fosteredOn = 0;
  for (const l of list) {
    if (l.aborted) { aborted++; continue; }
    ewes++; const ls = (l.lambs || []).filter((x) => !x.fosteredFrom); // a fostered-on lamb is counted with its own mother
    born += ls.length; alive += ls.filter((x) => x.alive).length; dead += ls.filter((x) => !x.alive).length;
    fosteredOn += (l.lambs || []).filter((x) => x.fosteredFrom).length;
    if (l.help && l.help !== "none") assisted++;
  }
  return { ewes, born, alive, dead, aborted, assisted, fosteredOn, perEwe: ewes ? Math.round((born / ewes) * 100) / 100 : 0, deadPct: born ? Math.round((dead / born) * 1000) / 10 : 0 };
}
/** The night's running total: since the shed's night start (default 18:00) before `now`. */
export function nightStart(now, from = "18:00") {
  const [h, m] = String(from).split(":").map(Number); const d = new Date(now); d.setHours(h || 0, m || 0, 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  return d;
}
export function tonight(data, now, from = "18:00") { const start = nightStart(now, from); return sumLambs(live(data.lambings).filter((l) => dt(l) >= start && dt(l) <= now)); }
/** Lambings in a calendar day (YYYY-MM-DD). */
export const onDay = (data, day) => sumLambs(live(data.lambings).filter((l) => lambDate(l) === day));

/** Pens in use: [{pen, lambing, hours, ready (≥24 h), turnOut (≥48 h)}]. */
export function pensInUse(data, now) {
  const out = [];
  for (const l of live(data.lambings)) {
    if (!l.pen || l.penOut || !l.penIn) continue;
    const hours = Math.floor((now - new Date(l.penIn)) / 3600000);
    out.push({ pen: +l.pen, lambing: l, hours, ready: hours >= 24, turnOut: hours >= 48 });
  }
  return out.sort((a, b) => a.pen - b.pen);
}
export function nextFreePen(data, now, pens = 12) { const used = new Set(pensInUse(data, now).map((p) => p.pen)); for (let i = 1; i <= pens; i++) if (!used.has(i)) return i; return null; }
/** Ewes "to watch": lambings with a ewe problem not yet cleared. */
export const toWatch = (data) => live(data.lambings).filter((l) => (l.problems || []).length && !l.watchCleared);
/** Abortions as % of ewes to the ram this crop. */
export function abortionPct(data, cy) { const n = cropLambings(data, cy).filter((l) => l.aborted).length; const e = ewesToRam(data, cy); return { n, pct: e ? Math.round((n / e) * 1000) / 10 : 0 }; }

/** Lamb deaths recorded after birth (quick add "Dead lamb"), by age band, within the crop. */
export function lambDeaths(data, cy, until = "9999-12-31") {
  const from = addDays(cy.ramsIn, 100);
  return (data.deaths || []).filter((d) => !d.deleted && d.lamb && d.date >= from && d.date < cy.nextRamsIn && d.date <= until);
}
/** Lambs scanned this cycle (scan events between rams in and lambing start). */
export function scanTotals(data, cy) {
  const t = { empty: 0, single: 0, twin: 0, triplet: 0, scanned: 0, lambs: 0, events: [] };
  for (const e of data.events || []) {
    if (e.deleted || e.kind !== "scan" || e.date < cy.ramsIn || e.date >= cy.lambTo) continue;
    t.events.push(e); for (const k of ["empty", "single", "twin", "triplet"]) t[k] += +e.counts?.[k] || 0;
  }
  t.scanned = t.empty + t.single + t.twin + t.triplet; t.lambs = t.single + 2 * t.twin + 3 * t.triplet;
  return t;
}
export const scanPct = (lambs, ewes) => (ewes ? Math.round((lambs / ewes) * 100) : 0);
export const barrenPct = (empty, scanned) => (scanned ? Math.round((empty / scanned) * 1000) / 10 : 0);

/**
 * The funnel for one crop. Every step is a count; losses are (previous − this) ÷ previous.
 *  ewes to the ram → lambs scanned → born alive → alive at 48 h → turned out → weaned → sold / kept
 * Turned out = alive at 48 h − deaths aged 2–7 days. Weaned = a recorded weaning count, else
 * turned out − older lamb deaths before weaning. Sold/kept = lambs sold this crop + lambs kept.
 */
export function funnel(data, cy, today) {
  const ewes = ewesToRam(data, cy);
  const scan = scanTotals(data, cy);
  const season = sumLambs(cropLambings(data, cy));
  const deaths = lambDeaths(data, cy);
  const d48 = deaths.filter((d) => d.ageBand === "<48h").reduce((n, d) => n + (+d.number || 1), 0);
  const d7 = deaths.filter((d) => d.ageBand === "2-7d").reduce((n, d) => n + (+d.number || 1), 0);
  const dOld = deaths.filter((d) => d.ageBand === "older" && d.date < cy.weaning).reduce((n, d) => n + (+d.number || 1), 0);
  const born = season.alive; const at48 = Math.max(0, born - d48); const out = Math.max(0, at48 - d7);
  const weanEv = (data.events || []).filter((e) => !e.deleted && e.kind === "wean" && e.date >= cy.lambFrom && e.date < cy.nextRamsIn);
  const weanedRec = weanEv.reduce((n, e) => n + (+e.counts?.weaned || 0), 0);
  const weaned = weanEv.length ? weanedRec : today >= cy.weaning && season.ewes ? Math.max(0, out - dOld) : null; // no lambings recorded = no estimate
  const sold = (data.movements || []).filter((m) => !m.deleted && m.kind === "off" && m.lambs && m.crop === cy.crop).reduce((n, m) => n + (+m.count || 0), 0);
  const counts = countsAt(data);
  const kept = (data.mobs || []).filter((m) => !m.deleted && ["lambs", "eweLambs"].includes(m.class) && (m.birthYears || []).map(Number).includes(cy.crop)).reduce((n, m) => n + (counts.get(m.id) || 0), 0);
  const steps = [
    { key: "ewes", label: "Ewes to the ram", n: ewes },
    { key: "scanned", label: "Lambs scanned", n: scan.scanned ? scan.lambs : null },
    { key: "born", label: "Born alive", n: season.ewes ? born : null },
    { key: "at48", label: "Alive at 48 h", n: season.ewes ? at48 : null },
    { key: "out", label: "Turned out", n: season.ewes ? out : null },
    { key: "weaned", label: "Weaned", n: weaned },
    { key: "sold", label: "Sold / kept", n: sold || kept ? sold + kept : null },
  ];
  const LOSS = { born: "lost scan → birth", at48: "in first 48 h", out: "in the pens", weaned: "turnout → weaning", sold: "after weaning" };
  let prev = null;
  for (const st of steps) {
    st.pct = ewes && st.n != null && st.key !== "ewes" ? Math.round((st.n / ewes) * 100) : null;
    if (prev && prev.n != null && st.n != null && LOSS[st.key] && st.n < prev.n) st.loss = { n: prev.n - st.n, pct: Math.round(((prev.n - st.n) / prev.n) * 1000) / 10, label: LOSS[st.key] };
    if (st.n != null) prev = st;
  }
  const scanned = steps[1].n, weanN = steps[5].n;
  const totalLoss = scanned && weanN != null ? Math.round(((scanned - weanN) / scanned) * 1000) / 10 : null;
  return { crop: cy.crop, ewes, steps, scan, season, totalLoss, enough: steps.filter((x) => x.n != null).length >= 2 };
}
