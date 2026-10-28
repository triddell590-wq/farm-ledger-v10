// Pigs ledger module (design/13-pigs.md). The unit runs on the production week: the home is
// "Week 42" — the week strip and the room board. Tabs depend on the system (§2.1):
//   breeding / farrow-to-finish: Week · Sows · Rooms · Batches · More
//   finishing only:              Week · Rooms · Batches · Paperwork · More
//   small herd mode:             Pigs · Litters · Sales & feed · Paperwork · More
// Contract: see sectors/ui.js. Screens load on demand from screens/, entry sheets from flows/.
import { loadPigs, knownTabs } from "./data.js";
import { ensureCss } from "./ui.js";
import { pigAlerts } from "./model/alerts.js";
import { todayTasks } from "./model/duties.js";
import { pigSettings, tabSetFor } from "./model/settings.js";
import { weekLabel } from "./model/weeks.js";
import { roomFacts } from "./model/facts.js";
import { moreState } from "./model/more.js";
import { canRead } from "../../core/policy.js";
import { session } from "../../services/session.js";

const OPS = ["owner", "manager", "worker", "viewer"];
const S = (name, extra = {}) => async (ctx) => { ensureCss(); const m = await import(`./screens/${name}.js`); return m.default({ ...ctx, ...extra }); };

const routes = [
  { pattern: /^sow\/(?<id>[^/]+)$/, load: S("sow") },
  { pattern: /^service$/, load: S("service") },
  { pattern: /^room\/(?<id>[^/]+)$/, load: S("room") },
  { pattern: /^crate\/(?<roomId>[^/]+)\/(?<crate>\d+)$/, load: S("room") },
  { pattern: /^batch\/(?<id>[^/]+)$/, load: S("batch") },
  { pattern: /^ship\/(?<id>[^/]+)$/, load: S("ship") },
  { pattern: /^compare$/, load: S("compare") },
  { pattern: /^move-farrowing$/, load: S("move-farrowing") },
  { pattern: /^alarm\/(?<house>[^/]+)$/, load: S("alarm") },
  { pattern: /^pigs-paperwork$/, load: S("paperwork") },
  { pattern: /^reg\/(?<doc>[a-zA-Z0-9-]+)$/, load: S("registers") },
  { pattern: /^(?<page>qvr|emb|inventory|plans)$/, load: S("returns") },
  { pattern: /^(?<page>rt|inspect)$/, load: S("checklist") },
  { pattern: /^gate(?:\/(?<mode>sign|form))?$/, load: S("gate") },
  { pattern: /^tools(?:\/(?<tool>[a-z-]+))?$/, load: S("tools") },
  { pattern: /^kpis$/, load: S("kpis") },
  { pattern: /^pigs-money$/, load: S("money") },
  { pattern: /^pigs-settings$/, load: S("settings") },
  { pattern: /^setup(?:\/(?<what>rooms|bins|semen|sows))?$/, load: S("setup") },
  { pattern: /^disease$/, load: S("disease") },
];

const TABSETS = {
  breeding: [["week", "Week", "today"], ["sows", "Sows", "birth"], ["rooms", "Rooms", "house"], ["batches", "Batches", "chart"]],
  finishing: [["week", "Week", "today"], ["rooms", "Rooms", "house"], ["batches", "Batches", "chart"], ["paperwork", "Paperwork", "document"]],
  small: [["week", "Pigs", "pigs"], ["litters", "Litters", "birth"], ["sales", "Sales & feed", "truck"], ["paperwork", "Paperwork", "document"]],
};
/** The ledger whose tabs the shell is asking for (the router has already set the hash). */
function currentSet() {
  const lid = (typeof location !== "undefined" && location.hash.match(/^#\/l\/([^/]+)/)?.[1]) || null;
  const known = lid && knownTabs(lid); if (known) return known;
  const ledger = lid && session.ledger?.(lid);
  return ledger ? tabSetFor(pigSettings(ledger, {})) : "breeding";
}

const M = {
  type: "pigs",
  get tabs() {
    return [
      ...TABSETS[currentSet()].map(([id, label, icon]) => ({ id, label, icon, roles: OPS })),
      { id: "money", label: "Money", icon: "money", roles: ["accountant"] }, // accountants: money only (design/13 §16)
      { id: "more", label: "More", icon: "more" },
    ];
  },
  routes,
  async screen(tab, ctx) {
    ensureCss();
    const name = { week: "week", sows: "sows", rooms: "rooms", batches: "batches", paperwork: "paperwork", litters: "litters", sales: "sales", money: "money" }[tab] || "week";
    const m = await import(`./screens/${name}.js`); return m.default({ ...ctx, tabId: tab });
  },
  fab(ctx) { ensureCss(); return import("./quick-add.js").then((m) => m.default(ctx)); },
  async moreRows(ctx) {
    const lid = ctx.ledger.id; const money = canRead(ctx.role, "finance"); const ops = OPS.includes(ctx.role);
    const set = currentSet(); const L = (h) => `#/l/${lid}/${h}`;
    let st = {};
    if (ops) { try { st = moreState(await loadPigs(ctx.ledger)); } catch (e) { st = {}; } }
    return [
      ops && set === "breeding" && { label: "Paperwork and Red Tractor", sub: "Based on Red Tractor Pigs v5.2, February 2026", icon: "records", href: L("pigs-paperwork") },
      ops && { label: "Visitors (gate log)", sub: st.visitors || "QR gate sign, visitors signed in", icon: "people", href: L("gate") },
      ops && st.alarmHref && { label: "Alarm tests", sub: st.alarms, icon: "bell", href: st.alarmHref },
      ops && set !== "small" && { label: "Vet visits (QVR)", sub: st.qvr, icon: "syringe", href: L("qvr") },
      ops && set !== "small" && { label: `eMB-Pigs ${st.embLabel || ""} antibiotics`.replace("  ", " "), sub: st.emb, icon: "document", href: L("emb") },
      ops && set === "breeding" && { label: "Movement book (PM1) · holding register (PM2)", sub: st.pm1, icon: "tag", href: L("reg/pm1") },
      ops && set !== "small" && { label: "Herd performance", sub: "Pigs weaned per sow, farrowing rate, parity profile", icon: "chart", href: L("kpis") },
      ops && { label: "Tools", sub: "Space per pen, farrowing planner, feed bins…", icon: "scale", href: L("tools") },
      money && { label: "Money per pig", sub: "Feed cost per kg gain, margin per pig", icon: "money", href: L("pigs-money") },
      ops && { label: "Rooms, bins and semen", sub: "Houses, rooms, pens, crates, feed bins", icon: "house", href: L("setup") },
      ops && { label: "Pig settings and targets", sub: st.system || "System, batch interval, lactation, weights, contract", icon: "settings", href: L("pigs-settings") },
      ops && { label: "Report a disease suspicion", sub: "ASF and notifiable disease — DAERA", icon: "alert", href: L("disease") },
    ].filter(Boolean);
  },
  async headline(ledger) {
    if (!OPS.includes(ledger.role)) return { value: "", unit: "", line: "Pig money is in Money" };
    const snap = await loadPigs(ledger);
    const growing = [...snap.c.bf.values()].reduce((t, f) => t + (f.final ? 0 : f.onFarm), 0);
    const sows = snap.data.sows.filter((s) => s.type !== "boar" && !s.cull?.date && !s.died).length;
    if (snap.s.smallHerd) return { value: String(sows + growing), unit: "pigs", line: `${sows} sows · ${growing} growing` };
    const late = roomFacts(snap.c).filter((x) => x.tile.level === "late").length;
    return { value: growing.toLocaleString("en-GB"), unit: "growing", line: `${weekLabel(snap.today)}${snap.s.breeding ? ` · ${sows} sows` : ""}${late ? ` · ${late} room${late > 1 ? "s" : ""} need attention` : ""}` };
  },
  async alerts(ledger, role) {
    if (!OPS.includes(role)) return [];
    const snap = await loadPigs(ledger);
    return pigAlerts(snap.c);
  },
  /** Generated jobs for the farm Overview's merged Today list. */
  async tasks(ledger) {
    if (!OPS.includes(ledger.role)) return [];
    const snap = await loadPigs(ledger);
    const { tickGenerated } = await import("./actions.js");
    return todayTasks(snap.c).map((t) => ({ id: t.key, title: t.title, due: t.due, sub: t.sub, href: t.href, legal: t.legal, generated: true, done: false, ledger, tick: (done) => tickGenerated(ledger.id, snap, t, done) }));
  },
  async contextLine(ledger) {
    const s = ledger.settings || {};
    return [ledger.name, s.herdMark ? `Herd mark ${s.herdMark}` : null].filter(Boolean).join(" · ");
  },
};
export default M;
