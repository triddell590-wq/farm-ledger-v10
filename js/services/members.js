// People on a ledger: list, change role (owner only), remove (owner), leave (anyone but the owner).
import { store } from "../core/store.js";
import { auth } from "../core/auth.js";
import { ROLES } from "../core/policy.js";

export async function listMembers(lid) {
  const ms = await store.query(`ledgers/${lid}/members`);
  return ms.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || String(a.displayName || a.email).localeCompare(b.displayName || b.email));
}
export const watchMembers = (lid, cb, onErr) => store.watchQuery(`ledgers/${lid}/members`, {}, cb, onErr);
export const myMembership = (lid) => store.get(`ledgers/${lid}/members/${auth.user.uid}`);
export const watchMyMembership = (lid, cb, onErr) => store.watchDoc(`ledgers/${lid}/members/${auth.user.uid}`, cb, onErr);

export function changeRole(lid, uid, role) {
  if (role === "owner") throw new Error("Use transferOwnership to make someone the owner");
  return store.update(`ledgers/${lid}/members/${uid}`, { role, updatedAt: new Date(), updatedBy: auth.user.uid });
}
export const removeMember = (lid, uid) => store.remove(`ledgers/${lid}/members/${uid}`);
export const leaveLedger = (lid) => store.remove(`ledgers/${lid}/members/${auth.user.uid}`);
/** Keep my name/email on my member docs in step with my profile. */
export async function syncMyName(lids, displayName) {
  const b = store.batch();
  lids.forEach((lid) => b.update(`ledgers/${lid}/members/${auth.user.uid}`, { displayName, email: auth.user.email, updatedAt: new Date() }));
  if (b.size) await b.commit();
}
