// Quick add (design/15 §2.2): AM check / PM check (whichever is due first), Sample weigh, Feed
// delivery, Medicine (in water), Note. During turnaround (no crop in any house) the grid becomes
// Litter out · Washed · Disinfected · Swab · Re-bedded · Note.
import { loadBroilers } from "./data.js";
import { quickAddSheet, taskSheet, focusFor } from "../generic.js";
import { canWrite } from "../../core/policy.js";
import { openMoneySheet } from "../../ui/money-sheet.js";
import { currentCrop, openTurnaround, listOf } from "./model/crop.js";

const F = (file, fn) => async (snap, extra) => (await import(`./flows/${file}.js`))[fn](snap, extra);
export const FLOWS = {
  am: { label: "AM check", icon: "clock", run: (snap, x = {}) => F("check", "checkFlow")(snap, { ...x, slot: "am" }) },
  pm: { label: "PM check", icon: "check", run: (snap, x = {}) => F("check", "checkFlow")(snap, { ...x, slot: "pm" }) },
  check: { label: "Check", icon: "check", run: F("check", "checkFlow") },
  weigh: { label: "Sample weigh", icon: "scale", run: F("growth", "weighFlow") },
  feed: { label: "Feed delivery", icon: "feed", run: F("growth", "feedFlow") },
  medicine: { label: "Medicine (in water)", icon: "syringe", run: F("paper", "medicineFlow") },
  note: { label: "Note", icon: "message", run: (snap) => taskSheet(snap.ledger) },
  litterOut: { label: "Litter out", icon: "truck", run: (snap, x = {}) => F("turnaround", "stepFlow")(snap, { ...x, key: "litterOut" }) },
  washed: { label: "Washed", icon: "water", run: (snap, x = {}) => F("turnaround", "stepFlow")(snap, { ...x, key: "washed" }) },
  disinfected: { label: "Disinfected", icon: "shield", run: (snap, x = {}) => F("turnaround", "stepFlow")(snap, { ...x, key: "disinfected" }) },
  swab: { label: "Swab", icon: "scan", run: (snap, x = {}) => F("turnaround", "stepFlow")(snap, { ...x, key: "swabs" }) },
  rebedded: { label: "Re-bedded", icon: "house", run: (snap, x = {}) => F("turnaround", "stepFlow")(snap, { ...x, key: "rebedded" }) },
  // started from buttons on screens
  step: { label: "Turnaround step", icon: "check", run: F("turnaround", "stepFlow") },
  placement: { label: "Next placement", icon: "birth", run: F("turnaround", "planPlacementFlow") },
  swabsToggle: { label: "Swabs required", icon: "scan", run: F("turnaround", "swabsRequiredToggle") },
  startCrop: { label: "Start a crop", icon: "birth", run: F("crop", "startCropFlow") },
  house: { label: "Add a house", icon: "house", run: F("crop", "houseSheet") },
  notice: { label: "Density notice", icon: "document", run: F("crop", "densityNoticeSheet") },
  planThin: { label: "Plan thin", icon: "broilers", run: F("thin", "planThinFlow") },
  planClear: { label: "Plan clear-out", icon: "broilers", run: (snap, x = {}) => F("thin", "planThinFlow")(snap, { ...x, kind: "clear" }) },
  thin: { label: "Thin", icon: "truck", run: (snap, x = {}) => F("thin", "thinFlow")(snap, { kind: "thin", ...x }) },
  clear: { label: "Clear-out", icon: "truck", run: (snap, x = {}) => F("thin", "thinFlow")(snap, { kind: "clear", ...x }) },
  docket: { label: "Processor docket", icon: "document", run: F("thin", "docketFlow") },
  salm: { label: "Boot swabs", icon: "scan", run: F("paper", "salmFlow") },
  salmResult: { label: "Salmonella result", icon: "document", run: F("paper", "salmResultFlow") },
  alarm: { label: "Generator / alarm test", icon: "bell", run: F("paper", "alarmFlow") },
  visitor: { label: "Visitor", icon: "people", run: F("paper", "visitorFlow") },
  water: { label: "Water test", icon: "water", run: F("paper", "waterTestFlow") },
  training: { label: "Training", icon: "user", run: F("paper", "trainingFlow") },
  birdReturn: { label: "Bird Register", icon: "records", run: F("paper", "birdReturnFlow") },
  brooding: { label: "Brooding", icon: "temp", run: F("brooding", "broodingFlow") },
  complaint: { label: "Chick quality complaint", icon: "alert", run: F("brooding", "complaintFlow") },
  settlement: { label: "Settlement", icon: "money", run: F("money", "settlementFlow") },
  contract: { label: "Contract", icon: "document", run: F("money", "contractFlow") },
  processor: { label: "Processor", icon: "document", run: F("money", "contractInfoFlow") },
  energy: { label: "Energy readings", icon: "fuel", run: F("money", "energyFlow") },
  controller: { label: "Controller import", icon: "download", run: F("controller", "controllerFlow") },
  money: { label: "Money", icon: "money", run: (snap) => openMoneySheet(snap.ledger) },
};

/** Which check is due first across the houses: "am" until every house has its AM check, then "pm". */
export function dueSlot(snap) {
  const crops = snap.ix.houses.map((h) => currentCrop(snap.ix, h.id)).filter((c) => c && c.placedDate <= snap.today);
  const amDone = crops.every((c) => listOf(snap.ix.checks, c.id).some((x) => x.date === snap.today && x.slot === "am"));
  return amDone ? "pm" : "am";
}
export function quickAddIds(snap) {
  const anyCrop = snap.ix.houses.some((h) => currentCrop(snap.ix, h.id));
  const anyTa = snap.ix.houses.some((h) => openTurnaround(snap.ix, h.id));
  if (!anyCrop && anyTa) return ["litterOut", "washed", "disinfected", "swab", "rebedded", "note"];
  const first = dueSlot(snap);
  return [first, first === "am" ? "pm" : "am", "weigh", "feed", "medicine", "note"];
}
export default async function quickAdd(ctx) {
  const snap = await loadBroilers(ctx.ledger);
  const money = canWrite(snap.role, "finance") ? [{ id: "money", label: "Money", icon: "money", run: () => openMoneySheet(snap.ledger) }] : [];
  if (!canWrite(snap.role, "checks")) return quickAddSheet(ctx.ledger, money);
  if (!snap.ix.houses.length) return quickAddSheet(ctx.ledger, [{ id: "house", label: "Add a house", icon: "house", run: () => FLOWS.house.run(snap) }, { id: "note", label: "Note", icon: "message", run: () => FLOWS.note.run(snap) }, ...money]);
  const ids = quickAddIds(snap);
  const FOCUS = { growth: ["weigh", "feed"], paperwork: ["medicine", "visitor", "alarm", "water"], money: ["money"] };
  const all = [...new Set([...ids, "visitor", "alarm", "water"])];
  return quickAddSheet(ctx.ledger, [...all.map((id) => ({ id, label: FLOWS[id].label, icon: FLOWS[id].icon, run: () => FLOWS[id].run(snap) })), ...money], { focus: focusFor(FOCUS, ctx.where) || ids });
}
/** Run a flow by id with a fresh snapshot (buttons on screens, tests). */
export async function runFlow(id, ledger, extra) { const snap = await loadBroilers(ledger); return FLOWS[id].run(snap, extra); }
