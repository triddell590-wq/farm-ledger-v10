// Margin cards (Tom, 10 Nov): every ledger's Today shows its money card to the owner; beef shows
// feed cost a head and margin over feed on Today, Groups, Feed & silage and Money. No errors.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedBeef } from "./beef-seed.mjs";
import { seedSheep } from "./sheep-seed.mjs";
import { seedDairy } from "./dairy-seed.mjs";
import { seedPigs } from "./pigs-seed.mjs";
import { seedLayers } from "./layers-seed.mjs";
import { seedBroilers } from "./broilers-seed.mjs";

let env;
before(async () => { env = await H.setup(); });
after(async () => { await env.close(); });

const TODAY = [["sheep", seedSheep, "flock"], ["dairy", seedDairy, "milking"], ["pigs", seedPigs, "week"], ["layers", seedLayers, "houses"], ["broilers", seedBroilers, "crop"]];
for (const [type, seed, tab] of TODAY) {
  test(`${type}: the money card is on Today and opens Money`, async () => {
    const p = await H.phone(env, { verified: true }); const errors = []; p.on("pageerror", (e) => errors.push(String(e)));
    await H.signUp(p, { email: `mc-${type}@x.test` }); await H.onboard(p, { types: [type] });
    const lid = await seed(p);
    await H.go(p, `/l/${lid}/${tab}`); await H.settle(p, 400);
    const card = p.locator(".screen:last-child .money-card");
    assert.equal(await card.count(), 1, `${type}: one money card`);
    const href = await card.getAttribute("href"); assert.match(href, new RegExp(`^#/l/${lid}/`));
    await H.go(p, href.slice(1)); await H.settle(p, 400);
    assert.doesNotMatch(await p.locator(".screen:last-child").textContent(), /Not found|You can't open this/);
    assert.deepEqual(errors, []);
    await p.context().close();
  });
}

test("beef: feed cost and margin on Today, Groups, Feed & silage and Money; prices saved", async () => {
  const p = await H.phone(env, { verified: true }); const errors = []; p.on("pageerror", (e) => errors.push(String(e)));
  await H.signUp(p, { email: "mc-beef@x.test" }); await H.onboard(p, { types: ["beef"] });
  const lid = await seedBeef(p);
  await p.evaluate(async (lid) => {
    const { listRecords, addRecord, updateRecord } = await import("./js/services/records.js");
    const animals = (await listRecords(lid, "animals")).filter((a) => !a.offDate).slice(0, 4).map((a) => a.id);
    await addRecord(lid, "feedGroups", { name: "Test finishers", animalIds: animals, rations: [{ from: "2020-01-01", mealGroup: 20, silageGroup: 100, meal: 5, silage: 25 }] });
    const prices = { perKgDead: 6, pricePerTonne: 300, silagePerTonne: 40 };
    const old = (await listRecords(lid, "finance")).find((e) => e.id === "beef-prices");
    if (old) await updateRecord(lid, "finance", old, prices); else await addRecord(lid, "finance", { kind: "prices", source: "beef", ...prices }, "beef-prices");
  }, lid);
  await H.go(p, `/l/${lid}/feed`); await H.settle(p, 500);
  let t = (await p.locator(".screen:last-child").textContent()).replace(/\s+/g, " ");
  assert.match(t, /Feed cost and margin/); assert.match(t, /Test finishers/);
  assert.match(t, /£2\.50 a head a day/, "20 kg meal × £300/t + 100 kg silage × £40/t = £10 a day ÷ 4 head");
  assert.match(t, /never added to Money/);
  await H.go(p, `/l/${lid}/today`); await H.settle(p, 500);
  const tc = (await p.locator(".screen:last-child .money-card").textContent()).replace(/\s+/g, " "); assert.match(tc, /Feed ?£[\d.,]+ a day/); assert.match(tc, /Margin over feed/); // all the groups together
  await H.go(p, `/l/${lid}/money`); await H.settle(p, 500);
  assert.match(await p.locator(".screen:last-child").textContent(), /Feed groups: cost and margin/);
  await H.go(p, `/l/${lid}/targets#fodder`); await H.settle(p, 500);
  assert.match(p.url(), /targets#fodder$/, "a page#spot link opens that page");
  assert.doesNotMatch(await p.locator(".screen:last-child").textContent(), /Not found/);
  assert.deepEqual(errors, []);
  await p.context().close();
});
