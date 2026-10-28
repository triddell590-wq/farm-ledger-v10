// Beef ledger module (design/10-beef.md). Five tabs: Today · Herd · Breeding · Paperwork · More.
// Screens load on demand; every screen reads the ledger through data.js and writes through
// actions.js. Contract: see sectors/ui.js.
import { loadBeef } from "./data.js";
import { ensureCss } from "./ui.js";
import { beefAlerts, todayTasks } from "./model/duties.js";
import { onFarm } from "./model/animals.js";
import { deadlineAnimals, finishingFacts } from "./model/finishing.js";
import { canRead } from "../../core/policy.js";
import { num } from "../../ui/format.js";
import { addDays } from "../../core/dates.js";

const OPS = ["owner", "manager", "worker", "viewer"];
// Route screens that belong to a Beef tab (Breeding segments, Herd → Finishing, Paperwork
// registers…) keep the + button (design/10 §2.2 "FAB on any Beef tab"); full-screen modes
// (TB test day, inspection pack) opt out with fab: false.
const FAB_TABS = new Set(["today", "herd", "breeding", "paperwork"]);
const S = (name) => async (ctx) => {
  ensureCss(); const m = await import(`./${name}.js`); const s = await m.default(ctx);
  if (s && s.fab === undefined && FAB_TABS.has(s.tab) && (s.depth || 0) <= 1 && OPS.includes(ctx.role) && ctx.role !== "viewer") s.fab = () => import("./quick-add.js").then((q) => q.default(ctx));
  if (s && s.fab === false) s.fab = null;
  return s;
};

const routes = [
  { pattern: /^animal\/(?<id>[^/]+)$/, load: S("animal") },
  { pattern: /^animal\/(?<id>[^/]+)\/sale-sheet$/, load: S("sale-sheet") },
  { pattern: /^breeding\/(?<seg>calving|board|register|heifers|fertility)$/, load: S("breeding") },
  { pattern: /^paperwork\/(?<doc>register|medicine|medpurchases|disposal|movements|deaths|vetops|tbtests|feedrecords|calvings|sc|finishing-list)$/, load: S("registers") },
  { pattern: /^paperwork\/fqa$/, load: S("fqa") },
  { pattern: /^paperwork\/inspect$/, load: S("inspect") },
  { pattern: /^paperwork\/tb$/, load: S("tb") },
  { pattern: /^tb\/(?<id>[^/]+)(?:\/(?<mode>day|read))?$/, load: S("tb") },
  { pattern: /^finishing$/, load: S("finishing") },
  { pattern: /^feed$/, load: S("feed") },
  { pattern: /^money$/, load: S("money") },
  { pattern: /^tools(?:\/(?<tool>[a-z-]+))?$/, load: S("tools") },
  { pattern: /^targets$/, load: S("targets") },
  { pattern: /^groups$/, load: S("groups") },
  { pattern: /^sires$/, load: S("sires") },
  { pattern: /^disease$/, load: S("disease") },
];

const M = {
  type: "beef",
  tabs: [
    { id: "today", label: "Today", icon: "today", roles: OPS },
    { id: "herd", label: "Herd", icon: "beef", roles: OPS },
    { id: "breeding", label: "Breeding", icon: "birth", roles: OPS },
    { id: "paperwork", label: "Paperwork", icon: "records", roles: OPS },
    { id: "money", label: "Money", icon: "money", roles: ["accountant"] }, // accountants get money only (design/10 §18)
    { id: "more", label: "More", icon: "more" },
  ],
  routes,
  async screen(tab, ctx) {
    ensureCss();
    const name = { today: "today", herd: "herd", breeding: "breeding", paperwork: "paperwork", money: "money" }[tab] || "today";
    const m = await import(`./${name}.js`); return m.default({ ...ctx, tabId: tab });
  },
  fab(ctx) { ensureCss(); return import("./quick-add.js").then((m) => m.default(ctx)); },
  async moreRows(ctx) {
    const lid = ctx.ledger.id; const money = canRead(ctx.role, "finance"); const ops = OPS.includes(ctx.role);
    return [
      ops && { label: "Feed & silage", sub: "Silage pits, fodder budget, meal", icon: "feed", href: `#/l/${lid}/feed` },
      money && { label: "Money & margins", sub: "This ledger's money, cost per head, scheme payments", icon: "money", href: `#/l/${lid}/money` },
      ops && { label: "Finishing planner", sub: "BCRS and processor deadlines, ready dates", icon: "scale", href: `#/l/${lid}/finishing` },
      ops && { label: "Groups and sheds", sub: "Management groups, housing", icon: "grid", href: `#/l/${lid}/groups` },
      ops && { label: "Tools", sub: "Calving date, dose by weight, max bid, 200-day weight…", icon: "grid", href: `#/l/${lid}/tools` },
      ops && { label: "Targets and scheme rules", sub: "Herd register (NIFAIS), SC Scheme, BCRS, processor spec", icon: "settings", href: `#/l/${lid}/targets` },
      ops && { label: "Sire report", sub: "Calving ease, weights and sale value by sire", icon: "birth", href: `#/l/${lid}/sires` },
      ops && { label: "Report a disease suspicion", sub: "Bluetongue, TB, BSE — who to phone", icon: "alert", href: `#/l/${lid}/disease` },
    ].filter(Boolean);
  },
  async headline(ledger) {
    if (!OPS.includes(ledger.role)) return { value: "", unit: "", line: "Beef money is in Money" };
    const snap = await loadBeef(ledger);
    const head = snap.data.animals.filter(onFarm).length;
    const end = addDays(snap.today, 31); let n = 0;
    for (const a of deadlineAnimals(snap.data, snap.ix, snap.today)) { const f = finishingFacts(snap.data, snap.s, snap.ix, a, snap.today); if (f.deadlines.some((d) => d.date >= snap.today && d.date <= end)) n++; }
    return { value: num(head), unit: "cattle", line: n ? `${n} at a scheme or spec deadline this month` : "No scheme or spec deadlines this month" };
  },
  async alerts(ledger, role) {
    if (!OPS.includes(role)) return [];
    const snap = await loadBeef(ledger);
    return beefAlerts(snap.c, { money: canRead(role, "finance") });
  },
  /** Generated jobs for the farm Overview's merged Today list. */
  async tasks(ledger) {
    if (!OPS.includes(ledger.role)) return [];
    const snap = await loadBeef(ledger);
    const { auth } = await import("../../core/auth.js"); const { tickGenerated } = await import("./actions.js");
    const by = { uid: auth.user?.uid, name: auth.user?.displayName || auth.user?.email };
    return todayTasks(snap.c, snap.doneKeys).map((t) => ({ id: t.key, title: t.title, due: t.due, href: t.href, legal: t.legal, generated: true, done: false, ledger, tick: (done) => tickGenerated(ledger.id, snap, t, done, by) }));
  },
  async contextLine(ledger) {
    const s = ledger.settings || {};
    return [ledger.name, s.herdNo ? `Herd ${s.herdNo}` : null].filter(Boolean).join(" · ");
  },
};
export default M;
