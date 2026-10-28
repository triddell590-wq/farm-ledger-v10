// The single list of security-rule cases: who tries what, and whether it must be allowed.
// Expected results are written by hand from the intended policy (ARCHITECTURE.md §4), NOT
// derived from the model, so the model and the real rules are both tested against intent.
// Used by: model.test.mjs (JS model, runs now), emulator.test.mjs (real rules, needs the
// Firestore emulator), gen-matrix-md.mjs (writes tests/rules-matrix.md).

export const TOM = "Nul4LGSWD4Zclv0lLGYjynVq2QZ2";
export const U = { owner: "uOwner", manager: "uManager", worker: "uWorker", viewer: "uViewer", accountant: "uAccountant", stranger: "uStranger", other: "uOther", tom: TOM, anon: null };
export const TOKEN = "a".repeat(48);
const DAY = 86400000;
export const NOW = Date.now();
const future = (d) => new Date(NOW + d * DAY);
const L = "ledgers/L1";

// A photo's metadata doc (services/photo-codec.js photoDoc); money photos sit on finance records.
const photo = (parentColl, parentId, money, by = "uOwner") => ({ parentColl, parentId, money, parentLabel: parentColl, takenAt: "2026-10-27T09:00:00.000Z", w: 4, h: 3, bytes: 1, caption: "", chunkCount: 1, thumb: "data:image/jpeg;base64,x", mime: "image/jpeg", createdBy: by, createdAt: new Date(NOW - DAY), updatedBy: by, updatedAt: new Date(NOW - DAY) });

// Database state before every case (written with rules disabled).
export function seed() {
  const m = (uid, role) => ({ uid, role, addedAt: new Date(NOW - DAY), addedBy: U.owner, displayName: role, email: `${role}@x.test` });
  return {
    "users/uOwner": { displayName: "Owner", email: "owner@x.test" },
    "users/uOwner/devices/dOwner": { token: "tok-owner", platform: "android", tz: "Europe/London", prefs: {} },
    "users/uOwner/notifyLog/late-0001": { key: "late:L1:x", sentAt: new Date(NOW - DAY) },
    "ledgers/F1": { name: "Hill Farm", farmName: "Hill Farm", farmId: "F1", type: "farm", region: "NI", ownerUid: U.owner, createdAt: new Date(NOW - DAY) },
    "ledgers/F1/members/uOwner": m(U.owner, "owner"),
    [L]: { name: "Beef", farmName: "Hill Farm", farmId: "F1", type: "beef", region: "NI", ownerUid: U.owner, createdAt: new Date(NOW - DAY) },
    [`${L}/members/uOwner`]: m(U.owner, "owner"),
    [`${L}/members/uManager`]: m(U.manager, "manager"),
    [`${L}/members/uWorker`]: m(U.worker, "worker"),
    [`${L}/members/uViewer`]: m(U.viewer, "viewer"),
    [`${L}/members/uAccountant`]: m(U.accountant, "accountant"),
    [`${L}/animals/a1`]: { tag: "UK9 012345 701086", createdBy: U.owner, createdAt: new Date(NOW - DAY), updatedBy: U.owner, updatedAt: new Date(NOW - DAY) },
    [`${L}/finance/f1`]: { kind: "expense", amount: 100, createdBy: U.owner, createdAt: new Date(NOW - DAY), updatedBy: U.owner, updatedAt: new Date(NOW - DAY) },
    [`${L}/photos/p1`]: photo("animals", "a1", false),
    [`${L}/photos/p1/chunks/0`]: { n: 0, data: "x" },
    [`${L}/photos/pm1`]: photo("finance", "f1", true),
    [`${L}/photos/pm1/chunks/0`]: { n: 0, data: "x" },
    [`${L}/meta/keeper`]: { name: "T", herdNo: "123456" },
    [`${L}/private/boardFeed`]: { token: TOKEN },
    [`${L}/inviteIndex/CODEvalid0000000000000000`]: { role: "worker", createdBy: U.owner },
    "invites/CODEvalid0000000000000000": { ledgerId: "L1", role: "worker", createdBy: U.owner, createdAt: new Date(NOW - DAY), expiresAt: future(6), usedBy: null, usedAt: null },
    "invites/CODEexpired00000000000000": { ledgerId: "L1", role: "worker", createdBy: U.owner, createdAt: new Date(NOW - 9 * DAY), expiresAt: new Date(NOW - DAY), usedBy: null, usedAt: null },
    "invites/CODEused00000000000000000": { ledgerId: "L1", role: "manager", createdBy: U.owner, createdAt: new Date(NOW - DAY), expiresAt: future(6), usedBy: U.other, usedAt: new Date(NOW - 1000) },
    "invites/CODEmgr000000000000000000": { ledgerId: "L1", role: "manager", createdBy: U.owner, createdAt: new Date(NOW - DAY), expiresAt: future(6), usedBy: null, usedAt: null },
    "ledgers/L2": { name: "Other farm", farmName: "Other", farmId: "F2", type: "sheep", region: "NI", ownerUid: U.other, createdAt: new Date(NOW - DAY) },
    "ledgers/L2/members/uOther": m(U.other, "owner"),
    "ledgers/L2/animals/x1": { tag: "x", createdBy: U.other, updatedBy: U.other },
    [`boardFeed/${TOKEN}`]: { herd: [] },
    "farms/tomsfarm65748392": { herd: [] },
  };
}

const stamp = (uid) => ({ createdBy: uid, createdAt: new Date(NOW), updatedBy: uid, updatedAt: new Date(NOW) });
const upd = (uid, extra = {}) => ({ ...extra, updatedBy: uid, updatedAt: new Date(NOW) });

// Actions. Each returns { ops: [...] } for the acting uid. op: {type, path, data}
// types: get | list | set (create/overwrite) | update | delete | group (collection-group query on members with uid==me)
export const ACTIONS = {
  readLedger: { label: "Open the ledger", ops: () => [{ type: "get", path: L }] },
  listLedgers: { label: "List all ledgers", ops: () => [{ type: "list", path: "ledgers" }] },
  renameLedger: { label: "Rename the ledger", ops: () => [{ type: "update", path: L, data: { name: "Beef 2" } }] },
  binLedger: { label: "Move the ledger to Recently deleted", ops: (u) => [{ type: "update", path: L, data: { deletedAt: new Date(NOW), deletedBy: u } }] },
  changeType: { label: "Change ledger type", ops: () => [{ type: "update", path: L, data: { type: "sheep" } }] },
  deleteLedgerDoc: { label: "Delete the ledger document", ops: () => [{ type: "delete", path: L }] },
  readMembers: { label: "See who is on the ledger", ops: () => [{ type: "list", path: `${L}/members` }] },
  readAnimal: { label: "Read an animal record", ops: () => [{ type: "get", path: `${L}/animals/a1` }] },
  listAnimals: { label: "List animal records", ops: () => [{ type: "list", path: `${L}/animals` }] },
  addAnimal: { label: "Add an animal record", ops: (u) => [{ type: "set", path: `${L}/animals/new1`, data: { tag: "UK9 1", ...stamp(u) } }] },
  addAnimalSpoof: { label: "Add a record stamped as someone else", ops: () => [{ type: "set", path: `${L}/animals/new2`, data: { tag: "UK9 2", ...stamp(U.owner) } }] },
  editAnimal: { label: "Edit an animal record", ops: (u) => [{ type: "update", path: `${L}/animals/a1`, data: upd(u, { tag: "UK9 9" }) }] },
  editCreatedBy: { label: "Rewrite who created a record", ops: (u) => [{ type: "update", path: `${L}/animals/a1`, data: upd(u, { createdBy: U.other }) }] },
  softDelete: { label: "Soft-delete (mark deleted)", ops: (u) => [{ type: "update", path: `${L}/animals/a1`, data: upd(u, { deleted: true }) }] },
  hardDelete: { label: "Hard-delete a record", ops: () => [{ type: "delete", path: `${L}/animals/a1` }] },
  deleteSubRecord: { label: "Delete one part (chunk) of a photo", ops: () => [{ type: "delete", path: `${L}/photos/p1/chunks/0` }] },
  writeSubRecord: { label: "Write a part (chunk) of a photo", ops: () => [{ type: "set", path: `${L}/photos/p1/chunks/1`, data: { n: 1, data: "y" } }] },
  // photos: two kinds — on an ordinary record (money false) and on a money record (money true)
  readPhoto: { label: "Photos: open a photo on an animal record", ops: () => [{ type: "get", path: `${L}/photos/p1` }] },
  listPhotos: { label: "Photos: list record photos (where money == false)", ops: () => [{ type: "list", path: `${L}/photos`, where: [["money", "==", false]] }] },
  listPhotosForRecord: { label: "Photos: list one animal's photos (parentId + money == false)", ops: () => [{ type: "list", path: `${L}/photos`, where: [["parentId", "==", "a1"], ["money", "==", false]] }] },
  listAllPhotos: { label: "Photos: list every photo (no filter)", ops: () => [{ type: "list", path: `${L}/photos` }] },
  readPhotoChunk: { label: "Photos: load the image of a record photo", ops: () => [{ type: "get", path: `${L}/photos/p1/chunks/0` }] },
  readMoneyPhoto: { label: "Money photos: open a photo on a money record", ops: () => [{ type: "get", path: `${L}/photos/pm1` }] },
  listMoneyPhotos: { label: "Money photos: list (where money == true)", ops: () => [{ type: "list", path: `${L}/photos`, where: [["money", "==", true]] }] },
  readMoneyPhotoChunk: { label: "Money photos: load the image", ops: () => [{ type: "get", path: `${L}/photos/pm1/chunks/0` }] },
  addPhoto: {
    label: "Photos: add a photo to an animal record (doc + image chunk)", ops: (u) => [
      { type: "set", path: `${L}/photos/pnew`, data: { ...photo("animals", "a1", false, u), createdAt: new Date(NOW), updatedAt: new Date(NOW) } },
      { type: "set", path: `${L}/photos/pnew/chunks/0`, data: { n: 0, data: "x".repeat(1000) } }],
  },
  addMoneyPhoto: {
    label: "Money photos: add a photo to a money record", ops: (u) => [
      { type: "set", path: `${L}/photos/pmnew`, data: { ...photo("finance", "f1", true, u), createdAt: new Date(NOW), updatedAt: new Date(NOW) } },
      { type: "set", path: `${L}/photos/pmnew/chunks/0`, data: { n: 0, data: "x" } }],
  },
  addPhotoWrongFlag: {
    label: "Photos: add a money-record photo marked not-money", ops: (u) => [
      { type: "set", path: `${L}/photos/pbad`, data: { ...photo("finance", "f1", false, u), createdAt: new Date(NOW), updatedAt: new Date(NOW) } },
      { type: "set", path: `${L}/photos/pbad/chunks/0`, data: { n: 0, data: "x" } }],
  },
  addPhotoReservedParent: { label: "Photos: attach to a members doc", ops: (u) => [{ type: "set", path: `${L}/photos/pres`, data: { ...photo("members", u || "x", false, u), createdAt: new Date(NOW), updatedAt: new Date(NOW) } }] },
  addPhotoBigChunk: {
    label: "Photos: image chunk over 750,000 characters", ops: (u) => [
      { type: "set", path: `${L}/photos/pbig`, data: { ...photo("animals", "a1", false, u), createdAt: new Date(NOW), updatedAt: new Date(NOW) } },
      { type: "set", path: `${L}/photos/pbig/chunks/0`, data: { n: 0, data: "x".repeat(750001) } }],
  },
  captionPhoto: { label: "Photos: change a photo's caption", ops: (u) => [{ type: "update", path: `${L}/photos/p1`, data: upd(u, { caption: "Docket" }) }] },
  movePhoto: { label: "Photos: move a photo to a money record", ops: (u) => [{ type: "update", path: `${L}/photos/p1`, data: upd(u, { parentColl: "finance", money: true }) }] },
  deletePhoto: { label: "Photos: delete a record photo (chunk + doc)", ops: () => [{ type: "delete", path: `${L}/photos/p1/chunks/0` }, { type: "delete", path: `${L}/photos/p1` }] },
  deleteMoneyPhoto: { label: "Money photos: delete (chunk + doc)", ops: () => [{ type: "delete", path: `${L}/photos/pm1/chunks/0` }, { type: "delete", path: `${L}/photos/pm1` }] },
  readFinance: { label: "Read money records", ops: () => [{ type: "list", path: `${L}/finance` }] },
  addFinance: { label: "Add a money record", ops: (u) => [{ type: "set", path: `${L}/finance/new1`, data: { amount: 5, ...stamp(u) } }] },
  readMeta: { label: "Read keeper details (meta)", ops: () => [{ type: "get", path: `${L}/meta/keeper` }] },
  writeMeta: { label: "Change keeper details (meta)", ops: () => [{ type: "set", path: `${L}/meta/keeper`, data: { name: "Z" } }] },
  writeOpsMeta: { label: "Mark silage used today (meta/silage)", ops: () => [{ type: "set", path: `${L}/meta/silage`, data: { used: 1 } }] },
  writeSettingsMeta: { label: "Change ledger targets (meta/settings)", ops: () => [{ type: "set", path: `${L}/meta/settings`, data: { bcrs: 27 } }] },
  createFarmSpace: {
    label: "Create a farm space (type farm, farmId = its id)", ops: (u) => [
      { type: "set", path: "ledgers/FNEW", data: { name: "New Farm", farmName: "New Farm", farmId: "FNEW", type: "farm", region: "NI", ownerUid: u, createdAt: new Date(NOW) } },
      { type: "set", path: `ledgers/FNEW/members/${u}`, data: { uid: u, role: "owner", addedAt: new Date(NOW), addedBy: u } }],
  },
  createFarmSpaceBadId: {
    label: "Create a farm space pointing at another farm", ops: (u) => [
      { type: "set", path: "ledgers/FNEW", data: { name: "New Farm", farmName: "New Farm", farmId: "F1", type: "farm", region: "NI", ownerUid: u, createdAt: new Date(NOW) } },
      { type: "set", path: `ledgers/FNEW/members/${u}`, data: { uid: u, role: "owner", addedAt: new Date(NOW), addedBy: u } }],
  },
  readFarmSpace: { label: "Open the farm space (F1)", ops: () => [{ type: "get", path: "ledgers/F1" }] },
  farmFinance: { label: "Read whole-farm money (F1 finance)", ops: () => [{ type: "list", path: "ledgers/F1/finance" }] },
  readPrivate: { label: "Read Morning Board token (private)", ops: () => [{ type: "get", path: `${L}/private/boardFeed` }] },
  inviteWorker: {
    label: "Invite a worker", ops: (u) => [
      { type: "set", path: "invites/NEWinvite0000000000000000", data: { ledgerId: "L1", role: "worker", createdBy: u, createdAt: new Date(NOW), expiresAt: new Date(NOW + 7 * DAY), usedBy: null, usedAt: null } },
      { type: "set", path: `${L}/inviteIndex/NEWinvite0000000000000000`, data: { role: "worker", createdBy: u } }],
  },
  inviteManager: { label: "Invite a manager", ops: (u) => [{ type: "set", path: "invites/NEWinvite1111111111111111", data: { ledgerId: "L1", role: "manager", createdBy: u, createdAt: new Date(NOW), expiresAt: new Date(NOW + 7 * DAY), usedBy: null, usedAt: null } }] },
  inviteOwner: { label: "Invite an owner", ops: (u) => [{ type: "set", path: "invites/NEWinvite2222222222222222", data: { ledgerId: "L1", role: "owner", createdBy: u, createdAt: new Date(NOW), expiresAt: new Date(NOW + 7 * DAY), usedBy: null, usedAt: null } }] },
  inviteLong: { label: "Invite lasting 30 days", ops: (u) => [{ type: "set", path: "invites/NEWinvite3333333333333333", data: { ledgerId: "L1", role: "worker", createdBy: u, createdAt: new Date(NOW), expiresAt: new Date(NOW + 30 * DAY), usedBy: null, usedAt: null } }] },
  listInvites: { label: "List all invites", ops: () => [{ type: "list", path: "invites" }] },
  getInvite: { label: "Read an invite by its code", ops: () => [{ type: "get", path: "invites/CODEvalid0000000000000000" }] },
  readInviteIndex: { label: "See the ledger's open invites", ops: () => [{ type: "list", path: `${L}/inviteIndex` }] },
  revokeInvite: { label: "Cancel an invite", ops: () => [{ type: "delete", path: "invites/CODEvalid0000000000000000" }, { type: "delete", path: `${L}/inviteIndex/CODEvalid0000000000000000` }] },
  changeRole: { label: "Change someone's role (worker to viewer)", ops: (u) => [{ type: "update", path: `${L}/members/uWorker`, data: { role: "viewer", updatedAt: new Date(NOW), updatedBy: u } }] },
  promoteSelf: { label: "Make myself owner", ops: (u) => [{ type: "update", path: `${L}/members/${u}`, data: { role: "owner", updatedAt: new Date(NOW), updatedBy: u } }] },
  removeWorker: { label: "Remove the worker", ops: () => [{ type: "delete", path: `${L}/members/uWorker` }] },
  leave: { label: "Leave the ledger", ops: (u) => [{ type: "delete", path: `${L}/members/${u}` }] },
  readOtherLedger: { label: "Open someone else's ledger", ops: () => [{ type: "get", path: "ledgers/L2" }] },
  readOtherRecords: { label: "List someone else's records", ops: () => [{ type: "list", path: "ledgers/L2/animals" }] },
  myMemberships: { label: "Find my ledgers (members group query uid==me)", ops: () => [{ type: "group", path: "members", mine: true }] },
  allMemberships: { label: "Query everyone's memberships", ops: () => [{ type: "group", path: "members", mine: false }] },
  readOwnProfile: { label: "Read my profile", ops: (u) => [{ type: "get", path: `users/${u}` }] },
  readOwnerProfile: { label: "Read the owner's profile", ops: () => [{ type: "get", path: "users/uOwner" }] },
  addMyDevice: { label: "Notifications: save my phone (users/me/devices)", ops: (u) => [{ type: "set", path: `users/${u}/devices/dMine`, data: { token: "t", tz: "Europe/London", prefs: {} } }] },
  listMyDevices: { label: "Notifications: list my phones", ops: (u) => [{ type: "list", path: `users/${u}/devices` }] },
  readOwnerDevice: { label: "Notifications: read the owner's phone token", ops: () => [{ type: "get", path: "users/uOwner/devices/dOwner" }] },
  listOwnerDevices: { label: "Notifications: list the owner's phones", ops: () => [{ type: "list", path: "users/uOwner/devices" }] },
  writeOwnerDevice: { label: "Notifications: change the owner's phone", ops: () => [{ type: "set", path: "users/uOwner/devices/dOwner", data: { token: "stolen" } }] },
  deleteOwnerDevice: { label: "Notifications: remove the owner's phone", ops: () => [{ type: "delete", path: "users/uOwner/devices/dOwner" }] },
  writeMyLog: { label: "Notifications: write my notification log", ops: (u) => [{ type: "set", path: `users/${u}/notifyLog/late-0002`, data: { key: "late:L1:y", sentAt: new Date(NOW) } }] },
  readOwnerLog: { label: "Notifications: read the owner's notification log", ops: () => [{ type: "get", path: "users/uOwner/notifyLog/late-0001" }] },
  writeOwnerLog: { label: "Notifications: write the owner's notification log", ops: () => [{ type: "set", path: "users/uOwner/notifyLog/late-0009", data: { key: "x" } }] },
  devicesGroup: { label: "Notifications: query every phone (collection group)", ops: () => [{ type: "group", path: "devices", mine: false }] },
  boardGet: { label: "Morning Board: read with token", ops: () => [{ type: "get", path: `boardFeed/${TOKEN}` }] },
  boardList: { label: "Morning Board: list", ops: () => [{ type: "list", path: "boardFeed" }] },
  boardWrite: { label: "Morning Board: write", ops: () => [{ type: "set", path: `boardFeed/${TOKEN}`, data: { herd: [1] } }] },
  v9Read: { label: "Read v9 farm document", ops: () => [{ type: "get", path: "farms/tomsfarm65748392" }] },
  createLedger: {
    label: "Create a new ledger (+ my owner member doc)", ops: (u) => [
      { type: "set", path: "ledgers/NEW", data: { name: "Sheep", farmName: "F", farmId: "F9", type: "sheep", region: "NI", ownerUid: u, createdAt: new Date(NOW) } },
      { type: "set", path: `ledgers/NEW/members/${u}`, data: { uid: u, role: "owner", addedAt: new Date(NOW), addedBy: u } }],
  },
  createLedgerForOther: {
    label: "Create a ledger owned by someone else", ops: (u) => [
      { type: "set", path: "ledgers/NEW", data: { name: "Sheep", farmName: "F", farmId: "F9", type: "sheep", region: "NI", ownerUid: U.other, createdAt: new Date(NOW) } },
      { type: "set", path: `ledgers/NEW/members/${u}`, data: { uid: u, role: "owner", addedAt: new Date(NOW), addedBy: u } }],
  },
  createBadType: {
    label: "Create a ledger of unknown type", ops: (u) => [
      { type: "set", path: "ledgers/NEW", data: { name: "Goats", farmName: "F", farmId: "F9", type: "goats", region: "NI", ownerUid: u, createdAt: new Date(NOW) } },
      { type: "set", path: `ledgers/NEW/members/${u}`, data: { uid: u, role: "owner", addedAt: new Date(NOW), addedBy: u } }],
  },
  hijackOwner: { label: "Add myself as owner of an existing ledger", ops: (u) => [{ type: "set", path: `${L}/members/${u}`, data: { uid: u, role: "owner", addedAt: new Date(NOW), addedBy: u } }] },
  joinNoInvite: { label: "Add myself as worker without an invite", ops: (u) => [{ type: "set", path: `${L}/members/${u}`, data: { uid: u, role: "worker", addedAt: new Date(NOW), addedBy: u } }] },
  acceptValid: {
    label: "Accept a valid invite (worker)", ops: (u) => [
      { type: "set", path: `${L}/members/${u}`, data: { uid: u, role: "worker", addedAt: new Date(NOW), addedBy: U.owner, inviteCode: "CODEvalid0000000000000000" } },
      { type: "update", path: "invites/CODEvalid0000000000000000", data: { usedBy: u, usedAt: new Date(NOW) } }],
  },
  acceptWrongRole: {
    label: "Accept a worker invite as manager", ops: (u) => [
      { type: "set", path: `${L}/members/${u}`, data: { uid: u, role: "manager", addedAt: new Date(NOW), addedBy: U.owner, inviteCode: "CODEvalid0000000000000000" } },
      { type: "update", path: "invites/CODEvalid0000000000000000", data: { usedBy: u, usedAt: new Date(NOW) } }],
  },
  acceptNoMark: { label: "Accept without marking the invite used", ops: (u) => [{ type: "set", path: `${L}/members/${u}`, data: { uid: u, role: "worker", addedAt: new Date(NOW), addedBy: U.owner, inviteCode: "CODEvalid0000000000000000" } }] },
  acceptExpired: {
    label: "Accept an expired invite", ops: (u) => [
      { type: "set", path: `${L}/members/${u}`, data: { uid: u, role: "worker", addedAt: new Date(NOW), addedBy: U.owner, inviteCode: "CODEexpired00000000000000" } },
      { type: "update", path: "invites/CODEexpired00000000000000", data: { usedBy: u, usedAt: new Date(NOW) } }],
  },
  acceptUsed: {
    label: "Accept an invite already used", ops: (u) => [
      { type: "set", path: `${L}/members/${u}`, data: { uid: u, role: "manager", addedAt: new Date(NOW), addedBy: U.owner, inviteCode: "CODEused00000000000000000" } },
      { type: "update", path: "invites/CODEused00000000000000000", data: { usedBy: u, usedAt: new Date(NOW) } }],
  },
  transferOwnership: {
    label: "Hand the ledger to the manager", ops: (u) => [
      { type: "update", path: L, data: { ownerUid: U.manager } },
      { type: "update", path: `${L}/members/uManager`, data: { role: "owner", updatedAt: new Date(NOW), updatedBy: u } },
      { type: "update", path: `${L}/members/${u}`, data: { role: "manager", updatedAt: new Date(NOW), updatedBy: u } }],
  },
  deleteLedgerFinal: {
    label: "Final step of deleting a ledger (ledger + own member doc)", ops: (u) => [
      { type: "delete", path: L }, { type: "delete", path: `${L}/members/${u}` }],
  },
};

const ROLES5 = ["owner", "manager", "worker", "viewer", "accountant"];
const WHO = [...ROLES5, "stranger", "anon"];
// Expected: string of A (allow) / D (deny) in WHO order: owner manager worker viewer accountant stranger anon
const E = {
  readLedger:        "AAAAADD",
  listLedgers:       "DDDDDDD",
  renameLedger:      "AADDDDD",
  binLedger:         "ADDDDDD",
  changeType:        "DDDDDDD",
  deleteLedgerDoc:   "ADDDDDD",
  readMembers:       "AAAAADD",
  readAnimal:        "AAAADDD",
  listAnimals:       "AAAADDD",
  addAnimal:         "AAADDDD",
  addAnimalSpoof:    "ADDDDDD", // only the owner may stamp the owner's uid (it's their own)
  editAnimal:        "AAADDDD",
  editCreatedBy:     "DDDDDDD",
  softDelete:        "AAADDDD",
  hardDelete:        "AADDDDD",
  deleteSubRecord:   "AAADDDD", // photo parts follow the photo: whoever may write the parent record
  writeSubRecord:    "AAADDDD",
  readPhoto:         "AAAADDD",
  listPhotos:        "AAAADDD",
  listPhotosForRecord: "AAAADDD",
  listAllPhotos:     "AADDDDD", // others must filter on money so the rules can prove the list
  readPhotoChunk:    "AAAADDD",
  readMoneyPhoto:    "AADDADD",
  listMoneyPhotos:   "AADDADD",
  readMoneyPhotoChunk: "AADDADD",
  addPhoto:          "AAADDDD",
  addMoneyPhoto:     "AADDADD",
  addPhotoWrongFlag: "DDDDDDD",
  addPhotoReservedParent: "DDDDDDD",
  addPhotoBigChunk:  "DDDDDDD",
  captionPhoto:      "AAADDDD",
  movePhoto:         "DDDDDDD",
  deletePhoto:       "AAADDDD",
  deleteMoneyPhoto:  "AADDADD",
  readFinance:       "AADDADD",
  addFinance:        "AADDADD",
  readMeta:          "AAAADDD",
  writeMeta:         "AADDDDD", // keeper/settings/sign-offs: owner + manager only
  writeOpsMeta:      "AAADDDD", // day-to-day docs (silage, places, tbDay, calfChecks): workers too
  writeSettingsMeta: "AADDDDD",
  createFarmSpace:   "AAAAAAD",
  createFarmSpaceBadId: "DDDDDDD",
  readFarmSpace:     "ADDDDDD", // only F1's own members (here just the owner)
  farmFinance:       "ADDDDDD",
  readPrivate:       "ADDDDDD",
  inviteWorker:      "AADDDDD",
  inviteManager:     "ADDDDDD",
  inviteOwner:       "DDDDDDD",
  inviteLong:        "DDDDDDD",
  listInvites:       "DDDDDDD",
  getInvite:         "AAAAAAA", // anyone who knows the code (128-bit), so the preview shows before sign-up
  readInviteIndex:   "AADDDDD",
  revokeInvite:      "ADDDDDD", // creator (owner here) or owner; manager can't cancel the owner's invite
  changeRole:        "ADDDDDD",
  promoteSelf:       "DDDDDDD", // owner: already owner but role change on self to owner not allowed path; others never
  removeWorker:      "ADADDDD", // owner removes; the worker may remove themselves (leave)
  leave:             "DAAAADD", // owner cannot just leave; stranger/anon have nothing to leave
  readOtherLedger:   "DDDDDDD",
  readOtherRecords:  "DDDDDDD",
  myMemberships:     "AAAAAAD",
  allMemberships:    "DDDDDDD",
  readOwnProfile:    "AAAAAAD",
  readOwnerProfile:  "ADDDDDD",
  addMyDevice:       "AAAAAAD", // every signed-in person, own path only
  listMyDevices:     "AAAAAAD",
  readOwnerDevice:   "ADDDDDD", // a phone token is the owner's alone — not even a manager
  listOwnerDevices:  "ADDDDDD",
  writeOwnerDevice:  "ADDDDDD",
  deleteOwnerDevice: "ADDDDDD",
  writeMyLog:        "AAAAAAD",
  readOwnerLog:      "ADDDDDD",
  writeOwnerLog:     "ADDDDDD",
  devicesGroup:      "DDDDDDD", // only the Admin SDK (sender) reads all phones
  boardGet:          "AAAAAAA",
  boardList:         "DDDDDDD",
  boardWrite:        "DDDDDDD", // only Tom's UID (tested separately below)
  v9Read:            "DDDDDDD",
  createLedger:      "AAAAAAD",
  createLedgerForOther: "DDDDDDD",
  createBadType:     "DDDDDDD",
  hijackOwner:       "DDDDDDD", // owner already has a member doc -> this is an update to the same role... see note
  joinNoInvite:      "DDDDDDD",
  acceptValid:       "DDDDDAD", // only someone not yet a member (stranger)
  acceptWrongRole:   "DDDDDDD",
  acceptNoMark:      "DDDDDDD",
  acceptExpired:     "DDDDDDD",
  acceptUsed:        "DDDDDDD",
  transferOwnership: "ADDDDDD",
  deleteLedgerFinal: "ADDDDDD",
};

export const CASES = [];
for (const [action, exp] of Object.entries(E)) {
  WHO.forEach((who, i) => CASES.push({ id: `${action}:${who}`, action, who, uid: U[who], expect: exp[i] === "A" ? "allow" : "deny" }));
}
// Tom-specific cases (v9 legacy + Morning Board writer).
CASES.push({ id: "boardWrite:tom", action: "boardWrite", who: "tom", uid: TOM, expect: "allow" });
CASES.push({ id: "v9Read:tom", action: "v9Read", who: "tom", uid: TOM, expect: "allow" });
export { WHO, E as EXPECTED };
