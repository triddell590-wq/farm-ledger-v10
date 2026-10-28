// "To do today" for Pigs (design/13 §3.4). Each job: { key, title, sub, due, href, legal }.
// `key` is stable so ticking it (a task with sourceRef = key) hides it until it comes round again.
import { addDays, daysBetween } from "./dates.js";
import { cycles, breedingTiles } from "./week.js";
import { roomFacts, binFacts } from "./facts.js";
import { batchName } from "./batches.js";
import { notifyState, qvrState, embDue, inventoryDue, checkState } from "./paperwork.js";
import { houses, alarmState } from "./rooms.js";
import { aliveNow } from "./litters.js";
import { dayName } from "./sows.js";
import { weekNo } from "./weeks.js";

const live = (a) => (a || []).filter((r) => !r.deleted);
const L = (c, h) => `#/l/${c.lid}/${h}`;
const dm = (iso) => `${dayName(iso)} ${+iso.slice(8)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+iso.slice(5, 7) - 1]}`;

export function todayTasks(c) {
  const t = []; const T = c.today; const add = (o) => { if (!c.doneKeys.has(o.key)) t.push({ due: T, ...o }); };
  const rf = roomFacts(c); const occupied = rf.filter((x) => x.pigs > 0 || x.batch);
  // room checks — the law asks for one inspection a day
  if (occupied.length) { const done = occupied.filter((x) => x.check).length; if (done < occupied.length) add({ key: `checks:${T}`, title: `Room checks — ${done} of ${occupied.length} done`, sub: "Daily · the law asks for once a day", href: L(c, "rooms"), legal: true, auto: true }); }
  // alarm tests per house
  for (const h of houses(c.data.rooms.filter((r) => r.mechVent !== false && !r.deleted))) { const a = alarmState(live(c.data.alarmTests), h, T); if (a.level !== "ok") add({ key: `alarm:${h}:${a.next}`, title: `Test the ventilation alarm — ${h}`, sub: a.last ? `Last tested ${dm(a.last.date)} · every 7 days` : "Never tested · every 7 days", href: L(c, `alarm/${encodeURIComponent(h)}`), legal: true, due: a.next }); }
  if (c.s.breeding) {
    const cy = cycles(c);
    // move to farrowing (batch), farrowing checks, piglet tasks, weaning, service, returns, scans
    const moveBy = new Map();
    for (const { sow, c: x } of cy) if (x.dates && ["served", "inpig"].includes(x.status) && x.dates.move <= addDays(T, 1) && x.dates.due >= T) { const k = x.first.batchId || "?"; moveBy.set(k, [...(moveBy.get(k) || []), { sow, x }]); }
    for (const [bid, list] of moveBy) { const due = list.map((y) => y.x.dates.due).sort()[0]; add({ key: `move:${bid}:${due}`, title: c.s.smallHerd ? `Move ${list.map((y) => y.sow.name || y.sow.sowNo).join(", ")} into the farrowing pen (due ${dayName(due)})` : `Move ${list.length} sow${list.length > 1 ? "s" : ""} to farrowing (${batchName(c.ix.batches.get(bid))} due ${dayName(due)})`, sub: c.s.smallHerd ? "No more than 7 days before she's due · straw for nesting 24 h before" : "No more than 7 days before farrowing · nesting material 24 h before", href: L(c, "move-farrowing"), due: list[0].x.dates.move }); }
    const dueToday = cy.filter((y) => y.c.dates && ["served", "inpig", "farrowing"].includes(y.c.status) && y.c.dates.due <= T);
    if (dueToday.length) add({ key: `farrow:${T}`, title: `Farrowing: check ${dueToday.length} sow${dueToday.length > 1 ? "s" : ""} due today or over`, sub: dueToday.slice(0, 5).map((y) => y.sow.sowNo).join(", "), href: L(c, "rooms") });
    const newLitters = live(c.data.litters).filter((l) => !l.weaned && !l.tasks?.iron && daysBetween(l.farrowedAt, T) >= c.s.ironDays[0] && daysBetween(l.farrowedAt, T) <= c.s.ironDays[1] + 2);
    if (newLitters.length) add({ key: `iron:${T}`, title: `Iron + tooth check: ${newLitters.length} litter${newLitters.length > 1 ? "s" : ""}`, sub: "Teeth only where you see injuries", href: L(c, "rooms") });
    const tiles = breedingTiles(c);
    const weanNow = live(c.data.litters).filter((l) => !l.weaned && daysBetween(l.farrowedAt, T) >= c.s.lactation);
    if (weanNow.length) { const r = c.ix.rooms.get(weanNow[0].roomId); add({ key: `wean:${T}`, title: `Wean ${batchName(c.ix.batches.get(weanNow[0].batchId))} — ${weanNow.length} sow${weanNow.length > 1 ? "s" : ""}${r ? ", " + r.name : ""}`, sub: `${weanNow.reduce((s, l) => s + aliveNow(l), 0)} piglets · ${c.s.lactation} days`, href: L(c, `room/${weanNow[0].roomId}`) }); }
    if (tiles.stillToServe.length && tiles.served < tiles.target) add({ key: `serve:${weekNo(T)}:${T}`, title: tiles.serveWeek ? `Serve this week — ${Math.max(0, tiles.target - tiles.served)} left to reach ${tiles.target}` : `Serve ${tiles.stillToServe.length} waiting (gilts in heat, returns, empties)`, sub: tiles.stillToServe.slice(0, 5).map((x) => x.sow.sowNo).join(", "), href: L(c, "service") });
    const ret = cy.filter((y) => y.c.status === "served" && y.c.days >= c.s.returnFrom && y.c.days <= c.s.returnTo);
    if (ret.length) add({ key: `returns:${T}`, title: `Watch for returns: ${ret.length} sow${ret.length > 1 ? "s" : ""} served ${c.s.returnFrom}–${c.s.returnTo} days ago`, sub: ret.slice(0, 6).map((y) => y.sow.sowNo).join(", "), href: L(c, "sows") });
    const scan = cy.filter((y) => y.c.status === "served" && y.c.days >= c.s.scanFrom && y.c.days <= c.s.scanTo);
    if (scan.length) add({ key: `scan:${weekNo(T)}`, title: `Scan ${scan.length} sow${scan.length > 1 ? "s" : ""} (served ${c.s.scanFrom}–${c.s.scanTo} days ago)`, sub: scan.slice(0, 6).map((y) => y.sow.sowNo).join(", "), href: L(c, "sows") });
  }
  // water drop
  for (const x of rf.filter((y) => y.wAlert)) add({ key: `water:${x.room.id}:${T}`, title: `${x.room.name} water down ${Math.abs(Math.round(x.wc.change * 100))}% on yesterday — check drinkers and pigs`, href: L(c, `room/${x.room.id}`) });
  // feed bins
  for (const b of binFacts(c).filter((y) => y.level === "due")) add({ key: `bin:${b.bin.id}:${b.emptyOn}`, title: `Order feed: ${b.bin.name} empty in ~${Math.max(0, Math.floor(b.daysLeft))} days`, sub: `Lead time ${+b.bin.leadDays || c.s.leadDays} days`, href: L(c, "tools/bins") });
  // wash stages
  for (const x of rf.filter((y) => !y.wash.inUse && !y.wash.ready && y.wash.stage !== "emptied" && !y.pigs)) add({ key: `wash:${x.room.id}:${x.wash.stage}`, title: `${x.room.name}: ${x.wash.stage} — ${x.wash.next} next`, href: L(c, `room/${x.room.id}`) });
  // ship loads are stored tasks (actions.planLoad) with the feed-withdrawal time in the title
  // medicine courses
  for (const m of live(c.data.medicines).filter((x) => x.batchId && +x.days > 1 && x.date <= T && addDays(x.date, +x.days - 1) >= T)) add({ key: `course:${m.id}:${T}`, title: `${batchName(c.ix.batches.get(m.batchId))} ${m.route === "In water" ? "in-water" : m.route === "In feed" ? "in-feed" : ""} ${m.productName}: day ${daysBetween(m.date, T) + 1} of ${m.days}`.replace(/\s+/g, " ") });
  // movement notifications
  for (const m of live(c.data.moves)) { const n = notifyState(m, T); if (n.by && n.level !== "info") add({ key: `notify:${m.id}`, title: `Notify movement of ${m.n} ${m.category || "pigs"} (by ${dm(n.by)})`, sub: "On NIFAIS within 7 days", href: L(c, "reg/pm1"), legal: true, due: n.by, action: { type: "notify", id: m.id } }); }
  // QVR, eMB, vermin, water, inventory
  const q = qvrState(live(c.data.vetVisits), T); if (q.level !== "ok") add({ key: `qvr:${q.last?.id || "none"}`, title: q.last ? `Book your quarterly vet visit — ${q.weeks} weeks since the last` : "Record your last quarterly vet visit", sub: q.last ? `20-week limit: by ${dm(q.nextBy)}` : "", href: L(c, "qvr") });
  const e = embDue(T, live(c.data.embUploads)); if (!e.done && e.level !== "info" && e.level !== "ok") add({ key: `emb:${e.label}`, title: `Upload ${e.label.split(" ")[0]} antibiotic use to eMB-Pigs by ${dm(e.due)}`, href: L(c, "emb"), action: { type: "emb", quarter: e.label } });
  for (const k of ["vermin", "water"]) { const st = checkState(live(c.data.siteChecks), k, T); if (st.level !== "ok" && !(k === "water" && c.s.mainsWater)) add({ key: `chk:${k}:${st.due}`, title: k === "vermin" ? "Quarterly vermin survey due" : "Yearly water test due (non-mains supply)", href: L(c, `reg/${k}`) }); }
  const inv = inventoryDue(T); if (inv.level === "due" && !live(c.data.inventories).some((x) => x.date === inv.date)) add({ key: `inv:${inv.date}`, title: `Pig inventory: count on ${dm(inv.date)}`, sub: "DAERA / NISRA survey · one return per herd", href: L(c, "inventory"), legal: true });
  return t;
}
