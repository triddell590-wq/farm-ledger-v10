// What needs doing across ledgers, as notification items (services/notify-core.js shape).
// The ONE place the notification centre, the "became late" check and the sender
// (build/notify/send.mjs, Node + firebase-admin store adapter) get alerts and jobs from: each
// sector's own alerts(ledger, role) and tasks(ledger) plus the hand-made tasks due today.
// Nothing here touches the DOM, so it runs unchanged in Node.
import { sectorModule } from "../sectors/ui.js";
import { todaysTasks } from "./tasks.js";
import { todayStr } from "../core/dates.js";
import { itemsFrom } from "./notify-core.js";

/** Items for one sector ledger ({ ...ledger, role }). Errors in one sector never stop the rest. */
export async function ledgerItems(ledger, { today = todayStr() } = {}) {
  if (!ledger || ledger.type === "farm") return [];
  const mod = await sectorModule(ledger.type);
  const [alerts, gen, manual] = await Promise.all([
    mod.alerts ? mod.alerts(ledger, ledger.role).catch(() => []) : [],
    mod.tasks ? mod.tasks(ledger).catch(() => []) : [],
    todaysTasks([ledger]).catch(() => []),
  ]);
  const tasks = [...gen.map((t) => ({ ...t, key: t.id })), ...manual.filter((t) => !t.done).map((t) => ({ ...t, key: `task:${t.id}` }))];
  return itemsFrom(ledger, alerts, tasks, today);
}

/** Items for many ledgers, in the ledgers' order. */
export async function allItems(ledgers, opts) {
  const lists = await Promise.all(ledgers.filter((l) => l.type !== "farm").map((l) => ledgerItems(l, opts).catch(() => [])));
  return lists.flat();
}
