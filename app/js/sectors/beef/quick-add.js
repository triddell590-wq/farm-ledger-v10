// Quick add (design/10 §2.2): the + button on any Beef tab. Order follows the season mode;
// the full set is always there.
import { loadBeef } from "./data.js";
import { modeFor } from "./today.js";
import { quickAddSheet, taskSheet, focusFor } from "../generic.js";
import { canWrite } from "../../core/policy.js";
import { openMoneySheet } from "../../ui/money-sheet.js";

const F = (name, fn = "default") => async (snap, extra) => (await import(`./flows/${name}.js`))[fn](snap, extra);
const ITEMS = {
  calving: { label: "Calving", icon: "birth", run: F("calving") },
  treatment: { label: "Treatment", icon: "syringe", run: F("treatment") },
  register: { label: "Tag & register", icon: "tag", run: (snap) => { location.hash = `#/l/${snap.lid}/breeding/register`; } },
  death: { label: "Death", icon: "alert", run: F("death") },
  weigh: { label: "Weigh", icon: "scale", run: F("weigh") },
  note: { label: "Note or job", icon: "edit", run: (snap) => taskSheet(snap.ledger) },
  bull: { label: "Bull in/out or AI", icon: "beef", run: F("breeding-events", "serviceSheet") },
  scan: { label: "Scan result", icon: "search", run: F("breeding-events", "scanSheet") },
  move: { label: "Move to group", icon: "truck", run: F("move") },
  sale: { label: "Sale or kill sheet", icon: "money", run: F("sale") },
  housing: { label: "Housing", icon: "farm", run: F("move", "housingSheet") },
  purchase: { label: "Purchase", icon: "truck", run: F("purchase") },
  silage: { label: "Silage used", icon: "feed", run: (snap) => { location.hash = `#/l/${snap.lid}/feed`; } },
  add: { label: "Add an animal", icon: "plus", run: F("animal-edit", "addAnimalSheet") },
  btv: { label: "BTV-3 vaccine", icon: "syringe", run: (snap) => import("./flows/treatment.js").then((m) => m.default(snap, { reason: "BTV-3 vaccine" })) },
  money: { label: "Money", icon: "money", run: (snap) => openMoneySheet(snap.ledger) },
  medPurchase: { label: "Medicine bought", icon: "syringe", run: F("medicine-records", "medPurchaseSheet") },
  disposal: { label: "Medicine disposed", icon: "trash", run: F("medicine-records", "disposalSheet") },
  vetop: { label: "Castration / disbudding", icon: "syringe", run: F("vetop") },
};
// What the + offers on each screen (route prefix → entries). Today follows the season.
const FOCUS = {
  herd: ["add", "purchase", "weigh", "move", "sale", "death"],
  animal: ["treatment", "weigh", "move", "sale", "death"],
  groups: ["move", "housing"],
  finishing: ["weigh", "sale"],
  breeding: ["calving", "bull", "scan", "register"],
  "breeding/calving": ["calving"],
  "breeding/register": ["calving", "add"],
  paperwork: ["treatment", "medPurchase", "purchase", "move", "death", "calving"],
  "paperwork/medicine": ["treatment", "btv"],
  "paperwork/medpurchases": ["medPurchase"],
  "paperwork/disposal": ["disposal"],
  "paperwork/movements": ["purchase", "sale", "move"],
  "paperwork/deaths": ["death"],
  "paperwork/calvings": ["calving"],
  "paperwork/register": ["add", "register", "purchase"],
  "paperwork/vetops": ["vetop"],
  "paperwork/feedrecords": ["silage"],
  money: ["money"],
};
const ORDER = {
  calving: ["calving", "treatment", "register", "death", "weigh", "note"],
  breeding: ["bull", "scan", "treatment", "move", "weigh", "note"],
  grazing: ["bull", "scan", "treatment", "move", "weigh", "note"],
  sales: ["sale", "weigh", "treatment", "housing", "purchase", "note"],
  winter: ["treatment", "silage", "weigh", "calving", "death", "note"],
};
const REST = ["calving", "treatment", "weigh", "sale", "purchase", "move", "bull", "scan", "death", "btv", "add", "register", "housing", "silage", "note", "money"];

export default async function quickAdd(ctx) {
  const snap = await loadBeef(ctx.ledger);
  if (!canWrite(snap.role, "animals")) return quickAddSheet(ctx.ledger, canWrite(snap.role, "finance") ? [{ id: "money", label: "Money", icon: "money", run: () => openMoneySheet(snap.ledger) }] : []);
  const first = ORDER[modeFor(snap)] || ORDER.calving;
  const ids = [...first, ...REST.filter((k) => !first.includes(k))].filter((k) => k !== "money" || canWrite(snap.role, "finance"));
  const all = [...ids, "medPurchase", "disposal", "vetop"];
  const focus = focusFor(FOCUS, ctx.where) || first;
  return quickAddSheet(ctx.ledger, all.map((id) => ({ id, label: ITEMS[id].label, icon: ITEMS[id].icon, run: () => ITEMS[id].run(snap) })), { focus });
}
