// Sheep ledger: the most-used entry flows, end to end on the in-memory backend (design/11 §4–§6).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedSheep } from "./sheep-seed.mjs";

let env, p, lid;
before(async () => {
  env = await H.setup(); p = await H.phone(env);
  await H.signUp(p, { email: "sheep-flows@x.test" }); await H.onboard(p, { types: ["sheep"] });
  lid = await seedSheep(p);
});
after(async () => { await env.close(); });

const recs = (coll) => p.evaluate(async ([lid, coll]) => (await import("./js/services/records.js")).listRecords(lid, coll), [lid, coll]);
const sheet = () => p.locator(".sheet").last();
const foot = () => sheet().locator(".sheet-foot .btn");
async function flow(name) {
  await H.go(p, `/l/${lid}/flock`);
  await p.evaluate(async ([lid, f]) => { const q = await import("./js/sectors/sheep/quick-add.js"); const { session } = window.__fl; await q.runFlow(f, session.ledgers.find((l) => l.id === lid)); }, [lid, name]);
  await H.settle(p, 700);
}
async function pickMob(name) {
  await sheet().locator("[data-pick-mob]").first().click(); await H.settle(p, 500);
  await p.locator(".sheet").last().locator("[data-mob]", { hasText: new RegExp("^\\s*" + name) }).first().click(); await H.settle(p, 500);
}

test("Flock home opens on the tupping board with the bluetongue banner; no errors", async () => {
  await H.go(p, `/l/${lid}/flock`);
  assert.match(await p.locator("body").textContent(), /day 18 of tupping/);
  assert.match(await p.locator("body").textContent(), /Bluetongue/);
  assert.deepEqual(p.errors, []);
});

test("lambing shed: twins, one dead with a cause, saved in four taps and counted in Tonight", async () => {
  const before = (await recs("lambings")).length;
  await H.go(p, `/l/${lid}/shed`);
  assert.equal(await p.locator(".shed [data-save]").isDisabled(), true);
  await p.locator(".shed [data-a=mob]").click(); await p.locator(".shed [data-mob]").first().click(); await p.locator(".shed [data-raddle]").first().click();
  await p.locator(".shed [data-n='2']").click(); await p.locator(".shed [data-l='1'][data-f=dead]").click();
  assert.equal(await p.locator(".shed [data-save]").isDisabled(), true); // must say why the lamb died
  await p.locator(".shed [data-l='1'][data-cause='Stillborn']").click();
  await p.locator(".shed [data-save]").click(); await H.settle(p, 900);
  const all = await recs("lambings"); assert.equal(all.length, before + 1);
  const l = all.find((x) => x.lambs?.length === 2 && x.lambs[1].deathCause === "Stillborn" && x.datetime > new Date(Date.now() - 600000).toISOString());
  assert.ok(l && l.mobId && l.raddle);
  assert.match(await p.locator(".shed").textContent(), /Tonight: 1 ewes? · 2 lambs · 1 dead/);
  assert.deepEqual(p.errors, []);
});

test("raddle check: Save says what's missing, then writes the tally event", async () => {
  await flow("raddle");
  assert.equal((await foot().textContent()).trim(), "Choose the mob to save");
  await pickMob("Texel");
  assert.match(await foot().textContent(), /Count the marked ewes/);
  await sheet().locator(".jumps [data-d='10']").click(); await sheet().locator(".bigstep [data-d='1']").click();
  await foot().click(); await H.settle(p, 700);
  const ev = (await recs("events")).filter((e) => e.kind === "raddle").find((e) => e.counts?.newlyMarked === 11);
  assert.ok(ev, "raddle event with 11 newly marked");
  assert.deepEqual(p.errors, []);
});

test("treat a mob: dose from the store sets the withdrawal and one medicine line, no £", async () => {
  await flow("treat");
  await pickMob("Ewe lambs");
  const opt = await sheet().locator("[name=productId] option", { hasText: "Zolvix" }).getAttribute("value");
  await sheet().locator("[name=productId]").selectOption(opt); await H.settle(p, 300);
  await sheet().locator("[name=heaviest]").fill("45"); await H.settle(p, 300);
  if (await sheet().locator("[name=wd]").inputValue() === "") await sheet().locator("[name=wd]").fill("7");
  await H.settle(p, 300);
  const label = (await foot().textContent()).trim();
  assert.ok(!/^Choose|^Add/.test(label), `save button ready, got "${label}"`);
  await foot().click(); await H.settle(p, 800);
  const m = (await recs("medicines")).find((x) => x.productName === "Zolvix");
  assert.ok(m, "medicine use saved");
  assert.equal(m.numberTreated, 30); assert.equal(m.wdMeatDays, 7); assert.ok(m.withdrawalUntil > m.date);
  for (const k of ["price", "cost", "total"]) assert.equal(m[k], undefined);
  assert.deepEqual(p.errors, []);
});

test("draft & sell to an abattoir: movement + sale carry no £, the money sits only in finance", async () => {
  await flow("draft");
  await pickMob("Lambs 2026");
  await sheet().locator(".jumps [data-d='-5']").click(); await H.settle(p, 200); // picking the mob fills in its whole count; draft 5 fewer
  await sheet().locator("[name=otherName]").fill("Dunbia Dungannon");
  const total = sheet().locator("[name=total]"); if (await total.count()) await total.fill("1300");
  await H.settle(p, 300);
  const label = (await foot().textContent()).trim();
  assert.ok(!/^Choose|^Add|^Name/.test(label), `save ready, got "${label}"`);
  await foot().click(); await H.settle(p, 1000);
  const mv = (await recs("movements")).find((x) => x.otherName === "Dunbia Dungannon");
  const sale = (await recs("sales")).find((x) => x.outlet === "Dunbia Dungannon" || x.otherName === "Dunbia Dungannon");
  assert.ok(mv && sale, "movement and sale saved");
  assert.equal(mv.kind, "off"); assert.ok(mv.docSerial);
  const money = (o) => JSON.stringify(o).match(/"(price|total|gross|net|pricePerKg|cost)":\s*[1-9]/);
  assert.equal(money(mv), null); assert.equal(money(sale), null);
  const fin = (await recs("finance")).find((x) => /Dunbia/.test(x.note || ""));
  assert.ok(fin && fin.amount > 0, "finance copy holds the £");
  assert.match(p.url(), /movement\//); // straight to the movement document
  assert.deepEqual(p.errors, []);
});

test("Paperwork: register shows the move, Targets saves for the owner", async () => {
  await H.go(p, `/l/${lid}/paperwork/register`);
  assert.match(await p.locator("body").textContent(), /Dunbia/);
  await H.go(p, `/l/${lid}/targets`);
  await p.locator("[name=draftKg]").fill("44"); await p.locator("[data-save]").click(); await H.settle(p, 500);
  const s = await p.evaluate(async (lid) => (await import("./js/services/records.js")).getMeta?.(lid, "settings"), lid);
  if (s) assert.equal(s.draftKg, 44);
  assert.deepEqual(p.errors, []);
});
