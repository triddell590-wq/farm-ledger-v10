// JS model of build/firebase/firestore.rules. Used by the in-memory store so tests see the
// same allow/deny as Firestore, and by tests/rules/model.test.mjs against the shared matrix.
// It is a model, not the real thing: the emulator test (tests/rules/emulator.test.mjs) is
// the proof. Keep both in step.
import { RESERVED, LEDGER_TYPES, REGIONS, INVITE_MAX_DAYS, META_WORKER } from "./policy.js";

const TOM = "Nul4LGSWD4Zclv0lLGYjynVq2QZ2";
const RECORD_READ = (c) => (c === "finance" ? ["owner", "manager", "accountant"] : ["owner", "manager", "worker", "viewer"]);
const RECORD_WRITE = (c) => (c === "finance" ? ["owner", "manager", "accountant"] : ["owner", "manager", "worker"]);

function changedKeys(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
}
const only = (keys, allowed) => keys.every((k) => allowed.includes(k));
const any = (keys, banned) => keys.some((k) => banned.includes(k));
const ms = (v) => (v instanceof Date ? v.getTime() : v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : NaN);

/**
 * ctx: { op: 'get'|'list'|'create'|'update'|'delete', path, uid (or null), now: Date,
 *        get(path)->data|null (state before the write/batch), getAfter(path)->data|null (after) }
 * returns true/false
 */
export function allowed(ctx) {
  const { op, path, uid } = ctx;
  const seg = path.split("/");
  const signedIn = !!uid;
  const before = ctx.get(path);
  const after = op === "create" || op === "update" ? ctx.getAfter(path) : null;
  const memberOf = (lid) => (signedIn ? ctx.get(`ledgers/${lid}/members/${uid}`) : null);
  const roleIn = (lid) => memberOf(lid)?.role || null;
  const hasRole = (lid, roles) => roles.includes(roleIn(lid));
  const now = ms(ctx.now || new Date());
  const isRead = op === "get" || op === "list";

  // users/{uid}
  if (seg[0] === "users" && seg.length === 2) return signedIn && uid === seg[1];
  // users/{uid}/devices/{id} and users/{uid}/notifyLog/{id}: that person only (sender = Admin SDK)
  if (seg[0] === "users" && seg.length === 4 && (seg[2] === "devices" || seg[2] === "notifyLog")) return signedIn && uid === seg[1];

  // boardFeed/{token}
  if (seg[0] === "boardFeed" && seg.length === 2) {
    if (op === "get") return true;
    if (op === "list") return false;
    return signedIn && uid === TOM && seg[1].length >= 40;
  }
  // farms/** (v9 legacy)
  if (seg[0] === "farms") return signedIn && uid === TOM;

  // invites/{code}
  if (seg[0] === "invites" && seg.length === 2) {
    const code = seg[1];
    if (op === "get") return true; // code holders only (unguessable); preview before sign-up
    if (op === "list") return false;
    if (op === "create") {
      const d = after;
      if (!signedIn || code.length < 20 || d.createdBy !== uid || d.usedBy != null) return false;
      const exp = ms(d.expiresAt);
      if (!(exp > now && exp < now + (INVITE_MAX_DAYS + 1) * 86400000)) return false;
      const r = roleIn(d.ledgerId);
      if (r === "owner") return ["manager", "worker", "viewer", "accountant"].includes(d.role);
      if (r === "manager") return ["worker", "viewer", "accountant"].includes(d.role);
      return false;
    }
    if (!before) return false; // update/delete of a missing invite: resource is null, rule errors -> deny
    if (op === "update") {
      if (!signedIn || before.usedBy != null || !(ms(before.expiresAt) > now)) return false;
      if (!only(changedKeys(before, after), ["usedBy", "usedAt"])) return false;
      if (after.usedBy !== uid) return false;
      return ctx.getAfter(`ledgers/${before.ledgerId}/members/${uid}`)?.inviteCode === code;
    }
    if (op === "delete") return signedIn && (before.createdBy === uid || hasRole(before.ledgerId, ["owner"]));
    return false;
  }

  // collection-group query over members (Overview)
  if (seg[0] === "**members") return signedIn && ctx.doc?.uid === uid;

  if (seg[0] !== "ledgers") return false;
  const lid = seg[1];
  const ledgerPath = `ledgers/${lid}`;

  // ledgers/{lid}
  if (seg.length === 2) {
    if (op === "get") return !!memberOf(lid);
    if (op === "list") return false;
    if (op === "create") {
      const d = after;
      return signedIn && d.ownerUid === uid && LEDGER_TYPES.includes(d.type) && REGIONS.includes(d.region)
        && typeof d.farmId === "string" && (d.type !== "farm" || d.farmId === lid)
        && typeof d.name === "string" && d.name.length > 0 && d.name.length <= 80
        && ctx.getAfter(`${ledgerPath}/members/${uid}`)?.role === "owner";
    }
    if (op === "update") {
      if (!hasRole(lid, ["owner", "manager"])) return false;
      const ch = changedKeys(before, after);
      if (any(ch, ["type", "createdAt", "farmId"])) return false;
      if (any(ch, ["deletedAt", "deletedBy"]) && roleIn(lid) !== "owner") return false;
      if (!ch.includes("ownerUid")) return true;
      const to = after.ownerUid;
      return roleIn(lid) === "owner" && !!ctx.get(`${ledgerPath}/members/${to}`)
        && ctx.getAfter(`${ledgerPath}/members/${to}`)?.role === "owner"
        && ctx.getAfter(`${ledgerPath}/members/${uid}`)?.role !== "owner";
    }
    if (op === "delete") return hasRole(lid, ["owner"]);
    return false;
  }

  const coll = seg[2];

  // members
  if (coll === "members" && seg.length === 4) {
    const m = seg[3];
    if (isRead) return !!memberOf(lid) || (signedIn && (before || {}).uid === uid);
    if (op === "create") {
      const d = after;
      if (!signedIn || m !== uid || d.uid !== m || !ctx.getAfter(ledgerPath)) return false;
      if (d.role === "owner") return !ctx.get(ledgerPath) && ctx.getAfter(ledgerPath)?.ownerUid === uid;
      if (typeof d.inviteCode !== "string") return false;
      const inv = ctx.get(`invites/${d.inviteCode}`);
      return !!inv && inv.ledgerId === lid && inv.usedBy == null && ms(inv.expiresAt) > now
        && inv.role === d.role && ctx.getAfter(`invites/${d.inviteCode}`)?.usedBy === uid;
    }
    if (op === "update") {
      if (!memberOf(lid)) return false;
      const ch = changedKeys(before, after);
      const r = roleIn(lid);
      if (r === "owner" && m !== uid && only(ch, ["role", "updatedAt", "updatedBy"])
        && ["manager", "worker", "viewer", "accountant"].includes(after.role)) return true;
      if (r === "owner" && only(ch, ["role", "updatedAt", "updatedBy"])) {
        const la = ctx.getAfter(ledgerPath);
        if (m !== uid && after.role === "owner" && la?.ownerUid === m) return true;
        if (m === uid && after.role === "manager" && la && la.ownerUid !== uid) return true;
      }
      return m === uid && only(ch, ["displayName", "email", "updatedAt"]);
    }
    if (op === "delete") {
      if (!memberOf(lid)) return false;
      const r = roleIn(lid);
      return (r === "owner" && m !== uid) || (m === uid && r !== "owner") || (m === uid && !ctx.getAfter(ledgerPath));
    }
    return false;
  }

  if (coll === "private" && seg.length === 4) return hasRole(lid, ["owner"]);
  if (coll === "inviteIndex" && seg.length === 4) {
    if (isRead || op === "delete") return hasRole(lid, ["owner", "manager"]);
    return hasRole(lid, ["owner", "manager"]) && after.createdBy === uid;
  }
  if (coll === "meta" && seg.length === 4) {
    if (isRead) return hasRole(lid, ["owner", "manager", "worker", "viewer"]);
    return hasRole(lid, ["owner", "manager"]) || (hasRole(lid, ["worker"]) && META_WORKER.includes(seg[3]));
  }
  // photos: follow the parent record's visibility through the `money` flag (photo-codec.js)
  if (coll === "photos") return photoRule(ctx, lid, seg, roleIn(lid), before, after);
  if (RESERVED.includes(coll)) return false;

  // ordinary records
  if (seg.length === 4) {
    if (isRead) return hasRole(lid, RECORD_READ(coll));
    if (op === "create") return hasRole(lid, RECORD_WRITE(coll)) && after.updatedBy === uid && after.createdBy === uid;
    if (op === "update") {
      return hasRole(lid, RECORD_WRITE(coll)) && after.updatedBy === uid
        && !any(changedKeys(before, after), ["createdBy", "createdAt"]);
    }
    if (op === "delete") return hasRole(lid, ["owner", "manager"]);
  }
  if (seg.length === 6) {
    if (isRead) return hasRole(lid, RECORD_READ(coll));
    if (op === "delete") return hasRole(lid, ["owner", "manager"]);
    return hasRole(lid, RECORD_WRITE(coll));
  }
  return false;
}

// ---- photos (ledgers/{lid}/photos/{pid} and .../chunks/{n}) — keep in step with firestore.rules
const CHUNK_MAX = 750000;
const sees = (r, d) => r === "owner" || r === "manager" || (r === "accountant" && d?.money === true) || ((r === "worker" || r === "viewer") && d?.money === false);
const writes = (r, d) => r === "owner" || r === "manager" || (r === "accountant" && d?.money === true) || (r === "worker" && d?.money === false);
function validPhoto(d, uid) {
  return typeof d.parentColl === "string" && d.parentColl.length > 0 && d.parentColl.length <= 40
    && !RESERVED.includes(d.parentColl) && d.parentColl !== "photos"
    && typeof d.parentId === "string" && d.parentId.length > 0 && d.parentId.length <= 200
    && d.money === (d.parentColl === "finance")
    && Number.isInteger(d.chunkCount) && d.chunkCount >= 1 && d.chunkCount <= 8
    && (d.thumb == null || (typeof d.thumb === "string" && d.thumb.length <= 100000))
    && (d.caption == null || (typeof d.caption === "string" && d.caption.length <= 300))
    && d.createdBy === uid && d.updatedBy === uid;
}
function photoRule(ctx, lid, seg, r, before, after) {
  const { op, uid } = ctx;
  if (!r) return false;
  if (seg.length === 4) {
    if (op === "get") return sees(r, before);
    if (op === "list") return sees(r, ctx.doc);
    if (op === "create") return writes(r, after) && validPhoto(after, uid);
    if (op === "update") return writes(r, before) && after.updatedBy === uid
      && only(changedKeys(before, after), ["caption", "updatedAt", "updatedBy"]);
    if (op === "delete") return writes(r, before);
    return false;
  }
  if (seg.length === 6 && seg[4] === "chunks") {
    const photoPath = seg.slice(0, 4).join("/");
    if (op === "get" || op === "list" || op === "delete") return (op === "delete" ? writes : sees)(r, ctx.get(photoPath));
    const d = after;
    return writes(r, ctx.getAfter(photoPath)) && typeof d.data === "string" && d.data.length <= CHUNK_MAX
      && Number.isInteger(d.n) && d.n >= 0 && d.n < 8 && only(Object.keys(d), ["n", "data"]);
  }
  return false;
}
