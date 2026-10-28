// End-to-end platform flows on the in-memory backend (Chromium, phone size).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";

let env;
before(async () => { env = await H.setup(); });
after(async () => { await env.close(); });

const hash = (p) => p.evaluate(() => location.hash);

test("sign up -> check email -> onboarding -> Overview with one card per ledger, rail in sector order", async () => {
  const p = await H.phone(env);
  await H.signUp(p);
  assert.equal(await hash(p), "#/verify");
  await H.onboard(p, { types: ["layers", "beef", "sheep"] });
  const rail = await p.locator(".rail .rail-pill").allTextContents();
  assert.deepEqual(rail.map((t) => t.trim()), ["Farm", "Beef", "Sheep", "Layers"]);
  assert.equal(await p.locator("[data-ledger-card]").count(), 3);
  assert.equal(await p.locator("#stage h1").first().textContent(), "Drumlin Farm");
  assert.deepEqual(p.errors, []);
  await p.ctx.close();
});

test("required fields: Save says what is missing; onboarding needs a farm name and a type", async () => {
  const p = await H.phone(env);
  await p.getByRole("button", { name: "Create an account" }).click(); await H.settle(p);
  const btn = p.locator(".sheet-foot .btn");
  assert.equal((await btn.textContent()).trim(), "Add your name to continue");
  assert.equal(await btn.isDisabled(), true);
  await p.getByLabel("Your name").fill("A"); assert.equal((await btn.textContent()).trim(), "Add your email to continue");
  await p.getByLabel("Email").fill("a@b.co"); await p.getByLabel("Password", { exact: true }).fill("short");
  assert.equal((await btn.textContent()).trim(), "Use at least 8 characters");
  await p.getByLabel("Password", { exact: true }).fill("long enough");
  assert.equal((await btn.textContent()).trim(), "Tick to agree to continue");
  await p.getByRole("checkbox", { name: /I agree/ }).click();
  assert.equal((await btn.textContent()).trim(), "Create account");
  await btn.click(); await H.settle(p, 700);
  await H.go(p, "/onboard/1");
  assert.equal((await p.locator("[data-next]").textContent()).trim(), "Add your farm name to continue");
  await p.getByLabel("Farm name").fill("X"); await p.locator("[data-next]").click(); await H.settle(p, 600);
  assert.equal((await p.locator("[data-next]").textContent()).trim(), "Pick at least one");
  await p.locator(".type-tile[data-type=pigs]").click();
  assert.equal((await p.locator("[data-next]").textContent()).trim(), "Continue with 1 ledger");
  assert.equal(await p.locator(".type-tile[data-type=pigs]").getAttribute("aria-checked"), "true");
  await p.ctx.close();
});

test("wrong password message, then sign in lands on the Overview", async () => {
  const p = await H.phone(env);
  await H.addUser(p, "ann@x.test", "right password", "Ann");
  await p.getByRole("button", { name: "I have an account" }).click(); await H.settle(p);
  await p.getByLabel("Email").fill("ann@x.test"); await p.getByLabel("Password", { exact: true }).fill("wrong one");
  await p.locator(".sheet-foot .btn").click(); await H.settle(p);
  assert.match(await p.locator(".field-error").textContent(), /don't match/);
  await p.getByLabel("Password", { exact: true }).fill("right password");
  await p.locator(".sheet-foot .btn").click(); await H.settle(p, 800);
  assert.equal(await hash(p), "#/onboard/1"); // no ledgers yet
  await p.ctx.close();
});

test("invite a worker; they join from the link and cannot see money", async () => {
  const p = await H.phone(env, { verified: true });
  await H.signUp(p, { email: "own@x.test" });
  await H.onboard(p, { types: ["beef"] });
  const lid = await p.evaluate(() => window.__fl.session.sectorLedgers()[0].id);
  await H.go(p, `/l/${lid}/more/people`);
  await p.getByRole("button", { name: "Invite someone" }).click(); await H.settle(p, 600);
  await p.getByLabel("Their name").fill("Seán");
  await p.locator(".sheet-foot .btn").click(); await H.settle(p, 900);
  const msg = await p.locator("[data-msg]").textContent();
  assert.match(msg, /has invited Seán to help with the Beef records on Drumlin Farm in Farm Ledger\. Tap to join: http.*#\/invite\/[A-Z0-9]{26} \. The link works once and runs out on/);
  const code = /#\/invite\/([A-Z0-9]{26})/.exec(msg)[1];
  await p.keyboard.press("Escape"); await H.settle(p, 400);
  assert.match(await p.locator("[data-inv]").textContent(), /Seán · Worker on Beef/);
  // same browser storage = same fake "server"; sign out and open the link as a new person
  await p.evaluate(() => window.__fl.auth.signOut());
  await H.go(p, `/invite/${code}`);
  assert.match(await p.locator("#stage h1").textContent(), /invited you to\s*Drumlin Farm – Beef/);
  await p.getByRole("button", { name: "Create an account to join" }).click(); await H.settle(p);
  await p.getByLabel("Your name").fill("Seán McKee"); await p.getByLabel("Email").fill("sean@x.test");
  await p.getByLabel("Password", { exact: true }).fill("password123"); await p.getByRole("checkbox", { name: /I agree/ }).click();
  await p.locator(".sheet-foot .btn").click();
  await p.waitForFunction((l) => location.hash.startsWith("#/l/" + l), lid); await H.settle(p, 700);
  const tabs = await p.locator(".tabbar .tab span").allTextContents();
  assert.deepEqual(tabs, ["Today", "Herd", "Breeding", "Paperwork", "More"]); // Beef module (design/10 §2.1); no Money for a worker
  assert.equal(await p.locator(".rail-add").count(), 0);
  await H.go(p, "/farm/money"); // not in their tabs; screen says money is hidden
  assert.match(await p.locator(".empty h2").textContent(), /hidden for your role/);
  // the link now says used
  await H.go(p, `/invite/${code}`);
  assert.equal(await hash(p), `#/l/${lid}`); // already a member -> straight to the ledger
  assert.deepEqual(p.errors, []);
  await p.ctx.close();
});

test("offline: pill says Saved on phone, entries still save, back online says Synced", async () => {
  const p = await H.phone(env);
  await H.signUp(p, { email: "off@x.test" }); await H.onboard(p, { types: ["sheep"] });
  { const l0 = await p.evaluate(() => window.__fl.session.sectorLedgers()[0].id); await H.go(p, `/l/${l0}`); await p.locator(".fab").click(); await H.settle(p, 500); await p.keyboard.press("Escape"); await H.settle(p, 400); await H.go(p, "/farm/today"); } // load the Sheep modules once online (sw=0 here; test 19 covers the service worker)
  await p.ctx.setOffline(true); await H.settle(p, 300);
  assert.equal((await p.locator(".sync .lbl").textContent()).trim(), "Saved on phone");
  const lid = await p.evaluate(() => window.__fl.session.sectorLedgers()[0].id);
  await H.go(p, `/l/${lid}`);
  await p.locator(".fab").click(); await H.settle(p, 500);
  await p.getByRole("button", { name: /^(Job to do|Note or job)$/ }).click(); await H.settle(p, 600); // Sheep is a built ledger now: its quick add says "Note or job"
  await p.getByLabel("Job", { exact: true }).fill("Dose ewes"); await p.locator(".sheet-foot .btn").click(); await H.settle(p, 600);
  assert.match(await p.locator(".toast").textContent(), /Job saved/);
  await H.go(p, "/farm/today");
  assert.match(await p.locator(".task").first().textContent(), /Dose ewes/);
  await p.ctx.setOffline(false); await H.settle(p, 300);
  assert.equal((await p.locator(".sync .lbl").textContent()).trim(), "Synced");
  await p.ctx.close();
});

test("ticking a task on the Overview collapses it into Done today and Undo brings it back", async () => {
  const p = await H.phone(env);
  await H.signUp(p, { email: "tick@x.test" }); await H.onboard(p, { types: ["beef"] });
  await p.evaluate(async () => { const { addTask } = await import("./js/services/tasks.js"); addTask(window.__fl.session.sectorLedgers()[0].id, { title: "Weigh pen 4" }); });
  await H.go(p, "/farm/more"); await H.go(p, "/farm/today");
  await p.locator(".task .tick").first().click();
  assert.equal(await p.locator(".task").first().getAttribute("class"), "task done");
  await p.waitForTimeout(1700);
  assert.match(await p.locator("[data-done-toggle]").textContent(), /Done today \(1\)/);
  await p.locator(".toast button").click(); await H.settle(p, 500);
  assert.equal(await p.locator(".task:not(.done)").count(), 1);
  await p.ctx.close();
});

test("dirty sheet asks before discarding; reduced motion is honoured", async () => {
  const p = await H.phone(env, { reduced: true });
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains("reduce-motion")), true);
  // the farm-wide Money screen (whole-farm money sheet) — holds whatever sectors are built
  await H.signUp(p, { email: "dirty@x.test" }); await H.onboard(p, { types: ["broilers"] });
  await H.go(p, "/farm/money");
  await p.locator(".fab").click(); await H.settle(p, 300);
  await p.getByLabel("Amount (£)").fill("12.50");
  await p.locator("[data-sheet-cancel]").first().click(); await H.settle(p, 300);
  assert.match(await p.locator(".sheet-title-sm").last().textContent(), /Discard this entry\?/);
  await p.getByRole("button", { name: "Keep editing" }).click(); await H.settle(p, 300);
  await p.locator(".sheet-foot .btn").click(); await H.settle(p, 500);
  assert.match(await p.locator("main, body").first().textContent(), /£12\.50/);
  await p.ctx.close();
});

test("delete account: typed DELETE + password; everything owned is gone", async () => {
  const p = await H.phone(env);
  await H.signUp(p, { email: "bye@x.test", password: "password123" }); await H.onboard(p, { types: ["beef", "dairy"] });
  await H.go(p, "/settings/delete");
  const btn = p.locator("[data-go]");
  assert.equal(await btn.isDisabled(), true);
  await p.getByLabel("Type DELETE to confirm").fill("delete"); await p.getByLabel("Your password", { exact: true }).fill("password123");
  await btn.click();
  await p.waitForFunction(() => location.hash === "#/deleted", null, { timeout: 8000 });
  const left = await p.evaluate(() => [...window.__fl.store.raw.keys()].filter((k) => k.startsWith("ledgers/") || k.startsWith("users/")));
  assert.deepEqual(left, []);
  await p.ctx.close();
});

test("service worker: the app opens with no signal after one visit", async () => {
  const ctx = await env.browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`${env.server.url}index.html?backend=memory#/welcome`);
  await p.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
  await p.waitForTimeout(1500);
  await ctx.setOffline(true);
  await p.reload();
  await p.waitForFunction(() => !document.getElementById("splash"), null, { timeout: 10000 });
  assert.match(await p.locator("#stage h1").textContent(), /in your pocket/);
  await ctx.close();
});
