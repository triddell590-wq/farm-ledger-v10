// One medicine store (review A #9): the farm store and each ledger's list agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeStores, storeLedgers } from "../../app/js/services/med-store.js";

test("farm products first; ledger products added once, labelled with their ledger; same name = the farm's", () => {
  const farm = [{ id: "f1", name: "Draxxin", wdMeat: 49 }, { id: "f2", name: "Old", deleted: true }];
  const beef = { ledger: { id: "b", name: "Beef", type: "beef" }, products: [{ id: "b1", name: "draxxin ", wdMeat: 99 }, { id: "b2", name: "Ivomec Super", wdMeat: 66 }] };
  const dairy = { ledger: { id: "d", name: "Dairy", type: "dairy" }, products: [{ id: "d1", name: "Ivomec  super" }, { id: "d2", name: "Synulox LC" }] };
  const m = mergeStores(farm, [beef, dairy]);
  assert.deepEqual(m.map((p) => p.id), ["f1", "b2", "d2"]);
  assert.equal(m[0].wdMeat, 49); assert.ok(!m[0].local);
  assert.equal(m[1].ledgerName, "Beef"); assert.equal(m[1].lid, "b"); assert.ok(m[1].local);
  // a plain list (one ledger's own products)
  assert.deepEqual(mergeStores(farm, [{ id: "x", name: "Pen & Strep" }]).map((p) => p.id), ["f1", "x"]);
});
test("only Beef and Dairy ledgers on the same farm the person can read count", () => {
  const ls = [{ id: "s", type: "farm", farmId: "F", role: "owner" }, { id: "b", type: "beef", farmId: "F", role: "owner" }, { id: "d", type: "dairy", farmId: "F", role: "accountant" }, { id: "p", type: "pigs", farmId: "F", role: "owner" }, { id: "b2", type: "beef", farmId: "G", role: "owner" }];
  assert.deepEqual(storeLedgers(ls, "F").map((l) => l.id), ["b"]);
});
