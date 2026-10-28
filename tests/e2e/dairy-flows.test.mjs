// The most-used Dairy entry flows, through the real UI on the in-memory backend:
// treatment (udder → withhold board), release, tank temp over the limit, seen bulling → served,
// calving (calf + new lactation), CSV import, and a relief milker (Worker) seeing no money.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedDairy } from "./dairy-seed.mjs";

let env, p, lid;
before(async () => {
  env = await H.setup();
  p = await H.phone(env, { verified: true });
  await H.signUp(p, { email: "dairy-flows@x.test" }); await H.onboard(p, { types: ["dairy"] });
  lid = await seedDairy(p);
});
after(async () => { await env.close(); });

const recs = (coll) => p.evaluate(async ([lid, coll]) => (await import("./js/services/records.js")).listRecords(lid, coll), [lid, coll]);
const L = (r) => H.go(p, `/l/${lid}${r}`);
const flow = async (id) => { await p.evaluate(async ([lid, id]) => { const q = await import("./js/sectors/dairy/quick-add.js"); const { session } = window.__fl; q.runFlow(id, session.ledgers.find((l) => l.id === lid)); }, [lid, id]); await H.settle(p, 700); };
const sheet = () => p.locator(".sheet").last();
const save = () => sheet().locator(".sheet-foot .btn");
/** Open the cow picker from the sheet's pick row and choose cow numbers. */
async function pick(nos, multi = true) {
  await sheet().locator("[data-pick]").first().click(); await H.settle(p, 500);
  for (const no of nos) { await sheet().locator("[data-q]").fill(String(no)); await H.settle(p, 150); await sheet().locator(`.cow-row:has(.cow-no:text-is("${no}"))`).first().click(); await H.settle(p, 200); }
  if (multi) { await sheet().locator(".sheet-foot .btn").click(); }
  await H.settle(p, 700);
  await p.waitForFunction(() => document.querySelectorAll(".sheet").length === 1);
}
const cowId = async (no) => (await recs("animals")).find((a) => a.cowNo === String(no)).id;

test("treatment: udder quarter + product → withhold board, mastitis case, handover line", async () => {
  await L("/milking"); await flow("treat");
  assert.match(await save().textContent(), /Choose the cow/);
  await pick([104]);
  assert.match(await save().textContent(), /Tap the quarter/);
  await sheet().locator(".udder [data-q=LF]").click(); await H.settle(p, 200);
  const opt = await sheet().locator("select[name=productId] option", { hasText: "Synulox LC" }).getAttribute("value");
  await sheet().locator("select[name=productId]").selectOption(opt); await H.settle(p, 200);
  await sheet().locator("[name=doses]").fill("3");
  await sheet().locator(".chip", { hasText: "Red leg band" }).click(); await H.settle(p, 300);
  assert.match(await sheet().locator("[data-panel]").textContent(), /Milk out of the tank until/);
  await save().click(); await H.settle(p, 800);
  const id = await cowId(104);
  const w = (await recs("milkWithhold")).find((x) => x.animalId === id);
  assert.ok(w && w.okFrom > w.lastDoseAt, "withhold written with OK-from after the last dose");
  assert.deepEqual(w.quarters, ["LF"]);
  const m = (await recs("mastitis")).find((x) => x.animalId === id); assert.ok(m);
  const med = (await recs("medicines")).find((x) => x.animalIds?.includes(id) && x.reason === "Mastitis"); assert.equal(med.doses, 3); assert.equal(med.wdMilkHours, 84);
  assert.ok((await recs("handover")).some((h) => h.auto && /104 treated LF/.test(h.text)));
  await L("/cows"); await L("/milking");
  assert.ok(await p.locator(".wh .wh-no", { hasText: /^104$/ }).count(), "104 on the withhold board");
});

test("release: a deliberate tap records who released her", async () => {
  await L("/milking");
  await p.locator("[data-release]").first().click(); await H.settle(p, 600);
  const id = await cowId(110);
  const w = (await recs("milkWithhold")).find((x) => x.animalId === id);
  assert.ok(w.releasedAt, "released"); assert.equal(w.releasedByName, "Tom Riddell");
});

test("tank temperature over the limit needs the action taken", async () => {
  await flow("tank");
  await sheet().locator("[name=tempC]").fill("9.4"); await sheet().locator("[name=tempC]").dispatchEvent("input"); await H.settle(p, 200);
  assert.match(await save().textContent(), /Note the action taken/);
  await sheet().locator("[name=action]").fill("Engineer called, compressor reset"); await H.settle(p, 200);
  await save().click(); await H.settle(p, 600);
  const t = (await recs("tankLog")).find((r) => r.tempC === 9.4);
  assert.ok(t && t.action.includes("compressor"));
});

test("seen bulling then served: straw count goes down", async () => {
  await flow("bulling"); await pick([126]);
  await save().click(); await H.settle(p, 600);
  const id = await cowId(126);
  assert.ok((await recs("heats")).some((h) => h.animalId === id));
  await L("/fertility");
  const row = p.locator(`.cow-row:has(.cow-no:text-is("126"))`).first();
  await row.getByRole("button", { name: "Served" }).click(); await H.settle(p, 700);
  const opt = await sheet().locator("select[name=strawId] option", { hasText: "Peak Altaiot" }).getAttribute("value");
  await sheet().locator("select[name=strawId]").selectOption(opt); await H.settle(p, 200);
  await save().click(); await H.settle(p, 600);
  const sv = (await recs("services")).find((x) => x.animalId === id); assert.ok(sv); assert.equal(sv.strawId, opt);
  const { strawsLeft } = await import("../../app/js/sectors/dairy/model/fertility.js");
  const left = strawsLeft(await recs("straws"), await recs("services")).find((x) => x.id === opt).left;
  assert.equal(left, 13);
});

test("calving: calf added with dam, cow starts a new lactation", async () => {
  const before = (await recs("animals")).length;
  await flow("calving"); await pick([131], false);
  await sheet().locator('[data-chips=sex0] .chip[data-value="Heifer"]').click(); await H.settle(p, 200);
  await save().click(); await H.settle(p, 700);
  const animals = await recs("animals"); const id = await cowId(131);
  assert.equal(animals.length, before + 1);
  assert.ok(animals.some((a) => a.damId === id && a.bornInHerd));
  assert.ok((await recs("calvings")).some((c) => c.damId === id && c.lactation === 4));
  await L(`/cow/${id}`);
  assert.match(await p.locator("main, .screen, body").first().textContent(), /4th lactation/);
});

test("CSV import: map columns once, recording written, template saved", async () => {
  await L("/imports");
  await p.locator("[data-src=NMR]").click(); await H.settle(p, 300);
  await p.locator("details summary").click();
  await p.locator("[data-paste]").fill("Cow No,Test Date,Yield,Fat %,Protein %,SCC\n214,15/10/2026,31.2,4.2,3.4,410\n302,15/10/2026,28,4.0,3.3,240\n999,15/10/2026,20,4,3.2,90");
  await p.locator("[data-read]").click(); await H.settle(p, 400);
  assert.match(await p.locator("[data-import]").textContent(), /Import 2 cows/);
  await p.locator("[data-import]").click(); await H.settle(p, 700);
  const r = (await recs("recordings")).find((x) => x.date === "2026-10-15" && x.source === "NMR");
  assert.equal(r.cows.length, 2); assert.equal(r.unmatched, 1);
  assert.equal(r.cows.find((c) => c.cowNo === "214").scc, 410);
  assert.equal((await recs("imports")).length, 1);
});

test("relief milker (Worker): withhold board yes, no money anywhere", async () => {
  await H.go(p, `/l/${lid}/more/people`);
  await p.getByRole("button", { name: "Invite someone" }).click(); await H.settle(p, 600);
  await p.getByLabel("Their name").fill("Seán");
  await p.locator(".sheet-foot .btn").click(); await H.settle(p, 900);
  const code = /#\/invite\/([A-Z0-9]{26})/.exec(await p.locator("[data-msg]").textContent())[1];
  await p.keyboard.press("Escape"); await H.settle(p, 400);
  await p.evaluate(() => window.__fl.auth.signOut());
  await H.go(p, `/invite/${code}`);
  await p.getByRole("button", { name: "Create an account to join" }).click(); await H.settle(p);
  await p.getByLabel("Your name").fill("Seán McKee"); await p.getByLabel("Email").fill("sean-dairy@x.test");
  await p.getByLabel("Password", { exact: true }).fill("password123"); await p.getByRole("checkbox", { name: /I agree/ }).click();
  await p.locator(".sheet-foot .btn").click();
  await p.waitForFunction((l) => location.hash.startsWith("#/l/" + l), lid); await H.settle(p, 900);
  const tabs = await p.locator(".tabbar .tab span").allTextContents();
  assert.deepEqual(tabs, ["Milking", "Cows", "Fertility", "Milk", "More"]);
  await L("/milking");
  assert.ok(await p.locator(".wh").count(), "withhold board visible to the milker");
  await L("/milk/cheques");
  assert.doesNotMatch(await p.locator("body").textContent(), /per litre actually paid|£/);
  await L("/dairy-settings");
  assert.doesNotMatch(await p.locator("body").textContent(), /Milk price profile/);
  await L("/tools");
  assert.doesNotMatch(await p.locator("body").textContent(), /Milk cheque check|Margin over purchased feed/);
});

test("no JavaScript errors", () => { assert.deepEqual(p.errors, []); });
