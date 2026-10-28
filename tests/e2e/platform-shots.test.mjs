// Screenshots of every platform screen at 390x844, light and dark, into build/screens/.
// Also fails if any screen logs a JavaScript error.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";

let env;
before(async () => { env = await H.setup(); });
after(async () => { await env.close(); });

for (const mode of ["light", "dark"]) {
  test(`platform screens (${mode})`, { timeout: 180000 }, async () => {
    const dark = mode === "dark"; const s = (n) => H.shot(p, `p-${n}-${mode}`);
    let p = await H.phone(env, { dark, hash: "/welcome" });
    // splash (fresh load, caught mid-animation and at rest)
    const sp = await p.ctx.newPage();
    await sp.goto(`${env.server.url}index.html?backend=memory&sw=0#/welcome`); await sp.waitForTimeout(350);
    await sp.screenshot({ path: H.SCREENS + `p-00-splash-mid-${mode}.png` }); await sp.waitForTimeout(700);
    await sp.screenshot({ path: H.SCREENS + `p-00-splash-rest-${mode}.png` }); await sp.close();
    await s("01-welcome");
    await p.getByRole("button", { name: "Create an account" }).click(); await H.settle(p, 600); await s("02-create-account");
    await p.locator("[data-sheet-cancel]").first().click(); await H.settle(p, 500);
    await p.getByRole("button", { name: "I have an account" }).click(); await H.settle(p, 600); await s("03-sign-in");
    await p.getByRole("button", { name: "Forgot password?" }).click(); await H.settle(p, 600); await s("04-forgot-password");
    await p.keyboard.press("Escape"); await H.settle(p, 300); await p.keyboard.press("Escape"); await H.settle(p, 500);
    await H.signUp(p); await s("05-check-email");
    await H.go(p, "/onboard/1"); await p.getByLabel("Farm name").fill("Drumlin Farm"); await s("06-onboard-farm");
    await p.getByRole("button", { name: "Continue" }).click(); await H.settle(p, 600);
    for (const t of ["beef", "sheep", "layers"]) await p.locator(`.type-tile[data-type=${t}]`).click();
    await s("07-onboard-types");
    await p.locator("[data-next]").click(); await H.settle(p, 600);
    await p.locator('[name="beef.herdNo"]').fill("123456");
    await s("08-onboard-numbers");
    await p.locator("[data-finish]").click(); await p.waitForTimeout(150); await p.screenshot({ path: H.SCREENS + `p-09-building-${mode}.png` });
    await p.waitForFunction(() => location.hash.startsWith("#/farm/today"));
    // add some content so screens aren't empty
    await p.evaluate(async () => {
      const { session } = window.__fl; const ls = session.sectorLedgers();
      const { addTask } = await import("./js/services/tasks.js"); const { addRecord } = await import("./js/services/records.js");
      addTask(ls[0].id, { title: "Weigh pen 4 bullocks" }); addTask(ls[1].id, { title: "Move ewes to Far Hill" }); addTask(ls[2].id, { title: "Egg count House 1" });
      const space = session.farm().space;
      addRecord(ls[0].id, "finance", { kind: "revenue", category: "Livestock Sales", amount: 9800, date: new Date().toISOString().slice(0, 10), note: "Bullocks" });
      addRecord(ls[0].id, "finance", { kind: "expense", category: "Feed", amount: 4210, date: new Date().toISOString().slice(0, 10) });
      addRecord(ls[2].id, "finance", { kind: "revenue", category: "Eggs", amount: 5520, date: new Date().toISOString().slice(0, 10) });
      addRecord(space.id, "finance", { kind: "expense", category: "Diesel", amount: 700, date: new Date().toISOString().slice(0, 10) });
      addRecord(space.id, "fields", { name: "Top Field", acreage: 6.2, type: "Grazing" });
      addRecord(space.id, "contacts", { name: "Jane Vet MRCVS", kind: "Vet", phone: "028 7964 0000" });
    });
    await H.go(p, "/farm/more"); await H.go(p, "/farm/today"); await H.settle(p, 500);
    await s("10-overview-today");
    await p.evaluate(() => window.scrollTo(0, 2000)); await s("11-overview-today-scrolled"); await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator(".fab").click(); await H.settle(p, 600); await s("12-fab-which-ledger"); await p.keyboard.press("Escape"); await H.settle(p, 400);
    await H.go(p, "/farm/money"); await s("13-overview-money");
    await H.go(p, "/farm/map"); await s("14-overview-map");
    await H.go(p, "/farm/people"); await s("15-overview-people");
    await H.go(p, "/farm/more"); await s("16-overview-more");
    await H.go(p, "/farm/contacts"); await s("17-contacts");
    await H.go(p, "/farm/medicines"); await s("18-medicine-store");
    const lid = await p.evaluate(() => window.__fl.session.sectorLedgers()[0].id);
    await H.go(p, `/l/${lid}`); await s("19-ledger-home");
    await H.go(p, `/l/${lid}/more`); await s("20-ledger-more");
    await H.go(p, `/l/${lid}/more/people`); await s("21-ledger-people");
    await p.evaluate(() => window.__fl.auth.verifyEmail("tom@example.com")); await p.evaluate(() => window.__fl.auth.reload());
    await p.getByRole("button", { name: "Invite someone" }).click(); await H.settle(p, 600); await s("22-invite");
    await p.locator(".sheet-foot .btn").click(); await H.settle(p, 900); await s("23-invite-share");
    const link = await p.locator("[data-msg]").textContent();
    await p.keyboard.press("Escape"); await H.settle(p, 400);
    await H.go(p, `/l/${lid}/more/settings`); await s("24-ledger-settings");
    await H.go(p, "/settings"); await s("25-settings");
    await H.go(p, "/settings/appearance"); await s("26-appearance");
    await H.go(p, "/settings/data"); await s("27-download-data");
    await H.go(p, "/settings/delete"); await s("28-delete-account");
    await H.go(p, "/legal/privacy"); await s("29-privacy");
    await H.go(p, "/legal/terms"); await s("30-terms");
    await H.go(p, "/settings/farm"); await s("31-farm-details");
    await H.go(p, "/add-ledger"); await s("32-add-ledger");
    // the invited person: new phone, opens the link
    const code = /#\/invite\/([A-Z0-9]+)/.exec(link)[1];
    const q = await H.phone(env, { dark, hash: `/invite/${code}`, context: await env.browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: dark ? "dark" : "light", isMobile: true, hasTouch: true, storageState: await p.ctx.storageState() }) });
    await q.evaluate(() => window.__fl.auth.signOut()); await H.go(q, "/welcome"); await H.go(q, `/invite/${code}`);
    await H.shot(q, `p-33-invite-preview-${mode}`);
    assert.deepEqual(p.errors, []); assert.deepEqual(q.errors, []);
    await q.ctx.close(); await p.ctx.close();
  });
}
