// Beef ledger: the most-used entry flows, end to end on the in-memory backend (design/10 §6).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedBeef } from "./beef-seed.mjs";

let env, p, lid;
before(async () => {
  env = await H.setup(); p = await H.phone(env);
  await H.signUp(p); await H.onboard(p, { types: ["beef"] });
  lid = await seedBeef(p);
});
after(async () => { await env.close(); });

const recs = (coll) => p.evaluate(async ([lid, coll]) => (await import("./js/services/records.js")).listRecords(lid, coll), [lid, coll]);
const sheet = () => p.locator(".sheet").last();
const save = () => sheet().locator(".sheet-foot .btn").click();
async function quick(label) { await p.locator(".fab").click(); await H.settle(p, 400); await p.locator(".share-tile", { hasText: label }).first().click(); await H.settle(p, 600); }
async function pick(rowLabel, names) {
  await sheet().locator("[data-pick]", { hasText: rowLabel }).click(); await H.settle(p, 400);
  for (const n of names) { await sheet().locator("[data-q]").fill(n); await H.settle(p, 150); await sheet().locator("[data-aid]").first().click(); await H.settle(p, 200); }
  if (await sheet().locator(".sheet-foot .btn").isVisible().catch(() => false) && (await sheet().locator(".sheet-foot .btn").textContent()).startsWith("Choose")) { await sheet().locator(".sheet-foot .btn").click(); }
  await H.settle(p, 400);
}

test("Beef home opens with season mode, alerts and the bluetongue banner; no errors", async () => {
  await H.go(p, `/l/${lid}/today`);
  assert.match(await p.locator(".mode-chip").textContent(), /mode/);
  assert.ok(await p.locator(".alert").count() >= 1);
  assert.match(await p.locator(".disease-banner").textContent(), /Bluetongue/);
  assert.deepEqual(p.errors, []);
});

test("record a calving: Save says what's missing, check digit guarded, calf lands in To register", async () => {
  await H.go(p, `/l/${lid}/breeding/calving`);
  await p.locator("[data-calving]").click(); await H.settle(p, 600);
  assert.equal((await sheet().locator(".sheet-foot .btn").textContent()).trim(), "Choose the cow to save");
  await pick("Cow", ["Clover"]);
  assert.match(await sheet().locator(".sheet-foot .btn").textContent(), /sex to save/);
  await sheet().locator("[data-chips=sex0] .chip", { hasText: "Heifer" }).click();
  await sheet().locator("[name=tag0]").fill("XI 9 012345 0250 0");
  const msg = await sheet().locator("[data-tagerr='0']").textContent();
  const good = await p.evaluate(async () => { const { tagCheckDigit } = await import("./js/sectors/beef/model/tags.js"); return `XI 9 012345 0250 ${tagCheckDigit("012345", "0250")}`; });
  if (!good.endsWith(" 0")) assert.match(msg, /check digit/);
  await sheet().locator("[name=tag0]").fill(good); await H.settle(p, 200);
  assert.equal((await sheet().locator(".sheet-foot .btn").textContent()).trim(), "Save calving");
  await save(); await H.settle(p, 800);
  const calf = (await recs("animals")).find((a) => a.tag === good);
  assert.ok(calf && calf.bornInHerd && calf.reg && calf.reg.nifais === null);
  assert.equal((await recs("calvings")).filter((c) => c.calves?.some((k) => k.animalId === calf.id)).length, 1);
  await H.go(p, `/l/${lid}/breeding/register`);
  assert.ok(await p.locator(".reg-card", { hasText: "0250" }).count() === 1);
  // tick NIFAIS from the card
  await p.locator(".reg-card", { hasText: "0250" }).locator("[data-step=nifais]").click(); await H.settle(p, 500);
  assert.ok((await recs("animals")).find((a) => a.id === calf.id).reg.nifais);
  assert.deepEqual(p.errors, []);
});

test("group treatment writes one DAERA line per animal and puts them in withdrawal; BTV-3 is a reason", async () => {
  await quick("Treatment");
  assert.ok(await sheet().locator("[data-chips=reason] .chip", { hasText: "BTV-3 vaccine" }).count() === 1);
  await pick("Cattle", ["0182", "0183"]);
  await sheet().locator("[data-chips=reason] .chip", { hasText: "Pneumonia" }).click();
  await sheet().locator("[name=product]").selectOption({ label: "Draxxin 100 mg/ml" }); await H.settle(p, 300);
  await sheet().locator("[data-seg=mode] [data-value=fixed]").click();
  await sheet().locator("[name=dose]").fill("12");
  assert.match(await sheet().locator("[data-wd]").textContent(), /meat 49 days/);
  await save(); await H.settle(p, 800);
  const meds = (await recs("medicines")).filter((m) => m.reason === "Pneumonia" && m.quantity === "12");
  assert.equal(meds.length, 2); assert.ok(meds.every((m) => m.withdrawalEndDateMeat && m.batchNumber === "B23418" && m.animalTags.length === 1));
  await H.go(p, `/l/${lid}/herd?f=withdrawal`);
  assert.ok(await p.locator(".animal-row", { hasText: "0182" }).count() === 1);
  assert.deepEqual(p.errors, []);
});

test("sale guard: factory can't take an animal in withdrawal; mart needs the FCI declaration", async () => {
  await H.go(p, `/l/${lid}/herd?f=withdrawal`);
  await quick("Sale or kill sheet");
  await pick("Cattle", ["0182"]);
  await sheet().locator("[data-seg=kind] [data-value=factory]").click(); await H.settle(p, 200);
  assert.match(await sheet().locator("[data-guard]").textContent(), /withdrawal/);
  assert.equal((await sheet().locator(".sheet-foot .btn").textContent()).trim(), "Remove cattle in withdrawal to save");
  await sheet().locator("[data-seg=kind] [data-value=mart]").click(); await H.settle(p, 200);
  await sheet().locator("[name=buyer]").fill("Dungannon Mart");
  assert.equal((await sheet().locator(".sheet-foot .btn").textContent()).trim(), "Tick the declaration to save");
  await sheet().locator("[data-check=fci]").click(); await H.settle(p, 100);
  await save(); await H.settle(p, 800);
  const a = (await recs("animals")).find((x) => /0182/.test(x.tag));
  assert.equal(a.offTo, "Dungannon Mart");
  assert.ok((await recs("movements")).some((m) => m.kind === "off" && m.animalIds.includes(a.id) && m.fci));
});

test("weigh session: keypad, Next saves, summary", async () => {
  await H.go(p, `/l/${lid}/herd`);
  await quick("Weigh");
  await sheet().locator("[data-q]").fill("0180"); await H.settle(p, 150); await sheet().locator("[data-aid]").first().click();
  assert.equal((await sheet().locator(".sheet-foot .btn").textContent()).trim(), "Weigh 1");
  await sheet().locator(".sheet-foot .btn").click(); await H.settle(p, 700);
  for (const k of ["4", "6", "2"]) await p.locator(".keypad [data-k='" + k + "']").click();
  assert.equal((await p.locator(".weigh [data-v]").textContent()).trim(), "462");
  await p.locator(".keypad [data-k=next]").click(); await H.settle(p, 800);
  assert.ok((await recs("weighings")).some((w) => w.kg === 462));
  assert.match(await p.locator(".sheet").last().textContent(), /Weighed 1/);
  await p.locator(".sheet [data-ok]").click(); await H.settle(p, 400);
});

test("NIFAIS Online as the herd register switches the births deadline to 23 days and the register print line", async () => {
  await H.go(p, `/l/${lid}/targets`);
  await p.locator("[data-radio=registerMode] [data-value=nifais]").click();
  await p.locator("[data-save]").click(); await H.settle(p, 500);
  await H.go(p, `/l/${lid}/breeding/register`);
  assert.match(await p.locator(".beef-page").textContent(), /within 23 days/);
  await H.go(p, `/l/${lid}/paperwork/register`);
  assert.match(await p.locator(".print-view").textContent(), /Herd register kept on NIFAIS Online/);
  await H.go(p, `/l/${lid}/targets`);
  await p.locator("[data-radio=registerMode] [data-value=farm]").click(); await p.locator("[data-save]").click(); await H.settle(p, 400);
});

test("TB test day: plan, present with one tap, finish → reading task", async () => {
  await H.go(p, `/l/${lid}/paperwork/tb`);
  await p.locator("[data-plan]").click(); await H.settle(p, 500); await save(); await H.settle(p, 900);
  await p.locator("a.btn", { hasText: "Start test day" }).click(); await H.settle(p, 800);
  const rows = p.locator(".tb-row"); const n = await rows.count(); assert.ok(n > 10);
  await rows.nth(0).click(); await rows.nth(1).click(); await H.settle(p, 300);
  assert.match(await p.locator(".tb-head h1").textContent(), new RegExp(`Presented 2 of ${n}`));
  assert.deepEqual(p.errors, []);
});

test("herd search finds by the last digits; animal card shows deadlines and timeline", async () => {
  await H.go(p, `/l/${lid}/herd`);
  await p.locator("[data-q]").fill("0108"); await H.settle(p, 300);
  assert.equal(await p.locator(".animal-row").count(), 1);
  await p.locator(".animal-row").click(); await H.settle(p, 900);
  assert.match(await p.locator(".beef-page").textContent(), /BCRS \(27 months\)/);
  assert.ok(await p.locator(".timeline .row").count() >= 3);
  assert.deepEqual(p.errors, []);
});
