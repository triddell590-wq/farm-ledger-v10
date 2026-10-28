// Quick add (design/11 §2.2): ordered by the current stage of the sheep year; everything is
// always there underneath.
import { loadSheep } from "./data.js";
import { quickAddSheet, taskSheet, focusFor } from "../generic.js";
import { canWrite } from "../../core/policy.js";
import { openMoneySheet } from "../../ui/money-sheet.js";

const F = (file, fn = "default") => async (snap, extra) => (await import(`./flows/${file}.js`))[fn](snap, extra);
export const FLOWS = {
  raddle: { label: "Raddle check", icon: "edit", run: F("tallies", "raddleSheet") },
  treat: { label: "Treat a mob", icon: "syringe", run: F("dose", "doseSheet") },
  move: { label: "Move mob", icon: "map", run: F("events", "fieldMoveSheet") },
  lame: { label: "Lame count", icon: "alert", run: F("tallies", "lameSheet") },
  death: { label: "Death", icon: "alert", run: F("events", "deathSheet") },
  note: { label: "Note or job", icon: "edit", run: (snap) => taskSheet(snap.ledger) },
  scan: { label: "Scan results", icon: "search", run: F("tallies", "scanSheet") },
  bcs: { label: "BCS tally", icon: "grid", run: F("tallies", "bcsSheet") },
  shed: { label: "Open lambing shed", icon: "birth", run: (snap) => { location.hash = `#/l/${snap.lid}/shed`; } },
  deadLamb: { label: "Dead lamb", icon: "alert", run: F("events", "deadLambSheet") },
  field: { label: "Move to field", icon: "map", run: F("events", "fieldMoveSheet") },
  fec: { label: "FEC result", icon: "search", run: F("dose", "fecSheet") },
  weigh: { label: "Weigh lambs", icon: "scale", run: F("weigh", "weighSheet") },
  draft: { label: "Draft & sell", icon: "truck", run: F("move", "sellSheet") },
  cull: { label: "Cull check", icon: "check", run: F("events", "cullSheet") },
  buy: { label: "Buy in", icon: "truck", run: F("move", "buyInSheet") },
  offMove: { label: "Move off the farm", icon: "truck", run: F("move", "moveOffSheet") },
  tag: { label: "Tag lambs", icon: "tag", run: F("tagging", "tagSheet") },
  btv: { label: "BTV-3 vaccine", icon: "syringe", run: (snap) => import("./flows/dose.js").then((m) => m.doseSheet(snap, { reason: "BTV-3 vaccine" })) },
  ramsIn: { label: "Rams in / out", icon: "sheep", run: F("events", "ramsSheet") },
  wean: { label: "Weaning count", icon: "check", run: F("events", "weanSheet") },
  newMob: { label: "New mob", icon: "plus", run: F("mob-edit", "newMobSheet") },
  money: { label: "Money", icon: "money", run: (snap) => openMoneySheet(snap.ledger) },
};
export const ORDER = {
  tupping: ["raddle", "treat", "move", "lame", "death", "note"],
  scanning: ["scan", "treat", "move", "bcs", "death", "note"],
  lambing: ["shed", "deadLamb", "treat", "field", "death", "note"],
  grazing: ["treat", "fec", "lame", "weigh", "move", "note"],
  weaning: ["draft", "weigh", "cull", "buy", "move", "note"],
};
const REST = ["raddle", "scan", "shed", "treat", "fec", "lame", "bcs", "weigh", "draft", "offMove", "buy", "tag", "cull", "deadLamb", "death", "move", "ramsIn", "btv", "newMob", "note", "money"];
export function quickAddIds(stage, role) {
  const first = ORDER[stage] || ORDER.tupping;
  return [...first, ...REST.filter((k) => !first.includes(k) && !(k === "field" && first.includes("move")) && !(k === "move" && first.includes("field")))].filter((k) => k !== "money" || canWrite(role, "finance"));
}
export default async function quickAdd(ctx) {
  const snap = await loadSheep(ctx.ledger);
  if (!canWrite(snap.role, "events")) return quickAddSheet(ctx.ledger, canWrite(snap.role, "finance") ? [{ id: "money", label: "Money", icon: "money", run: () => openMoneySheet(snap.ledger) }] : []);
  const FOCUS = {
    mobs: ["newMob", "move", "treat", "weigh", "draft", "death"], mob: ["treat", "move", "weigh", "lame", "death"],
    paperwork: ["treat", "death", "offMove", "buy", "tag", "btv"], "paperwork/medicine": ["treat", "btv"], "paperwork/deaths": ["death", "deadLamb"],
    "paperwork/movements": ["offMove", "buy", "draft"], "paperwork/tagging": ["tag"], rams: ["ramsIn"], worms: ["fec", "treat"], money: ["money"],
  };
  const focus = focusFor(FOCUS, ctx.where) || ORDER[snap.stage.stage] || ORDER.tupping;
  return quickAddSheet(ctx.ledger, quickAddIds(snap.stage.stage, snap.role).map((id) => ({ id, label: FLOWS[id].label, icon: FLOWS[id].icon, run: () => FLOWS[id].run(snap) })), { focus });
}
/** Run a flow by id with a fresh snapshot (used by buttons on boards). */
export async function runFlow(id, ledger, extra) { const snap = await loadSheep(ledger); return FLOWS[id].run(snap, extra); }
