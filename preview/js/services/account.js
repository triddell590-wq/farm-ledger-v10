// Delete my account (UK GDPR right to erasure). Ledgers I own are deleted with everything in
// them (the screen lists them and who else uses them first, and offers to hand them over);
// ledgers I was invited to, I leave. Then my profile, then the sign-in itself.
import { store } from "../core/store.js";
import { auth } from "../core/auth.js";
import { listMine, deleteLedger, transferOwnership } from "./ledgers.js";
import { leaveLedger, listMembers } from "./members.js";
import { removeAllNotifyData } from "./devices.js";

/** What deleting would do: { owned: [{ledger, others: n}], joined: [ledger] } */
export async function deletionPlan() {
  const mine = await listMine();
  const owned = []; const joined = [];
  for (const l of mine) {
    if (l.role === "owner") owned.push({ ledger: l, others: (await listMembers(l.id)).filter((m) => m.uid !== auth.user.uid).length });
    else joined.push(l);
  }
  return { owned, joined };
}

/**
 * choices: { [ledgerId]: { handTo: uid } } for ledgers to hand over instead of deleting.
 * Order: hand over (I become manager) and leave those; leave joined ledgers; delete owned
 * sector ledgers, then farm spaces; then my profile; then the sign-in.
 */
export async function deleteAccount(password, onProgress = () => {}, choices = {}) {
  await auth.reauthenticate(password);
  const { owned, joined } = await deletionPlan();
  for (const { ledger } of owned) {
    const c = choices[ledger.id];
    if (c && c.handTo) { onProgress(`Handing over ${ledger.name}…`); await transferOwnership(ledger.id, c.handTo); joined.push(ledger); }
  }
  for (const l of joined) { onProgress(`Leaving ${l.name}…`); await leaveLedger(l.id); }
  const toDelete = owned.filter(({ ledger }) => !(choices[ledger.id] && choices[ledger.id].handTo));
  // Sector ledgers before farm spaces (a farm space is just another ledger, but delete it last).
  toDelete.sort((a, b) => (a.ledger.type === "farm") - (b.ledger.type === "farm"));
  for (const { ledger } of toDelete) { onProgress(`Deleting ${ledger.name}…`); await deleteLedger(ledger.id); }
  onProgress("Deleting your profile…");
  await removeAllNotifyData(auth.user.uid).catch(() => {}); // phones + notification log (users/{uid}/devices, notifyLog)
  await store.remove(`users/${auth.user.uid}`);
  onProgress("Deleting your sign-in…");
  await auth.deleteUser();
}
