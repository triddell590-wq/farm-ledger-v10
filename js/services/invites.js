// Invites (share links). A code is 26 characters from a 31-letter readable alphabet drawn with
// crypto.getRandomValues: >= 128 bits, so it cannot be guessed (core/ids.js). invites/{code} can be read by
// anyone signed in who has the code, never listed. Each ledger keeps inviteIndex/{code} so its
// owner/manager can see and cancel open invites, and so deleting the ledger removes them.
import { store } from "../core/store.js";
import { auth } from "../core/auth.js";
import { inviteCode, normaliseCode } from "../core/ids.js";
import { invitableRoles, INVITE_MAX_DAYS } from "../core/policy.js";

export const DEFAULT_DAYS = 7;

/** Create an invite. ledger = {id, name, farmName, type}, myRole = my role on it. Returns the code. */
export async function createInvite(ledger, role, myRole, days = DEFAULT_DAYS, forName = "") {
  if (!invitableRoles(myRole).includes(role)) throw new Error(`A ${myRole} cannot invite a ${role}`);
  days = Math.min(Math.max(1, days), INVITE_MAX_DAYS);
  const u = auth.user; const code = inviteCode();
  const now = new Date(); const expiresAt = new Date(now.getTime() + days * 86400000);
  const b = store.batch();
  b.set(`invites/${code}`, {
    ledgerId: ledger.id, ledgerName: ledger.name, farmName: ledger.farmName || "", type: ledger.type, role,
    createdBy: u.uid, createdByName: u.displayName || u.email, createdAt: now, expiresAt, usedBy: null, usedAt: null, forName,
  });
  b.set(`ledgers/${ledger.id}/inviteIndex/${code}`, { role, createdBy: u.uid, createdByName: u.displayName || u.email, createdAt: now, expiresAt, forName, days });
  await b.commit();
  return code;
}

/** The link to share. Works under /farm-ledger/ because it is built from the current page. */
export function inviteLink(code, base = location.href.split("#")[0].split("?")[0]) { return `${base}#/invite/${code}`; }

/** Read an invite by its code: { ...invite, state: 'ok'|'used'|'expired'|'missing' }. */
export async function readInvite(code) {
  code = normaliseCode(code);
  const inv = await store.get(`invites/${code}`);
  if (!inv) return { state: "missing" };
  if (inv.usedBy) return { ...inv, state: inv.usedBy === auth.user?.uid ? "mine" : "used" };
  if (!(new Date(inv.expiresAt) > new Date())) return { ...inv, state: "expired" };
  return { ...inv, state: "ok" };
}

/** Accept: create my member doc with the invite's role and mark the invite used, in one batch. */
export async function acceptInvite(code) {
  code = normaliseCode(code);
  const inv = await readInvite(code);
  if (inv.state === "mine") return inv.ledgerId;
  if (inv.state !== "ok") { const e = new Error(inv.state); e.code = "invite/" + inv.state; throw e; }
  const u = auth.user; const now = new Date();
  const b = store.batch();
  b.set(`ledgers/${inv.ledgerId}/members/${u.uid}`, { uid: u.uid, role: inv.role, addedAt: now, addedBy: inv.createdBy, displayName: u.displayName || "", email: u.email || "", inviteCode: code });
  b.update(`invites/${code}`, { usedBy: u.uid, usedAt: now });
  await b.commit();
  return inv.ledgerId;
}

/** Open (and recently used) invites for a ledger, newest first. Owner/manager only. */
export async function listInvites(lid) {
  const idx = await store.query(`ledgers/${lid}/inviteIndex`, { orderBy: [["createdAt", "desc"]] });
  return Promise.all(idx.map(async (i) => {
    const inv = await store.get(`invites/${i.id}`).catch(() => null);
    const state = !inv ? "cancelled" : inv.usedBy ? "used" : new Date(inv.expiresAt) > new Date() ? "open" : "expired";
    return { ...i, code: i.id, state, usedBy: inv?.usedBy || null };
  }));
}

/** Cancel an invite (its creator or the ledger owner). Removes the index entry too. */
export async function revokeInvite(lid, code) {
  const b = store.batch();
  if (await store.get(`invites/${code}`).catch(() => null)) b.remove(`invites/${code}`);
  b.remove(`ledgers/${lid}/inviteIndex/${code}`);
  await b.commit();
}
