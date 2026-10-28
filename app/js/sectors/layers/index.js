// Poultry – Layers ledger module (design/14-layers.md). No individual birds: the unit is one flock
// in one house, measured by bird age in weeks, and the job is the daily house sheet checked
// against the breed company's standard curve.
//   Tabs: Houses · Flock · Eggs · Health · More   (Accountant: Money · More)
// Contract: see sectors/ui.js. Screens load on demand from screens/, entry sheets from flows/.
import { loadLayers } from "./data.js";
import { ensureCss, n0, n1 } from "./ui.js";
import { layerAlerts } from "./model/alerts.js";
import { todayTasks } from "./model/duties.js";
import { sortedHouses, flockIn, series, aliveAt } from "./model/flock.js";
import { salmonella } from "./model/health.js";
import { canRead } from "../../core/policy.js";

const OPS = ["owner", "manager", "worker", "viewer"];
const S = (name, extra = {}) => async (ctx) => { ensureCss(); const m = await import(`./screens/${name}.js`); return m.default({ ...ctx, ...extra }); };

const routes = [
  { pattern: /^sheet\/(?<houseId>[^/]+)\/(?<date>\d{4}-\d\d-\d\d)$/, load: S("houses") },
  { pattern: /^house\/(?<id>[^/]+)$/, load: S("house") },
  { pattern: /^(?:flock|curve)\/(?<id>[^/]+)$/, load: S("flock") },
  { pattern: /^flock\/(?<id>[^/]+)\/passport$/, load: S("passport") },
  { pattern: /^weekly\/(?<id>[^/]+)$/, load: S("weekly") },
  { pattern: /^mite\/(?<houseId>[^/]+)$/, load: S("mite") },
  { pattern: /^salmonella\/(?<id>[^/]+)$/, load: S("salmonella") },
  { pattern: /^samples\/(?<houseId>[^/]+)\/(?<kind>weights|eggs|feather)$/, load: S("samples") },
  { pattern: /^health\/(?<section>mortality|vaccinations|treatments|samples)$/, load: S("health-more") },
  { pattern: /^eggs\/(?<seg>production|packer|store|money|farm-gate)$/, load: S("eggs") },
  { pattern: /^statement\/(?<id>[^/]+)$/, load: S("statement") },
  { pattern: /^range(?:\/(?<sub>biosecurity))?$/, load: S("range") },
  { pattern: /^lighting$/, load: S("lighting") },
  { pattern: /^logs\/(?<kind>[a-zA-Z]+)$/, load: S("logs") },
  { pattern: /^layers-paperwork$/, load: S("paperwork") },
  { pattern: /^reg\/(?<key>[a-zA-Z]+)$/, load: S("registers") },
  { pattern: /^(?<page>lion|rspca|inspect)$/, load: S("checklist") },
  { pattern: /^tools(?:\/(?<tool>[a-z-]+))?$/, load: S("tools") },
  { pattern: /^layers-money$/, load: S("money") },
  { pattern: /^layers-settings(?:\/(?<sec>prices))?$/, load: S("settings") },
  { pattern: /^houses-setup$/, load: S("setup") },
  { pattern: /^import$/, load: S("import") },
  { pattern: /^bird-register$/, load: S("bird-register") },
];

const M = {
  type: "layers",
  tabs: [
    { id: "houses", label: "Houses", icon: "today", roles: OPS },
    { id: "flock", label: "Flock", icon: "chart", roles: OPS },
    { id: "eggs", label: "Eggs", icon: "layers", roles: OPS },
    { id: "health", label: "Health", icon: "health", roles: OPS },
    { id: "money", label: "Money", icon: "money", roles: ["accountant"] }, // accountants: money only (design/14 §16)
    { id: "more", label: "More", icon: "more" },
  ],
  routes,
  async screen(tab, ctx) {
    ensureCss();
    const name = { houses: "houses", flock: "flock", eggs: "eggs", health: "health", money: "money" }[tab] || "houses";
    const m = await import(`./screens/${name}.js`); return m.default({ ...ctx, tabId: tab });
  },
  fab(ctx) { ensureCss(); return import("./quick-add.js").then((m) => m.default(ctx)); },
  async moreRows(ctx) {
    ensureCss();
    const lid = ctx.ledger.id; const money = canRead(ctx.role, "finance"); const ops = OPS.includes(ctx.role);
    const L = (h) => `#/l/${lid}/${h}`;
    let st = {};
    if (ops) { try { const { moreState } = await import("./screens/more-state.js"); st = moreState(await loadLayers(ctx.ledger)); } catch (e) { console.error(e); st = {}; } }
    return [
      ops && { label: "Paperwork and Lion", sub: "Registers, visitors, Lion and RSPCA checks — British Lion Code v8", icon: "records", href: L("layers-paperwork") },
      money && { label: "Money per dozen", sub: st.money || "Feed cost per dozen · margin over feed", icon: "money", href: L("layers-money") },
      ops && { label: "Tools", sub: "Uniformity, depop decision, space check…", icon: "scale", href: L("tools") },
      ops && { label: "Layers settings", sub: "Packer, breed standards, alert rules, phone numbers", icon: "settings", href: L("layers-settings") },
    ].filter(Boolean);
  },
  async headline(ledger) {
    if (!OPS.includes(ledger.role)) return { value: "", unit: "", line: "Egg money is in Money" };
    const snap = await loadLayers(ledger); const c = snap.c;
    let eggs = 0, alive = 0, hd = []; let dueSalm = 0, deaths = 0;
    for (const h of sortedHouses(c)) {
      const f = flockIn(c, h.id); if (!f) continue;
      const s = series(c, f); const d = s.find((x) => x.date === c.today) || s.find((x) => x.date === s[s.length - 1]?.date);
      if (d && d.date >= addDaysIso(c.today, -1)) { eggs += +d.eggsTotal || 0; alive += d.alive; if (d.henDay != null) hd.push(d); deaths += (+d.dead || 0) + (+d.culled || 0); }
      const sal = salmonella(c, f); if (!sal.exempt && sal.level !== "ok") dueSalm++;
    }
    if (!eggs) return { value: n0(sortedHouses(c).reduce((t, h) => { const f = flockIn(c, h.id); return t + (f ? aliveAt(c, f, c.today) : 0); }, 0)), unit: "hens", line: "No daily sheet yet today" };
    const lay = alive ? (eggs / alive) * 100 : null;
    return { value: n0(eggs), unit: "eggs", line: [`${n1(lay)}% lay`, deaths ? `${deaths} dead` : null, dueSalm ? "Salmonella sample due" : null].filter(Boolean).join(" · ") };
  },
  async alerts(ledger, role) {
    if (!OPS.includes(role)) return [];
    const snap = await loadLayers(ledger);
    return layerAlerts(snap.c);
  },
  /** Generated jobs for the farm Overview's merged Today list. */
  async tasks(ledger) {
    if (!OPS.includes(ledger.role)) return [];
    const snap = await loadLayers(ledger);
    const { tickGenerated } = await import("./actions.js");
    return todayTasks(snap.c).map((t) => ({ id: t.key, title: t.title, due: t.due, sub: t.sub, href: t.href, legal: t.legal, generated: true, done: false, ledger, tick: (done) => tickGenerated(ledger.id, snap, t, done) }));
  },
  async contextLine(ledger) {
    const s = ledger.settings || {};
    return [ledger.name, s.registerNo ? `Register ${s.registerNo}` : null].filter(Boolean).join(" · ");
  },
};
function addDaysIso(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export default M;
