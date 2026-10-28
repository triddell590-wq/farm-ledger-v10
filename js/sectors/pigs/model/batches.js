// Growing batches and the batch card (design/13 §6.2): live FCR estimate, growth, feed cost
// per kg gain, mortality, projected ship date, close-out summary. Formulas exactly as the design:
//   kgGain = (onFarm × estWeightNow + kgOut + deadPigs × estDeadKg) − kgIn
//   estWeightNow = last weigh avg + DLWG × days since (before any weigh: avgIn + target DLWG × days)
//   FCR = feedUsedKg ÷ kgGain, feedUsedKg = delivered − bin estimate ("estimate" until closed)
//   DLWG = (estWeightNow − avgIn) ÷ days × 1000 ; ship = today + (targetLive − est) ÷ DLWG
import { addDays, daysBetween } from "./dates.js";

const sum = (a, f) => a.reduce((t, x) => t + (+f(x) || 0), 0);
export const batchName = (b) => (b ? `B${b.no}` : "");
export const STAGES = ["service", "farrowing", "weaner", "grower", "finisher", "closed"];

/** Share of a delivery that belongs to this batch (split evenly across its batches). */
const share = (d, id) => ((d.batchIds || []).includes(id) ? 1 / d.batchIds.length : 0);

export function feedFor(b, deliveries, finance = []) {
  const mine = deliveries.filter((d) => share(d, b.id));
  const kg = sum(mine, (d) => d.kg * share(d, b.id));
  const ids = new Set(mine.map((d) => d.id));
  const pounds = sum(finance.filter((f) => ids.has(f.feedDeliveryId)), (f) => {
    const d = mine.find((x) => x.id === f.feedDeliveryId); return f.amount * share(d, b.id);
  });
  return { kg, pounds, loads: mine.length, last: mine.map((d) => d.date).sort().pop() || null };
}

/** Everything the batch card shows. Pass `money` = finance rows the viewer may read (or []). */
export function batchFacts(b, { deaths = [], moves = [], deliveries = [], readings = [], killSheets = [], finance = [], medicines = [] }, s, today) {
  const t = s.targets;
  // the batch's current phase starts at b.inDate (weaning, pigs in, or the move to the finisher)
  const inPhase = (d) => !b.inDate || !d || d >= b.inDate;
  const dead = deaths.filter((d) => d.batchId === b.id && d.stage !== "Sow" && d.stage !== "Boar" && d.stage !== "Suckling" && inPhase(d.date));
  const outs = moves.filter((m) => m.batchId === b.id && m.direction === "off" && inPhase(m.date));
  const died = sum(dead, (d) => d.n);
  const culled = sum(outs.filter((m) => m.category === "culls"), (m) => m.n);
  const out = sum(outs.filter((m) => m.category !== "culls"), (m) => m.n);
  const numberIn = +b.numberIn || 0; const avgIn = +b.avgKgIn || 0; const kgIn = numberIn * avgIn;
  const onFarm = Math.max(0, numberIn - died - culled - out);
  const end = b.closed?.date || today;
  const days = b.inDate ? Math.max(0, daysBetween(b.inDate, end)) : 0;
  const weighs = [...(b.sampleWeighs || [])].sort((x, y) => x.date.localeCompare(y.date));
  const lw = weighs[weighs.length - 1] || null;
  let dlwg, est, fromTarget = false;
  if (lw && b.inDate && daysBetween(b.inDate, lw.date) > 0) {
    dlwg = ((lw.avgKg - avgIn) / daysBetween(b.inDate, lw.date)) * 1000;
    est = lw.avgKg + (dlwg / 1000) * daysBetween(lw.date, end);
  } else { dlwg = b.stage === "weaner" ? t.rearDlwg : t.dlwg; est = avgIn + (dlwg / 1000) * days; fromTarget = true; }
  const deadKg = sum(dead, (d) => (+d.estKg || est) * d.n);
  const ks = killSheets.filter((k) => k.batchId === b.id && inPhase(k.date));
  const ksDw = sum(ks, (k) => k.totals?.dwKg); const ksPigs = sum(ks, (k) => k.totals?.pigs);
  // kg out: kill-sheet deadweight ÷ kill-out where we have it, else the live weight on the move
  const liveOutFromKs = ksDw ? ksDw / (s.killOut / 100) : 0;
  const kgOutMoves = sum(outs, (m) => (+m.liveKg || (+m.avgKg || est) * m.n));
  const kgOut = ksPigs && ksPigs >= out ? liveOutFromKs + sum(outs.filter((m) => m.category === "culls"), (m) => +m.liveKg || est * m.n) : kgOutMoves;
  const kgGain = onFarm * est + kgOut + deadKg - kgIn;
  const feed = feedFor(b, deliveries.filter((d) => inPhase(d.date)), finance);
  const dip = readings.filter((r) => r.roomId === b.roomId && r.binDipKg != null && r.date >= (b.inDate || "")).sort((x, y) => x.date.localeCompare(y.date)).pop();
  const binKg = dip && (!feed.last || dip.date >= feed.last) ? +dip.binDipKg : 0;
  const feedUsed = Math.max(0, feed.kg - binKg);
  const fcr = kgGain > 0 && feedUsed > 0 && (b.closed || days >= 7) ? feedUsed / kgGain : null; // too early to mean anything in week 1
  const mortPct = numberIn ? died / numberIn : null;
  const daysToShip = dlwg > 0 && est < s.targetLive ? Math.ceil((s.targetLive - est) / (dlwg / 1000)) : 0;
  const wd = withdrawalEnd(b, medicines);
  return {
    numberIn, avgIn, kgIn, died, culled, out, onFarm, days, est, dlwg, fromTarget, lastWeigh: lw, deadKg, kgOut, kgGain,
    feedKg: feed.kg, feedLoads: feed.loads, feedPounds: feed.pounds, binKg, feedUsed, fcr, final: !!b.closed,
    costPerKgGain: feed.pounds && kgGain > 0 ? feed.pounds / kgGain : null, feedPerPig: feed.pounds && numberIn ? feed.pounds / numberIn : null,
    mortPct, shipDate: onFarm ? addDays(today, daysToShip) : null, shipDays: days + daysToShip, withdrawalEnd: wd,
    targetFcr: b.stage === "weaner" ? t.rearFcr : t.fcr, targetMort: b.stage === "weaner" ? t.rearMort : t.mort, targetDlwg: b.stage === "weaner" ? t.rearDlwg : t.dlwg,
  };
}

/** Latest meat withdrawal end from medicines given to this batch (blocks "Plan a load"). */
export function withdrawalEnd(b, medicines) {
  return medicines.filter((m) => m.batchId === b.id && m.withdrawalEndDateMeat).map((m) => m.withdrawalEndDateMeat).sort().pop() || null;
}
export function shipBlocked(b, medicines, date) {
  const wd = withdrawalEnd(b, medicines);
  return wd && date < wd ? { blocked: true, until: wd } : { blocked: false };
}

/** Feed withdrawal (Red Tractor LT.4.0): ≤ 8 h before transport and ≤ 12 h before arrival. */
export function feedWithdrawCheck(withdrawnAt, loadAt, arriveAt) {
  const h = (a, b) => (new Date(b) - new Date(a)) / 3600000;
  if (!withdrawnAt || !loadAt) return { ok: true };
  const before = h(withdrawnAt, loadAt); const toArrive = arriveAt ? h(withdrawnAt, arriveAt) : before;
  if (before < 0) return { ok: false, text: "Feed withdrawal time is after loading." };
  if (toArrive > 12) return { ok: false, text: `Feed off ${Math.round(toArrive)} h before arrival — the limit is 12 h.` };
  if (before > 8) return { ok: false, text: `Feed off ${Math.round(before)} h before loading — the limit is 8 h.` };
  return { ok: true };
}

/**
 * Ready to ship (design/13 §6.3): rank pens by estimated weight against the processor's
 * deadweight band. pens: [{ no, pigs, avgKg? }] — pens with no sample use the batch estimate.
 */
export function readyToShip(pens, est, s) {
  return pens.map((p) => {
    const live = +p.avgKg || est; const dw = live * (s.killOut / 100);
    const status = dw < s.bandMin ? "light" : dw > s.bandMax ? "over" : "in";
    return { ...p, live, dw, status, gap: status === "light" ? s.bandMin - dw : status === "over" ? dw - s.bandMax : 0 };
  }).sort((a, b) => b.live - a.live);
}

/** Close-out summary (design/13 §6.5). Final FCR uses kill-sheet weights. */
export function closeSummary(f, killSheets, revenue = 0) {
  const pigs = sum(killSheets, (k) => k.totals?.pigs); const inSpec = sum(killSheets, (k) => k.totals?.inSpec);
  return {
    fcr: f.fcr, dlwg: f.dlwg, mortPct: f.mortPct, days: f.days, feedPerPig: f.feedPerPig,
    marginPerPig: revenue && pigs ? revenue / pigs - (f.feedPerPig || 0) : null, inSpecPct: pigs ? inSpec / pigs : null,
  };
}

/** Next batch number: one more than the highest used. */
export function nextBatchNo(batches) { return batches.reduce((m, b) => Math.max(m, +b.no || 0), 0) + 1; }
