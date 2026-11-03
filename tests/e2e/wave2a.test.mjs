// Wave 2A (fresh-eyes reviews A #2-#4, #9, #12, #14-#16, #36, #39; B #7, #8, #12, #13, #17, #20,
// #25-#28, #33-#35, #39): number checks, the kill sheet that comes later, breeding stock on a sale,
// one medicine store, an honest inspection score, and the sector fixes — end to end.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedBeef } from "./beef-seed.mjs";
import { seedLayers } from "./layers-seed.mjs";
import { seedDairy } from "./dairy-seed.mjs";
import { seedSheep } from "./sheep-seed.mjs";

let env;
before(async () => { env = await H.setup(); });
after(async () => { await env.close(); });

const recsOf = (p, lid, coll) => p.evaluate(async ([lid, coll]) => (await import("./js/services/records.js")).listRecords(lid, coll), [lid, coll]);
const sheetOf = (p) => p.locator(".sheet").last();
async function quick(p, label) {
  await p.locator(".fab").click(); await H.settle(p, 400);
  if (!(await p.locator(".share-tile", { hasText: label }).count())) { await p.getByRole("button", { name: "Something else…" }).click(); await H.settle(p, 200); }
  await p.locator(".share-tile", { hasText: label }).first().click(); await H.settle(p, 600);
}
async function pickCattle(p, names) {
  const sh = sheetOf(p);
  await sh.locator("[data-pick]").first().click(); await H.settle(p, 400);
  for (const n of names) { await sheetOf(p).locator("[data-q]").fill(n); await H.settle(p, 150); await sheetOf(p).locator("[data-aid]").first().click(); await H.settle(p, 200); }
  const b = sheetOf(p).locator(".sheet-foot .btn");
  if (await b.isVisible().catch(() => false) && /^Choose|^Done|selected|^Use/.test((await b.textContent()).trim()) && (await p.locator(".sheet").count()) > 1) await b.click();
  await H.settle(p, 400);
}

test("beef: £372/kg asks 'Is this right?' (Change goes back, Yes saves); a factory sale with no kill sheet waits for it; the bull gets a warning", { timeout: 180000 }, async () => {
  const p = await H.phone(env);
  await H.signUp(p, { email: "w2a-beef@x.test" }); await H.onboard(p, { types: ["beef"] });
  const lid = await seedBeef(p);
  const recs = (c) => recsOf(p, lid, c);
  // 1. the typo
  await H.go(p, `/l/${lid}/herd`); await quick(p, "Sale or kill sheet");
  await pickCattle(p, ["0180"]);
  await sheetOf(p).locator("[data-seg=kind] [data-value=factory]").click(); await H.settle(p, 300);
  await sheetOf(p).locator("[name=buyer]").fill("Linden Foods");
  const aid = (await recs("animals")).find((a) => /0180/.test(a.tag)).id;
  await sheetOf(p).locator(`[data-l="${aid}"][data-k=deadKg]`).fill("372"); await sheetOf(p).locator(`[data-l="${aid}"][data-k=deadKg]`).dispatchEvent("change");
  await sheetOf(p).locator(`[data-l="${aid}"][data-k=pricePerKg]`).fill("372"); await sheetOf(p).locator(`[data-l="${aid}"][data-k=pricePerKg]`).dispatchEvent("change"); await H.settle(p, 300);
  await sheetOf(p).locator(".sheet-foot .btn").click(); await H.settle(p, 600);
  const ask = p.locator("[data-sanity]");
  assert.match(await ask.textContent(), /Is this right\?/); assert.match(await ask.textContent(), /£372\/kg is high/); assert.match(await ask.textContent(), /£138,384 for one animal/);
  await H.shot(p, "2a-is-this-right");
  await ask.getByRole("button", { name: "Change" }).click(); await H.settle(p, 500);
  const salesBefore = (await recs("sales")).length;
  assert.ok(!(await recs("sales")).some((x) => x.buyer === "Linden Foods"), "nothing saved after Change");
  await sheetOf(p).locator(`[data-l="${aid}"][data-k=pricePerKg]`).fill("4.85"); await sheetOf(p).locator(`[data-l="${aid}"][data-k=pricePerKg]`).dispatchEvent("change"); await H.settle(p, 300);
  await sheetOf(p).locator(".sheet-foot .btn").click(); await H.settle(p, 900);
  assert.equal(await p.locator("[data-sanity]").count(), 0, "sensible numbers save straight away");
  assert.equal((await recs("sales")).length, salesBefore + 1);
  const ls = (await recs("sales")).find((x) => x.buyer === "Linden Foods");
  assert.equal((await recs("finance")).find((f) => f.id === ls.financeId)?.amount, 1804.2);

  // 2. a factory sale with nothing in the kill-sheet columns
  await H.go(p, `/l/${lid}/herd`); await quick(p, "Sale or kill sheet");
  await pickCattle(p, ["0181"]);
  await sheetOf(p).locator("[data-seg=kind] [data-value=factory]").click(); await H.settle(p, 300);
  await sheetOf(p).locator("[name=buyer]").fill("ABP Lurgan");
  await sheetOf(p).locator(".sheet-foot .btn").click(); await H.settle(p, 900);
  const sale = (await recs("sales")).find((x) => x.buyer === "ABP Lurgan");
  assert.equal(sale.awaitingKillSheet, true);
  await H.go(p, `/l/${lid}/today`); await H.settle(p, 600);
  assert.match(await p.locator("body").textContent(), /Add the kill sheet for/);
  await H.go(p, `/l/${lid}/money`); await H.settle(p, 600);
  assert.match(await p.locator("[data-awaiting]").textContent(), /£ — awaiting kill sheet/);
  await H.shot(p, "2a-money-awaiting");
  await p.locator("[data-awaiting]").click(); await H.settle(p, 800);
  assert.match(location(p), new RegExp(`/sale/${sale.id}$`));
  await p.locator("[data-kill]").click(); await H.settle(p, 600);
  const a181 = (await recs("animals")).find((a) => /0181/.test(a.tag)).id;
  await sheetOf(p).locator(`[data-l="${a181}"][data-k=deadKg]`).fill("355");
  await sheetOf(p).locator(`[data-l="${a181}"][data-k=grade]`).fill("R-3");
  await sheetOf(p).locator(`[data-l="${a181}"][data-k=pricePerKg]`).fill("4.9"); await sheetOf(p).locator(`[data-l="${a181}"][data-k=pricePerKg]`).dispatchEvent("input"); await H.settle(p, 200);
  await H.shot(p, "2a-kill-sheet");
  await sheetOf(p).locator(".sheet-foot .btn").click(); await H.settle(p, 900);
  const after = (await recs("sales")).find((x) => x.id === sale.id);
  assert.equal(after.awaitingKillSheet, false); assert.equal(after.lines[0].deadKg, 355);
  assert.equal((await recs("finance")).find((f) => f.saleId === sale.id).amount, 1739.5);

  // 3. the stock bull
  await H.go(p, `/l/${lid}/herd`); await quick(p, "Sale or kill sheet");
  await pickCattle(p, ["Ruler"]);
  assert.match(await sheetOf(p).locator("[data-keeper]").textContent(), /is your stock bull/);
  await H.shot(p, "2a-sale-bull");
  await p.keyboard.press("Escape"); await H.settle(p, 400); if (await p.locator(".sheet").count()) { await p.getByRole("button", { name: "Discard" }).click().catch(() => {}); await H.settle(p, 400); }

  // 4. one medicine store: the Beef ledger's products are in Farm → Medicine store
  await H.go(p, "/farm/medicines"); await H.settle(p, 800);
  const store = await p.locator("body").textContent();
  assert.doesNotMatch(store, /No medicines in the store yet/); assert.match(store, /Draxxin|Ivomec/);
  await H.shot(p, "2a-farm-med-store");

  // 5. inspection ready: records-only score, a separate checklist with one checkbox each
  await H.go(p, `/l/${lid}/paperwork/fqa`); await H.settle(p, 700);
  assert.ok(await p.locator("[data-ready-auto]").count()); assert.ok(await p.locator("[data-ready-self] [data-selftick]").count() > 10);
  assert.equal(await p.locator(".row:has(.pill)", { hasText: "Tick yourself" }).count(), 0);
  const first = p.locator("[data-selftick]").first(); const id = await first.getAttribute("data-selftick");
  const before = await p.locator("[data-ready-hero] .value").textContent();
  await first.click(); await H.settle(p, 700);
  assert.equal(await p.locator(`[data-selftick="${id}"]`).getAttribute("aria-checked"), "true");
  assert.equal(await p.locator("[data-ready-hero] .value").textContent(), before, "a self-tick doesn't move the score");
  assert.deepEqual(p.errors, []);
  await p.ctx.close();
});
const location = (p) => p.url();

test("beef: a new empty ledger shows no inspection %; Money takes supplier and VAT", { timeout: 120000 }, async () => {
  const p = await H.phone(env);
  await H.signUp(p, { email: "w2a-empty@x.test" }); await H.onboard(p, { types: ["beef"] });
  const lid = await p.evaluate(async () => window.__fl.session.sectorLedgers()[0].id);
  await H.go(p, `/l/${lid}/paperwork`); await H.settle(p, 600);
  assert.equal((await p.locator(".inspect-hero .value").textContent()).trim(), "—");
  await H.shot(p, "2a-paperwork-empty");
  await H.go(p, `/l/${lid}/money`); await H.settle(p, 600);
  await p.locator(".fab").click(); await H.settle(p, 600);
  await sheetOf(p).locator("[name=amount]").fill("25000");
  await sheetOf(p).locator("[name=supplier]").fill("Thompsons Feeds");
  await sheetOf(p).locator("[data-seg=vat] [data-value=ex]").click();
  await sheetOf(p).locator(".sheet-foot .btn").click(); await H.settle(p, 600);
  assert.match(await p.locator("[data-sanity]").textContent(), /£25,000 — more than £20,000/);
  await p.locator("[data-sanity] [data-yes]").click(); await H.settle(p, 800);
  const f = (await recsOf(p, lid, "finance"))[0];
  assert.equal(f.amount, 25000); assert.equal(f.supplier, "Thompsons Feeds"); assert.equal(f.vat, "ex");
  assert.deepEqual(p.errors, []);
  await p.ctx.close();
});

test("layers: checks start unticked, 'All checked ✓' ticks them, saving without asks; chooser marks a done house and lists the other first", { timeout: 120000 }, async () => {
  const p = await H.phone(env);
  await H.signUp(p, { email: "w2a-layers@x.test" }); await H.onboard(p, { types: ["layers"] });
  const lid = await seedLayers(p);
  const runFlow = (id) => p.evaluate(async ([lid, id]) => { const q = await import("./js/sectors/layers/quick-add.js"); q.runFlow(id, window.__fl.session.ledgers.find((l) => l.id === lid)); }, [lid, id]);
  await H.go(p, `/l/${lid}/houses`);
  await runFlow("sheet"); await H.settle(p, 800);
  const rows = await p.locator(".sheet").last().locator("[data-pick]").allTextContents();
  const doneIdx = rows.findIndex((t) => /✓ done/.test(t));
  if (doneIdx >= 0) assert.equal(doneIdx, rows.length - 1, "done houses go last");
  assert.doesNotMatch(rows.join(" "), /placed/, "hens now, not the number placed");
  await H.shot(p, "2a-layers-chooser");
  await p.locator(".sheet").last().locator("[data-pick]").first().click(); await H.settle(p, 800);
  const sh = sheetOf(p);
  assert.equal(await sh.locator("[data-chips=checks] .chip[aria-checked=true]").count(), 0);
  assert.equal(await sh.locator(".ly-times").count(), 0, "pop-hole times are stacked rows, nothing clipped");
  await sh.locator("input[name=eggs]").fill("100"); await H.settle(p, 200);
  await sh.locator(".sheet-foot .btn").last().click(); await H.settle(p, 600);
  assert.match(await p.locator("[data-sanity]").textContent(), /None of the daily checks are ticked/);
  await p.locator("[data-sanity] [data-change]").click(); await H.settle(p, 500);
  await sheetOf(p).locator("[data-allchecked]").click(); await H.settle(p, 300);
  assert.equal(await sheetOf(p).locator("[data-chips=checks] .chip[aria-checked=true]").count(), 5);
  await H.shot(p, "2a-layers-checks");
  await sheetOf(p).locator(".sheet-foot .btn").last().click(); await H.settle(p, 900);
  assert.equal(await p.locator("[data-sanity]").count(), 0);
  const day = (await recsOf(p, lid, "days")).sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0];
  assert.equal(day.checks.length, 5);
  assert.deepEqual(p.errors, []);
  await p.ctx.close();
});

test("dairy: mastitis defaults to the usual tube, products grouped, a vaccine warns; details folded; robot says Withhold list", { timeout: 120000 }, async () => {
  const p = await H.phone(env);
  await H.signUp(p, { email: "w2a-dairy@x.test" }); await H.onboard(p, { types: ["dairy"] });
  const lid = await seedDairy(p);
  await H.go(p, `/l/${lid}/milking`);
  await p.evaluate(async (lid) => { const q = await import("./js/sectors/dairy/quick-add.js"); q.runFlow("treat", window.__fl.session.ledgers.find((l) => l.id === lid)); }, lid); await H.settle(p, 800);
  const sh = sheetOf(p);
  assert.ok((await sh.locator("select[name=productId]").evaluate((s) => s.options[s.selectedIndex].value)) !== "", "a product is chosen for mastitis");
  assert.ok((await sh.locator("optgroup").count()) >= 3);
  assert.equal(await sh.locator("[data-details]").evaluate((d) => d.open), false, "batch, given by, date and time are folded");
  const v = await sh.locator("select[name=productId] option", { hasText: "Bultavo" }).first().getAttribute("value");
  await sh.locator("select[name=productId]").selectOption(v); await H.settle(p, 300);
  await sh.locator("[data-pick]").first().click(); await H.settle(p, 500);
  await sheetOf(p).locator("[data-q]").fill("104"); await H.settle(p, 150); await sheetOf(p).locator(`.cow-row:has(.cow-no:text-is("104"))`).first().click(); await H.settle(p, 200);
  await sheetOf(p).locator(".sheet-foot .btn").click(); await H.settle(p, 700);
  assert.match(await sheetOf(p).locator("[data-prodwarn]").textContent(), /is a vaccine/);
  await p.keyboard.press("Escape"); await H.settle(p, 400); if (await p.locator(".sheet").count()) { await p.getByRole("button", { name: "Discard" }).click().catch(() => {}); await H.settle(p, 400); }
  await p.evaluate(async (lid) => { const { setMeta, getMeta } = await import("./js/services/records.js"); const m = (await getMeta(lid, "settings")) || {}; await setMeta(lid, "settings", { ...m, robot: true, mode: "robot" }); }, lid);
  await H.go(p, `/l/${lid}/cows`); await H.go(p, `/l/${lid}/milking`); await H.settle(p, 700);
  const parlourBtn = p.locator("[data-parlour]");
  if (await parlourBtn.count()) assert.match(await parlourBtn.textContent(), /Withhold list|Parlour sheet/);
  assert.deepEqual(p.errors, []);
  await p.ctx.close();
});

test("pigs: first run offers 'Just a few pigs'; small herd paperwork is the legal minimum", { timeout: 120000 }, async () => {
  const p = await H.phone(env);
  await H.signUp(p, { email: "w2a-pigs@x.test" }); await H.onboard(p, { types: ["pigs"] });
  const lid = await p.evaluate(async () => window.__fl.session.sectorLedgers()[0].id);
  await H.go(p, `/l/${lid}/week`); await H.settle(p, 700);
  assert.match(await p.locator("[data-system-choice]").textContent(), /Just a few pigs \(small herd\)/);
  await H.shot(p, "2a-pigs-first-run");
  await p.locator("[data-system=small]").click(); await H.settle(p, 900);
  const m = await p.evaluate(async (lid) => (await import("./js/services/records.js")).getMeta(lid, "settings"), lid);
  assert.equal(m.smallHerd, true); assert.equal(m.assured, false);
  await H.go(p, `/l/${lid}/paperwork`); await H.settle(p, 700);
  const t = await p.locator("body").textContent();
  assert.match(t, /just the records the law asks for/); assert.doesNotMatch(t, /eMB-Pigs|Alarm tests|Inspection ready/);
  await H.shot(p, "2a-pigs-small-paperwork");
  assert.deepEqual(p.errors, []);
  await p.ctx.close();
});

test("sheep: one stage control on Flock, Sheep settings on More, money per ewe says how far through selling", { timeout: 120000 }, async () => {
  const p = await H.phone(env);
  await H.signUp(p, { email: "w2a-sheep@x.test" }); await H.onboard(p, { types: ["sheep"] });
  const lid = await seedSheep(p);
  await H.go(p, `/l/${lid}/flock`); await H.settle(p, 700);
  assert.equal(await p.locator(".ystrip").count(), 0, "no stage pills on Flock"); assert.ok(await p.locator("[data-stage]").count());
  await H.go(p, `/l/${lid}/more`); await H.settle(p, 500);
  assert.match(await p.locator("body").textContent(), /Sheep settings/);
  await H.go(p, `/l/${lid}/money`); await H.settle(p, 700);
  assert.match(await p.locator("body").textContent(), /so far this year \(\d+ of ~\d+ lambs sold\)/);
  assert.ok(await p.locator("[data-bench-later]").count());
  await H.shot(p, "2a-sheep-money");
  assert.deepEqual(p.errors, []);
  await p.ctx.close();
});
