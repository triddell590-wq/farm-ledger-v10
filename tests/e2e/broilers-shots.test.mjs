// Screenshots of every Broilers screen at 390x844, light and dark, into build/screens/br-*.png.
// Fails if any screen logs a JavaScript error.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedBroilers } from "./broilers-seed.mjs";

let env;
before(async () => { env = await H.setup(); });
after(async () => { await env.close(); });

const recs = (p, lid, coll) => p.evaluate(async ([lid, coll]) => (await import("./js/services/records.js")).listRecords(lid, coll), [lid, coll]);
const flow = (p, lid, id, arg = {}) => p.evaluate(async ([lid, id, arg]) => { const q = await import("./js/sectors/broilers/quick-add.js"); const { session } = window.__fl; q.runFlow(id, session.ledgers.find((l) => l.id === lid), arg); }, [lid, id, arg]);

for (const mode of ["light", "dark"]) {
  test(`broilers screens (${mode})`, { timeout: 400000 }, async () => {
    const p = await H.phone(env, { dark: mode === "dark" });
    const s = (n) => H.shot(p, `br-${n}-${mode}`);
    const close = async () => { for (let i = 0; i < 3; i++) { if (!(await p.locator(".sheet").count())) break; const d = p.locator(".sheet .btn", { hasText: /^\s*Discard/ }); if (await d.count()) await d.first().click(); else await p.keyboard.press("Escape"); await H.settle(p, 350); } };
    const sheetShot = async (lid, id, arg, name, scroll = 0) => { await flow(p, lid, id, arg); await H.settle(p, 700); await s(name); if (scroll) { await p.evaluate((y) => document.querySelector(".sheet:last-of-type .sheet-body")?.scrollTo(0, y), scroll); await H.settle(p, 250); await s(`${name}-lower`); } await close(); };
    await H.signUp(p, { email: `br-${mode}@x.test` }); await H.onboard(p, { types: ["broilers"] });
    { // empty states (design/15 §16)
      const lid0 = await p.evaluate(() => window.__fl.session.ledgers.find((l) => l.type === "broilers").id);
      for (const [r, n] of [["/crop", "00-empty-crop"], ["/growth", "00b-empty-growth"], ["/crops", "00c-empty-crops"], ["/turnaround", "00d-empty-turnaround"]]) { await H.go(p, `/l/${lid0}${r}`); await s(n); }
    }
    const lid = await seedBroilers(p); await H.settle(p, 600);
    const L = (r) => H.go(p, `/l/${lid}${r}`);
    const crops = await recs(p, lid, "crops"); const thins = await recs(p, lid, "thins"); const houses = await recs(p, lid, "houses"); const samples = await recs(p, lid, "salmSamples");
    const H1 = houses.find((h) => h.name === "House 1").id, H2 = houses.find((h) => h.name === "House 2").id;
    const cur = crops.find((c) => c.no === 41 && c.houseId === H2); const cur1 = crops.find((c) => c.no === 41 && c.houseId === H1);
    const plan = thins.find((t) => t.cropId === cur1.id && t.status === "planned"); const c40 = crops.find((c) => c.no === 40 && c.houseId === H1);
    const done40 = thins.find((t) => t.cropId === c40.id && t.kind === "clear");
    // ---- Crop (home) ----
    await L("/crop"); await s("01-crop");
    await p.evaluate(() => window.scrollTo(0, 700)); await s("01b-crop-cards"); await p.evaluate(() => window.scrollTo(0, 1500)); await s("01c-crop-todo"); await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator(".fab").click(); await H.settle(p, 500); await s("02-quick-add"); await close();
    await L("/crop"); await p.locator(`[data-house="${H2}"] [data-flow="pm"]`).click(); await H.settle(p, 800); await s("03-check-pm");
    await p.evaluate(() => document.querySelector(".sheet .sheet-body")?.scrollTo(0, 700)); await H.settle(p, 250); await s("03b-check-house"); await p.evaluate(() => document.querySelector(".sheet .sheet-body")?.scrollTo(0, 3000)); await H.settle(p, 250); await s("03c-check-summary"); await close();
    // ---- Growth ----
    await L("/growth"); await s("10-growth"); await p.evaluate(() => window.scrollTo(0, 900)); await s("10b-growth-density"); await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator("[data-line='water']").click(); await H.settle(p, 300); await s("11-growth-water"); await p.locator("[data-line='gain']").click(); await H.settle(p, 300); await s("11b-growth-gain"); await p.locator("[data-line='weight']").click();
    await L(`/growth/${cur.id}`); await s("12-growth-house2");
    await L(`/density/${cur1.id}`); await s("13-density"); await p.evaluate(() => window.scrollTo(0, 800)); await s("13b-density-law"); await p.evaluate(() => window.scrollTo(0, 0));
    await sheetShot(lid, "weigh", { cropId: cur.id }, "14-flow-weigh");
    // ---- Crops ----
    await L("/crops"); await s("20-crops"); await p.locator("[data-f]").first().click(); await H.settle(p, 200); await s("20b-crops-formula"); await p.evaluate(() => window.scrollTo(0, 900)); await s("20c-crops-history"); await p.evaluate(() => window.scrollTo(0, 0));
    await L(`/crop-result/${c40.id}`); await s("21-crop-result"); await p.evaluate(() => window.scrollTo(0, 900)); await s("21b-crop-result-money"); await p.evaluate(() => window.scrollTo(0, 1800)); await s("21c-crop-result-mortality"); await p.evaluate(() => window.scrollTo(0, 0));
    // ---- Paperwork ----
    await L("/paperwork"); await s("30-paperwork"); await p.evaluate(() => window.scrollTo(0, 800)); await s("30b-paperwork-registers"); await p.evaluate(() => window.scrollTo(0, 0));
    await L("/rt"); await s("31-rt-checklist"); await p.evaluate(() => window.scrollTo(0, 1600)); await s("31b-rt-lower"); await p.evaluate(() => window.scrollTo(0, 0));
    await L("/inspect"); await s("32-inspect");
    await L(`/salm/${cur1.id}`); await s("33-salmonella");
    await L(`/fci/${cur1.id}/${plan.id}`); await s("34-fci"); await p.evaluate(() => window.scrollTo(0, 900)); await s("34b-fci-lower"); await p.evaluate(() => window.scrollTo(0, 0));
    await L(`/paperwork/house/${cur.id}`); await s("35-house-record");
    for (const k of ["medicines", "alarms", "environment", "turnaround", "salmonella", "fci", "feed", "thins", "density", "visitors", "water", "training"]) { await L(`/paperwork/${k}`); await s(`36-reg-${k}`); }
    await L("/birdreg"); await s("37-bird-register");
    // ---- Thin / clear-out ----
    await L(`/thin/${cur1.id}/${plan.id}`); await s("40-thin-planned");
    await L(`/thin/${c40.id}/${done40.id}`); await s("40b-clear-done");
    await sheetShot(lid, "thin", { cropId: cur1.id, thinId: plan.id }, "41-flow-thin", 600);
    await sheetShot(lid, "planClear", { cropId: cur1.id }, "42-flow-plan-clear");
    await sheetShot(lid, "docket", { cropId: c40.id, thinId: done40.id }, "43-flow-docket");
    // ---- other entry flows ----
    await sheetShot(lid, "medicine", { cropId: cur1.id }, "44-flow-medicine");
    await sheetShot(lid, "salm", { cropId: cur1.id }, "45-flow-salmonella");
    await sheetShot(lid, "salmResult", { sampleId: samples[0].id }, "45b-flow-salm-result");
    await sheetShot(lid, "alarm", {}, "46-flow-alarm");
    await sheetShot(lid, "feed", { cropId: cur1.id }, "47-flow-feed");
    await sheetShot(lid, "visitor", {}, "48-flow-visitor");
    await sheetShot(lid, "water", {}, "48b-flow-water-test");
    await sheetShot(lid, "training", {}, "48c-flow-training");
    await sheetShot(lid, "settlement", { cropId: crops.find((c) => c.no === 40 && c.houseId === H2).id }, "49-flow-settlement");
    await sheetShot(lid, "contract", {}, "50-flow-contract", 900);
    await sheetShot(lid, "energy", { cropId: c40.id }, "51-flow-energy");
    await sheetShot(lid, "controller", {}, "52-flow-controller");
    await sheetShot(lid, "notice", { cropId: cur1.id }, "53-flow-density-notice");
    await sheetShot(lid, "house", { houseId: H1 }, "54-flow-house");
    await sheetShot(lid, "birdReturn", { year: 2027, birds: 0, establishmentNo: "UK5012345" }, "55-flow-bird-return");
    // ---- More ----
    await L("/more"); await s("60-more");
    await L("/houses"); await s("61-houses");
    await L("/contract"); await s("62-contract"); await p.evaluate(() => window.scrollTo(0, 800)); await s("62b-contract-money"); await p.evaluate(() => window.scrollTo(0, 0));
    await L("/tools"); await s("63-tools");
    for (const t of ["density", "legal", "epef", "projection", "uniformity", "payment", "energy", "income", "dates", "workdays"]) { await L(`/tools/${t}`); if (t === "uniformity") { await p.locator("textarea[name=w]").fill("1820 1765 1902 1690 1844 1777 1930 1712 1801 1865"); await H.settle(p, 200); } await s(`64-tool-${t}`); }
    await L("/br-settings"); await s("65-settings"); await p.evaluate(() => window.scrollTo(0, 1500)); await s("65b-settings-lower"); await p.evaluate(() => window.scrollTo(0, 0));
    await L(`/brooding/${cur1.id}`); await s("66-brooding-done");
    assert.deepEqual(p.errors, []);
    await p.ctx.close();
  });

  test(`broilers turnaround and brooding (${mode})`, { timeout: 200000 }, async () => {
    const p = await H.phone(env, { dark: mode === "dark" });
    const s = (n) => H.shot(p, `br-${n}-${mode}`);
    const close = async () => { for (let i = 0; i < 3; i++) { if (!(await p.locator(".sheet").count())) break; const d = p.locator(".sheet .btn", { hasText: /^\s*Discard/ }); if (await d.count()) await d.first().click(); else await p.keyboard.press("Escape"); await H.settle(p, 350); } };
    await H.signUp(p, { email: `br-ta-${mode}@x.test` }); await H.onboard(p, { types: ["broilers"] });
    const lid = await seedBroilers(p, { variant: "turnaround" }); await H.settle(p, 600);
    const L = (r) => H.go(p, `/l/${lid}${r}`);
    const houses = await recs(p, lid, "houses"); const crops = await recs(p, lid, "crops");
    const H1 = houses.find((h) => h.name === "House 1").id; const young = crops.find((c) => !c.clearedDate);
    await L("/crop"); await s("70-crop-turnaround");
    await p.evaluate(() => window.scrollTo(0, 700)); await s("70b-crop-turnaround-lower"); await p.evaluate(() => window.scrollTo(0, 0));
    await L(`/turnaround/${H1}`); await s("71-turnaround"); await p.evaluate(() => window.scrollTo(0, 700)); await s("71b-turnaround-lower"); await p.evaluate(() => window.scrollTo(0, 0));
    await L(`/brooding/${young.id}`); await s("72-brooding-day1");
    await p.locator("[data-flow='brooding']").nth(4).click(); await H.settle(p, 700); await s("73-flow-crop-fill-24h"); await close();
    await p.locator("[data-flow='complaint']").click(); await H.settle(p, 700); await s("74-flow-chick-complaint"); await close();
    await L(`/turnaround/${H1}`); await p.locator("[data-flow='step']").nth(2).click(); await H.settle(p, 700); await s("75-flow-disinfected"); await close();
    await p.locator("[data-flow='placement']").click(); await H.settle(p, 700); await s("76-flow-next-chicks"); await close();
    await p.locator("[data-flow='startCrop']").click(); await H.settle(p, 700); await s("77-flow-chicks-placed"); await close();
    await L("/crop"); await p.locator(".fab").click(); await H.settle(p, 500); await s("78-quick-add-brooding"); await close();
    await L("/turnaround"); await s("79-turnaround-list");
    assert.deepEqual(p.errors, []);
    await p.ctx.close();
  });
}
