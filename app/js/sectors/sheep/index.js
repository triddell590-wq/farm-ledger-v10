// Sheep ledger module (design/11-sheep.md). Five tabs: Flock · Mobs · Sheep year · Paperwork ·
// More. Mobs and counts are the unit, tallies are the entry, the sheep year drives the home.
// Every screen reads through data.js and writes through actions.js. Contract: sectors/ui.js.
import { loadSheep } from "./data.js";
import { ensureCss } from "./ui.js";
import { sheepAlerts, todayTasks } from "./model/duties.js";
import { STAGE_NAMES } from "./model/year.js";
import { canRead } from "../../core/policy.js";
import { num } from "../../ui/format.js";

const OPS = ["owner", "manager", "worker", "viewer"];
const S = (name) => async (ctx) => { ensureCss(); const m = await import(`./${name}.js`); return m.default(ctx); };

const routes = [
  { pattern: /^mob\/(?<id>[^/]+)$/, load: S("mob") },
  { pattern: /^sheep\/(?<id>[^/]+)$/, load: S("ewe") },
  { pattern: /^year\/(?<stage>tupping|scanning|lambing|grazing|weaning)$/, load: S("year") },
  { pattern: /^funnel(?:\/(?<step>[a-z0-9]+))?$/, load: S("funnel") },
  { pattern: /^shed$/, load: S("shed") },
  { pattern: /^paperwork\/(?<doc>register|movements|medicine|deaths|vetops|feed)$/, load: S("registers") },
  { pattern: /^paperwork\/tagging$/, load: S("tagging") },
  { pattern: /^paperwork\/inventory$/, load: S("inventory") },
  { pattern: /^paperwork\/fqa$/, load: S("fqa") },
  { pattern: /^paperwork\/inspect$/, load: S("inspect") },
  { pattern: /^paperwork\/disease$/, load: S("disease") },
  { pattern: /^movement\/(?<id>[^/]+)$/, load: S("movement") },
  { pattern: /^worms$/, load: S("worms") },
  { pattern: /^tools(?:\/(?<tool>[a-z-]+))?$/, load: S("tools") },
  { pattern: /^money$/, load: S("money") },
  { pattern: /^targets$/, load: S("targets") },
  { pattern: /^rams$/, load: S("rams") },
];

const M = {
  type: "sheep",
  tabs: [
    { id: "flock", label: "Flock", icon: "sheep", roles: OPS },
    { id: "mobs", label: "Mobs", icon: "people", roles: OPS },
    { id: "year", label: "Sheep year", icon: "today", roles: OPS },
    { id: "paperwork", label: "Paperwork", icon: "document", roles: OPS },
    { id: "money", label: "Money", icon: "money", roles: ["accountant"] }, // accountants: money only (§16)
    { id: "more", label: "More", icon: "more" },
  ],
  routes,
  async screen(tab, ctx) {
    ensureCss();
    const name = { flock: "flock", mobs: "mobs", year: "year", paperwork: "paperwork", money: "money" }[tab] || "flock";
    const m = await import(`./${name}.js`); return m.default({ ...ctx, tabId: tab });
  },
  fab(ctx) { ensureCss(); return import("./quick-add.js").then((m) => m.default(ctx)); },
  async moreRows(ctx) {
    const lid = ctx.ledger.id; const money = canRead(ctx.role, "finance"); const ops = OPS.includes(ctx.role);
    return [
      money && { label: "Money per ewe", sub: "Gross margin, price per lamb, cost per kg", icon: "money", href: `#/l/${lid}/money` },
      ops && { label: "Tools", sub: "Lambing dates, meal planner, dose, draft value…", icon: "grid", href: `#/l/${lid}/tools` },
    ].filter(Boolean);
  },
  async settingsRows(ctx) {
    return OPS.includes(ctx.role) ? [{ label: "Targets and flock settings", sub: "Rams in, raddle colours, draft weight, FEC threshold", icon: "settings", href: `#/l/${ctx.ledger.id}/targets` }] : [];
  },
  async headline(ledger) {
    if (!OPS.includes(ledger.role)) return { value: "", unit: "", line: "Sheep money is in Money" };
    const snap = await loadSheep(ledger);
    return { value: num(snap.totals.ewes), unit: "ewes", line: `${STAGE_NAMES[snap.stage.stage]} · day ${snap.stage.day}` };
  },
  async alerts(ledger, role) {
    if (!OPS.includes(role)) return [];
    const snap = await loadSheep(ledger);
    return sheepAlerts(snap.c, { money: canRead(role, "finance") }).filter((a) => !a.banner && !String(a.key).startsWith("season:"));
  },
  /** Generated jobs for the farm Overview's merged Today list. */
  async tasks(ledger) {
    if (!OPS.includes(ledger.role)) return [];
    const snap = await loadSheep(ledger);
    const { auth } = await import("../../core/auth.js"); const { tickGenerated } = await import("./actions.js");
    const by = { uid: auth.user?.uid, name: auth.user?.displayName || auth.user?.email };
    return todayTasks(snap.c, snap.doneKeys).map((t) => ({ id: t.key, title: t.title, due: t.due, href: t.href, legal: t.legal, generated: true, done: false, ledger, tick: (done) => tickGenerated(ledger.id, snap, t, done, by) }));
  },
  async contextLine(ledger) {
    const s = ledger.settings || {};
    return [ledger.name, s.flockNo ? `Flock ${s.flockNo}` : null].filter(Boolean).join(" · ");
  },
};
export default M;
