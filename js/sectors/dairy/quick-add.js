// Quick add (design/12 §2.2): the same grid all year — dairy has no season mode.
import { loadDairy } from "./data.js";
import { quickAddSheet } from "../generic.js";
import { canWrite } from "../../core/policy.js";
import { openMoneySheet } from "../../ui/money-sheet.js";

const F = (name, fn = "default", extra) => async (snap) => (await import(`./flows/${name}.js`))[fn](snap, extra);
export const ITEMS = {
  treat: { label: "Treatment / mastitis", icon: "syringe", run: F("treatment") },
  bulling: { label: "Seen bulling", icon: "dairy", run: F("breeding", "heatSheet") },
  served: { label: "Served (AI)", icon: "birth", run: F("breeding", "serveSheet") },
  calving: { label: "Calving", icon: "birth", run: F("calving") },
  tank: { label: "Tank temp", icon: "temp", run: F("tank") },
  note: { label: "Note / handover", icon: "message", run: F("handover") },
  pd: { label: "PD result", icon: "search", run: F("breeding", "pdSheet") },
  dry: { label: "Dry off", icon: "water", run: F("dryoff") },
  fresh: { label: "Fresh cow check", icon: "check", run: F("fresh") },
  btv: { label: "BTV-3 vaccine", icon: "syringe", run: F("treatment", "default", { reason: "BTV-3 vaccine" }) },
  add: { label: "Add a cow", icon: "plus", run: F("cow-edit", "addCowSheet") },
  off: { label: "Off the farm", icon: "truck", run: F("cow-edit", "offSheet") },
};
const ORDER = ["treat", "bulling", "served", "calving", "tank", "note", "pd", "dry", "fresh", "btv", "add", "off"];

export default async function quickAdd(ctx) {
  const snap = await loadDairy(ctx.ledger);
  const money = canWrite(snap.role, "finance") ? [{ id: "money", label: "Money", icon: "money", run: () => openMoneySheet(snap.ledger) }] : [];
  if (!canWrite(snap.role, "animals")) return quickAddSheet(ctx.ledger, money);
  return quickAddSheet(ctx.ledger, [...ORDER.map((id) => ({ id, label: ITEMS[id].label, icon: ITEMS[id].icon, run: () => ITEMS[id].run(snap) })), ...money]);
}
/** Open one quick-add entry by id (used by the screenshot and flow tests). */
export async function runFlow(id, ledger) { const snap = await loadDairy(ledger); return ITEMS[id].run(snap); }
