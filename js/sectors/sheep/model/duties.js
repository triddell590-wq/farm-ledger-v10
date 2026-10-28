// What needs doing: Sheep alerts (design/11 §11) and the generated To-do list (§3.7). Nothing
// here is stored; ticking a job either does its record action or saves a done task with the
// job's key as sourceRef (same pattern as every ledger).
import { addDays, daysBetween } from "../../../core/dates.js";
import { activeMobs, countsAt } from "./mobs.js";
import { raddleCycles } from "./year.js";
import { mobWithdrawal, drenchChecksDue, lastLame, repeatLame, fecVerdict, fecReduction, preDoseFec, doses } from "./health.js";
import { pensInUse, abortionPct, scanTotals, barrenPct, cropLambings } from "./lambing.js";
import { cropTagging, retagsDue, importRetags, quarantines, toNotify, cprListsDue, restriction, inventoryWindow } from "./paperwork.js";
import { ewesToRam, ramSummary } from "./mobs.js";
import { regionRule } from "./region.js";
import { seasonalFor, DISEASE_BANNER } from "./content.js";

const ORDER = { late: 0, due: 1, info: 2 };
const short = (iso) => { const d = new Date(iso + "T12:00:00"); return `${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}`; };
const dowShort = (iso) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(iso + "T12:00:00").getDay()] + " " + short(iso);

/** Alerts. c = { data, s, today, now, lid, cy, stage, store } */
export function sheepAlerts(c, { money = false } = {}) {
  const { data, s, today, lid, cy, stage } = c; const A = (h) => `#/l/${lid}/${h}`; const out = [];
  const r = restriction(data);
  if (r) out.push({ level: "late", key: "restricted", title: `Flock restricted (${r.disease}) since ${short(r.date)}`, body: "Moves are stopped until your vet confirms in writing.", href: A("paperwork/disease"), action: "Add vet's letter", legal: true });
  for (const mob of activeMobs(data)) {
    const w = mobWithdrawal(data, mob.id, today);
    if (w) out.push({ level: "late", key: `wd:${mob.id}`, title: `${mob.name} under withdrawal`, body: `Don't sell for meat until ${short(w.until)}.`, href: A(`mob/${mob.id}`), action: "See mob", legal: true });
  }
  const tg = cropTagging(data, cy, s);
  if (tg.untagged && tg.tagBy) {
    const left = daysBetween(today, tg.tagBy);
    if (left < 0) out.push({ level: "late", key: "tagby", title: `${tg.untagged} lambs are past their tag-by date`, body: "Tag them now.", href: A("paperwork/tagging"), action: "Tagging board", legal: true });
    else if (left <= 30) out.push({ level: "due", key: "tagby", title: `Tag ${tg.untagged} lambs by ${short(tg.tagBy)}`, body: "Before they leave the farm, too.", href: A("paperwork/tagging"), action: "Tagging board", legal: true });
  }
  for (const { mv, due } of toNotify(data)) {
    const d = daysBetween(mv.date, today); if (d < 5) continue;
    out.push({ level: today > due ? "late" : "due", key: `notify:${mv.id}`, title: `Notify NIFAIS: ${mv.count} ${mv.kind === "off" ? "to" : "from"} ${mv.otherName || mv.otherFlock || "?"}`, body: today > due ? `Was due by ${short(due)}.` : `Due by ${short(due)}.`, href: A(`movement/${mv.id}`), action: "Open document", legal: true });
  }
  for (const { mv, due } of cprListsDue(data)) {
    const h = daysBetween(mv.date, today); if (h < 1) continue;
    out.push({ level: today >= due ? "late" : "due", key: `cpr:${mv.id}`, title: `Photo the ${mv.dest === "abattoir" ? "abattoir's" : "market's"} tag list for ${dowShort(mv.date)}'s move`, body: "Keep it with the movement document.", href: A(`movement/${mv.id}`), legal: true });
  }
  for (const { ev, due } of retagsDue(data)) {
    const d = daysBetween(ev.date, today); if (d < 21) continue;
    out.push({ level: today > due ? "late" : "due", key: `retag:${ev.id}`, title: `Fit replacement tag for ${ev.tag || "a sheep"}`, body: `By ${short(due)}.`, href: A("paperwork/tagging"), legal: true });
  }
  for (const { mv, due } of importRetags(data)) {
    const d = daysBetween(mv.date, today); if (d < 14) continue;
    out.push({ level: today > due ? "late" : "due", key: `gb:${mv.id}`, title: `Re-tag ${mv.count} sheep from GB by ${short(due)}`, body: "NI tags within 20 days of arrival.", href: A("paperwork/tagging"), legal: true });
  }
  const inv = inventoryWindow(today, s); const invDone = (data.inventories || []).some((i) => !i.deleted && +i.year === inv.year && i.submittedOn);
  if (!invDone) {
    if (today >= inv.infoFrom && today < inv.from) out.push({ level: "info", key: "inv", title: "Sheep inventory", body: "Count the flock between 1 and 5 December.", href: A("paperwork/inventory"), legal: true });
    else if (today >= inv.from && today <= inv.to) out.push({ level: "due", key: "inv", title: "Count the flock between 1 and 5 December", body: "Then send your inventory to DAERA.", href: A("paperwork/inventory"), action: "Start the count", legal: true });
    else if (inv.deadline && today > inv.to && today <= inv.deadline) out.push({ level: "due", key: "inv", title: `Send your inventory to DAERA by ${short(inv.deadline)}`, body: "Record the date you sent it.", href: A("paperwork/inventory"), legal: true });
    else if (inv.deadline && today > inv.deadline && daysBetween(inv.deadline, today) < 120) out.push({ level: "late", key: "inv", title: "Sheep inventory is late", body: `It was due by ${short(inv.deadline)}.`, href: A("paperwork/inventory"), legal: true });
  }
  for (const d of data.deaths || []) if (!d.deleted && d.over18m && !d.tseDone && daysBetween(d.date, today) <= 3) out.push({ level: "late", key: `tse:${d.id}`, title: "Phone the TSE sampling site within 24 hours", body: `${d.mobName || "Sheep"} died ${short(d.date)} (over 18 months).`, href: A("paperwork/deaths"), legal: true });
  // tupping: first cycle marks
  if (stage.stage === "tupping" || stage.stage === "scanning") {
    const day = daysBetween(cy.ramsIn, today) + 1; const ewes = ewesToRam(data, cy);
    if (day >= 17 && day <= 34 && ewes) {
      const rc = raddleCycles(cy, s, today); const first = rc.cycles[0]?.colour;
      const marked = (data.events || []).filter((e) => !e.deleted && e.kind === "raddle" && e.date >= cy.ramsIn && e.counts?.colour === first).reduce((n, e) => n + (+e.counts?.newlyMarked || 0), 0);
      const pct = Math.round((marked / ewes) * 100);
      if (pct < (+s.firstCycleAlert || 60)) out.push({ level: "due", key: "firstcycle", title: `Only ${pct}% of ewes marked in the first cycle`, body: "Check the rams.", href: A("year/tupping"), action: "See rams" });
    }
  }
  const sc = scanTotals(data, cy);
  if (sc.scanned && today <= cy.lambTo) { const b = barrenPct(sc.empty, sc.scanned); if (b > (+s.barrenTarget || 4)) out.push({ level: "info", key: "barren", title: `Barren ewes ${b}%`, body: `Target under ${s.barrenTarget || 4}%.`, href: A("year/scanning") }); }
  const ab = abortionPct(data, cy);
  if (ab.n && ab.pct >= (+s.abortionTrigger || 2)) out.push({ level: "late", key: "abort", title: "Abortions are over 2% of ewes", body: "Call your vet — samples can find the cause.", href: A("year/lambing") });
  for (const mob of activeMobs(data)) {
    const l = lastLame(data, mob.id);
    if (l && daysBetween(l.date, today) <= 30 && l.pct > (+s.lameTarget || 2)) out.push({ level: "due", key: `lame:${mob.id}`, title: `${mob.name}: ${l.pct}% lame`, body: "Five-point plan: treat, cull repeat cases, footbath.", href: A(`mob/${mob.id}`) });
    const fec = (data.events || []).filter((e) => !e.deleted && e.kind === "fec" && e.mobId === mob.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (fec && daysBetween(fec.date, today) <= 21) {
      const dosedSince = doses(data, mob.id).some((m) => m.date >= fec.date && m.wormerGroup);
      const v = fecVerdict(fec.counts?.strongyle, s.fecThreshold);
      if (v?.dose && !dosedSince) out.push({ level: "due", key: `fec:${fec.id}`, title: `${mob.name}: worm egg count ${fec.counts.strongyle} epg`, body: `Above your ${s.fecThreshold} epg threshold — dose needed.`, href: A(`mob/${mob.id}`) });
      if (fec.postDoseOf) { const dose = (data.medicines || []).find((m) => m.id === fec.postDoseOf); const pre = dose && preDoseFec(data, dose); const red = pre && fecReduction(+pre.counts?.strongyle, +fec.counts?.strongyle); if (red && !red.ok) out.push({ level: "info", key: `fecr:${fec.id}`, title: `Wormer may not be working (reduction ${red.pct}%)`, body: "Talk to your vet about resistance.", href: A(`mob/${mob.id}`) }); }
    }
  }
  for (const rl of repeatLame(data, today)) out.push({ level: "info", key: `rl:${rl.tag}`, title: `${rl.tag} lame twice this season`, body: "Added to the cull list.", href: A("year/weaning") });
  for (const p of c.store || []) if (p.expiry && daysBetween(today, p.expiry) <= 30) out.push({ level: "info", key: `exp:${p.id}`, title: `${p.name} ${daysBetween(today, p.expiry) < 0 ? "has expired" : "expires " + short(p.expiry)}`, body: "Medicine store (shared with the farm).", href: "#/farm/medicines" });
  for (const x of seasonalFor(today)) out.push({ level: "info", key: `season:${x.key}`, title: x.title, body: `${x.text} (Updated ${short(x.updated)})`, href: A("worms") });
  out.push({ level: "info", key: "disease", title: DISEASE_BANNER.title, body: `${DISEASE_BANNER.text} (Updated ${short(DISEASE_BANNER.updated)})`, banner: true });
  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

/** Generated jobs: { key, title, show, due, href?, action?, legal? }. */
export function generatedTasks(c) {
  const { data, s, today, now, lid, cy } = c; const A = (h) => `#/l/${lid}/${h}`; const out = [];
  const rc = raddleCycles(cy, s, today);
  for (const cyc of rc.cycles.slice(1)) out.push({ key: `raddle:${cyc.from}`, title: `Change raddle: ${rc.cycles[cyc.i - 1].colour} → ${cyc.colour}`, show: addDays(cyc.from, -1), due: cyc.from, href: A("year/tupping") });
  if (!cy.ramsOutActual) out.push({ key: `ramsout:${cy.ramsOut}`, title: `Take rams out (planned ${short(cy.ramsOut)})`, show: addDays(cy.ramsOut, -2), due: cy.ramsOut, href: A("year/tupping"), action: { type: "ramsOut" } });
  if (s.scanDate && s.scanDate >= cy.ramsIn) out.push({ key: `scanbook:${s.scanDate}`, title: `Scanning ${dowShort(s.scanDate)} — bring ewes in the night before`, show: addDays(s.scanDate, -2), due: addDays(s.scanDate, -1), href: A("year/scanning") });
  const vacFrom = addDays(cy.lambFrom, -42);
  const vaccinated = (data.medicines || []).some((m) => !m.deleted && m.reason === "Vaccine" && m.date >= addDays(cy.lambFrom, -56) && m.date <= cy.lambFrom);
  if (!vaccinated) out.push({ key: `clostridial:${cy.crop}`, title: "Clostridial booster: in-lamb ewes (4–6 weeks before lambing)", show: addDays(vacFrom, -7), due: vacFrom, href: A("year/lambing") });
  for (const { mv, due } of toNotify(data)) out.push({ key: `notify:${mv.id}`, title: `Notify movement: ${mv.count} ${mv.kind === "off" ? "to" : "from"} ${mv.otherName || mv.otherFlock || "?"}`, show: mv.date, due, href: A(`movement/${mv.id}`), action: { type: "set", coll: "movements", id: mv.id, field: "notifiedOn" }, legal: true });
  for (const { mv, due } of cprListsDue(data)) out.push({ key: `cpr:${mv.id}`, title: `Photo the tag list for the ${short(mv.date)} move`, show: mv.date, due, href: A(`movement/${mv.id}`), action: { type: "set", coll: "movements", id: mv.id, field: "cprListFiledOn" }, legal: true });
  const tg = cropTagging(data, cy, s);
  if (tg.untagged && tg.tagBy) out.push({ key: `tag:${cy.crop}`, title: `Tag ${tg.untagged} lambs born from ${short(tg.earliest)} (tag by ${short(tg.tagBy)})`, show: addDays(tg.tagBy, -30), due: tg.tagBy, href: A("paperwork/tagging"), legal: true });
  for (const { ev, due } of retagsDue(data)) out.push({ key: `retag:${ev.id}`, title: `Fit replacement tag for ${ev.tag || "a sheep"}`, show: ev.date, due, href: A("paperwork/tagging"), action: { type: "set", coll: "events", id: ev.id, field: "fittedOn" }, legal: true });
  for (const { mv, due } of importRetags(data)) out.push({ key: `gb:${mv.id}`, title: `Re-tag ${mv.count} sheep from GB (by ${short(due)})`, show: mv.date, due, href: A("paperwork/tagging"), action: { type: "set", coll: "movements", id: mv.id, field: "retaggedOn" }, legal: true });
  for (const q of quarantines(data, s, today)) {
    if (!q.active && q.until < addDays(today, -1)) continue;
    const who = q.mv.mobName || q.mv.description || "bought-in sheep";
    out.push({ key: `qend:${q.mv.id}`, title: `Quarantine ends: ${who}, ${+q.mv.quarantineDays || +s.quarantineDays || 28} days`, show: q.until, due: q.until, href: A(`mob/${q.mv.mobId}`), action: { type: "set", coll: "movements", id: q.mv.id, field: "quarantineEnded" } });
    out.push({ key: `qdose:${q.mv.id}`, title: `Quarantine dose: ${who} (wormer, two groups)`, show: q.mv.date, due: addDays(q.mv.date, 1), href: A(`mob/${q.mv.mobId}`) });
    out.push({ key: `qscab:${q.mv.id}`, title: `Scab treatment or blood test: ${who}`, show: q.mv.date, due: addDays(q.mv.date, 3), href: A(`mob/${q.mv.mobId}`) });
    out.push({ key: `qfoot:${q.mv.id}`, title: `Footbath: ${who}`, show: q.mv.date, due: addDays(q.mv.date, 2), href: A(`mob/${q.mv.mobId}`) });
  }
  const mobs = new Map((data.mobs || []).map((m) => [m.id, m]));
  for (const { dose, due } of drenchChecksDue(data, s, today)) out.push({ key: `drench:${dose.id}`, title: `Drench check: ${mobs.get(dose.mobId)?.name || "mob"} — FEC 7–14 days after dose`, show: due, due, href: A(`mob/${dose.mobId}`) });
  const inv = inventoryWindow(today, s); const invRec = (data.inventories || []).find((i) => !i.deleted && +i.year === inv.year);
  if (!invRec?.countDate) out.push({ key: `invcount:${inv.year}`, title: "Count the flock between 1 and 5 December", show: inv.from, due: inv.to, href: A("paperwork/inventory"), legal: true });
  if (inv.deadline && !invRec?.submittedOn) out.push({ key: `invsend:${inv.year}`, title: "Send your inventory to DAERA", show: inv.to, due: inv.deadline, href: A("paperwork/inventory"), legal: true });
  for (const d of data.deaths || []) if (!d.deleted && d.over18m && !d.tseDone) out.push({ key: `tse:${d.id}`, title: "Phone the TSE sampling site (within 24 h)", show: d.date, due: addDays(d.date, 1), href: A("paperwork/deaths"), action: { type: "set", coll: "deaths", id: d.id, field: "tseDone" }, legal: true });
  for (const p of pensInUse(data, now || new Date())) if (p.turnOut) out.push({ key: `pen:${p.lambing.id}`, title: `Pen ${p.pen}: ${p.lambing.mobName || "ewe"}${p.lambing.eweTag ? " " + p.lambing.eweTag : ""} + ${(p.lambing.lambs || []).filter((x) => x.alive).length} ready to turn out (48 h)`, show: today, due: today, href: A("year/lambing"), action: { type: "penOut", id: p.lambing.id } });
  const rams = ramSummary(data);
  if (rams.total) { const motBy = addDays(cy.nextRamsIn, -30); if (!(rams.lastMot && rams.lastMot >= addDays(cy.nextRamsIn, -75))) out.push({ key: `mot:${cy.nextRamsIn}`, title: `Ram MOT: ${rams.total} rams before ${short(motBy)}`, show: addDays(cy.nextRamsIn, -60), due: motBy, href: A("year/weaning") }); }
  return out;
}
/** Jobs due today or overdue (shown from `show`), not done. */
export function todayTasks(c, doneKeys) { return generatedTasks(c).filter((t) => t.show <= c.today && !doneKeys.has(t.key)).sort((a, b) => a.due.localeCompare(b.due)); }
/** The next upcoming job (for the empty state). */
export function nextTask(c, doneKeys) { return generatedTasks(c).filter((t) => t.show > c.today && !doneKeys.has(t.key)).sort((a, b) => a.show.localeCompare(b.show))[0] || null; }
/** Overnight summary for the morning (05:00–12:00). */
export function overnight(c) {
  const now = c.now || new Date(); if (now.getHours() < 5 || now.getHours() >= 12) return null;
  const start = new Date(now); start.setDate(start.getDate() - 1); const [h, m] = String(c.s.shedNightFrom || "18:00").split(":").map(Number); start.setHours(h || 18, m || 0, 0, 0);
  const list = (c.data.lambings || []).filter((l) => !l.deleted && new Date(l.datetime) >= start && new Date(l.datetime) <= now);
  if (!list.length) return null;
  let ewes = 0, lambs = 0, dead = 0, fostered = 0, watch = 0;
  for (const l of list) { if (l.aborted) continue; ewes++; lambs += (l.lambs || []).length; dead += (l.lambs || []).filter((x) => !x.alive).length; fostered += (l.lambs || []).filter((x) => x.fosteredTo || x.fosteredFrom).length; if ((l.problems || []).length) watch++; }
  return `Overnight: ${ewes} ewe${ewes === 1 ? "" : "s"} lambed, ${lambs} lamb${lambs === 1 ? "" : "s"}, ${dead} dead, ${fostered} fostered, ${watch} to watch.`;
}
export { countsAt, cropLambings };
