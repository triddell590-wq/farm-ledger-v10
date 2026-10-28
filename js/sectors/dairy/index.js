// Dairy ledger module (design/12-dairy.md). Five tabs: Milking · Cows · Fertility · Milk · More.
// The home is "Milking" and opens on the cows whose milk must stay out of the tank.
// Contract: see sectors/ui.js. Screens load on demand from screens/, entry sheets from flows/.
import { loadDairy } from "./data.js";
import { ensureCss, cowLabel } from "./ui.js";
import { dairyAlerts } from "./model/alerts.js";
import { todayTasks } from "./model/duties.js";
import { onFarm, groupOf } from "./model/cows.js";
import { canRead } from "../../core/policy.js";
import { num } from "../../ui/format.js";

const OPS = ["owner", "manager", "worker", "viewer"];
const S = (name, extra = {}) => async (ctx) => { ensureCss(); const m = await import(`./screens/${name}.js`); return m.default({ ...ctx, ...extra }); };

const routes = [
  { pattern: /^cow\/(?<id>[^/]+)$/, load: S("cow") },
  { pattern: /^fertility\/(?<view>vet|sires|kpis)$/, load: S("fert-more") },
  { pattern: /^milk\/(?<seg>tank|quality|mastitis|cheques)$/, load: S("milk") },
  { pattern: /^paperwork$/, load: S("paperwork") },
  { pattern: /^paperwork\/(?<doc>[a-z]+)$/, load: S("register") },
  { pattern: /^(?<page>rt|inspect)$/, load: S("checklist") },
  { pattern: /^calves$/, load: S("calves") },
  { pattern: /^(?<page>feed|slurry)$/, load: S("feed") },
  { pattern: /^tools(?:\/(?<tool>[a-z-]+))?$/, load: S("tools") },
  { pattern: /^imports$/, load: S("imports") },
  { pattern: /^dairy-settings$/, load: S("settings") },
  { pattern: /^scores$/, load: S("scores") },
  { pattern: /^(?<kind>parlour-machine|training|ab-failures|tb|foot|people-log)$/, load: S("logs") },
  { pattern: /^money$/, load: S("money") },
];

const M = {
  type: "dairy",
  tabs: [
    { id: "milking", label: "Milking", icon: "today", roles: OPS },
    { id: "cows", label: "Cows", icon: "dairy", roles: OPS },
    { id: "fertility", label: "Fertility", icon: "birth", roles: OPS },
    { id: "milk", label: "Milk", icon: "water", roles: OPS },
    { id: "money", label: "Money", icon: "money", roles: ["accountant"] }, // accountants: cheques and money only (design/12 §15)
    { id: "more", label: "More", icon: "more" },
  ],
  routes,
  async screen(tab, ctx) {
    ensureCss();
    const name = { milking: "milking", cows: "cows", fertility: "fertility", milk: "milk", money: "money" }[tab] || "milking";
    const m = await import(`./screens/${name}.js`); return m.default({ ...ctx, tabId: tab });
  },
  fab(ctx) { ensureCss(); return import("./quick-add.js").then((m) => m.default(ctx)); },
  async moreRows(ctx) {
    const lid = ctx.ledger.id; const money = canRead(ctx.role, "finance"); const ops = OPS.includes(ctx.role);
    return [
      ops && { label: "Paperwork and Red Tractor", sub: "Registers, Red Tractor check, slurry, training, disease report", icon: "records", href: `#/l/${lid}/paperwork` },
      money && { label: "Milk money", sub: "Milk cheques, MOPF, what if", icon: "money", href: `#/l/${lid}/money` },
      ops && { label: "Tools", sub: "Dates, cheque check, MOPF, cull ranking, weigh tape…", icon: "grid", href: `#/l/${lid}/tools` },
      ops && { label: "Dairy settings", sub: "Milking times, waiting period, processor, bands, imports", icon: "settings", href: `#/l/${lid}/dairy-settings` },
    ].filter(Boolean);
  },
  async headline(ledger) {
    if (!OPS.includes(ledger.role)) return { value: "", unit: "", line: "Milk cheques are in Money" };
    const snap = await loadDairy(ledger);
    const inMilk = snap.data.animals.filter((a) => onFarm(a) && groupOf(snap.ix, a, snap.today) === "milking").length;
    const w = snap.brd.withheld;
    return { value: num(inMilk), unit: "in milk", line: w.length ? `Milk out of the tank: ${w.map((x) => cowLabel(x.cow)).slice(0, 4).join(", ")}` : "All cows' milk can go in the tank" };
  },
  async alerts(ledger, role) {
    if (!OPS.includes(role)) return [];
    const snap = await loadDairy(ledger);
    return dairyAlerts(snap.c);
  },
  /** Generated jobs for the farm Overview's merged Today list. */
  async tasks(ledger) {
    if (!OPS.includes(ledger.role)) return [];
    const snap = await loadDairy(ledger);
    const { tickGenerated } = await import("./actions.js");
    return todayTasks(snap.c).map((t) => ({ id: t.key, title: t.title, due: t.due, sub: t.sub, href: t.href, legal: t.legal, generated: true, done: false, ledger, tick: (done) => tickGenerated(ledger.id, snap, t, done) }));
  },
  async contextLine(ledger) {
    const s = ledger.settings || {};
    return [ledger.name, s.herdNo ? `Herd ${s.herdNo}` : null].filter(Boolean).join(" · ");
  },
};
export default M;
