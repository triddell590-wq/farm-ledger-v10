// Wave 2B e2e (platform and first-time experience): the Farm ▾ picker, the demo farm (never
// Firebase, nothing saved), onboarding numbers -> houses, empty homes, readable export, sheets
// that close without "Discard?" when untouched, inline tag check digit, Farm → People rows.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedBeef } from "./beef-seed.mjs";

let env;
before(async () => { env = await H.setup(); });
after(async () => { await env.close(); });

const ids = (p) => p.evaluate(() => Object.fromEntries(window.__fl.session.sectorLedgers().map((l) => [l.type + (l.name.match(/ \d+$/)?.[0] || ""), l.id])));

test("Farm ▾ picker: one button, 7 herds/flocks in a sheet with status lines, never overflows 390px", async () => {
  const p = await H.phone(env, { verified: true });
  await H.signUp(p);
  await H.onboard(p, { types: ["beef", "sheep", "dairy", "pigs", "layers", "broilers"] });
  // a second beef herd makes seven
  await H.go(p, "/add-ledger"); await p.locator(".type-tile[data-type=beef]").click();
  assert.equal((await p.locator("[data-next]").textContent()).trim(), "Add Beef herd");
  await p.locator("[data-next]").click(); await H.settle(p, 600);
  await p.locator("[data-finish]").click(); await H.settle(p, 1200);
  await H.go(p, "/farm/today");
  const box = (sel) => p.locator(sel).boundingBox();
  const btn = await box("[data-picker]"), bell = await box(".topbar .bell"), sync = await box(".topbar .sync");
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390);
  for (const b of [btn, bell, sync]) assert.ok(b && b.x >= 0 && b.x + b.width <= 390, JSON.stringify(b));
  assert.ok(btn.x + btn.width <= bell.x, "button never runs under the bell");
  assert.equal(await p.locator(".topbar .rail").isVisible(), false, "no sideways strip on phones");
  assert.equal((await p.locator("[data-picker] .lb-name").textContent()).trim(), "Farm");
  await p.locator("[data-picker]").click(); await H.settle(p, 1500);
  const names = (await p.locator(".lp [data-lp] .primary").allTextContents()).map((t) => t.trim());
  assert.deepEqual(names, ["Beef herd", "Beef herd 2", "Sheep flock", "Dairy herd", "Pigs", "Laying hens", "Broilers"]);
  assert.match(await p.locator(".lp [data-go=farm]").textContent(), /Farm overview/);
  assert.match(await p.locator(".lp [data-add]").textContent(), /Add cattle, sheep, pigs or poultry/);
  const lines = (await p.locator(".lp [data-status]").allTextContents()).map((t) => t.trim());
  assert.ok(lines.filter(Boolean).length >= 6, lines.join(" | "));
  assert.ok(await p.locator(".sheet").evaluate((s) => s.scrollWidth <= s.clientWidth + 1));
  // go to Laying hens; the button now says so, and the sheet marks it as open
  await p.locator(".lp [data-lp]").nth(5).click(); await H.settle(p, 900);
  assert.match(await p.evaluate(() => location.hash), /^#\/l\//);
  assert.equal((await p.locator("[data-picker] .lb-name").textContent()).trim(), "Laying hens");
  await p.locator("[data-picker]").click(); await H.settle(p, 600);
  assert.equal(await p.locator(".lp [aria-current=page] .primary").textContent(), "Laying hens");
  await p.locator(".lp [data-go=farm]").click(); await H.settle(p, 700);
  assert.equal(await p.evaluate(() => location.hash), "#/farm/today");
  await H.shot(p, "2b-farm-picker-closed");
  assert.deepEqual(p.errors, []);
  await p.ctx.close();
});

test("onboarding uses its numbers: layer houses with bird places, broiler houses; beef/dairy ask no head count; number fields not steppers", async () => {
  const p = await H.phone(env, { verified: true });
  await H.signUp(p);
  await H.go(p, "/onboard/1");
  await p.getByLabel("Farm name").fill("Drumlin Farm");
  await p.getByRole("button", { name: "Continue" }).click(); await H.settle(p, 600);
  for (const t of ["beef", "dairy", "layers", "broilers"]) await p.locator(`.type-tile[data-type=${t}]`).click();
  await p.locator("[data-next]").click(); await H.settle(p, 600);
  assert.equal(await p.locator('[name="beef.headCount"], [name="dairy.cowsInMilk"], [name="dairy.dryCows"]').count(), 0);
  assert.equal(await p.locator('[data-stepper="layers.birdsPerHouse"]').count(), 0, "big counts are a number field");
  assert.match(await p.locator('[data-setup-note=beef]').textContent(), /NIFAIS/);
  await p.locator('[name="layers.birdsPerHouse"]').fill("16,000");
  await p.locator('[data-stepper="layers.houses"] [data-dir="1"]').click();
  await p.locator('[data-stepper="broilers.houses"] [data-dir="1"]').click();
  await p.locator('[data-stepper="broilers.houses"] [data-dir="1"]').click();
  await p.locator("[data-finish]").click();
  await p.waitForFunction(() => location.hash.startsWith("#/farm/today"), null, { timeout: 8000 }); await H.settle(p, 800);
  const L = await ids(p);
  const houses = await p.evaluate(async (L) => { const R = await import("./js/services/records.js"); return { layers: await R.listRecords(L.layers, "houses"), broilers: await R.listRecords(L.broilers, "houses") }; }, L);
  assert.deepEqual(houses.layers.map((h) => [h.name, h.places]).sort(), [["House 1", 16000], ["House 2", 16000]]);
  assert.deepEqual(houses.broilers.map((h) => h.name).sort(), ["House 1", "House 2", "House 3"]);
  const settings = await p.evaluate((id) => window.__fl.session.ledger(id).settings, L.layers);
  assert.equal(settings.birdsPerHouse, 16000);
  // empty homes: one start card, no zero tiles (A #19, B #6)
  await H.go(p, `/l/${L.beef}`); await H.settle(p, 500);
  assert.equal(await p.locator("[data-start-home=beef]").count(), 1);
  assert.match(await p.locator(".start-card").textContent(), /Import your herd list/);
  assert.equal(await p.locator(".num-tile, .tile-row, .herd-strip").count(), 0);
  await H.go(p, `/l/${L.dairy}`); await H.settle(p, 500);
  assert.equal(await p.locator("[data-start-home=dairy]").count(), 1);
  assert.match(await p.locator(".start-card").textContent(), /milk recording/);
  await H.shot(p, "2b-dairy-empty");
  await H.go(p, `/l/${L.layers}`); await H.settle(p, 500);
  assert.equal(await p.getByText("House 2").count() > 0, true, "layer houses show on the home");
  assert.deepEqual(p.errors, []);
  await p.ctx.close();
});

test("demo farm: opens from Welcome on the memory backend (even if Firebase is asked for), banner, nothing saved, Leave returns to Welcome", async () => {
  const ctx = await env.browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const firebase = [];
  // anything Firebase: its SDK files (vendor/firebase-*) or any Google endpoint
  await ctx.route((u) => /\/vendor\/firebase-/.test(u.pathname) || /googleapis|gstatic|firebaseio|firebaseapp/.test(u.hostname), (r) => { firebase.push(r.request().url()); return r.abort(); });
  const p = await H.phone(env, { context: ctx });
  assert.equal(await p.locator("[data-act=demo]").count(), 1);
  // ask for Firebase on purpose: demo=1 must still never load or write it
  await p.evaluate(() => { location.href = location.pathname + "?backend=firestore&sw=0&demo=1#/farm/today"; });
  await p.waitForFunction(() => window.__fl && window.__fl.demo && document.querySelector("#stage .screen"), null, { timeout: 20000 });
  await H.settle(p, 1500);
  assert.equal(await p.locator(".demo-banner").isVisible(), true);
  assert.match(await p.locator(".demo-banner").textContent(), /Demo farm — nothing here is saved/);
  assert.equal(await p.locator(".demo-banner .demo-signup").textContent(), "Sign up");
  const st = await p.evaluate(async () => ({
    firebase: typeof window.firebase, backend: (await import("./js/core/store.js")).backendName(),
    saved: Object.keys(localStorage).filter((k) => /demo-db|demo-auth/.test(k)),
    ledgers: window.__fl.session.sectorLedgers().map((l) => l.type),
    animals: (await (await import("./js/services/records.js")).listRecords(window.__fl.session.sectorLedgers()[0].id, "animals")).length,
  }));
  assert.equal(st.firebase, "undefined"); assert.equal(st.backend, "memory"); assert.deepEqual(st.saved, []);
  assert.deepEqual(st.ledgers, ["beef", "sheep", "dairy"]);
  assert.ok(st.animals > 20, "realistic seeded herd");
  assert.deepEqual(firebase, [], "no request ever went to Firebase");
  // the banner never covers the top bar
  const ban = await p.locator(".demo-banner").boundingBox(); const top = await p.locator(".topbar").boundingBox();
  assert.ok(top.y >= ban.y + ban.height - 1, JSON.stringify({ ban, top }));
  await H.shot(p, "2b-demo-farm");
  assert.deepEqual(firebase, [], "no request ever went to Firebase");
  assert.deepEqual(p.errors, []);
  await ctx.close();
  // from Welcome (as a farmer would), then Leave: back on Welcome, demo gone
  const q = await H.phone(env);
  await q.locator("[data-act=demo]").click();
  await q.waitForFunction(() => window.__fl && window.__fl.demo && document.querySelector("#stage .screen"), null, { timeout: 20000 }); await H.settle(q, 800);
  await q.locator(".demo-banner .demo-exit").click();
  await q.waitForFunction(() => location.hash === "#/welcome" && document.querySelector(".welcome"), null, { timeout: 15000 }); await H.settle(q, 500);
  assert.equal(await q.evaluate(() => /demo=1/.test(location.search)), false);
  assert.equal(await q.locator(".demo-banner").count(), 0);
  assert.equal(await q.getByRole("button", { name: "Create an account" }).count(), 1);
  assert.equal(await q.evaluate(() => window.__fl.auth.user()), null, "nobody signed in after the demo");
  assert.deepEqual(q.errors, []);
  await q.ctx.close();
});

test("Download my data: readable registers with plain headings and names, plus Full backup", async () => {
  const p = await H.phone(env, { verified: true });
  await H.signUp(p);
  await H.onboard(p, { types: ["beef"] });
  await seedBeef(p);
  await H.go(p, "/settings/data"); await H.settle(p, 500);
  assert.match(await p.locator("[data-radio=format]").textContent(), /Records for inspection or your accountant[\s\S]*Full backup/);
  const [dl] = await Promise.all([p.waitForEvent("download"), p.locator("[data-go]").click()]);
  const buf = await (await import("node:fs/promises")).readFile(await dl.path());
  const text = buf.toString("utf8");
  assert.match(text, /Read me\.txt/); assert.match(text, /Beef herd\/Animals\.csv/); assert.match(text, /Beef herd\/Medicines\.csv/);
  assert.match(text, /Record,Tag/); assert.match(text, /Date of birth/); assert.match(text, /Shed 2 finishers/);
  assert.match(text, /\d\d\/\d\d\/20\d\d/);
  assert.doesNotMatch(text, /groupId|createdBy|damId|herdBookNo"?:/, "no code names or JSON in the readable export");
  // Full backup is the raw JSON
  await p.locator("[data-radio=format] [data-value=json]").click();
  const [dl2] = await Promise.all([p.waitForEvent("download"), p.locator("[data-go]").click()]);
  assert.match(dl2.suggestedFilename(), /\.json$/);
  assert.deepEqual(p.errors, []);
  await p.ctx.close();
});

test("untouched sheets close without 'Discard?'; touched ones still ask; bad tag shows inline under the field", async () => {
  const p = await H.phone(env, { verified: true });
  await H.signUp(p);
  await H.onboard(p, { types: ["beef"] });
  const lid = await seedBeef(p);
  await H.go(p, `/l/${lid}`);
  await p.evaluate((lid) => import("./js/sectors/beef/data.js").then(async (d) => (await import("./js/sectors/beef/flows/purchase.js")).default(await d.loadBeef(window.__fl.session.ledger(lid)))), lid);
  await H.settle(p, 600);
  assert.equal(await p.locator(".sheet").count(), 1);
  await p.locator(".sheet [data-sheet-cancel]").first().click(); await H.settle(p, 600);
  assert.equal(await p.locator(".sheet").count(), 0, "closed straight away, no Discard prompt");
  // touched: asks
  await p.evaluate((lid) => import("./js/sectors/beef/data.js").then(async (d) => (await import("./js/sectors/beef/flows/purchase.js")).default(await d.loadBeef(window.__fl.session.ledger(lid)))), lid);
  await H.settle(p, 600);
  await p.locator(".sheet [name=tag0]").fill("UK 9 543210 0077 3");
  await H.settle(p, 200);
  const msg = p.locator(".sheet .tag-msg");
  assert.equal(await msg.count(), 1);
  assert.match(await msg.textContent(), /Check digit doesn't match — for 543210 0077 the last digit should be \d/);
  assert.equal(await p.locator(".sheet [name=tag0]").getAttribute("aria-invalid"), "true");
  await H.shot(p, "2b-tag-inline");
  await p.locator(".sheet [data-sheet-cancel]").first().click(); await H.settle(p, 500);
  assert.match(await p.locator(".sheet").last().textContent(), /Discard this purchase\?/);
  await p.getByRole("button", { name: "Discard" }).click(); await H.settle(p, 500);
  assert.equal(await p.locator(".sheet").count(), 0);
  assert.deepEqual(p.errors, []);
  await p.ctx.close();
});

test("Farm → People: a row opens that person's role; notifications page shows reminder times even when off", async () => {
  const p = await H.phone(env, { verified: true });
  await H.signUp(p);
  await H.onboard(p, { types: ["beef"] });
  const L = await ids(p);
  await p.evaluate((lid) => window.__fl.store.seed(`ledgers/${lid}/members/uSean`, { uid: "uSean", role: "worker", addedAt: new Date(), addedBy: "x", displayName: "Seán McKee", email: "sean@x.test" }), L.beef);
  await H.go(p, "/farm/people"); await H.settle(p, 600);
  await p.locator("[data-person=uSean]").click(); await H.settle(p, 600);
  assert.match(await p.locator(".sheet").textContent(), /Role on Beef herd/);
  await p.locator(".sheet [data-radio=role] [data-value=viewer]").click();
  await p.locator(".sheet [data-save]").click(); await H.settle(p, 700);
  const role = await p.evaluate((lid) => window.__fl.store.raw.get(`ledgers/${lid}/members/uSean`).role, L.beef);
  assert.equal(role, "viewer");
  await H.go(p, "/settings/notifications"); await H.settle(p, 500);
  assert.equal(await p.locator("select[name=summaryTime]").count(), 1, "reminder time can be set before turning on");
  await H.go(p, "/settings/reminders"); await H.settle(p, 700);
  assert.equal(await p.evaluate(() => location.hash), "#/settings/notifications");
  // delete account: nobody else on the farm space -> plainly "Deleted"; the beef herd can be handed over
  await H.go(p, "/settings/delete"); await H.settle(p, 800);
  assert.match(await p.locator("#stage").textContent(), /Hand over to Seán McKee/);
  assert.match(await p.locator("#stage").textContent(), /Farm-wide records[\s\S]*Deleted/);
  assert.doesNotMatch(await p.locator("#stage").textContent(), /Choose for each/);
  assert.deepEqual(p.errors, []);
  await p.ctx.close();
});
