// Wave 1A (fresh-eyes reviews A #1, #5, #8, #40; B #1, #2, #3, #29, #30, #36): the animal
// picker puts the exact animal first and double-checks deaths/sales; every record opens,
// edits and deletes as one entry; the records list reads like a farmer talks.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedBeef } from "./beef-seed.mjs";
import { seedDairy } from "./dairy-seed.mjs";

let env, p, lid;
before(async () => {
  env = await H.setup(); p = await H.phone(env);
  await H.signUp(p, { email: "records-1a@x.test" }); await H.onboard(p, { types: ["beef"] });
  lid = await seedBeef(p);
});
after(async () => { await env.close(); });

const recs = (coll, page = p, l = lid) => page.evaluate(async ([lid, coll]) => (await import("./js/services/records.js")).listRecords(lid, coll, { includeDeleted: true }), [l, coll]);
const sheet = (page = p) => page.locator(".sheet").last();
const errs = (page = p) => page.errors.filter((e) => !/overview-today|screen failed \/farm\/today/.test(e)); // Today is another builder's work in progress
async function quick(label) {
  await p.locator(".fab").click(); await H.settle(p, 400);
  if (!(await p.locator(".share-tile", { hasText: label }).count())) { await p.getByRole("button", { name: "Something else…" }).click(); await H.settle(p, 200); }
  await p.locator(".share-tile", { hasText: label }).first().click(); await H.settle(p, 600);
}

test("picker: typing a management number or tag number puts that animal first, search reads left to right", async () => {
  await H.go(p, `/l/${lid}/herd`);
  await quick("Death");
  await sheet().locator("[data-pick]").click(); await H.settle(p, 400);
  const q = sheet().locator("[data-q]");
  assert.equal(await q.evaluate((i) => getComputedStyle(i).textAlign), "left");
  await q.fill("0111"); await H.settle(p, 200);
  const first0111 = await sheet().locator("[data-aid]").first().textContent();
  assert.match(first0111, /0111/); assert.doesNotMatch(first0111, /Ruler/, "the stock bull is not on top");
  assert.ok((await sheet().locator("[data-aid]").allTextContents()).some((t) => /Ruler/.test(t)), "the bull still shows lower down");
  await q.fill("0105"); await H.settle(p, 200);
  const first = sheet().locator("[data-aid]").first();
  assert.match(await first.textContent(), /0105 Peggy/); assert.match(await first.textContent(), /Exact match/);
  await H.shot(p, "1a-picker-0105");
  await first.click(); await H.settle(p, 400);
  await sheet().locator("[name=cause]").selectOption("Old age");
  await sheet().locator("[name=disposal]").selectOption("Knackery"); await H.settle(p, 200);
  await sheet().locator(".sheet-foot .btn").click(); await H.settle(p, 500);
  // the search matched Peggy and the calf tagged 0105: ask before recording a death
  assert.match(await sheet().textContent(), /Record a death for 0105 Peggy \(UK 9 012345 0403 \d\)\?/);
  await H.shot(p, "1a-confirm-death");
  await sheet().getByRole("button", { name: "No, go back" }).click(); await H.settle(p, 400);
  assert.equal((await recs("deaths")).length, 0, "nothing saved after No");
  await sheet().locator(".sheet-foot .btn").click(); await H.settle(p, 500);
  await sheet().getByRole("button", { name: "Yes, that's the one" }).click(); await H.settle(p, 800);
  const d = await recs("deaths"); assert.equal(d.length, 1);
  const peggy = (await recs("animals")).find((a) => a.name === "Peggy");
  assert.equal(d[0].animalId, peggy.id); assert.equal(peggy.offTo, "Dead"); assert.ok(d[0].actionId);
  assert.deepEqual(errs(), []);
});

test("Fix a mistake: rows read like a farmer says them, newest first; natural service shows its bull-in date", async () => {
  await H.go(p, `/l/${lid}/more`);
  await p.getByRole("link", { name: /Fix a mistake/ }).click(); await H.settle(p, 1000);
  assert.match(await p.locator("h1").first().textContent(), /Fix a mistake/);
  const recent = await p.locator("[data-recent] .rb-row").allTextContents();
  assert.ok(recent.slice(0, 3).some((t) => /^Death · 0105 Peggy · old age/.test(t.trim())), recent.slice(0, 3).join(" | "));
  const all = await p.locator(".rb-row").allTextContents();
  assert.ok(all.some((t) => /^Treatment · 0108 \d · Draxxin 100 mg\/ml · pneumonia/.test(t.trim())), "treatment names the animal");
  assert.ok(all.some((t) => /^Calving · 0412 Daisy · bull calf/.test(t.trim())), "calving names the cow and calf");
  assert.ok(all.some((t) => /^Money in · Livestock Sales · £3,000\.00/.test(t.trim())), "money formatted");
  assert.ok(!all.some((t) => /^Record\b/.test(t.trim())), "no bare 'Record' rows");
  const bullIn = all.find((t) => /^Bull in · /.test(t.trim()));
  const today = await p.evaluate(async () => (await import("./js/core/dates.js")).shortDate((await import("./js/core/dates.js")).todayStr()));
  assert.ok(bullIn && !bullIn.includes(today), `natural service shows the bull-in date, not today: ${bullIn}`);
  await H.shot(p, "1a-fix-a-mistake");
  assert.deepEqual(errs(), []);
});

test("delete a death: says what goes with it, puts the cow back; Recently deleted has a Bring back button", async () => {
  await p.locator("[data-recent] .rb-row", { hasText: "Death · 0105 Peggy" }).first().click(); await H.settle(p, 700);
  assert.match(await sheet().textContent(), /Cause\s*Old age/);
  await H.shot(p, "1a-record-open");
  await sheet().getByRole("button", { name: "Delete" }).click(); await H.settle(p, 600);
  const txt = await sheet().textContent();
  assert.match(txt, /Delete this death\?/); assert.match(txt, /This also deletes what was saved with it/); assert.match(txt, /0105 Peggy goes back on the farm/);
  await H.shot(p, "1a-delete-confirm");
  await sheet().getByRole("button", { name: /Delete all 2/ }).click(); await H.settle(p, 900);
  let peggy = (await recs("animals")).find((a) => a.name === "Peggy");
  assert.equal(peggy.status, "onFarm"); assert.equal(peggy.offTo, undefined);
  assert.ok((await recs("deaths")).every((x) => x.deleted)); assert.ok((await recs("movements")).filter((m) => m.death).every((m) => m.deleted));
  await H.go(p, `/l/${lid}/more/records/bin`); await H.settle(p, 900);
  const bring = p.locator("[data-bring]").first();
  assert.equal((await bring.textContent()).trim(), "Bring back");
  await H.shot(p, "1a-recently-deleted");
  await p.locator(".rb-row-wrap", { hasText: "Death · 0105 Peggy" }).locator("[data-bring]").click(); await H.settle(p, 900);
  peggy = (await recs("animals")).find((a) => a.name === "Peggy");
  assert.equal(peggy.offTo, "Dead"); assert.ok((await recs("deaths")).every((x) => !x.deleted));
  assert.deepEqual(errs(), []);
});

test("edit a treatment from the animal's timeline: labelled form, change kept in history, withdrawal worked out again", async () => {
  const a = (await recs("animals")).find((x) => /0108 \d$/.test(x.tag));
  await H.go(p, `/l/${lid}/animal/${a.id}`); await H.settle(p, 800);
  await p.locator(".timeline [data-rec^='medicines:']").first().click(); await H.settle(p, 700);
  assert.match(await sheet().textContent(), /Draxxin/);
  await sheet().getByRole("button", { name: "Edit" }).click(); await H.settle(p, 700);
  const s = sheet(); const body = await s.textContent();
  assert.match(body, /Batch number/); assert.doesNotMatch(body, /\{"|withdrawalEndDateMeat|batchNumber/, "labels, not field names or JSON");
  await s.getByLabel("Batch number").fill("B99999");
  await s.getByLabel("Meat withdrawal (days)").fill("28"); await H.settle(p, 200);
  await H.shot(p, "1a-edit-form");
  await s.locator(".sheet-foot .btn").click(); await H.settle(p, 800);
  const m = (await recs("medicines")).find((x) => (x.animalIds || []).includes(a.id));
  assert.equal(m.batchNumber, "B99999"); assert.equal(m.withdrawalMeatDays, 28);
  const end = await p.evaluate(([d]) => import("./js/core/dates.js").then((D) => D.addDays(d, 28)), [m.lastDate]);
  assert.equal(m.withdrawalEndDateMeat, end); assert.equal(m.history.length, 1); assert.equal(m.history[0].before.batchNumber, "B23418");
  await H.settle(p, 300);
  assert.match(await p.locator(".timeline").textContent(), /Withdrawal to/);
  assert.deepEqual(errs(), []);
});

test("delete a treatment with a live withdrawal says so plainly", async () => {
  const a = (await recs("animals")).find((x) => /0109 \d$/.test(x.tag));
  await H.go(p, `/l/${lid}/animal/${a.id}`); await H.settle(p, 800);
  await p.locator(".timeline [data-rec^='medicines:']").first().click(); await H.settle(p, 700);
  await sheet().getByRole("button", { name: "Delete" }).click(); await H.settle(p, 600);
  assert.match(await sheet().textContent(), /0109 \d will no longer show as in withdrawal \(until \d+ \w{3}\)/);
  await sheet().getByRole("button", { name: "Cancel" }).click(); await H.settle(p, 400);
  await p.keyboard.press("Escape"); await H.settle(p, 300);
});

// ---- dairy: the withhold board row opens the treatment; edit; cascade delete and bring back
let d, dlid;
test("dairy: tap a withhold-board row, edit the treatment in its own form, the board follows", async () => {
  d = await H.phone(env);
  await H.signUp(d, { email: "records-1a-dairy@x.test" }); await H.onboard(d, { types: ["dairy"] });
  dlid = await seedDairy(d);
  await H.go(d, `/l/${dlid}/milking`); await H.settle(d, 800);
  const row = d.locator(".wh-row", { hasText: "214" });
  await row.click(); await H.settle(d, 800);
  assert.match(await sheet(d).textContent(), /214 Bella/);
  await H.shot(d, "1a-dairy-treatment-open");
  await sheet(d).getByRole("button", { name: "Edit" }).click(); await H.settle(d, 900);
  assert.equal((await sheet(d).locator(".sheet-head h2").textContent()).trim(), "Edit treatment");
  await sheet(d).locator("[name=batch]").fill("EDITED1");
  await sheet(d).locator("[name=time]").fill("04:00"); await H.settle(d, 300);
  await sheet(d).locator(".sheet-foot .btn").click(); await H.settle(d, 900);
  const cow = (await recs("animals", d, dlid)).find((a) => String(a.cowNo) === "214");
  const med = (await recs("medicines", d, dlid)).find((m) => (m.animalIds || []).includes(cow.id) && !m.deleted && m.batch === "EDITED1");
  assert.ok(med, "medicine changed"); assert.equal(med.time, "04:00"); assert.equal(med.history.length, 1);
  const w = (await recs("milkWithhold", d, dlid)).find((x) => x.medId === med.id && !x.deleted);
  assert.equal(w.time, "04:00", "the withhold row followed the edit"); assert.equal(w.okFrom, med.milkOkFrom);
  assert.deepEqual(errs(d), []);
});

test("dairy: deleting the treatment takes it off the board; Bring back puts it back", async () => {
  await H.go(d, `/l/${dlid}/milking`); await H.settle(d, 800);
  await d.locator(".wh-row", { hasText: "214" }).click(); await H.settle(d, 800);
  await sheet(d).getByRole("button", { name: "Delete" }).click(); await H.settle(d, 600);
  const txt = await sheet(d).textContent();
  assert.match(txt, /Milk withheld · 214 Bella/); assert.match(txt, /Mastitis case · 214 Bella/);
  assert.match(txt, /214 Bella will no longer show on the milk-out board/);
  await H.shot(d, "1a-dairy-delete-confirm");
  await sheet(d).locator("[data-yes]").click(); await H.settle(d, 900);
  assert.equal(await d.locator(".wh-row", { hasText: "214" }).count(), 0, "off the board");
  await H.go(d, `/l/${dlid}/more/records/bin`); await H.settle(d, 900);
  await d.locator(".rb-row-wrap", { hasText: "Milk withheld · 214 Bella" }).locator("[data-bring]").click(); await H.settle(d, 900);
  await H.go(d, `/l/${dlid}/milking`); await H.settle(d, 800);
  assert.equal(await d.locator(".wh-row", { hasText: "214" }).count(), 1, "back on the board");
  const mast = (await recs("mastitis", d, dlid)).filter((m) => !m.deleted); assert.ok(mast.length >= 1);
  await H.go(d, `/l/${dlid}/more/records`); await H.settle(d, 1000);
  const rows = await d.locator(".rb-row").allTextContents();
  assert.ok(rows.some((t) => /^Treatment · 214 Bella · /.test(t.trim())), "cows by number and name, not full tag");
  assert.ok(!rows.some((t) => /UK 9 223344/.test(t)), "no full tags in the list");
  await H.shot(d, "1a-dairy-fix-a-mistake");
  assert.deepEqual(errs(d), []);
});
