// Pigs alerts (design/13 §11). Late legal alerts first, then scheme, then the rest.
// ASF and notifiable disease are never auto-generated: More → "Report a disease suspicion".
import { addDays, daysBetween } from "./dates.js";
import { roomFacts, binFacts, pct } from "./facts.js";
import { cycles, breedingTiles } from "./week.js";
import { notifyState, qvrState, embDue, inventoryDue, checkState } from "./paperwork.js";
import { houses, alarmState, tailBiteRepeat } from "./rooms.js";
import { crateEntryCheck, dayName } from "./sows.js";
import { plan } from "./weeks.js";

const live = (a) => (a || []).filter((r) => !r.deleted);
const L = (c, h) => `#/l/${c.lid}/${h}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dm = (iso) => `${+iso.slice(8)} ${MON[+iso.slice(5, 7) - 1]}`;
const RANK = { late: 0, due: 1, info: 2 };

export function pigAlerts(c) {
  const a = []; const T = c.today; const rf = roomFacts(c);
  for (const h of houses(c.data.rooms.filter((r) => r.mechVent !== false && !r.deleted))) {
    const s = alarmState(live(c.data.alarmTests), h, T);
    if (s.level === "late") a.push({ level: "late", legal: true, title: `Alarm test overdue — ${h}`, body: s.last ? `Last tested ${dayName(s.last.date)} ${dm(s.last.date)}, ${s.days} days ago. The law asks for every 7 days.` : "No test recorded. The law asks for every 7 days.", href: L(c, `alarm/${encodeURIComponent(h)}`), action: "Test" });
    else if (s.failed) a.push({ level: "late", legal: true, title: `Alarm didn't sound — ${h}`, body: `Last test ${dm(s.last.date)}: ${s.last.action || "fix it and test again"}.`, href: L(c, `alarm/${encodeURIComponent(h)}`), action: "Test again" });
  }
  const [hh, mm] = String(c.s.checkBy || "12:00").split(":").map(Number);
  const nowMin = c.now ? +c.now.slice(11, 13) * 60 + +c.now.slice(14, 16) : 0;
  const unchecked = rf.filter((x) => (x.pigs > 0 || x.batch) && !x.check);
  if (unchecked.length && nowMin >= hh * 60 + mm) a.push({ level: "due", legal: true, title: `${unchecked.length} room${unchecked.length > 1 ? "s" : ""} not checked yet today`, body: unchecked.slice(0, 4).map((x) => x.room.name).join(", "), href: L(c, "rooms"), action: "Check" });
  for (const m of live(c.data.moves)) { const n = notifyState(m, T); if (n.level === "late" || n.level === "due") a.push({ level: n.level, legal: true, title: `Notify the move of ${m.n} ${m.category || "pigs"} by ${dm(n.by)}`, body: "Moves off are notified on NIFAIS within 7 days.", href: L(c, "reg/pm1") }); }
  for (const s of live(c.data.sows)) if (s.lostTag && !s.lostTag.replaced && daysBetween(s.lostTag.date, T) <= 28) a.push({ level: "due", legal: true, title: `Replace the mark on sow ${s.sowNo} within 28 days`, body: `Lost ${dm(s.lostTag.date)} — by ${dm(addDays(s.lostTag.date, 28))}.`, href: L(c, `sow/${s.id}`) });
  if (c.s.breeding) {
    for (const { sow, c: x } of cycles(c)) if (x.inCrate && x.dates && x.inCrate.since) { const chk = crateEntryCheck(x.inCrate.since, x.dates.due); if (!chk.ok) a.push({ level: "due", title: `Sow ${sow.sowNo} ${chk.text}`, body: "Red Tractor HF.9.2.a.", href: L(c, `sow/${sow.id}`) }); }
    for (const { sow, c: x } of cycles(c)) if (x.status === "weaned" && daysBetween(x.weaned, T) > 7) a.push({ level: "due", title: `${sow.sowNo} not served ${daysBetween(x.weaned, T)} days after weaning`, body: "Check for heat or plan to cull.", href: L(c, `sow/${sow.id}`) });
    const tiles = breedingTiles(c);
    if (tiles.served < tiles.target && tiles.served > 0) a.push({ level: "info", title: `${tiles.target - tiles.served} short of the service target`, body: `This week's batch may fill ${Math.round(tiles.served * c.s.targets.farrowRate / 100)} of ${c.s.farrowingPlaces} crates. Bring in gilts?`, href: L(c, "service") });
    const p = plan({ fromIso: T, weeks: 20, s: c.s, anchorIdx: c.anchorIdx, nextNo: c.nextNo, known: c.knownBatches }).rows.find((r) => r.over);
    if (p) a.push({ level: "info", title: `Week ${p.week}: ${p.due} sows due, ${c.s.farrowingPlaces} crates`, body: "Too many sows for the farrowing places — see the batch planner.", href: L(c, "tools/planner") });
  }
  for (const x of rf) {
    if (x.wAlert) a.push({ level: "due", title: `${x.room.name} water down ${Math.abs(Math.round(x.wc.change * 100))}% on yesterday — check drinkers and pigs`, href: L(c, `room/${x.room.id}`) });
    if (x.pwm != null && x.pwm * 100 > c.s.targets.pwm && x.litters.length) a.push({ level: "info", title: `${x.room.name} mortality ${pct(x.pwm, 0)} — above your ${c.s.targets.pwm}% target`, href: L(c, `room/${x.room.id}`) });
    if (tailBiteRepeat(live(c.data.tailBites), x.room.id, T)) a.push({ level: "info", title: `Tail biting twice in ${x.room.name} this week — look at your tail-biting action plan`, href: L(c, "plans") });
    if (x.space?.level === "late") a.push({ level: "late", legal: true, title: `${x.room.name} is over the legal space by ${x.f.onFarm - x.space.allowed} pigs`, body: `At ${Math.round(x.f.est)} kg each pig needs the Schedule 8 minimum floor area.`, href: L(c, "tools/space") });
  }
  for (const b of live(c.data.batches)) { const f = c.bf?.get(b.id); if (f?.withdrawalEnd && f.withdrawalEnd > T && live(c.data.tasks).some((t) => t.pig?.kind === "ship" && !t.done && t.pig.batchId === b.id && t.due < f.withdrawalEnd)) a.push({ level: "late", legal: true, title: `B${b.no} can't go for slaughter before ${dayName(f.withdrawalEnd)} ${dm(f.withdrawalEnd)} — withdrawal`, href: L(c, `batch/${b.id}`) }); }
  const q = qvrState(live(c.data.vetVisits), T); if (q.last && q.level !== "ok") a.push({ level: q.level, title: `Book your quarterly vet visit — ${q.weeks} weeks since the last`, body: `20-week limit: by ${dm(q.nextBy)}.`, href: L(c, "qvr") });
  const e = embDue(T, live(c.data.embUploads)); if (!e.done && (e.level === "due" || e.level === "late")) a.push({ level: e.level, title: `Upload ${e.label.split(" ")[0]} antibiotic use to eMB-Pigs by ${dm(e.due)}`, href: L(c, "emb") });
  for (const b of binFacts(c).filter((y) => y.level === "due")) a.push({ level: "due", title: `Order feed: ${b.bin.name} empty in ~${Math.max(0, Math.floor(b.daysLeft))} days`, href: L(c, "tools/bins") });
  for (const k of ["vermin", "water"]) { const st = checkState(live(c.data.siteChecks), k, T); if (st.level === "late" && !(k === "water" && c.s.mainsWater)) a.push({ level: "due", title: k === "vermin" ? "Quarterly vermin survey overdue" : "Yearly water test overdue", href: L(c, `reg/${k}`) }); }
  const inv = inventoryDue(T); if (inv.level === "due" && T >= addDays(inv.date, -7) && !live(c.data.inventories).some((x) => x.date === inv.date)) a.push({ level: "due", legal: true, title: `Count your pigs on 1 June for the DAERA inventory`, href: L(c, "inventory") });
  return a.sort((x, y) => RANK[x.level] - RANK[y.level] || (y.legal ? 1 : 0) - (x.legal ? 1 : 0));
}
