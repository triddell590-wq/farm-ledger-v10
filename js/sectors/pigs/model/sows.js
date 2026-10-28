// Sows, gilts and boars (design/13 §4). One record per breeding pig; status, parity and dates
// are worked out from services, scans and litters, never stored (so an edit can't leave them
// stale). Status cycle: Served → In pig (scan +) → In farrowing → Suckling → Weaned/empty → …
import { addDays, daysBetween } from "./dates.js";
import { batchDates } from "./weeks.js";

const byDate = (k) => (a, b) => String(a[k] || "").localeCompare(String(b[k] || ""));
const group = (list, key) => { const m = new Map(); for (const r of list) { const k = r[key]; if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } for (const v of m.values()) v.sort(byDate(v[0].farrowedAt ? "farrowedAt" : "date")); return m; };

/** Index the breeding herd once per snapshot. */
export function indexHerd(data) {
  const ix = {
    byId: new Map(data.sows.map((s) => [s.id, s])),
    services: group(data.services, "sowId"), scans: group(data.scans, "sowId"), litters: group(data.litters, "sowId"),
    rooms: new Map(data.rooms.map((r) => [r.id, r])), batches: new Map(data.batches.map((b) => [b.id, b])),
    litterById: new Map(data.litters.map((l) => [l.id, l])),
  };
  ix.batchByNo = new Map(data.batches.map((b) => [+b.no, b]));
  return ix;
}
export const listOf = (m, sow) => m.get(sow.id) || [];
export const sowLabel = (s) => s.sowNo || (s.tag || "").split(/\s+/).pop() || "—";
export const isBoar = (s) => s.type === "boar";
export const onFarm = (s) => !s.cull?.date && !s.died && !s.deleted;
export function sowMatches(s, q) { q = String(q || "").trim().toLowerCase(); if (!q) return true; return String(s.sowNo || "").toLowerCase().startsWith(q) || String(s.tag || "").replace(/\s+/g, "").toLowerCase().includes(q.replace(/\s+/g, "")); }
export const sortByNo = (a, b) => String(a.sowNo || "").localeCompare(String(b.sowNo || ""), "en", { numeric: true });

/** The sow's current cycle and every date in it. */
export function cycleOf(s, ix, sow, today) {
  const litters = listOf(ix.litters, sow); const last = litters[litters.length - 1] || null;
  const after = last ? last.farrowedAt : "";
  const all = listOf(ix.services, sow).filter((x) => x.date > after);
  const services = all.filter((x) => !x.returned); // a return to heat closes the earlier services
  const returnedAt = all.filter((x) => x.returned).map((x) => x.returnedOn || x.date).sort().pop() || null;
  const first = services[0] || null;
  const scans = first ? listOf(ix.scans, sow).filter((x) => x.date >= first.date) : [];
  const scan = scans[scans.length - 1] || null;
  const dates = first ? batchDates(first.date, s) : null;
  const weaned = last?.weaned?.date || null;
  const parity = litters.length + (first && scan?.result !== "-" ? 1 : 0);
  const inCrate = sow.location?.roomId && ix.rooms.get(sow.location.roomId)?.kind === "farrowing" && (!first || (sow.location.since || "") >= first.date) ? sow.location : null;
  let status;
  if (!onFarm(sow)) status = "gone";
  else if (sow.type === "boar") status = "boar";
  else if (first && scan?.result === "-") status = "empty";
  else if (first && inCrate) status = "farrowing";
  else if (first && scan?.result === "+") status = "inpig";
  else if (first) status = "served";
  else if (returnedAt && returnedAt >= (weaned || "")) status = "empty";
  else if (last && !weaned) status = "suckling";
  else if (last) status = "weaned";
  else status = "gilt";
  const days = first ? daysBetween(first.date, today) : null;
  return { returnedAt, today, weanedDays: weaned ? daysBetween(weaned, today) : null, litters, last, services, first, scan, dates, weaned, parity, status, days, inCrate, batchId: first?.batchId || (status === "suckling" ? last?.batchId : null) || null };
}

export const STATUS_WORD = { served: "Served", inpig: "In pig", farrowing: "In farrowing", suckling: "Suckling", weaned: "Weaned", empty: "Empty", gilt: "Gilt", boar: "Boar", gone: "Gone" };
/** Filter chips on the sow list (design/13 §4.1). */
export function inFilter(c, sow, f) {
  if (f === "all") return true;
  if (f === "cull") return !!sow.cull?.planned;
  if (f === "gilts") return sow.type === "gilt" && !c.litters.length;
  if (f === "empty") return c.status === "weaned" || c.status === "empty";
  return { served: ["served"], inpig: ["inpig"], farrowing: ["farrowing"], suckling: ["suckling"] }[f]?.includes(c.status) || false;
}

/**
 * The one pill for a sow (design/13 §4.1): Return? (late) → Due this week (due) → Overdue ≥117 d (late)
 * → Not served 7 d after weaning (due) → Cull (info). Returns [level, text] or null.
 */
export function sowPill(s, c, sow, today, weekEnd) {
  if (c.status === "served" && c.days >= s.returnFrom && c.days <= s.returnTo) return ["late", "Return?"];
  if (c.dates && ["inpig", "served", "farrowing"].includes(c.status)) {
    if (c.days >= 117) return ["late", `Overdue ${c.days} d`];
    if (c.dates.due >= today && c.dates.due <= weekEnd) return ["due", `Due ${dayName(c.dates.due)}`];
  }
  if (c.status === "weaned" && daysBetween(c.weaned, today) > 7) return ["due", "Serve"];
  if (sow.cull?.planned) return ["info", "Cull"];
  if (c.status === "suckling") return ["neutral", "Suckling"];
  return null;
}
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const dayName = (iso) => DOW[new Date(iso + "T12:00:00Z").getUTCDay()];

/** Line under the sow number (design/13 §4.1). */
export function sowLine(c, ix, batchNoOf) {
  const b = c.batchId ? batchNoOf(c.batchId) : "";
  const room = c.inCrate ? `${ix.rooms.get(c.inCrate.roomId)?.name || "Farrowing"}${c.inCrate.crate ? " C" + c.inCrate.crate : ""}` : "";
  const bits = [b];
  if (c.status === "served") bits.push(`served ${c.days} d ago`);
  else if (c.status === "inpig" || c.status === "farrowing") bits.push(`in pig ${c.days} d`, room);
  else if (c.status === "suckling") bits.push(`suckling ${daysBetween(c.last.farrowedAt, c.today)} d`, room || (c.last.roomId ? `${ix.rooms.get(c.last.roomId)?.name || ""}${c.last.crate ? " C" + c.last.crate : ""}` : ""));
  else if (c.status === "weaned") bits.push(`weaned ${c.weanedDays} d ago`);
  else if (c.status === "empty") bits.push(c.returnedAt ? `returned ${daysBetween(c.returnedAt, c.today)} d ago · to serve` : "scanned empty · to serve");
  return bits.filter(Boolean).join(" · ");
}

/** Lifetime totals across litters. */
export function lifetime(litters) {
  let ba = 0, weaned = 0;
  for (const l of litters) { ba += +l.bornAlive || 0; weaned += +l.weaned?.n || 0; }
  return { bornAlive: ba, weaned, litters: litters.length };
}

/** Moving into the crate more than 7 days before due breaks Red Tractor HF.9.2.a. */
export function crateEntryCheck(moveDate, dueDate) {
  const early = daysBetween(moveDate, dueDate);
  return early > 7 ? { ok: false, days: early, text: `went into the crate ${early} days before she's due — Red Tractor allows 7` } : { ok: true, days: early };
}

/** Sows to serve this week: weaned 3+ days, returns, empty scans, gilts flagged in heat. */
export function toServe(s, ix, sows, today) {
  const out = [];
  for (const sow of sows) {
    if (!onFarm(sow) || sow.type === "boar") continue;
    const c = cycleOf(s, ix, sow, today);
    if (c.status === "weaned" && daysBetween(c.weaned, today) >= 3) out.push({ sow, c, why: "weaned" });
    else if (c.status === "empty") out.push({ sow, c, why: c.returnedAt ? "return" : "empty scan" });
    else if (c.status === "gilt" && sow.type === "gilt" && sow.inHeat && sow.inHeat >= addDays(today, -3)) out.push({ sow, c, why: "gilt" });
  }
  return out;
}
