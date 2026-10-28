// Quick add (design/13 §2.2). The grid depends on the system; Visitor and Alarm test are always
// on the last row.
import { loadPigs } from "./data.js";
import { quickAddSheet, taskSheet, focusFor } from "../generic.js";
import { canWrite } from "../../core/policy.js";
import { openMoneySheet } from "../../ui/money-sheet.js";
import { tabSetFor } from "./model/settings.js";

const F = (file, fn = "default") => async (snap, extra) => (await import(`./flows/${file}.js`))[fn](snap, extra);
export const FLOWS = {
  farrowing: { label: "Farrowing", icon: "birth", run: F("farrowing", "litterFlow") },
  served: { label: "Served", icon: "pigs", run: F("breeding", "servedSheet") },
  weaned: { label: "Weaned", icon: "scale", run: F("wean", "weanFlow") },
  death: { label: "Death", icon: "alert", run: F("death") },
  check: { label: "Room check", icon: "check", run: F("room-check", "roomCheckFlow") },
  feed: { label: "Feed delivery", icon: "feed", run: F("feed", "feedSheet") },
  pigsIn: { label: "Pigs in", icon: "truck", run: F("move", "pigsInSheet") },
  pigsOut: { label: "Pigs out", icon: "truck", run: F("move", "pigsOutSheet") },
  treat: { label: "Treat a pen", icon: "syringe", run: F("treat") },
  treatAny: { label: "Treat", icon: "syringe", run: F("treat") },
  litter: { label: "Litter born", icon: "birth", run: F("farrowing", "litterFlow") },
  feedBought: { label: "Feed bought", icon: "feed", run: F("feed", "feedBoughtSheet") },
  sold: { label: "Pigs sold", icon: "truck", run: F("move", "soldSheet") },
  note: { label: "Note", icon: "edit", run: (snap) => taskSheet(snap.ledger) },
  visitor: { label: "Visitor", icon: "people", run: F("visitor", "visitorSheet") },
  alarm: { label: "Alarm test", icon: "bell", run: F("alarm", "alarmFlow") },
  readings: { label: "Readings", icon: "water", run: F("readings", "readingsFlow") },
  treatSow: { label: "Treat a sow", icon: "syringe", run: (snap, x = {}) => import("./flows/treat.js").then((m) => m.default(snap, { ...x, sow: true })) },
  money: { label: "Money", icon: "money", run: (snap) => openMoneySheet(snap.ledger) },
  // flows started from buttons on screens (not on the + sheet)
  sow: { label: "Add a sow", icon: "plus", run: F("sow", "sowSheet") },
  scan: { label: "Scan result", icon: "scan", run: F("sow", "scanSheet") },
  returned: { label: "Returned", icon: "refresh", run: F("sow", "returnedSheet") },
  heat: { label: "In heat", icon: "pigs", run: F("sow", "heatNow") },
  cull: { label: "Cull", icon: "trash", run: F("sow", "cullSheet") },
  intoCrate: { label: "Into farrowing", icon: "birth", run: F("sow", "intoCrateSheet") },
  lostTag: { label: "Tag lost", icon: "tag", run: F("sow", "lostTagToggle") },
  enrich: { label: "Enrichment", icon: "check", run: F("rooms", "enrichSheet") },
  room: { label: "Room", icon: "house", run: F("rooms", "roomSheet") },
  bin: { label: "Feed bin", icon: "feed", run: F("rooms", "binSheet") },
  semen: { label: "Semen", icon: "pigs", run: F("rooms", "semenSheet") },
  moveBatch: { label: "Move a batch", icon: "house", run: F("batch", "moveBatchSheet") },
  weigh: { label: "Weigh sample", icon: "scale", run: F("batch", "weighSheet") },
  planLoad: { label: "Plan a load", icon: "truck", run: F("batch", "planLoadSheet") },
  killSheet: { label: "Kill sheet", icon: "document", run: F("batch", "killSheetSheet") },
  closeBatch: { label: "Close batch", icon: "check", run: F("batch", "closeBatchSheet") },
  vetVisit: { label: "Vet visit", icon: "syringe", run: F("paper", "vetVisitSheet") },
  siteCheck: { label: "Check", icon: "check", run: F("paper", "siteCheckSheet") },
  plan: { label: "Plan", icon: "document", run: F("paper", "planSheet") },
  inventory: { label: "Inventory", icon: "records", run: F("paper", "inventorySheet") },
};
export const ORDER = {
  breeding: ["farrowing", "served", "weaned", "death", "check", "feed"],
  finishing: ["pigsIn", "death", "check", "feed", "pigsOut", "treat"],
  small: ["litter", "death", "feedBought", "sold", "treatAny", "note"],
};
export function quickAddIds(set, role) {
  return [...ORDER[set], "visitor", "alarm"].filter((k) => k !== "money" || canWrite(role, "finance"));
}
export default async function quickAdd(ctx) {
  const snap = await loadPigs(ctx.ledger);
  const money = canWrite(snap.role, "finance") ? [{ id: "money", label: "Money", icon: "money", run: () => openMoneySheet(snap.ledger) }] : [];
  if (!canWrite(snap.role, "deaths")) return quickAddSheet(ctx.ledger, money);
  const set = tabSetFor(snap.s); const ids = quickAddIds(set, snap.role);
  const treat = set === "small" ? "treatAny" : "treat";
  const FOCUS = {
    sows: ["farrowing", "served", "weaned", "treatSow", "death"], rooms: ["check", "death", treat, "feed", "readings"],
    batches: ["pigsIn", "pigsOut", "death", treat, "feed"], litters: ["litter", "death", "treatAny"], sales: ["sold", "feedBought"],
    paperwork: ["visitor", "alarm", treat, "death"], money: ["money"],
  };
  const all = [...new Set([...ids, "treatSow", "readings", treat])];
  return quickAddSheet(ctx.ledger, [...all.map((id) => ({ id, label: FLOWS[id].label, icon: FLOWS[id].icon, run: () => FLOWS[id].run(snap) })), ...money], { focus: focusFor(FOCUS, ctx.where) || ids });
}
/** Run a flow by id with a fresh snapshot (buttons on screens, tests). */
export async function runFlow(id, ledger, extra) { const snap = await loadPigs(ledger); return FLOWS[id].run(snap, extra); }
