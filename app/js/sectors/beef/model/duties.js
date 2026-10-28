// What needs doing: the Beef Today list and alerts (design/10 §3.6, §13), generated from the
// records — nothing here is stored. Ticking a generated job either does its record action
// (e.g. marks the calf registered) or saves a done task with the same `key` (sourceRef).
// Deadlines switch when the keeper uses NIFAIS Online as the herd register (Research B
// verification pass 2026-10-15: births 23 days, move off same day, other events 3 days).
import { addDays, daysBetween, shortDate } from "../../../core/dates.js";
// "21 Oct" (with the year only when it isn't this year's) — the date style used on Today.
const ddmmyy = (iso) => (iso ? shortDate(iso).replace(new RegExp(` ${new Date().getFullYear()}$`), "") : "");
import { onFarm, withdrawal, classOf, ageMonths, lastWeight, shortName } from "./animals.js";
import { birthsToRegister, scStatus, breedingFemales, notSeenBulling, heiferWindow, replacementHeifers, dueInfo } from "./breeding.js";
import { deadlineAnimals, finishingFacts, deadlineLevel } from "./finishing.js";
import { tagParts } from "./tags.js";
import { BCRS_PAYMENT, SC_PAYMENT, ON_FARM, NAP } from "./rules.js";
import { nifaisOnline, usesNifaisRegister } from "./region.js";

/** NIFAIS deadlines: on-farm register = region pack defaults (ON_FARM in rules.js); NIFAIS Online
 * as the register = the herdRegisterNifais content rule (design/01 §17.1). */
export function nifaisDays(s) {
  const n = usesNifaisRegister(s) ? nifaisOnline(s) : null;
  return n ? { birth: n.birth, moveOff: n.moveOff, moveOn: n.other, death: n.other, retag: n.other } : { birth: ON_FARM.nifaisBirth, moveOff: ON_FARM.nifaisMove, moveOn: ON_FARM.nifaisMove, death: ON_FARM.nifaisDeath, retag: ON_FARM.retag };
}
const tagShort = (a) => { const t = tagParts(a.tag).tail; return shortName(a) || t || a.tag || "animal"; };
const calfOf = (ix, a) => { const d = a.damId ? ix.byId.get(a.damId) : null; return `calf of ${d ? tagShort(d) : a.damTag ? tagParts(a.damTag).tail : tagShort(a)}`; };
const LEVEL_ORDER = { late: 0, due: 1, info: 2 };

/** All generated jobs. Each: { key, title, show, due, href?, animalId?, action?, legal? } */
export function generatedTasks(c) {
  const { data, s, ix, today, lid } = c; const out = []; const nd = nifaisDays(s);
  const A = (h) => `#/l/${lid}/${h}`;
  for (const b of birthsToRegister(data, s, today)) {
    const a = b.animal; const who = calfOf(ix, a); const show = addDays(a.dob, 1);
    for (const st of b.steps) {
      if (st.done) continue;
      const title = { tagged: `Tag ${who}`, bvdSample: `Post BVD sample for ${who}`, nifais: usesNifaisRegister(s) ? `Record ${who} on NIFAIS` : `Register ${who} on NIFAIS`, society: `Register ${who} with the ${s.society || "breed"} society`, dna: `Post DNA sample for ${who}` }[st.key];
      out.push({ key: `reg:${a.id}:${st.key}`, title, show, due: st.by, href: A("breeding/register"), animalId: a.id, action: { type: "reg", animalId: a.id, step: st.key }, legal: ["tagged", "nifais", "bvdSample"].includes(st.key) });
    }
  }
  for (const m of data.medicines) {
    const n = +m.courseDays || 1; if (m.deleted || m.notUsed || n < 2 || !m.date) continue;
    for (let i = 1; i < n; i++) { const d = addDays(m.date, i); if (d < addDays(today, -2)) continue; out.push({ key: `dose:${m.courseId || m.id}:${i}`, title: `${i === 1 ? "Second" : i === 2 ? "Third" : `Dose ${i + 1}`} dose: ${m.groupLabel || (m.animalTags || []).map((t) => tagParts(t).tail).join(", ")} (${m.productName})`, show: d, due: d, href: A("paperwork/medicine") }); }
  }
  // weigh reminders, per class that is weighed for gain
  for (const cls of ["finisher", "store", "weanling"]) {
    const live = data.animals.filter((a) => onFarm(a) && classOf(ix, a, today) === cls); if (!live.length) continue;
    const last = live.map((a) => lastWeight(ix, a)?.date || "").sort().pop();
    const show = last ? addDays(last, s.weighEveryDays) : today;
    out.push({ key: `weigh:${cls}:${show}`, title: `Weigh ${{ finisher: "finishers", store: "stores", weanling: "weanlings" }[cls]}${last ? ` (last weighed ${ddmmyy(last)})` : ""}`, show, due: show, href: A(`herd?f=${cls}`) });
  }
  for (const mv of data.movements) {
    if (mv.deleted || mv.nifaisNotified || !mv.date || !["on", "off"].includes(mv.kind)) continue;
    const n = (mv.animalIds || []).length; const days = mv.kind === "off" ? nd.moveOff : nd.moveOn;
    out.push({ key: `move:${mv.id}`, title: `${usesNifaisRegister(s) ? (mv.kind === "off" ? "Record the move on NIFAIS today" : "Record on NIFAIS") : "Notify NIFAIS"}: ${n} moved ${mv.kind} ${mv.kind === "off" ? "to" : "from"} ${mv.to || mv.from || "?"}`.replace(/ (to|from) $/, ""), show: mv.date, due: addDays(mv.date, days), action: { type: "notified", coll: "movements", id: mv.id }, legal: true });
  }
  for (const d of data.deaths) {
    if (d.deleted || !d.date) continue;
    if (!d.nifaisNotified) out.push({ key: `death:${d.id}`, title: `${usesNifaisRegister(s) ? "Record on NIFAIS" : "Notify NIFAIS"} of death: ${d.tagLabel || ""}`.trim(), show: d.date, due: addDays(d.date, nd.death), action: { type: "notified", coll: "deaths", id: d.id }, legal: true });
    if (d.tseRequired && !d.tseDone) out.push({ key: `tse:${d.id}`, title: `Phone the TSE sampling site: ${d.tagLabel || ""}`.trim(), show: d.date, due: addDays(d.date, 1), action: { type: "tse", id: d.id }, legal: true });
  }
  for (const a of data.animals) if (onFarm(a) && a.retagPending) out.push({ key: `retag:${a.id}:${a.retagPending}`, title: `Fit replacement tag: ${tagShort(a)}`, show: a.retagPending, due: addDays(a.retagPending, nd.retag), animalId: a.id, action: { type: "retagDone", animalId: a.id }, legal: true });
  for (const p of data.purchases) {
    if (p.deleted || p.kind !== "livestock" || !p.date || !p.isolationUntil) continue;
    if (p.isolationUntil >= today) out.push({ key: `iso:${p.id}`, title: `Keep bought-in cattle apart until ${ddmmyy(p.isolationUntil)}`, show: p.date, due: p.isolationUntil });
    if (p.untestedBvd) out.push({ key: `isobvd:${p.id}`, title: `BVD test bought-in cattle (${p.untestedBvd} untested)`, show: p.date, due: addDays(p.date, 30), legal: true });
    out.push({ key: `isodose:${p.id}`, title: "Dose bought-in cattle for worms and fluke", show: p.date, due: addDays(p.date, 2) });
  }
  const tb = tbNext(c);
  if (tb) {
    out.push({ key: `tb30:${tb}`, title: "TB test: book the vet", show: addDays(tb, -30), due: addDays(tb, -14), href: A("paperwork/tb") });
    out.push({ key: `tb3:${tb}`, title: "TB test in 3 days: gather cattle", show: addDays(tb, -3), due: tb, href: A("paperwork/tb") });
  }
  for (const t of data.tbTests) if (!t.deleted && t.stage === "presented" && t.readingDate) out.push({ key: `tbread:${t.id}`, title: `TB reading: ${ddmmyy(t.readingDate)}`, show: addDays(t.readingDate, -1), due: t.readingDate, href: A(`tb/${t.id}`) });
  if (s.calfChecks) for (const when of ["morning", "evening"]) out.push({ key: `calfcheck:${today}:${when}`, title: `Calf check (${when})`, show: today, due: today });
  for (const h of replacementHeifers(data, ix, today)) {
    const w = heiferWindow(data, s, ix, h, today);
    if (w && w.status === "open" && w.daysLeft <= 60) out.push({ key: `heifer:${h.id}:${w.serveTo}`, title: `Heifer ${tagShort(h)}: serve by ${ddmmyy(w.serveTo)} to calve by ${w.maxM} months`, show: addDays(w.serveTo, -60), due: w.serveTo, animalId: h.id });
  }
  return out;
}

/** Jobs for the Today list: shown and not done (done = action done, or a done task with the key). */
export function todayTasks(c, doneKeys = new Set()) {
  return generatedTasks(c).filter((t) => t.show <= c.today && !doneKeys.has(t.key)).sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
}
export function weekTasks(c, doneKeys = new Set()) {
  const end = addDays(c.today, 7);
  return generatedTasks(c).filter((t) => t.show > c.today && t.show <= end && !doneKeys.has(t.key)).sort((a, b) => a.show.localeCompare(b.show));
}
export function tbNext(c) {
  const last = c.data.tbTests.filter((t) => !t.deleted && t.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (c.s.tbNextDue) return c.s.tbNextDue;
  if (last) return last.nextDue || addDays(last.date, 365);
  return null;
}

/** Alerts, most urgent first. Legal ones can't be snoozed. */
export function beefAlerts(c, { money = true } = {}) {
  const { data, s, ix, today, lid } = c; const out = []; const A = (h) => `#/l/${lid}/${h}`;
  const inWd = data.animals.filter((a) => onFarm(a) && withdrawal(ix, a, today));
  if (inWd.length) { const last = inWd.map((a) => withdrawal(ix, a, today).until).sort().pop(); out.push({ key: "wd", level: "late", legal: true, title: `${inWd.length} ${inWd.length === 1 ? "animal" : "cattle"} under withdrawal`, body: `Don't sell for meat until ${ddmmyy(inWd.length === 1 ? last : inWd.map((a) => withdrawal(ix, a, today).until).sort()[0])}${inWd.length > 1 ? ` (last clears ${ddmmyy(last)})` : ""}.`, href: A("herd?f=withdrawal"), action: "See them" }); }
  // NAP slurry closed period (design/10 §3.4): info from 1 Oct until it starts (region pack dates).
  const y = today.slice(0, 4); const closed = `${y}-${NAP.slurryClosedFrom}`;
  if (today >= `${y}-${NAP.slurryWarnFrom}` && today < closed) out.push({ key: `nap:${y}`, level: "info", title: `Slurry closed period starts ${ddmmyy(closed)}`, body: "Spread before then if ground allows." });
  for (const b of birthsToRegister(data, s, today)) {
    const a = b.animal; const who = calfOf(ix, a);
    const tag = b.steps.find((x) => x.key === "tagged"), nif = b.steps.find((x) => x.key === "nifais");
    if (!tag.done && b.age >= 20) out.push({ key: `tag:${a.id}`, level: "late", legal: true, title: `Tag ${who} now`, body: `${cap(who)} is ${b.age} days old and not tagged. Tag now — it's needed before any move.`, href: A("breeding/register") });
    else if (!tag.done && b.age >= 15) out.push({ key: `tag:${a.id}`, level: "due", legal: true, title: `Tag ${who} by ${ddmmyy(tag.by)}`, body: "Tags and BVD sample within 20 days of birth.", href: A("breeding/register") });
    if (!nif.done && nif.left < 0) out.push({ key: `nif:${a.id}`, level: "late", legal: true, title: `Register ${who} on NIFAIS`, body: `It's past ${nifaisDays(s).birth} days. Late: this calving won't count for the Suckler Cow Scheme. Late births get NNO status, which restricts moves and may affect slaughter and subsidy.`, href: A("breeding/register") });
    else if (!nif.done && nif.left <= 7) out.push({ key: `nif:${a.id}`, level: "due", legal: true, title: `Register ${who} on NIFAIS by ${ddmmyy(nif.by)}`, body: `${nif.left} day${nif.left === 1 ? "" : "s"} left.`, href: A("breeding/register") });
    if (!a.bvd?.status && b.age >= 25) out.push({ key: `bvd:${a.id}`, level: b.age >= 30 ? "late" : "due", legal: true, title: `${cap(who)} has no BVD result yet`, body: "Calves must be tested before 30 days old.", href: A(`animal/${a.id}`) });
  }
  const pos = data.animals.filter((a) => onFarm(a) && /BVDP|BVDI|positive/i.test(a.bvd?.status || ""));
  for (const a of pos) out.push({ key: `bvdpos:${a.id}`, level: "late", legal: true, title: `BVD positive: ${tagShort(a)}`, body: "Isolate now. Your herd is restricted from today. Remove within 28 days.", href: A(`animal/${a.id}`) });
  const untested = data.animals.filter((a) => onFarm(a) && a.dob && daysBetween(a.dob, today) > 30 && /BVDU|untested/i.test(a.bvd?.status || ""));
  if (untested.length >= 5) out.push({ key: "bvdu", level: "late", legal: true, title: `${untested.length} cattle over 30 days have no BVD result`, body: "DAERA will restrict the herd if they're not tested within 28 days of a warning letter.", href: A("herd") });
  const nd = nifaisDays(s);
  for (const t of generatedTasks(c)) {
    if (!/^(move|death|retag|tse):/.test(t.key) || c.doneKeys?.has(t.key)) continue;
    const left = daysBetween(today, t.due);
    if (left < 0 || t.key.startsWith("tse:")) out.push({ key: t.key, level: "late", legal: true, title: t.title, body: t.key.startsWith("tse:") ? `Phone within 24 hours (by ${ddmmyy(t.due)}).` : `Overdue since ${ddmmyy(t.due)}.`, href: t.href });
    else if (left <= 2 || (t.key.startsWith("retag:") && left <= 7)) out.push({ key: t.key, level: "due", legal: true, title: t.title, body: `By ${ddmmyy(t.due)}.`, href: t.href });
  }
  const tb = tbNext(c);
  if (tb) {
    const left = daysBetween(today, tb);
    if (left < 0) out.push({ key: "tb", level: "late", legal: true, title: "TB test overdue", body: "Your herd's OTF status is suspended until it's done.", href: A("paperwork/tb") });
    else if (left <= 30) out.push({ key: "tb", level: left <= 14 ? "due" : "info", title: `TB test in ${left} day${left === 1 ? "" : "s"}`, body: left <= 3 ? "Gather the cattle and check every tag is in." : left <= 14 ? "Make sure the vet is booked." : "Book the vet.", href: A("paperwork/tb") });
  }
  for (const a of deadlineAnimals(data, ix, today)) {
    const f = finishingFacts(data, s, ix, a, today);
    for (const d of f.deadlines) {
      const lv = deadlineLevel(d.left); if (!lv || (lv === "info" && d.left > 60)) continue;
      out.push({ key: `dl:${a.id}:${d.kind}`, level: lv === "late" ? "due" : lv, title: `${tagShort(a)} reaches ${d.kind === "bcrs" ? `${f.bcrs.months} months on ${ddmmyy(d.date)} — BCRS${money ? ` £${BCRS_PAYMENT}` : ""}` : `your processor's ${s.processor.maxAgeMonths}-month limit on ${ddmmyy(d.date)}`}`, body: d.left === 0 ? "That's today." : `${d.left} days left.`, href: A(`animal/${a.id}`), group: "deadline" });
    }
  }
  for (const cow of breedingFemales(data, ix, today)) {
    const st = scStatus(data, s, ix, cow, today);
    if (st && st.status === "risk") out.push({ key: `sc:${cow.id}`, level: "due", title: `${tagShort(cow)} must calve by ${ddmmyy(st.deadline)} to count${money ? ` (£${SC_PAYMENT})` : ""}`, body: dueInfo(data, s, ix, cow).basis ? "Not scanned in calf yet." : "Not seen bulling yet.", href: A("breeding/board"), group: "sc" });
  }
  const nsb = breedingFemales(data, ix, today).filter((cow) => notSeenBulling(data, ix, cow, today));
  if (nsb.length) out.push({ key: "nsb", level: "info", title: `${nsb.length} cow${nsb.length > 1 ? "s" : ""} calved over 6 weeks ago with no heat seen`, body: "Cows should cycle 35–42 days after calving.", href: A("breeding/board?f=nsb") });
  for (const h of replacementHeifers(data, ix, today)) { const w = heiferWindow(data, s, ix, h, today); if (w && w.status === "open" && w.daysLeft <= 14) out.push({ key: `hw:${h.id}`, level: "due", title: `Heifer ${tagShort(h)}: breeding window closes ${ddmmyy(w.serveTo)}`, body: `Serve by then to calve by ${w.maxM} months.`, href: A("breeding/heifers") }); }
  for (const [k, label] of [["hparDate", "Health, performance & antibiotic review"], ["healthPlanSigned", "Animal health plan review"]]) {
    const d = c.ms?.[k]; if (!d) continue; const due = addDays(d, 365); const left = daysBetween(today, due);
    if (left <= 30) out.push({ key: `plan:${k}`, level: left < 0 ? "late" : "due", title: `${label} ${left < 0 ? "overdue" : `due ${ddmmyy(due)}`}`, body: "Book it with your vet.", href: A("paperwork") });
  }
  if (c.silage && c.silage.short > 0) out.push({ key: "silage", level: "due", title: `Silage runs out ${ddmmyy(c.silage.runOut)} — ${c.silage.short} days before turnout`, body: "See the fodder budget for what-ifs.", href: A("feed") });
  for (const p of c.store || []) if (p.expiry && p.expiry >= today && daysBetween(today, p.expiry) <= 30) out.push({ key: `exp:${p.id}`, level: "info", title: `${p.name}${p.batch ? ` batch ${p.batch}` : ""} expires ${ddmmyy(p.expiry)}`, body: "Use it first, or dispose of it and record the disposal." });
  for (const o of outbreaks(c)) out.push({ key: `ob:${o.reason}:${o.group}`, level: "info", title: `${o.n} ${o.reason.toLowerCase()} cases${o.group ? ` in ${o.group}` : ""} this fortnight`, body: "Worth a word with the vet.", href: A("paperwork/medicine") });
  return collapse(out).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
/** Many deadline / SC alerts become one summary line each so the list stays short. */
function collapse(list) {
  const out = []; const groups = {};
  for (const a of list) { if (!a.group) { out.push(a); continue; } (groups[a.group] = groups[a.group] || []).push(a); }
  for (const [g, items] of Object.entries(groups)) {
    if (items.length <= 2) { out.push(...items); continue; }
    const lv = items.some((x) => x.level === "due") ? "due" : "info";
    out.push(g === "deadline" ? { key: "dl", level: lv, title: `${items.length} cattle near a scheme or spec deadline`, body: items.slice(0, 2).map((x) => x.title).join("; ") + "…", href: items[0].href.replace(/animal\/.*/, "finishing") }
      : { key: "sc", level: "due", title: `${items.length} cows at risk for the Suckler Cow Scheme`, body: "Not served or scanned in time to calve within the limit.", href: items[0].href });
  }
  return out;
}
/** ≥ 3 treated for the same reason in the same group within 14 days. */
export function outbreaks(c) {
  const { data, ix, today } = c; const since = addDays(today, -14); const map = new Map();
  for (const m of data.medicines) {
    if (m.deleted || m.notUsed || !m.reason || m.reason === "BTV-3 vaccine" || m.reason === "Vaccine" || m.date < since) continue;
    for (const t of m.animalTags || []) { const a = ix.byTag.get(String(t).replace(/\s+/g, "").toLowerCase()); const g = a && a.groupId ? ix.groups.get(a.groupId)?.name || "" : ""; const k = m.reason + "|" + g; if (!map.has(k)) map.set(k, new Set()); map.get(k).add(t); }
  }
  return [...map.entries()].filter(([, v]) => v.size >= 3).map(([k, v]) => ({ reason: k.split("|")[0], group: k.split("|")[1], n: v.size }));
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export { ageMonths };
