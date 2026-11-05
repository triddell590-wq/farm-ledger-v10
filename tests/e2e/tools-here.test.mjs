// "Tools for this" (Tom, 5 Nov): every sector's More tools show on the screens they belong to; each
// chip opens a working tool whose back link returns to that screen. No errors anywhere.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedSheep } from "./sheep-seed.mjs";
import { seedDairy } from "./dairy-seed.mjs";
import { seedPigs } from "./pigs-seed.mjs";
import { seedLayers } from "./layers-seed.mjs";
import { seedBroilers } from "./broilers-seed.mjs";

const SECTORS = [
  ["sheep", seedSheep, ["flock", "mobs", "year", "worms", "shed"]],
  ["dairy", seedDairy, ["milking", "cows", "fertility", "milk", "feed", "slurry", "calves", "paperwork"]],
  ["pigs", seedPigs, ["week", "sows", "rooms", "batches", "pigs-paperwork"]],
  ["layers", seedLayers, ["houses", "flock", "eggs", "health", "range", "lighting"]],
  ["broilers", seedBroilers, ["crop", "growth", "crops", "contract", "paperwork/register"]],
];

let env;
before(async () => { env = await H.setup(); });
after(async () => { await env.close(); });

for (const [type, seed, screens] of SECTORS) {
  test(`${type}: tools on their screens, each opens and comes back`, async () => {
    const p = await H.phone(env, { verified: true }); const errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    await H.signUp(p, { email: `tools-${type}@x.test` }); await H.onboard(p, { types: [type] });
    const lid = await seed(p);
    let shown = 0;
    for (const where of screens) {
      await H.go(p, `/l/${lid}/${where}`); await H.settle(p, 300);
      const chips = await p.locator(".screen:last-child .tool-links a.chip").evaluateAll((as) => as.map((a) => [a.textContent.trim(), a.getAttribute("href")]));
      assert.ok(chips.length, `${type} ${where}: no tools strip`);
      shown += chips.length;
      for (const [label, href] of chips) {
        await H.go(p, href.slice(1)); await H.settle(p, 300);
        const body = (await p.locator(".screen:last-child").textContent()).replace(/\s+/g, " ");
        assert.doesNotMatch(body, /Tool not found|That tool doesn't exist|You can't open this/, `${type} ${where} → ${label}`);
        if (/\/tools\//.test(href)) {
          const back = await p.locator(".screen:last-child .back-link").first().getAttribute("href");
          assert.equal(back, `#/l/${lid}/${where}`, `${type} ${where} → ${label}: back link`);
        }
      }
    }
    assert.deepEqual(errors, [], `${type}: page errors`);
    assert.ok(shown >= screens.length);
    await p.context().close();
  });
}
