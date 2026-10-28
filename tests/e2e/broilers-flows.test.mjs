// Broilers ledger: the most-used entry flows, end to end on the in-memory backend (design/15
// §3, §4, §6.2, §7, §8, §10, §18).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedBroilers } from "./broilers-seed.mjs";

let env, p, lid, houses, crops;
before(async () => {
  env = await H.setup(); p = await H.phone(env, { verified: true });
  await H.signUp(p, { email: "broilers-flows@x.test" }); await H.onboard(p, { types: ["broilers"] });
  lid = await seedBroilers(p);
  houses = await recs("houses"); crops = await recs("crops");
});
after(async () => { await env.close(); });

function recs(coll) { return p.evaluate(async ([lid, coll]) => (await import("./js/services/records.js")).listRecords(lid, coll), [lid, coll]); }
const add = (coll, data) => p.evaluate(async ([lid, coll, data]) => (await import("./js/services/records.js")).addRecord(lid, coll, data), [lid, coll, data]);
const today = () => p.evaluate(async () => (await import("./js/core/dates.js")).todayStr());
const Hid = (n) => houses.find((h) => h.name === n).id;
const cur = (n) => crops.find((c) => c.houseId === Hid(n) && c.no === 41);
const sheet = () => p.locator(".sheet").last();
const foot = () => sheet().locator(".sheet-foot .btn");
const text = async () => (await p.locator("body").textContent()).replace(/\s+/g, " ");
async function closeAll() {
  for (let i = 0; i < 4 && await p.locator(".sheet").count(); i++) {
    const d = p.locator(".sheet .btn", { hasText: /^\s*Discard/ }); if (await d.count()) await d.first().click(); else await p.keyboard.press("Escape");
    await H.settle(p, 400);
  }
}
async function flow(id, arg = {}) {
  await closeAll(); await H.go(p, `/l/${lid}/crop`);
  await p.evaluate(async ([lid, id, arg]) => { const q = await import("./js/sectors/broilers/quick-add.js"); const { session } = window.__fl; q.runFlow(id, session.ledgers.find((l) => l.id === lid), arg); }, [lid, id, arg]);
  await H.settle(p, 800);
}
const plus = (name, n = 1) => sheet().locator(`[data-stepper="${name}"] [data-dir="1"]`).click({ clickCount: n, delay: 40 });

test("Crop home: day countdown per house, mortality alarm with Call vet / Call DAERA, coming up; no errors (§3)", async () => {
  await H.go(p, `/l/${lid}/crop`);
  const t = await text();
  assert.match(t, /Crop 41/); assert.match(t, /Day 23\s*of 38/); assert.match(t, /House 2: 48 dead since this morning/);
  assert.ok(await p.locator(".br-mort a", { hasText: "Call vet" }).count()); assert.ok(await p.locator(".br-mort a", { hasText: "Call DAERA" }).count());
  assert.match(t, /Coming up/); assert.match(t, /Salmonella boot swabs/); assert.match(t, /Thin both houses/);
  assert.equal(await p.locator(`[data-house="${Hid("House 1")}"] [data-flow="pm"]`).count(), 1);
  assert.deepEqual(p.errors, []);
});

test("PM check: steppers for dead and culls by reason → one Schedule 5 record; card shows PM done (§4)", async () => {
  await closeAll(); await H.go(p, `/l/${lid}/crop`);
  await p.locator(`[data-house="${Hid("House 1")}"] [data-flow="pm"]`).click(); await H.settle(p, 800);
  assert.match(await sheet().textContent(), /House 1 · PM check · Day 23/);
  await plus("dead", 3); await plus("cull_legs", 2); await plus("cull_runt", 1);
  assert.match(await sheet().locator("[data-sum]").textContent(), /This check: 6 out/);
  await foot().click(); await H.settle(p, 800);
  const T = await today(); const pm = (await recs("checks")).find((c) => c.cropId === cur("House 1").id && c.date === T && c.slot === "pm");
  assert.equal(pm.dead, 3); assert.equal(pm.culls.legs, 2); assert.equal(pm.culls.runt, 1); assert.deepEqual(pm.checks, ["Feeders", "Drinkers", "Lights", "Ventilation"]);
  assert.ok(await p.locator(`[data-house="${Hid("House 1")}"] .br-done`, { hasText: "PM" }).count());
});

test("Thin is blocked without Salmonella boot swabs; boot swabs flow → thin saved, birds leave the house (§7, §11)", async () => {
  const c = cur("House 2"); const T = await today();
  await flow("thin", { cropId: c.id });
  await sheet().locator("[name=catchAt]").fill(`${T}T02:00`); await H.settle(p, 300);
  await sheet().locator("[name=birds]").fill("6400"); await H.settle(p, 300);
  assert.match(await foot().textContent(), /Take Salmonella boot swabs first/);
  await flow("salm", { cropId: c.id });
  await sheet().locator("[data-ok]").click(); await H.settle(p, 700);
  await foot().click(); await H.settle(p, 700);
  assert.equal((await recs("salmSamples")).filter((x) => x.cropId === c.id).length, 1);
  await flow("thin", { cropId: c.id });
  await sheet().locator("[name=catchAt]").fill(`${T}T02:00`); await H.settle(p, 300);
  await sheet().locator("[name=birds]").fill("6400"); await H.settle(p, 300);
  assert.match(await foot().textContent(), /Save thin/);
  await foot().click(); await H.settle(p, 800);
  const done = (await recs("thins")).filter((t) => t.cropId === c.id && t.status === "done");
  assert.equal(done.length, 1); assert.equal(done[0].birds, 6400); assert.equal(done[0].crew.glaa, "GLAA 0412/0091");
  await H.go(p, `/l/${lid}/crop`); assert.match(await p.locator(`[data-house="${Hid("House 2")}"] .br-facts`).textContent(), /25,\d{3} alive/);
});

test("A medicine still in withdrawal blocks the clear-out (§7, §13)", async () => {
  const c = cur("House 1"); const T = await today();
  await add("medicines", { cropId: c.id, houseId: c.houseId, date: T, days: 3, product: "Tylan Soluble", active: "tylosin", reason: "Necrotic enteritis", wdDays: 1, vetReason: "Sensitivity test" });
  await flow("clear", { cropId: c.id });
  await sheet().locator("[name=catchAt]").fill(`${T}T23:00`); await H.settle(p, 400);
  assert.match(await foot().textContent(), /Withdrawal ends .* can't send birds yet/);
  assert.match(await sheet().textContent(), /Tylan Soluble: withdrawal ends/);
  await closeAll();
});

test("FCI: send-by clock and 'mark as sent' → copy kept, paperwork row turns Sent (§8)", async () => {
  const c = cur("House 1"); const plan = (await recs("thins")).find((t) => t.cropId === c.id && t.status === "planned");
  await H.go(p, `/l/${lid}/fci/${c.id}/${plan.id}`);
  const t = await text(); assert.match(t, /Send by Mon|Send by Tue|Send by Wed|Send by Thu|Send by Fri|Send by Sat|Send by Sun/); assert.match(t, /24 hours before the birds arrive/); assert.match(t, /Ann Devlin MRCVS/);
  await p.locator("[data-mark]").click(); await H.settle(p, 700);
  const f = (await recs("fci")).find((x) => x.thinId === plan.id); assert.ok(f.sentAt); assert.equal(f.method, "other"); assert.equal(f.doc.flock.birds, 6400);
  await H.go(p, `/l/${lid}/thin/${c.id}/${plan.id}`); assert.match(await text(), /FCI\s*Sent/);
});

test("Density planner: pick a thin day → birds to take → Plan thin makes the thin (feed-off and FCI jobs) (§6.2)", async () => {
  const c = cur("House 1");
  await closeAll(); await H.go(p, `/l/${lid}/density/${c.id}`);
  assert.match(await text(), /Without a thin, crosses 38 kg\/m²/);
  await p.locator("[data-thin='30']").click(); await H.settle(p, 400);
  const btn = p.locator("[data-flow='planThin']"); assert.match(await btn.textContent(), /day 30/);
  await btn.click(); await H.settle(p, 800);
  assert.match(await sheet().textContent(), /Feed off at/); assert.match(await sheet().textContent(), /Send FCI by/);
  await foot().click(); await H.settle(p, 800);
  const planned = (await recs("thins")).filter((t) => t.cropId === c.id && t.status === "planned");
  assert.ok(planned.some((t) => t.catchAt.endsWith("T02:00") && t.birds > 0 && t.feedOffAt));
});

test("Clear-out closes the crop with its results and starts the turnaround; placing chicks < 5 days later warns (§7, §10)", async () => {
  const c = cur("House 2"); const T = await today();
  await flow("clear", { cropId: c.id });
  await sheet().locator("[name=catchAt]").fill(`${T}T04:00`); await H.settle(p, 400);
  assert.match(await foot().textContent(), /Save clear-out/);
  await foot().click(); await H.settle(p, 900);
  const crop = (await recs("crops")).find((x) => x.id === c.id);
  assert.equal(crop.clearedDate, T); assert.ok(crop.results.liveability > 90); assert.ok(crop.results.sold > 30000);
  const ta = (await recs("turnarounds")).find((t) => t.cropId === c.id && !t.closedAt); assert.ok(ta);
  await H.go(p, `/l/${lid}/crop`); assert.match(await p.locator(".br-hc", { hasText: "House 2" }).first().textContent(), /Turnaround/);
  await flow("startCrop", { houseId: c.houseId }); await H.settle(p, 400);
  await sheet().locator("[name=placedDate]").fill(T); await H.settle(p, 400);
  assert.match(await sheet().textContent(), /Only 0 days since clear-out\. Red Tractor needs at least 5 days/);
  await closeAll();
  await flow("litterOut", { houseId: c.houseId });
  await sheet().locator("[name=tonnes]").fill("90"); await sheet().locator("[name=haulier]").fill("J. Bradley"); await sheet().locator("[data-value='AD plant']").click(); await H.settle(p, 300);
  await foot().click(); await H.settle(p, 700);
  const ta2 = (await recs("turnarounds")).find((t) => t.id === ta.id); assert.equal(ta2.litterOut.t, 90); assert.equal(ta2.litterOut.dest, "AD plant");
  assert.deepEqual(p.errors, []);
});

test("Worker sees checks and no money; accountant gets only Money (§18)", async () => {
  await closeAll();
  const codes = await p.evaluate(async (lid) => { const I = await import("./js/services/invites.js"); const { session } = window.__fl; const l = session.ledgers.find((x) => x.id === lid); return { w: await I.createInvite(l, "worker", l.role, 7, "Seán"), a: await I.createInvite(l, "accountant", l.role, 7, "Ruth") }; }, lid);
  const join = async (code, name, email) => {
    await p.evaluate(() => window.__fl.auth.signOut()); await H.settle(p, 400);
    await H.go(p, `/invite/${code}`);
    await p.getByRole("button", { name: "Create an account to join" }).click(); await H.settle(p);
    await p.getByLabel("Your name").fill(name); await p.getByLabel("Email").fill(email);
    await p.getByLabel("Password", { exact: true }).fill("password123"); await p.getByRole("checkbox", { name: /I agree/ }).click();
    await p.locator(".sheet-foot .btn").click();
    await p.waitForFunction((l) => location.hash.startsWith("#/l/" + l), lid); await H.settle(p, 900);
  };
  await join(codes.w, "Seán McKee", "sean-br@x.test");
  assert.deepEqual(await p.locator(".tabbar .tab span").allTextContents(), ["Crop", "Growth", "Crops", "Paperwork", "More"]);
  await H.go(p, `/l/${lid}/crop`); assert.ok(await p.locator("[data-flow='pm'], .br-done").count());
  const c40 = (await recs("crops")).find((c) => c.no === 40);
  await H.go(p, `/l/${lid}/crop-result/${c40.id}`); assert.doesNotMatch(await text(), /£\s?\d/);
  await H.go(p, `/l/${lid}/more`); const m = await text(); assert.match(m, /Processor/); assert.doesNotMatch(m, /Contract and payment/);
  await H.go(p, `/l/${lid}/tools`); assert.doesNotMatch(await text(), /Payment estimate/);
  await join(codes.a, "Ruth Accounts", "ruth-br@x.test");
  assert.deepEqual(await p.locator(".tabbar .tab span").allTextContents(), ["Money", "More"]);
  await H.go(p, `/l/${lid}/money`); const a = await text(); assert.match(a, /Settlements/); assert.match(a, /£/);
  assert.deepEqual(p.errors, []);
});
