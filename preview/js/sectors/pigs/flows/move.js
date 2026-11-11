// Movements (design/13 §7.5, §7.6, §20): Pigs in (opens or tops up a batch, writes the "on"
// move for PM1/PM2), Pigs out / ship (FCI, slap mark, haulier, feed-withdrawal check, the 7-day
// NIFAIS notification task, a task to add the kill sheet), and the small-herd "Pigs sold".
// Withdrawal periods block slaughter loads; a market in the last N days (shared rule content)
// is flagged. No £ on moves — sale money goes in finance (01-platform §15).
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField, checkRow, stepper } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { addDays } from "../model/dates.js";
import { entrySheet, chipsField, numField, dateField, timeField, warn, lawNote, batchPickRow, roomPickRow, nowHM } from "./common.js";
import { pigsIn, pigsOut, smallSale, undoAdd } from "../actions.js";
import { CATEGORIES, standstill, notifyDays } from "../model/paperwork.js";
import { shipBlocked, feedWithdrawCheck, batchName } from "../model/batches.js";
import { canFill } from "../model/rooms.js";
import { dm } from "../ui.js";

const LICENCE = "Moves follow DAERA's general licence for the movement of pigs — read its conditions on daera-ni.gov.uk.";
const places = (snap, dir) => [...new Set(snap.data.moves.filter((m) => m.direction === dir).map((m) => dir === "on" ? m.fromName : m.toName).filter(Boolean))].slice(0, 6);

export function pigsInSheet(snap, { roomId = null, batchId = null } = {}) {
  let rid = roomId;
  const open = snap.data.batches.filter((b) => !b.closed && (b.numberIn != null || b.inDate));
  const body = el(html`<form novalidate>
    <div class="form-group">${dateField("date", "Date in", snap.today)}<div class="field stepper-field"><span class="label">Number of pigs</span><span class="spacer"></span>${stepper("n", 0, { min: 0, max: 5000, step: 10, label: "Number of pigs" })}</div>
      ${chipsField("category", "Category", CATEGORIES.filter(([k]) => !["culls"].includes(k)), snap.s.breeding ? "gilts" : "weaners")}${numField("avgKg", "Average weight (kg)", "", { optional: true })}</div>
    <div class="form-group">${textField({ name: "fromCode", label: "From holding / herd mark", placeholder: "e.g. NI 5678" })}${textField({ name: "fromName", label: "Farm or market name", value: places(snap, "on")[0] || "" })}${checkRow("fromMarket", "Came through a market", false)}</div>
    <div class="form-group">${chipsField("markType", "ID mark", ["Slap mark", "Ear tag", "Tattoo"], "Slap mark")}${textField({ name: "mark", label: "Mark", placeholder: "on the pigs", optional: true })}${textField({ name: "haulier", label: "Haulier", optional: true })}${textField({ name: "vehicle", label: "Vehicle reg", optional: true })}</div>
    <div class="form-group" data-room></div>
    ${open.length ? html`<div class="form-group">${chipsField("batch", "Batch", [["new", `New batch B${snap.c.nextNo}`], ...open.map((b) => [b.id, `Add to ${batchName(b)}`])], batchId || "new")}</div>` : ""}
    ${snap.s.contract.on ? html`<div class="form-group">${textField({ name: "contractRef", label: `${snap.s.contract.integrator || "Integrator"} batch ref`, optional: true })}</div>` : ""}
    <div data-fill hidden class="form-group">${checkRow("fillAnyway", "Fill anyway", false, "The room isn't through its wash — this is recorded as an exception (BI.12)")}</div>
    ${lawNote(LICENCE)}</form>`);
  const room = roomPickRow(snap, { label: "Into room", id: rid, title: "Which room?", filter: (r) => !["farrowing", "service", "dry"].includes(r.kind) || snap.s.breeding, onChange: (v) => { rid = v; paint(); es.refresh(); } });
  body.querySelector("[data-room]").append(room.node);
  const paint = () => { const r = rid && snap.ix.rooms.get(rid); body.querySelector("[data-fill]").hidden = !r || r.batchId || canFill(r, snap.today); };
  const es = entrySheet({ title: "Pigs in", body, label: "Save pigs in",
    missing: (v) => { const r = rid && snap.ix.rooms.get(rid); return !+v.n ? "Add the number of pigs" : !v.fromCode && !v.fromName ? "Add where they came from" : !rid ? "Choose the room" : r && !r.batchId && !canFill(r, snap.today) && !v.fillAnyway ? "Room isn't ready — tick Fill anyway" : null; },
    save(v, sh) {
      const r = pigsIn(snap, { ...v, n: +v.n, avgKg: v.avgKg === "" ? undefined : +v.avgKg, roomId: rid, batchId: v.batch && v.batch !== "new" ? v.batch : null, fromMarket: !!v.fromMarket });
      sh.close(true, { force: true });
      toast(`${v.n} pigs in to ${snap.ix.rooms.get(rid).name}`, { action: "Undo", onAction: () => undoAdd(snap.lid, "moves", r.moveId) });
    } });
  es.form.onChange(paint); paint();
  return es.sheet.done;
}

export function pigsOutSheet(snap, { batchId = null, n = null, pens = null } = {}) {
  let bid = batchId; const b0 = bid && snap.ix.batches.get(bid);
  const plan = snap.data.tasks.find((t) => t.pig?.kind === "ship" && !t.done && (!bid || t.pig.batchId === bid));
  if (!bid && plan) bid = plan.pig.batchId;
  const toList = places(snap, "off");
  const body = el(html`<form novalidate>
    <div class="form-group" data-b></div>
    <div class="form-group"><div class="field stepper-field"><span class="label">Number of pigs</span><span class="spacer"></span>${stepper("n", n || plan?.pig.n || 0, { min: 0, max: 5000, step: 1, label: "Number of pigs" })}</div>
      ${chipsField("category", "Category", CATEGORIES, b0?.stage === "weaner" ? "weaners" : "finishers")}${dateField("date", "Date", plan?.due || snap.today)}${timeField("time", "Loading time", plan?.pig.loadAt?.slice(11, 16) || "06:00")}</div>
    <div class="form-group">${chipsField("dest", "Going to", [["slaughter", "Slaughter"], ["farm", "Another farm"], ["market", "Market"]], "slaughter")}
      ${textField({ name: "toName", label: "Abattoir / farm / market", value: toList[0] || "", placeholder: "Name" })}${textField({ name: "toCode", label: "Plant no. or holding code", optional: true })}</div>
    <div class="form-group">${chipsField("markType", "ID mark", ["Slap mark", "Ear tag", "Tattoo"], "Slap mark")}${textField({ name: "mark", label: "Slap mark", value: snap.s.herdMark || "", placeholder: "NI: one shoulder" })}</div>
    <div class="form-group">${textField({ name: "haulier", label: "Haulier" })}${textField({ name: "haulierAuth", label: "Haulier authorisation no.", optional: true })}${textField({ name: "vehicle", label: "Vehicle reg", optional: true })}</div>
    <div data-sl><p class="form-label">Food Chain Information</p><div class="form-group">${checkRow("fciWd", "All withdrawal periods observed", true)}${checkRow("fciDisease", "No disease on the farm that affects meat safety", true)}
      <div class="field"><label>Feed withdrawn at</label><input type="datetime-local" name="feedOff" value="${plan?.pig.withdrawAt || ""}"></div>
      <div class="field"><label>Arrival at the plant</label><input type="time" name="arrive" value=""></div>${numField("liveKg", "Total live weight (kg)", "", { optional: true })}</div></div>
    <div data-w></div>
    ${lawNote(`Notify moves off on NIFAIS within ${notifyDays(snap.ledger.region || "NI")} days. ${LICENCE}`)}</form>`);
  const bp = batchPickRow(snap, { label: "Batch", id: bid, title: "Which batch?", onChange: (v) => { bid = v; paint(); es.refresh(); } });
  body.querySelector("[data-b]").append(bp.node);
  const checks = (v) => {
    const w = []; const blk = bid ? shipBlocked({ id: bid }, snap.data.medicines, v.date || snap.today) : { blocked: false };
    if (v.dest === "slaughter" && blk.blocked) w.push(["late", `${batchName(snap.ix.batches.get(bid))} can't go for slaughter before ${dm(blk.until)} — withdrawal`]);
    const ss = bid && v.dest === "market" ? standstill(snap.data.moves, bid, v.date || snap.today, snap.ledger.region || "NI") : null;
    if (ss) w.push(["late", `Was at ${ss.market} on ${dm(ss.date)} — can't go to a market again until ${dm(ss.until)}`]);
    if (v.dest === "slaughter" && v.feedOff && v.time) { const load = `${v.date || snap.today}T${v.time}`; const arr = v.arrive ? `${v.arrive < v.time ? addDays(v.date || snap.today, 1) : v.date || snap.today}T${v.arrive}` : null; const c = feedWithdrawCheck(v.feedOff, load, arr); if (!c.ok) w.push(["due", c.text]); }
    const f = bid && snap.c.bf.get(bid); if (f && +v.n > f.onFarm) w.push(["due", `Only ${f.onFarm} pigs in ${batchName(snap.ix.batches.get(bid))}.`]);
    return w;
  };
  const paint = () => { const v = es.form.values(); body.querySelector("[data-sl]").hidden = v.dest !== "slaughter"; body.querySelector("[data-w]").replaceChildren(...checks(v).map(([, t]) => el(warn(t)))); };
  const es = entrySheet({ title: "Pigs out", body, label: "Save pigs out",
    missing: (v) => { if (!+v.n) return "Add the number of pigs"; if (!v.toName && !v.toCode) return "Add where they're going"; const late = checks(v).find(([l]) => l === "late"); if (late) return v.dest === "market" ? "Market standstill — can't go yet" : "Withdrawal — can't go for slaughter yet"; if (v.dest === "slaughter" && !v.fciWd) return "FCI: withdrawals must be observed"; return null; },
    save(v, sh) {
      const id = pigsOut(snap, { batchId: bid, roomId: snap.ix.batches.get(bid)?.roomId, n: +v.n, category: v.category, date: v.date || snap.today, time: v.time, toSlaughter: v.dest === "slaughter", toName: v.toName, toCode: v.toCode, markType: v.markType, mark: v.mark, haulier: v.haulier, haulierAuth: v.haulierAuth, vehicle: v.vehicle, fci: { withdrawals: !!v.fciWd, disease: v.fciDisease ? "No disease affecting meat safety" : "Declared — see note" }, feedWithdrawnAt: v.dest === "slaughter" ? v.feedOff || undefined : undefined, liveKg: v.liveKg === "" ? undefined : +v.liveKg, pens: pens || plan?.pig.pens });
      sh.close(true, { force: true });
      toast(`${v.n} pigs out · notify by ${dm(addDays(v.date || snap.today, notifyDays(snap.ledger.region || "NI")))}`, { action: "Undo", onAction: () => undoAdd(snap.lid, "moves", id) });
    } });
  es.form.onChange(paint); paint();
  return es.sheet.done;
}

/** Small herd: pigs sold (weaners or porkers). Money only for money roles. */
export function soldSheet(snap) {
  const money = canWrite(snap.role, "finance");
  const body = el(html`<form novalidate><div class="form-group">${dateField("date", "Date", snap.today)}<div class="field stepper-field"><span class="label">How many</span><span class="spacer"></span>${stepper("n", 1, { min: 1, max: 500, label: "How many" })}</div>
    ${chipsField("category", "What", [["weaners", "Weaners"], ["finishers", "Porkers / baconers"], ["sows", "Cull sow"], ["boars", "Boar"]], "finishers")}
    ${chipsField("to", "To", [["slaughter", "Abattoir"], ["farm", "Another keeper"]], "slaughter")}
    ${textField({ name: "toName", label: "Abattoir or buyer", placeholder: "Name" })}${textField({ name: "toCode", label: "Their herd mark", optional: true })}
    ${numField("liveKg", "Total live weight (kg)", "", { optional: true })}${money ? numField("amount", "Paid £", "", { optional: true }) : ""}</div>
    ${lawNote(`Notify the move on NIFAIS within ${notifyDays(snap.ledger.region || "NI")} days.`)}</form>`);
  entrySheet({ title: "Pigs sold", body, label: "Save sale", missing: (v) => (!v.toName && !v.toCode ? "Add who they went to" : null),
    save(v, sh) { const id = smallSale(snap, { ...v, n: +v.n, toSlaughter: v.to === "slaughter" }); sh.close(true, { force: true }); toast(`${v.n} pigs sold`, { action: "Undo", onAction: () => undoAdd(snap.lid, "moves", id) }); } });
}
export { nowHM };
