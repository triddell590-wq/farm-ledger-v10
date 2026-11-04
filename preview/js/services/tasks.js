// Tasks ("To do today"): ledgers/{lid}/tasks/{id} = { title, due 'YYYY-MM-DD', done, doneAt, doneBy,
// doneByName, note, money? (money-side task, shown to accountants) }. Ticking on the Overview
// or in the ledger is the same record (design/01 §15.3).
import { addRecord, updateRecord, listRecords } from "./records.js";
import { auth } from "../core/auth.js";
import { todayStr } from "../core/dates.js";
import { canRead } from "../core/policy.js";

export function addTask(lid, { title, due = todayStr(), note = "", money = false }) {
  return addRecord(lid, "tasks", { title, due, note, money, done: false });
}
export function setDone(lid, task, done) {
  const u = auth.user;
  return updateRecord(lid, "tasks", task, done ? { done: true, doneAt: new Date(), doneBy: u.uid, doneByName: u.displayName || u.email } : { done: false, doneAt: null, doneBy: null, doneByName: null }, { history: false });
}
/** Today's tasks for a set of ledgers: due today or overdue and not done, plus done today. */
export async function todaysTasks(ledgers) {
  const today = todayStr(); const out = [];
  await Promise.all(ledgers.map(async (l) => {
    if (!canRead(l.role, "tasks")) return;
    let list = [];
    try { list = await listRecords(l.id, "tasks"); } catch (e) { return; }
    for (const t of list) {
      if (l.role === "accountant" && !t.money) continue;
      if (t.sourceRef && !t.done) continue; // a generated job ticked then unticked: the ledger's own list shows it
      const doneToday = t.done && t.doneAt && todayStr(new Date(t.doneAt)) === today;
      if ((!t.done && t.due && t.due <= today) || doneToday) out.push({ ...t, ledger: l });
    }
  }));
  return out.sort((a, b) => (a.done - b.done) || String(a.due).localeCompare(String(b.due)) || String(a.title).localeCompare(b.title));
}
