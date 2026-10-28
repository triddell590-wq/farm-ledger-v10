// Quick add (design/14 §2.2): Daily sheet (asks which house if more than one) · Deaths · Egg
// collection (packer) · Feed delivery · Mite traps · Note. Money roles also get Money.
import { loadLayers } from "./data.js";
import { quickAddSheet } from "../generic.js";
import { canWrite } from "../../core/policy.js";
import { openMoneySheet } from "../../ui/money-sheet.js";

const F = (file, fn = "default") => async (snap, extra) => (await import(`./flows/${file}.js`))[fn](snap, extra);
export const FLOWS = {
  sheet: { label: "Daily sheet", icon: "today", run: F("sheet", "sheetFlow") },
  deaths: { label: "Deaths", icon: "alert", run: F("deaths", "deathsFlow") },
  collection: { label: "Egg collection", icon: "layers", run: F("eggs", "collectionSheet") },
  feed: { label: "Feed delivery", icon: "feed", run: (snap, x = {}) => import("./flows/logs.js").then((m) => m.logSheet(snap, { ...x, kind: "feed" })) },
  mite: { label: "Mite traps", icon: "bug", run: F("mite", "miteFlow") },
  note: { label: "Note", icon: "message", run: F("note", "noteSheet") },
  // flows started from buttons on screens (not on the + sheet)
  statement: { label: "Packer statement", icon: "document", run: F("eggs", "statementSheet") },
  storeTemp: { label: "Egg store temperature", icon: "temp", run: F("eggs", "storeSheet") },
  farmGate: { label: "Farm gate", icon: "layers", run: F("eggs", "farmGateSheet") },
  salm: { label: "Salmonella sample", icon: "syringe", run: F("health", "salmSheet") },
  mitetreat: { label: "Mite treatment", icon: "bug", run: (snap, x = {}) => import("./flows/health.js").then((m) => m.treatSheet(snap, { ...x, mite: true })) },
  treat: { label: "Treatment", icon: "syringe", run: F("health", "treatSheet") },
  vacc: { label: "Vaccination", icon: "syringe", run: F("health", "vaccSheet") },
  weights: { label: "Weigh hens", icon: "scale", run: (snap, x = {}) => import("./flows/samples.js").then((m) => m.weighFlow(snap, { ...x, kind: "weights" })) },
  eggWeights: { label: "Egg weights", icon: "scale", run: (snap, x = {}) => import("./flows/samples.js").then((m) => m.weighFlow(snap, { ...x, kind: "eggs" })) },
  feather: { label: "Feather score", icon: "check", run: F("samples", "featherFlow") },
  house: { label: "House", icon: "house", run: F("house", "houseSheet") },
  place: { label: "Place a flock", icon: "plus", run: F("house", "placeSheet") },
  editFlock: { label: "Flock", icon: "edit", run: F("house", "flockSheet") },
  depop: { label: "Depopulate", icon: "truck", run: F("house", "depopSheet") },
  log: { label: "Record", icon: "plus", run: F("logs", "logSheet") },
  money: { label: "Money", icon: "money", run: (snap) => openMoneySheet(snap.ledger) },
};
export const ORDER = ["sheet", "deaths", "collection", "feed", "mite", "note"];
export default async function quickAdd(ctx) {
  const snap = await loadLayers(ctx.ledger);
  const money = canWrite(snap.role, "finance") ? [{ id: "money", label: "Money", icon: "money", run: () => openMoneySheet(snap.ledger) }] : [];
  if (!canWrite(snap.role, "days")) return quickAddSheet(ctx.ledger, money);
  return quickAddSheet(ctx.ledger, [...ORDER.map((id) => ({ id, label: FLOWS[id].label, icon: FLOWS[id].icon, run: () => FLOWS[id].run(snap) })), ...money]);
}
/** Run a flow by id with a fresh snapshot (buttons on screens, tests). */
export async function runFlow(id, ledger, extra) { const snap = await loadLayers(ledger); return FLOWS[id].run(snap, extra); }
