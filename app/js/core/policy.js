// Roles, sectors and who-may-do-what. Single table used by the UI (to hide what you
// cannot do) and by policy-rules.js (the JS model of firestore.rules). Keep in step
// with build/firebase/firestore.rules.

export const SECTORS = ["beef", "sheep", "dairy", "pigs", "layers", "broilers"]; // fixed order everywhere
// "farm" is the farm space: a hidden ledger holding farm-wide records (shared money, medicine
// store, map, documents). Its id is the farmId every sector ledger on that farm carries.
export const LEDGER_TYPES = ["farm", ...SECTORS];
export const SECTOR_NAMES = {
  beef: "Beef", sheep: "Sheep", dairy: "Dairy", pigs: "Pigs",
  layers: "Poultry – Layers", broilers: "Poultry – Broilers",
};
export const REGIONS = ["NI", "ENG", "SCO", "WAL"];
export const REGION_NAMES = { NI: "Northern Ireland", ENG: "England", SCO: "Scotland", WAL: "Wales" };
export const ACTIVE_REGIONS = ["NI"]; // others are content-only later

export const ROLES = ["owner", "manager", "worker", "viewer", "accountant"];
export const ROLE_NAMES = { owner: "Owner", manager: "Manager", worker: "Worker", viewer: "Viewer", accountant: "Accountant" };
export const ROLE_HELP = {
  owner: "Everything, including deleting the ledger and handing it on.",
  manager: "Everything day to day, including money and inviting helpers.",
  worker: "Records animals, treatments and jobs. Doesn't see money.",
  viewer: "Can look at records but not change them. Doesn't see money.",
  accountant: "Sees and edits the money side only.",
};

export const FINANCE = "finance";
export const RESERVED = ["members", "private", "meta", "inviteIndex"];
const READ_ALL = ["owner", "manager", "worker", "viewer"];
const WRITE_OPS = ["owner", "manager", "worker"];
const MONEY = ["owner", "manager", "accountant"];

export function canRead(role, coll) {
  if (!role) return false;
  if (coll === FINANCE) return MONEY.includes(role);
  if (coll === "members") return true;
  if (coll === "private") return role === "owner";
  if (coll === "inviteIndex") return ["owner", "manager"].includes(role);
  return READ_ALL.includes(role);
}
export function canWrite(role, coll) {
  if (!role) return false;
  if (coll === FINANCE) return MONEY.includes(role);
  if (coll === "private") return role === "owner";
  if (coll === "members") return false; // handled by member actions below
  return WRITE_OPS.includes(role);
}
export function canHardDelete(role, coll) { return !RESERVED.includes(coll) && ["owner", "manager"].includes(role); }
export function canEditLedger(role) { return ["owner", "manager"].includes(role); }
export function canDeleteLedger(role) { return role === "owner"; }
export function canChangeRoles(role) { return role === "owner"; }
export function invitableRoles(role) {
  if (role === "owner") return ["manager", "worker", "viewer", "accountant"];
  if (role === "manager") return ["worker", "viewer", "accountant"];
  return [];
}
export const INVITE_MAX_DAYS = 14;
// meta/{doc} a Worker may write (day-to-day). Everything else in meta (settings, targets, keeper,
// checklist sign-offs) is owner/manager only. Keep in step with firestore.rules.
export const META_WORKER = ["silage", "places", "tbDay", "calfChecks"];
export function canWriteMeta(role, doc) { return ["owner", "manager"].includes(role) || (role === "worker" && META_WORKER.includes(doc)); }
