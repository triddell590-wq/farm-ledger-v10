// Head counts for the PM2 holding register and the 1 June inventory (design/13 §8.3, §19).
// Pigs on farm now = breeding pigs + suckling piglets + growing batches. PM2 months are worked
// back from today's count: opening = closing − born − on + off + died, so the register always
// reconciles with the records; the farmer's own month-end count is the check (pm2Months).
import { addDays } from "./dates.js";
import { pm2Month } from "./paperwork.js";
import { aliveNow } from "./litters.js";
import { onFarm } from "./sows.js";

/** Pigs on farm now by category. */
export function headCount(snap) {
  const sows = snap.data.sows.filter(onFarm);
  const c = { sows: 0, gilts: 0, boars: 0, piglets: 0, weaners: 0, growers: 0, finishers: 0 };
  for (const s of sows) { if (s.type === "boar") c.boars++; else if (s.type === "gilt" && !(snap.ix.litters.get(s.id) || []).length) c.gilts++; else c.sows++; }
  c.piglets = snap.data.litters.filter((l) => !l.weaned).reduce((t, l) => t + aliveNow(l), 0);
  for (const [id, f] of snap.c.bf) { if (f.final) continue; const st = snap.ix.batches.get(id)?.stage; if (st === "weaner") c.weaners += f.onFarm; else if (st === "grower") c.growers += f.onFarm; else c.finishers += f.onFarm; }
  return c;
}
export const total = (c) => Object.values(c).reduce((t, n) => t + n, 0);

/** Inventory counts for the 1 June return (pre-filled from today's records). */
export function inventoryCounts(snap) { const c = headCount(snap); return { counts: { sows: c.sows, gilts: c.gilts, boars: c.boars, piglets: c.piglets, weaners: c.weaners, growers: c.growers, finishers: c.finishers }, total: total(c) }; }

/** The last `n` PM2 months, newest first, each with its saved close (if any). */
export function pm2Series(snap, n = 6) {
  const months = []; let m = snap.today.slice(0, 7);
  for (let i = 0; i < n; i++) { months.push(m); const d = new Date(m + "-15T12:00Z"); d.setUTCMonth(d.getUTCMonth() - 1); m = d.toISOString().slice(0, 7); }
  const data = { litters: snap.data.litters, moves: snap.data.moves, deaths: snap.data.deaths };
  let closing = total(headCount(snap)); const out = [];
  for (const mo of months) {
    const probe = pm2Month(mo, data, 0);
    const opening = closing - probe.born - probe.on + probe.off + probe.died;
    const saved = (snap.data.pm2Months || []).find((x) => x.month === mo) || null;
    const r = pm2Month(mo, data, opening, saved ? saved.counted : null, saved?.note || "");
    out.push({ ...r, saved, current: mo === snap.today.slice(0, 7) });
    closing = opening;
  }
  return out;
}
export { addDays };
