// Poultry – Broilers ledger module (design/15-broilers.md + mockups/broilers.html). A crop lasts
// about six weeks, so the home is a countdown per house: "Day 23 of 38", the crop bar to the thin
// and clear-out, and the two checks a day. Tabs: Crop · Growth · Crops · Paperwork · More
// (+ Money for accountants). Contract: see sectors/ui.js. Screens load on demand from screens/,
// entry sheets from flows/.
import { loadBroilers } from "./data.js";
import { ensureCss } from "./ui.js";
import { broilerAlerts } from "./model/alerts.js";
import { todayTasks } from "./model/duties.js";
import { currentCrop, cropDay, cumMortPct, nextEvent, openTurnaround } from "./model/crop.js";
import { stdOf, vsStdPct } from "./model/growth.js";
import { canRead } from "../../core/policy.js";

const OPS = ["owner", "manager", "worker", "viewer"];
const S = (name, extra = {}) => async (ctx) => { ensureCss(); const m = await import(`./screens/${name}.js`); return m.default({ ...ctx, ...extra }); };

const routes = [
  { pattern: /^check\/(?<houseId>[^/]+)\/(?<date>\d{4}-\d\d-\d\d)\/(?<slot>am|pm)$/, load: S("crop") },
  { pattern: /^growth\/(?<cropId>[^/]+)$/, load: S("growth") },
  { pattern: /^weigh\/(?<cropId>[^/]+)$/, load: S("growth", { open: "weigh" }) },
  { pattern: /^density\/(?<cropId>[^/]+)$/, load: S("density") },
  { pattern: /^thin\/(?<cropId>[^/]+)\/(?<thinId>[^/]+)$/, load: S("thin") },
  { pattern: /^fci\/(?<cropId>[^/]+)\/(?<thinId>[^/]+)$/, load: S("fci") },
  { pattern: /^salm\/(?<cropId>[^/]+)$/, load: S("salm") },
  { pattern: /^brooding(?:\/(?<cropId>[^/]+))?$/, load: S("brooding") },
  { pattern: /^turnaround(?:\/(?<houseId>[^/]+))?$/, load: S("turnaround") },
  { pattern: /^crop-result\/(?<cropId>[^/]+)$/, load: S("result") },
  { pattern: /^paperwork\/(?<doc>[a-z]+)(?:\/(?<cropId>[^/]+))?$/, load: S("registers") },
  { pattern: /^(?<page>rt|inspect)$/, load: S("checklist") },
  { pattern: /^birdreg$/, load: S("birdreg") },
  { pattern: /^houses$/, load: S("houses") },
  { pattern: /^contract$/, load: S("contract") },
  { pattern: /^tools(?:\/(?<tool>[a-z-]+))?$/, load: S("tools") },
  { pattern: /^br-settings$/, load: S("settings") },
];

const M = {
  type: "broilers",
  tabs: [
    { id: "crop", label: "Crop", icon: "today", roles: OPS },
    { id: "growth", label: "Growth", icon: "chart", roles: OPS },
    { id: "crops", label: "Crops", icon: "broilers", roles: OPS },
    { id: "paperwork", label: "Paperwork", icon: "records", roles: OPS },
    { id: "money", label: "Money", icon: "money", roles: ["accountant"] }, // accountants: settlements and energy money only (§18)
    { id: "more", label: "More", icon: "more" },
  ],
  routes,
  async screen(tab, ctx) {
    ensureCss();
    const name = { crop: "crop", growth: "growth", crops: "crops", paperwork: "paperwork", money: "contract" }[tab] || "crop";
    const m = await import(`./screens/${name}.js`); return m.default({ ...ctx, tabId: tab });
  },
  fab(ctx) { ensureCss(); return import("./quick-add.js").then((m) => m.default(ctx)); },
  async moreRows(ctx) {
    const lid = ctx.ledger.id; const money = canRead(ctx.role, "finance"); const ops = OPS.includes(ctx.role); const L = (h) => `#/l/${lid}/${h}`;
    let snap = null; if (ops) { try { snap = await loadBroilers(ctx.ledger); } catch (e) { snap = null; } }
    const hs = snap?.ix.houses || []; const ta = hs.map((h) => openTurnaround(snap.ix, h.id)).filter(Boolean);
    const area = hs.reduce((t, h) => t + (+h.usableM2 || 0), 0);
    return [
      (money || ops) && { label: money ? "Contract and payment" : "Processor", sub: snap?.s.processor ? `${snap.s.processor}${snap.s.noticeMonths ? ` · ${snap.s.noticeMonths}-month notice` : ""}` : "Processor, FCI address, pay basis", icon: money ? "money" : "document", href: L("contract") },
      ops && { label: "Tools", sub: "Density, EPEF, legal line, energy, working days…", icon: "scale", href: L("tools") },
      ops && { label: "Broiler settings and targets", sub: snap ? `${snap.s.hybrid} · farm limit ${snap.s.farmLimitKgM2} kg/m²` : "Hybrid, density limit, alerts, vet", icon: "settings", href: L("br-settings") },
    ].filter(Boolean);
  },
  /** Overview line (design/15 §17): "Crop day 23 · weight vs target · mortality vs trigger · days to first thin". */
  async headline(ledger) {
    if (!OPS.includes(ledger.role)) return { value: "", unit: "", line: "Crop payments are in Money" };
    const snap = await loadBroilers(ledger); const { ix, s, today } = snap;
    const crops = ix.houses.map((h) => currentCrop(ix, h.id)).filter((c) => c && c.placedDate <= today);
    if (!crops.length) { const ta = ix.houses.filter((h) => openTurnaround(ix, h.id)).length; return { value: "", unit: "", line: ix.houses.length ? (ta ? `Turnaround · ${ta} house${ta > 1 ? "s" : ""} empty` : "Houses empty") : "Add your houses" }; }
    const c = crops[0]; const day = cropDay(c, today); const std = stdOf(c, s);
    const vs = vsStdPct(ix, c, std, day, today); const mort = Math.max(...crops.map((x) => cumMortPct(ix, x, today)));
    const ev = nextEvent(ix, c, s, today);
    return { value: String(day), unit: "crop day", line: [`${vs >= 0 ? "+" : "−"}${Math.abs(vs).toFixed(0)}% vs ${std.hybrid}`, `mortality ${mort.toFixed(1)}%`, ev ? `${ev.day - day} days to ${ev.kind === "clear" ? "clear-out" : "thin"}` : null].filter(Boolean).join(" · ") };
  },
  async alerts(ledger, role) {
    if (!OPS.includes(role)) return [];
    const snap = await loadBroilers(ledger);
    return broilerAlerts(snap.c);
  },
  /** Generated jobs for the farm Overview's merged Today list. */
  async tasks(ledger) {
    if (!OPS.includes(ledger.role)) return [];
    const snap = await loadBroilers(ledger);
    const { tickGenerated } = await import("./actions.js");
    return todayTasks(snap.c).map((t) => ({ id: t.key, title: t.title, due: t.due, sub: t.sub, href: t.href, legal: t.legal, generated: true, done: false, ledger, tick: (done) => tickGenerated(ledger.id, snap, t, done) }));
  },
  async contextLine(ledger) {
    const s = ledger.settings || {};
    return [ledger.name, s.registerNo ? `Register ${s.registerNo}` : null].filter(Boolean).join(" · ");
  },
};
export default M;
