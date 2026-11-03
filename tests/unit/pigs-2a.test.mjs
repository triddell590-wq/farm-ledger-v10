// Pigs wave 2A (B #12, #23, #24): small herd = legal minimum unless assured; honest cost of production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pigSettings } from "../../app/js/sectors/pigs/model/settings.js";
import { missingCostLines, costPerPigSold } from "../../app/js/sectors/pigs/model/money.js";
import { quickAddIds } from "../../app/js/sectors/pigs/quick-add.js";

test("small herd defaults to the legal minimum; ticking 'I'm Red Tractor assured' brings the rest back", () => {
  const small = pigSettings({ settings: { sows: 3 } }, {});
  assert.equal(small.smallHerd, true); assert.equal(small.assured, false); assert.equal(small.legalOnly, true);
  assert.equal(pigSettings({ settings: { sows: 3 } }, { assured: true }).legalOnly, false);
  const big = pigSettings({ settings: { sows: 300 } }, {}); assert.equal(big.assured, true); assert.equal(big.legalOnly, false);
  assert.ok(!quickAddIds("small", "owner", small).includes("alarm"));
  assert.ok(quickAddIds("breeding", "owner", big).includes("alarm"));
});
test("cost of production lists the cost lines not recorded", () => {
  const rows = [{ kind: "expense", category: "Feed", amount: 220425 }, { kind: "expense", category: "Medicine", amount: 0 }, { kind: "revenue", category: "Livestock Sales", amount: 5 }];
  assert.deepEqual(missingCostLines(rows), ["Vet and medicine", "Labour", "Power and fuel", "Bedding", "Repairs", "Rent, rates and insurance"]);
});
test("small herd cost per pig is per pig sold", () => {
  assert.equal(costPerPigSold(420, 6), 70); assert.equal(costPerPigSold(420, 0), null);
});
