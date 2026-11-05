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
