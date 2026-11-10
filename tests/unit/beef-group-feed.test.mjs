// Herd → Groups feed (Tom, 5 Nov): a feed group linked to a herd group feeds whoever is in it now;
// older feed groups (picked cattle) are found by name or by exactly the same cattle.
import test from "node:test";
import assert from "node:assert/strict";
import { feedMembers, feedForGroup, mealToday, feedEaten } from "../../app/js/sectors/beef/model/feed.js";

const animals = [{ id: "a", groupId: "g1" }, { id: "b", groupId: "g1" }, { id: "c", groupId: "g2" }, { id: "d", groupId: "g1", offDate: "2026-01-01" }];
const data = { animals };
const ration = [{ from: "2026-11-01", meal: 4, silage: 20, blocks: 0, every: 1 }];

test("a linked feed group follows the herd group's members", () => {
  const fg = { id: "f", groupId: "g1", animalIds: ["c"], rations: ration };
  assert.deepEqual(feedMembers(fg, data).sort(), ["a", "b", "d"]);
  assert.equal(mealToday([fg], [], data, "2026-11-05").kg, 8); // d is sold: 2 head × 4 kg
  assert.equal(feedEaten([fg], [], data, "2026-11-04", "2026-11-05", 0).meal, 16);
});
test("an unlinked feed group still feeds its picked cattle", () => {
  assert.deepEqual(feedMembers({ animalIds: ["c"] }, data), ["c"]);
  assert.equal(mealToday([{ id: "f", animalIds: ["c"], rations: ration }], [], data, "2026-11-05").kg, 4);
});
test("finding a herd group's feed: linked first, then same name, then same cattle", () => {
  const g1 = { id: "g1", name: "Shed 2 finishers" };
  const byCattle = { id: "x", name: "Finishers", animalIds: ["b", "a"] };
  const byName = { id: "y", name: "shed 2 finishers ", animalIds: [] };
  const linked = { id: "z", name: "Other", groupId: "g1" };
  assert.equal(feedForGroup([byCattle], g1, data).id, "x");
  assert.equal(feedForGroup([byCattle, byName], g1, data).id, "y");
  assert.equal(feedForGroup([byCattle, byName, linked], g1, data).id, "z");
  assert.equal(feedForGroup([{ ...linked, deleted: true }], g1, data), null);
  assert.equal(feedForGroup([{ id: "w", name: "x", animalIds: ["a"] }], g1, data), null); // only some of the cattle
});

// Whole-group rations (Tom, 10 Nov): the group's total a day is entered; per head is worked out.
import { rationDay } from "../../app/js/sectors/beef/model/feed.js";
test("a whole-group ration splits across the cattle there that day", () => {
  const r = { from: "2026-11-01", mealGroup: 30, silageGroup: 150, meal: 10, silage: 50 }; // per-head copies are ignored
  assert.deepEqual(rationDay(r, 3, 0), { meal: 30, silage: 150, mealHead: 10, silageHead: 50 });
  assert.deepEqual(rationDay(r, 0, 0), { meal: 0, silage: 0, mealHead: 0, silageHead: 0 });
  const fg = { id: "f", groupId: "g1", rations: [r] };
  const t = mealToday([fg], [], data, "2026-11-05");
  assert.equal(t.kg, 30); assert.equal(t.silage, 150); assert.equal(t.rows[0].perHead, 15); assert.equal(t.rows[0].silageHead, 75); // 2 head on farm
});
test("older per-head rations and grab blocks still work", () => {
  assert.equal(rationDay({ meal: 4, silage: 20 }, 2, 0).meal, 8);
  assert.equal(rationDay({ meal: 4, silage: 20 }, 2, 0).silage, 40);
  assert.equal(rationDay({ blocks: 2, every: 2 }, 5, 600).silage, 600);
  assert.equal(rationDay({ blocks: 2, every: 1 }, 5, 600).silageHead, 240);
});
