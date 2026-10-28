// Photos on records, end to end on the in-memory backend: attach from a fixture image (the
// phone's file chooser), shrink + EXIF strip + orientation, view (swipe, caption), delete with
// confirm, "Waiting to upload" while offline, draft photos count as unsaved changes, checklist
// photo evidence — across Documents (farm), Beef, Sheep and Pigs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedBeef } from "./beef-seed.mjs";
import { seedSheep } from "./sheep-seed.mjs";
import { seedPigs } from "./pigs-seed.mjs";

const FIX = new URL("../fixtures/photos/", import.meta.url).pathname;
let env, p, beef, sheep, pigs;
before(async () => {
  env = await H.setup(); p = await H.phone(env, { verified: true });
  await H.signUp(p, { email: "photos@x.test" }); await H.onboard(p, { types: ["beef", "sheep", "pigs"] });
  beef = await seedBeef(p); sheep = await seedSheep(p); pigs = await seedPigs(p);
});
after(async () => { await env.close(); });

const sheet = () => p.locator(".sheet").last();
const save = () => sheet().locator(".sheet-foot .btn").click();
const photos = (lid) => p.evaluate(async (lid) => { const s = await import("./js/core/store.js"); return s.store.query(`ledgers/${lid}/photos`); }, lid);
const chunk = (lid, id) => p.evaluate(async ([lid, id]) => { const s = await import("./js/core/store.js"); return (await s.store.get(`ledgers/${lid}/photos/${id}/chunks/0`)).data; }, [lid, id]);
async function attach(scope, files, which = "[data-ph-library]") {
  const n0 = await scope.locator(".ph-thumb").count();
  const [fc] = await Promise.all([p.waitForEvent("filechooser"), scope.locator(which).first().click()]);
  await fc.setFiles(files.map((f) => FIX + f));
  for (let t = 0; t < 100 && await scope.locator(".ph-thumb").count() < n0 + files.length; t++) await p.waitForTimeout(200);
  assert.equal(await scope.locator(".ph-thumb").count(), n0 + files.length, "photos ready");
  await H.settle(p, 300);
}
async function closeAll() {
  for (let i = 0; i < 4 && await p.locator(".sheet").count(); i++) {
    const d = p.locator(".sheet .btn", { hasText: /^\s*Discard/ }); if (await d.count()) await d.first().click(); else await p.keyboard.press("Escape");
    await H.settle(p, 400);
  }
}
async function farmSpace() { return p.evaluate(() => window.__fl.session.farm().space.id); }

test("Documents: two photos on a new document — shrunk to 1600 px / 350 KB, EXIF gone, turned the right way", async () => {
  await H.go(p, "/farm/documents");
  await p.locator(".fab").click(); await H.settle(p, 600);
  await p.getByLabel("Title").fill("TB test certificate");
  await attach(sheet(), ["camera-rotated.jpg", "letter.png"]);
  assert.equal(await sheet().locator(".ph-thumb").count(), 2);
  assert.equal(await sheet().locator("[data-count]").textContent(), "2");
  await save(); await H.settle(p, 800);
  const fid = await farmSpace();
  const list = await photos(fid);
  assert.equal(list.length, 2);
  for (const ph of list) {
    assert.equal(ph.parentColl, "documents"); assert.equal(ph.money, false); assert.match(ph.parentLabel, /TB test certificate/);
    assert.ok(Math.max(ph.w, ph.h) <= 1600, "longest side 1600"); assert.ok(ph.bytes <= 350 * 1024, `<= 350 KB (${ph.bytes})`);
    assert.ok(ph.thumb.startsWith("data:image/jpeg;base64,") && ph.thumb.length < 60000, "small inline thumbnail");
    const raw = Buffer.from(await chunk(fid, ph.id), "base64");
    assert.equal(raw[0], 0xff); assert.equal(raw[1], 0xd8, "JPEG");
    assert.ok(!raw.includes(Buffer.from("FakeCam")) && !raw.includes(Buffer.from("Exif\0\0")), "EXIF (camera, GPS) stripped");
  }
  const cam = list.find((x) => x.w === 1067 || x.h === 1600 && x.w < x.h);
  assert.ok(cam, "the 3000×2000 photo stored with EXIF orientation 6 comes out portrait 1067×1600");
  assert.deepEqual(p.errors, []);
});

test("Viewer: swipe to the next photo, caption it, delete one with confirm", async () => {
  await H.go(p, "/farm/documents");
  await p.locator(".row", { hasText: "TB test certificate" }).click(); await H.settle(p, 900);
  assert.equal(await sheet().locator(".ph-thumb").count(), 2);
  await sheet().locator(".ph-thumb").first().click(); await H.settle(p, 600);
  const v = p.locator(".ph-viewer");
  assert.equal((await v.locator(".ph-n").textContent()).trim(), "1 of 2");
  // swipe left with a touch-like drag
  const box = await v.boundingBox();
  await p.mouse.move(box.width * 0.8, box.height / 2); await p.mouse.down();
  await p.mouse.move(box.width * 0.2, box.height / 2, { steps: 8 }); await p.mouse.up(); await H.settle(p, 500);
  assert.equal((await v.locator(".ph-n").textContent()).trim(), "2 of 2");
  await v.locator("[data-cap-edit]").click(); await v.locator(".ph-cap-edit input").fill("Signed by the vet"); await v.locator(".ph-cap-edit button").click(); await H.settle(p, 400);
  assert.equal((await v.locator(".ph-cap").textContent()).trim(), "Signed by the vet");
  await v.locator("[data-del]").click(); await H.settle(p, 200);
  assert.ok(await v.locator(".ph-confirm").isVisible());
  await v.locator("[data-no]").click(); await H.settle(p, 200);
  assert.equal(await v.locator(".ph-confirm").isVisible(), false, "Keep it closes the confirm");
  await v.locator("[data-del]").click(); await v.locator("[data-yes]").click(); await H.settle(p, 600);
  assert.equal((await v.locator(".ph-n").textContent()).trim(), "Photos of the document", "one left: the strip's title, no counter");
  await v.locator("[data-close]").click(); await H.settle(p, 500);
  assert.equal(await p.locator(".ph-viewer").count(), 0);
  const left = await photos(await farmSpace());
  assert.equal(left.length, 1); assert.equal(left[0].caption, "", "the captioned one was deleted");
  assert.equal(await sheet().locator(".ph-thumb").count(), 1);
  await closeAll();
  assert.deepEqual(p.errors, []);
});

test("A new record's unsaved photos count as changes: closing asks before discarding them", async () => {
  await H.go(p, "/farm/documents");
  await p.locator(".fab").click(); await H.settle(p, 600);
  await attach(sheet(), ["docket.jpg"]);
  await p.keyboard.press("Escape"); await H.settle(p, 500);
  assert.ok(await p.locator(".sheet .btn", { hasText: "Discard" }).count(), "discard confirm shown");
  await p.locator(".sheet .btn", { hasText: "Discard" }).first().click(); await H.settle(p, 500);
  assert.equal((await photos(await farmSpace())).length, 1, "nothing saved");
});

test("Beef: death with a docket photo (camera) → photo on the death record, shown in Photos", async () => {
  await closeAll(); await H.go(p, `/l/${beef}/today`);
  await p.evaluate(async (lid) => { const { loadBeef } = await import("./js/sectors/beef/data.js"); const m = await import("./js/sectors/beef/flows/death.js"); const { session } = window.__fl; const snap = await loadBeef(session.ledgers.find((l) => l.id === lid)); const a = snap.data.animals.find((x) => x.status === "onFarm"); m.default(snap, { animalId: a.id }); }, beef);
  await H.settle(p, 700);
  await sheet().locator("select[name=cause]").selectOption("Pneumonia");
  await sheet().locator("select[name=disposal]").selectOption("Knackery");
  await attach(sheet(), ["docket.jpg"], "[data-ph-camera]");
  await save(); await H.settle(p, 800);
  const deaths = await p.evaluate(async (lid) => (await import("./js/services/records.js")).listRecords(lid, "deaths"), beef);
  const d = deaths.find((x) => x.cause === "Pneumonia");
  const ph = (await photos(beef)).filter((x) => x.parentColl === "deaths" && x.parentId === d.id);
  assert.equal(ph.length, 1); assert.match(ph[0].parentLabel, /^Death · /);
  await H.go(p, `/l/${beef}/more`);
  await p.locator(".row", { hasText: "Photos" }).first().click(); await H.settle(p, 800);
  assert.match(await p.locator("body").textContent(), /Photos/);
  assert.equal(await p.locator(".ph-grid .ph-thumb").count(), 1);
  assert.deepEqual(p.errors, []);
});

test("Sheep: the vet's letter photo lifts a scab restriction (photo instead of the tick)", async () => {
  await closeAll();
  const rep = await p.evaluate(async (lid) => { const A = await import("./js/sectors/sheep/actions.js"); return A.reportDisease(lid, { disease: "scab", date: "2026-10-01" }); }, sheep);
  await H.settle(p, 300);
  await p.evaluate(async ([lid, rid]) => { const { loadSheep } = await import("./js/sectors/sheep/data.js"); const m = await import("./js/sectors/sheep/flows/disease.js"); const { session } = window.__fl; const snap = await loadSheep(session.ledgers.find((l) => l.id === lid)); m.clearSheet(snap, snap.data.diseaseReports.find((r) => r.id === rid)); }, [sheep, rep]);
  await H.settle(p, 700);
  await sheet().locator("[name=letterDate]").fill("2026-10-20"); await H.settle(p, 300);
  assert.match(await sheet().locator(".sheet-foot .btn").textContent(), /Photo the letter or tick/);
  await attach(sheet(), ["letter.png"]);
  await H.settle(p, 300);
  assert.equal((await sheet().locator(".sheet-foot .btn").textContent()).trim(), "Lift restriction");
  await save(); await H.settle(p, 800);
  const r = (await p.evaluate(async (lid) => (await import("./js/services/records.js")).listRecords(lid, "diseaseReports"), sheep)).find((x) => x.id === rep);
  assert.ok(r.clearedOn); assert.equal(r.letterPhotos, 1);
  const ph = (await photos(sheep)).filter((x) => x.parentColl === "diseaseReports" && x.parentId === rep);
  assert.equal(ph.length, 1);
  assert.deepEqual(p.errors, []);
});

test("Pigs offline: feed docket photo shows 'Waiting to upload' until the signal comes back", async () => {
  await closeAll(); await H.go(p, `/l/${pigs}/week`);
  await p.evaluate(() => window.__fl.store.setOnline(false));
  await p.evaluate(async (lid) => { const q = await import("./js/sectors/pigs/quick-add.js"); const { session } = window.__fl; q.runFlow("feed", session.ledgers.find((l) => l.id === lid)); }, pigs);
  await H.settle(p, 800);
  await sheet().locator("[name=ration]").fill("Finisher pellets"); await sheet().locator("[name=tonnes]").fill("8");
  await attach(sheet(), ["docket.jpg"]);
  await save(); await H.settle(p, 800);
  await H.go(p, `/l/${pigs}/more/photos`); await H.settle(p, 600);
  assert.equal(await p.locator(".ph-grid .ph-thumb").count(), 1);
  assert.equal(await p.locator(".ph-grid .ph-wait").count(), 1, "waiting badge on the tile");
  assert.match(await p.locator("body").textContent(), /1 photo waiting to upload/);
  await p.evaluate(() => window.__fl.store.setOnline(true)); await H.settle(p, 600);
  assert.equal(await p.locator(".ph-grid .ph-wait").count(), 0, "badge gone once synced");
  const ph = (await photos(pigs))[0];
  assert.equal(ph.parentColl, "feedDeliveries"); assert.match(ph.parentLabel, /Feed docket · Finisher pellets/);
  assert.deepEqual(p.errors, []);
});

test("Pigs Red Tractor checklist: photo evidence on an item", async () => {
  await closeAll(); await H.go(p, `/l/${pigs}/rt`); await H.settle(p, 600);
  const b = p.locator("[data-evidence]").first(); const id = await b.getAttribute("data-evidence");
  await b.click(); await H.settle(p, 600);
  assert.match(await sheet().textContent(), /Photo evidence/);
  await attach(sheet(), ["letter.png"]);
  await H.settle(p, 300);
  const ph = (await photos(pigs)).filter((x) => x.parentColl === "checklist");
  assert.equal(ph.length, 1); assert.equal(ph[0].parentId, `rtChecklist.${id}`);
  await closeAll();
  assert.deepEqual(p.errors, []);
});

test("A worker doesn't see photos on money records; the accountant sees only those", async () => {
  // money photo through the Money sheet (receipt), as the owner
  await closeAll();
  await p.evaluate(async (lid) => { const m = await import("./js/ui/money-sheet.js"); const { session } = window.__fl; m.openMoneySheet(session.ledgers.find((l) => l.id === lid)); }, pigs);
  await H.settle(p, 700);
  await sheet().locator("[name=amount]").fill("412.50");
  await attach(sheet(), ["docket.jpg"]);
  await save(); await H.settle(p, 800);
  const all = await photos(pigs);
  assert.equal(all.filter((x) => x.money).length, 1, "receipt saved as a money photo");
  const seen = await p.evaluate(async (lid) => {
    const P = await import("./js/services/photos.js");
    return { worker: (await P.listPhotos(lid, "worker")).map((x) => x.money), accountant: (await P.listPhotos(lid, "accountant")).map((x) => x.money) };
  }, pigs);
  assert.ok(seen.worker.every((m) => m === false) && seen.worker.length >= 1);
  assert.deepEqual(seen.accountant, [true]);
  assert.deepEqual(p.errors, []);
});
