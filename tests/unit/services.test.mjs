// Platform services against the in-memory store WITH the rules model enforced.
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshEnv, denied } from "./env.mjs";
import { createLedger, listMine, groupByFarm, deleteLedger, transferOwnership } from "../../app/js/services/ledgers.js";
import { createInvite, readInvite, acceptInvite, listInvites, revokeInvite } from "../../app/js/services/invites.js";
import { listMembers, changeRole, removeMember, leaveLedger } from "../../app/js/services/members.js";
import { addRecord, listRecords, updateRecord, softDelete, hardDelete } from "../../app/js/services/records.js";
import { deleteAccount } from "../../app/js/services/account.js";
import { exportLedger, toCSV } from "../../app/js/services/export.js";
import { store } from "../../app/js/core/store.js";
import { inviteCode, normaliseCode, groupCode } from "../../app/js/core/ids.js";

const tick = () => new Promise((r) => setTimeout(r, 5));

async function farmWithBeef(env) {
  await env.as("tom");
  const beef = await createLedger({ type: "beef", farmName: "Drumlin Farm" });
  const mine = await listMine();
  return { beef, farmId: mine.find((l) => l.id === beef).farmId, mine };
}
async function invite(env, lid, role, by = "tom", who = "sean") {
  await env.as(by);
  const l = (await listMine()).find((x) => x.id === lid);
  const code = await createInvite(l, role, l.role);
  await env.as(who);
  await acceptInvite(code);
  return code;
}

test("invite codes are >= 128 bits from the readable alphabet", () => {
  const c = inviteCode();
  assert.equal(c.length, 26); assert.match(c, /^[2-9A-HJKMNP-Z]+$/);
  assert.ok(26 * Math.log2(31) >= 128);
  assert.equal(normaliseCode(groupCode(c).toLowerCase()), c);
});

test("create ledger makes a farm space + ledger + owner memberships; Overview groups them", async () => {
  const env = freshEnv();
  const { beef, farmId, mine } = await farmWithBeef(env);
  assert.equal(mine.length, 2);
  assert.deepEqual(mine.map((l) => [l.type, l.role]), [["farm", "owner"], ["beef", "owner"]]);
  const farms = groupByFarm(mine);
  assert.equal(farms.length, 1); assert.equal(farms[0].farmName, "Drumlin Farm"); assert.equal(farms[0].ledgers[0].id, beef); assert.equal(farms[0].space.id, farmId);
});

test("invite -> accept gives exactly the invited role; the code works once", async () => {
  const env = freshEnv();
  const { beef } = await farmWithBeef(env);
  const code = await invite(env, beef, "worker");
  const mine = await listMine();
  assert.deepEqual(mine.map((l) => [l.id, l.role]), [[beef, "worker"]]);
  await env.as("jane");
  assert.equal((await readInvite(code)).state, "used");
  await assert.rejects(acceptInvite(code), (e) => e.code === "invite/used");
});

test("a manager cannot invite a manager; worker cannot invite", async () => {
  const env = freshEnv();
  const { beef } = await farmWithBeef(env);
  await invite(env, beef, "manager", "tom", "mo");
  await env.as("mo");
  const l = (await listMine())[0];
  await assert.rejects(createInvite(l, "manager", "manager"));
  const code = await createInvite(l, "worker", "manager");
  assert.equal(code.length, 26);
  await invite(env, beef, "worker", "tom", "sean");
  await env.as("sean");
  await assert.rejects(createInvite({ ...l }, "viewer", "worker"));
  assert.ok(await denied(store.set(`invites/${inviteCode()}`, { ledgerId: beef, role: "viewer", createdBy: env.users.sean, expiresAt: new Date(Date.now() + 86400000), usedBy: null })));
});

test("roles: worker and vet see no money; accountant sees only money", async () => {
  const env = freshEnv();
  const { beef } = await farmWithBeef(env);
  await env.as("tom");
  addRecord(beef, "finance", { kind: "expense", amount: 10, category: "Feed", date: "2026-10-01" });
  addRecord(beef, "animals", { tag: "UK9 123456 700012" });
  await tick();
  await invite(env, beef, "worker", "tom", "sean");
  await invite(env, beef, "viewer", "tom", "jane");
  await invite(env, beef, "accountant", "tom", "mark");
  await env.as("sean");
  assert.ok(await denied(listRecords(beef, "finance")));
  assert.equal((await listRecords(beef, "animals")).length, 1);
  await env.as("jane");
  assert.ok(await denied(listRecords(beef, "finance")));
  assert.ok(await denied(store.set(`ledgers/${beef}/animals/x`, { tag: "x", createdBy: env.users.jane, updatedBy: env.users.jane })));
  await env.as("mark");
  assert.equal((await listRecords(beef, "finance")).length, 1);
  assert.ok(await denied(listRecords(beef, "animals")));
});

test("worker soft-deletes but cannot hard-delete; history is kept on edit", async () => {
  const env = freshEnv();
  const { beef } = await farmWithBeef(env);
  await invite(env, beef, "worker");
  await env.as("sean");
  const id = addRecord(beef, "animals", { tag: "UK9 1", name: "Bella" }); await tick();
  const rec = (await listRecords(beef, "animals"))[0];
  await updateRecord(beef, "animals", rec, { name: "Bella 2" });
  const after = (await listRecords(beef, "animals"))[0];
  assert.equal(after.history.length, 1); assert.equal(after.history[0].before.name, "Bella");
  await softDelete(beef, "animals", id);
  assert.equal((await listRecords(beef, "animals")).length, 0);
  assert.equal((await listRecords(beef, "animals", { includeDeleted: true })).length, 1);
  assert.ok(await denied(store.remove(`ledgers/${beef}/animals/${id}`)));
  await env.as("tom");
  await hardDelete(beef, "animals", id);
  assert.equal((await listRecords(beef, "animals", { includeDeleted: true })).length, 0);
});

test("owner changes role, removes; member leaves; owner can't leave", async () => {
  const env = freshEnv();
  const { beef } = await farmWithBeef(env);
  await invite(env, beef, "worker");
  await env.as("tom");
  await changeRole(beef, env.users.sean, "viewer");
  assert.equal((await listMembers(beef)).find((m) => m.uid === env.users.sean).role, "viewer");
  await removeMember(beef, env.users.sean);
  assert.equal((await listMembers(beef)).length, 1);
  assert.ok(await denied(leaveLedger(beef)));
  await invite(env, beef, "worker", "tom", "jane");
  await leaveLedger(beef); // jane leaves
  await env.as("tom");
  assert.equal((await listMembers(beef)).length, 1);
});

test("invites can be listed by the ledger's owner and cancelled", async () => {
  const env = freshEnv();
  const { beef } = await farmWithBeef(env);
  const l = (await listMine()).find((x) => x.id === beef);
  const code = await createInvite(l, "viewer", "owner", 7, "Jane");
  let list = await listInvites(beef);
  assert.equal(list.length, 1); assert.equal(list[0].state, "open"); assert.equal(list[0].forName, "Jane");
  await revokeInvite(beef, code);
  list = await listInvites(beef);
  assert.equal(list.length, 0);
  await env.as("jane");
  await assert.rejects(acceptInvite(code), (e) => e.code === "invite/missing");
});

test("hand over ownership: new owner, old owner becomes manager", async () => {
  const env = freshEnv();
  const { beef } = await farmWithBeef(env);
  await invite(env, beef, "manager", "tom", "mo");
  await env.as("tom");
  await transferOwnership(beef, env.users.mo);
  const ms = await listMembers(beef);
  assert.equal(ms.find((m) => m.uid === env.users.mo).role, "owner");
  assert.equal(ms.find((m) => m.uid === env.users.tom).role, "manager");
  assert.equal((await store.get(`ledgers/${beef}`)).ownerUid, env.users.mo);
});

test("deleteLedger leaves no documents under the ledger and cancels its invites", async () => {
  const env = freshEnv();
  const { beef } = await farmWithBeef(env);
  await invite(env, beef, "worker");
  await env.as("tom");
  for (let i = 0; i < 5; i++) addRecord(beef, "animals", { tag: "UK9 " + i });
  addRecord(beef, "finance", { amount: 1, kind: "expense" });
  const { savePhoto } = await import("../../app/js/services/photos.js");
  savePhoto(beef, { coll: "animals", id: "a1", label: "Animal" }, { b64: "eWVz", w: 4, h: 3, bytes: 3, thumb: "data:image/jpeg;base64,eA==" });
  savePhoto(beef, { coll: "finance", id: "f1", label: "Receipt" }, { b64: "eWVz", w: 4, h: 3, bytes: 3, thumb: "" });
  await tick();
  assert.equal(env.under(`ledgers/${beef}/photos`).length, 4, "two photos + one chunk each");
  await store.set(`ledgers/${beef}/meta/keeper`, { name: "T" });
  await store.set(`ledgers/${beef}/private/boardFeed`, { token: "t".repeat(48) });
  const l = (await listMine()).find((x) => x.id === beef);
  const open = await createInvite(l, "viewer", "owner");
  assert.ok(env.under(`ledgers/${beef}`).length > 10);
  await deleteLedger(beef);
  assert.deepEqual(env.under(`ledgers/${beef}`), []);
  assert.equal(env.db.raw.has(`invites/${open}`), false);
});

test("delete account: leaves joined ledgers, hands over or deletes owned ones, removes profile", async () => {
  const env = freshEnv();
  const { beef, farmId } = await farmWithBeef(env);
  await env.as("tom");
  const sheep = await createLedger({ type: "sheep", farmId, farmName: "Drumlin Farm" });
  await store.set(`users/${env.users.tom}`, { displayName: "Tom" });
  await invite(env, beef, "manager", "tom", "mo");
  // Tom also joins Eve's farm as a worker
  await env.as("eve");
  const eveL = await createLedger({ type: "pigs", farmName: "Eve's" });
  await invite(env, eveL, "worker", "eve", "tom");
  await env.as("tom");
  await deleteAccount("password123", () => {}, { [beef]: { handTo: env.users.mo } });
  assert.deepEqual(env.under(`ledgers/${sheep}`), []);
  assert.deepEqual(env.under(`ledgers/${farmId}`), []);
  assert.equal(env.db.raw.has(`users/${env.users.tom}`), false);
  assert.equal(env.db.raw.get(`ledgers/${beef}`).ownerUid, env.users.mo);
  assert.equal(env.db.raw.has(`ledgers/${beef}/members/${env.users.tom}`), false);
  assert.equal(env.db.raw.has(`ledgers/${eveL}/members/${env.users.tom}`), false);
});

test("export includes only what the role may read; CSV escapes", async () => {
  const env = freshEnv();
  const { beef } = await farmWithBeef(env);
  addRecord(beef, "finance", { kind: "expense", amount: 10 }); addRecord(beef, "animals", { tag: "UK9 1", note: 'Said "hi", left' });
  await tick();
  await invite(env, beef, "worker");
  await env.as("sean");
  const l = (await listMine())[0];
  const x = await exportLedger(l);
  assert.equal(x.collections.finance, undefined);
  assert.equal(x.collections.animals.length, 1);
  const csv = toCSV(x.collections.animals, [["tag", "Tag"], ["note", "Note"]]);
  assert.equal(csv, 'Tag,Note\r\nUK9 1,"Said ""hi"", left"');
});
