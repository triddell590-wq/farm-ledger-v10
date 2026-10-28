// Screenshots of the photo pieces at 390x844, light and dark, into build/screens/ph-*.png:
// strip in a record sheet (draft and saved, waiting to upload), the viewer (photo, caption,
// delete confirm), the ledger gallery (empty and full), checklist evidence, receipt on a money
// entry, a Beef death with its docket photo. Fails if any screen logs a JavaScript error.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedPigs } from "./pigs-seed.mjs";

const FIX = new URL("../fixtures/photos/", import.meta.url).pathname;
let env;
before(async () => { env = await H.setup(); });
after(async () => { await env.close(); });

for (const mode of ["light", "dark"]) {
  test(`photo screens (${mode})`, { timeout: 300000 }, async () => {
    const p = await H.phone(env, { dark: mode === "dark", verified: true });
    await H.signUp(p, { email: `photos-${mode}@x.test` }); await H.onboard(p, { types: ["beef", "pigs"] });
    const s = (n) => H.shot(p, `ph-${n}-${mode}`);
    const sheet = () => p.locator(".sheet").last();
    const close = async () => { for (let i = 0; i < 4 && await p.locator(".sheet").count(); i++) { const d = p.locator(".sheet .btn", { hasText: /^\s*Discard/ }); if (await d.count()) await d.first().click(); else await p.keyboard.press("Escape"); await H.settle(p, 400); } };
    const attach = async (scope, files, which = "[data-ph-library]") => {
      const n0 = await scope.locator(".ph-thumb").count();
      const [fc] = await Promise.all([p.waitForEvent("filechooser"), scope.locator(which).first().click()]);
      await fc.setFiles(files.map((f) => FIX + f));
      for (let t = 0; t < 100 && await scope.locator(".ph-thumb").count() < n0 + files.length; t++) await p.waitForTimeout(200);
      await H.settle(p, 300);
    };
    const ids = await p.evaluate(() => { const L = window.__fl.session.ledgers; return { beef: L.find((l) => l.type === "beef").id, pigs: L.find((l) => l.type === "pigs").id }; });

    await H.go(p, `/l/${ids.beef}/more/photos`); await s("01-gallery-empty");

    // Documents: draft strip in the add sheet
    await H.go(p, "/farm/documents");
    await p.locator(".fab").click(); await H.settle(p, 600);
    await p.getByLabel("Title").fill("Herd health plan 2026");
    await attach(sheet(), ["letter.png", "docket.jpg", "camera-rotated.jpg"]);
    await s("02-strip-new-document");
    await sheet().locator(".sheet-foot .btn").click(); await H.settle(p, 800);

    // saved document, offline: a fresh photo waits to upload
    await p.evaluate(() => window.__fl.store.setOnline(false));
    await p.locator(".row", { hasText: "Herd health plan" }).click(); await H.settle(p, 900);
    await attach(sheet(), ["docket.jpg"]);
    await s("04-strip-waiting-to-upload");
    // viewer on the first photo, with a caption
    await sheet().locator(".ph-thumb").first().click(); await H.settle(p, 900);
    const v = p.locator(".ph-viewer");
    await v.locator("[data-cap-edit]").click(); await v.locator(".ph-cap-edit input").fill("Signed page 2 of 4"); await v.locator(".ph-cap-edit button").click(); await H.settle(p, 500);
    await s("05-viewer");
    await v.locator("[data-del]").click(); await H.settle(p, 300); await s("06-viewer-delete-confirm");
    await v.locator("[data-no]").click(); await H.settle(p, 200);
    await v.locator("[data-close]").click(); await H.settle(p, 500);
    await close();
    await p.evaluate(() => window.__fl.store.setOnline(true)); await H.settle(p, 500);

    // Beef death with a docket photo
    await p.evaluate(async (lid) => { const R = await import("./js/services/records.js"); R.addRecord(lid, "animals", { tag: "UK 9 012345 0101 7", sex: "F", breed: "CH", dob: "2019-03-02", status: "onFarm", name: "Clover" }); }, ids.beef);
    await H.settle(p, 300);
    await p.evaluate(async (lid) => { const { loadBeef } = await import("./js/sectors/beef/data.js"); const m = await import("./js/sectors/beef/flows/death.js"); const { session } = window.__fl; const snap = await loadBeef(session.ledgers.find((l) => l.id === lid)); m.default(snap, { animalId: snap.data.animals[0].id }); }, ids.beef);
    await H.settle(p, 700);
    await sheet().locator("select[name=cause]").selectOption("Pneumonia"); await sheet().locator("select[name=disposal]").selectOption("Knackery");
    await attach(sheet(), ["docket.jpg"], "[data-ph-camera]");
    await sheet().locator(".sheet-body").evaluate((b) => b.scrollTo(0, b.scrollHeight)); await H.settle(p, 300);
    await s("07-beef-death-photo");
    await sheet().locator(".sheet-foot .btn").click(); await H.settle(p, 800);

    // Pigs: checklist evidence and a receipt on a money entry, then the gallery
    const pigs = await seedPigs(p);
    await H.go(p, `/l/${pigs}/rt`); await H.settle(p, 600);
    await p.locator("[data-evidence]").first().click(); await H.settle(p, 600);
    await attach(sheet(), ["letter.png"]);
    await s("08-checklist-evidence"); await close();
    await H.go(p, `/l/${pigs}/rt`); await s("09-checklist-photo-buttons");
    await p.evaluate(async (lid) => { const m = await import("./js/ui/money-sheet.js"); const { session } = window.__fl; m.openMoneySheet(session.ledgers.find((l) => l.id === lid)); }, pigs);
    await H.settle(p, 700);
    await sheet().locator("[name=amount]").fill("412.50");
    await attach(sheet(), ["docket.jpg"]);
    await s("10-money-receipt"); await sheet().locator(".sheet-foot .btn").click(); await H.settle(p, 800);
    await p.evaluate(async (lid) => { const q = await import("./js/sectors/pigs/quick-add.js"); const { session } = window.__fl; q.runFlow("feed", session.ledgers.find((l) => l.id === lid)); }, pigs);
    await H.settle(p, 800);
    await sheet().locator("[name=ration]").fill("Finisher pellets"); await sheet().locator("[name=tonnes]").fill("8");
    await attach(sheet(), ["docket.jpg", "camera-rotated.jpg"]);
    await sheet().locator(".sheet-body").evaluate((b) => b.scrollTo(0, b.scrollHeight)); await H.settle(p, 300);
    await s("11-pigs-feed-docket"); await sheet().locator(".sheet-foot .btn").click(); await H.settle(p, 800);
    await H.go(p, `/l/${pigs}/more/photos`); await s("12-gallery");
    await p.locator(".ph-grid .ph-thumb").first().click(); await H.settle(p, 900); await s("13-gallery-viewer");
    await p.locator(".ph-viewer").click({ position: { x: 195, y: 420 } }); await H.settle(p, 700); await s("14-viewer-bars-hidden");
    await p.keyboard.press("Escape"); await H.settle(p, 400);
    await H.go(p, `/l/${pigs}/more`); await s("15-ledger-more-photos-row");
    await H.go(p, "/farm/more"); await s("16-farm-more-photos-row");
    await H.go(p, "/farm/photos"); await s("17-farm-photos");
    assert.deepEqual(p.errors, []);
    await p.ctx.close();
  });
}
