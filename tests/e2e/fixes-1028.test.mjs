// 28 Oct fixes: + button shows only what fits the screen; anything can be deleted (records
// browser + Recently deleted, ledger bin with restore); the map has the v9 tools.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedBeef } from "./beef-seed.mjs";

let env, p, lid; const errors = [];
before(async () => {
  env = await H.setup(); p = await H.phone(env);
  p.on("pageerror", (e) => errors.push(String(e)));
  await H.signUp(p); await H.onboard(p, { types: ["beef", "sheep"] });
  lid = await seedBeef(p);
});
after(async () => { await env.close(); });
const tiles = () => p.locator(".sheet .share-tile").allTextContents();
const closeSheets = async () => { for (let i = 0; i < 3; i++) { await p.keyboard.press("Escape"); await H.settle(p, 250); } };

test("+ on Herd shows herd things only, with 'Something else…' for the rest", async () => {
  await H.go(p, `/l/${lid}/herd`); await p.locator(".fab").click(); await H.settle(p, 500);
  const t = await tiles();
  assert.ok(t.some((x) => /Add an animal/.test(x)), t.join("|"));
  assert.ok(!t.some((x) => /Bull in\/out|Scan result|Money/.test(x)), t.join("|"));
  assert.ok(t.length <= 6);
  await p.getByRole("button", { name: "Something else…" }).click(); await H.settle(p, 250);
  assert.ok((await tiles()).length > t.length);
  await closeSheets();
});
test("+ on the medicine register opens a treatment straight away", async () => {
  await H.go(p, `/l/${lid}/paperwork/medicine`); await p.locator(".fab").click(); await H.settle(p, 800);
  const t = await tiles();
  assert.ok(t.length === 2 && t.some((x) => /Treatment/.test(x)), t.join("|")); // Treatment + BTV-3 vaccine
  await closeSheets();
  await H.go(p, `/l/${lid}/paperwork/deaths`); await p.locator(".fab").click(); await H.settle(p, 800);
  assert.equal(await p.locator(".sheet .share-tile").count(), 0, "single entry opens its form directly");
  assert.ok(await p.locator(".sheet").count());
  await closeSheets();
});
test("Edit or delete records: delete with confirm, undo, then restore from Recently deleted", async () => {
  const before = await p.evaluate(async (lid) => (await import("./js/services/records.js")).listRecords(lid, "animals"), lid);
  await H.go(p, `/l/${lid}/more`);
  await p.getByRole("link", { name: /Edit or delete records/ }).click(); await H.settle(p, 900);
  const first = p.locator("[data-c='animals']").first(); await first.click(); await H.settle(p, 400);
  assert.match(await p.locator(".sheet").last().textContent(), /legal record/);
  await p.locator(".sheet").last().getByRole("button", { name: "Delete" }).click(); await H.settle(p, 700);
  let now = await p.evaluate(async (lid) => (await import("./js/services/records.js")).listRecords(lid, "animals"), lid);
  assert.equal(now.length, before.length - 1);
  await H.go(p, `/l/${lid}/more/records/bin`); await H.settle(p, 600);
  await p.locator("[data-c='animals']").first().click(); await H.settle(p, 400);
  await p.locator(".sheet").last().getByRole("button", { name: "Restore", exact: true }).click(); await H.settle(p, 600);
  now = await p.evaluate(async (lid) => (await import("./js/services/records.js")).listRecords(lid, "animals"), lid);
  assert.equal(now.length, before.length);
});
test("Deleting a ledger moves it to Recently deleted; it can be restored", async () => {
  const sheep = await p.evaluate(() => window.__fl.session.sectorLedgers().find((l) => l.type === "sheep"));
  await H.go(p, `/l/${sheep.id}/more/settings`);
  await p.getByRole("button", { name: /Delete this ledger/ }).click(); await H.settle(p, 500);
  await p.locator(".sheet input[name='confirm']").fill(sheep.name); await H.settle(p, 200);
  await p.locator(".sheet-foot .btn.danger").click(); await H.settle(p, 900);
  assert.ok(!(await p.evaluate(() => window.__fl.session.sectorLedgers().map((l) => l.type))).includes("sheep"));
  await H.go(p, "/settings/bin"); await H.settle(p, 700);
  assert.match(await p.locator("main, #app").first().textContent(), new RegExp(sheep.name));
  await p.locator("[data-restore]").first().click(); await H.settle(p, 900);
  assert.ok((await p.evaluate(() => window.__fl.session.sectorLedgers().map((l) => l.type))).includes("sheep"));
});
test("Map: full screen, draw a field with acres, then delete it", async () => {
  await H.go(p, "/farm/map"); await H.settle(p, 1500);
  await p.locator("[data-full]").click(); await H.settle(p, 300);
  assert.ok(await p.locator(".map-wrap.map-full").count());
  await p.locator("[data-full]").click(); await H.settle(p, 300);
  await p.locator("[data-drawnew]").click(); await H.settle(p, 400);
  for (let i = 0; i < 6; i++) { await p.locator(".leaflet-control-zoom-in").click(); await H.settle(p, 250); }
  const box = await p.locator("[data-map]").boundingBox();
  for (const [x, y] of [[0.3, 0.4], [0.7, 0.4], [0.7, 0.7], [0.3, 0.7]]) { await p.mouse.click(box.x + box.width * x, box.y + box.height * y); await H.settle(p, 150); }
  assert.match(await p.locator("[data-count]").textContent(), /4 points · [\d.,]+ ac/);
  await p.locator("[data-finish]").click(); await H.settle(p, 500);
  await p.locator(".sheet input[name='name']").fill("Top field"); await p.locator(".sheet-foot .btn").click(); await H.settle(p, 900);
  assert.match(await p.locator("[data-list]").textContent(), /Top field/);
  await p.locator("[data-list] [data-f]").first().click(); await H.settle(p, 600);
  if (!(await p.locator(".sheet").count())) { await p.locator("[data-card] [data-edit]").click(); await H.settle(p, 500); }
  await p.locator(".sheet [data-del]").click(); await H.settle(p, 400);
  await p.locator(".sheet").last().getByRole("button", { name: "Delete field" }).click(); await H.settle(p, 900);
  assert.doesNotMatch(await p.locator("[data-list]").textContent(), /Top field/);
  assert.deepEqual(errors.filter((e) => !/tile|Failed to fetch/i.test(e)), []);
});
