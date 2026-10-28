// Screenshots of every Beef screen and entry sheet at 390x844, light and dark, into
// build/screens/b-*.png (design/10). Fails if any Beef screen logs a JavaScript error.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedBeef } from "./beef-seed.mjs";

let env;
before(async () => { env = await H.setup(); });
after(async () => { await env.close(); });

const SCREENS = [
  // [name, hash (relative to /l/<lid>/), optional action before the shot]
  ["01-today", "today"],
  ["02-today-calving-mode", "today", { mode: "calving" }],
  ["03-today-breeding-mode", "today", { mode: "breeding" }],
  ["04-today-sales-mode", "today", { mode: "sales" }],
  ["05-today-winter-mode", "today", { mode: "winter" }],
  ["06-herd", "herd"],
  ["07-herd-finishing", "herd?f=finishing"],
  ["08-herd-select", "herd", { click: "[data-select]" }],
  ["09-animal-finisher", "animal/{fin}"],
  ["10-animal-cow", "animal/{cow}"],
  ["11-animal-calf", "animal/{calf}"],
  ["12-animal-bull", "animal/{bull}"],
  ["13-breeding-calving", "breeding/calving"],
  ["14-breeding-board", "breeding/board"],
  ["15-breeding-register", "breeding/register"],
  ["16-breeding-heifers", "breeding/heifers"],
  ["17-breeding-fertility", "breeding/fertility"],
  ["18-paperwork", "paperwork"],
  ["19-register-mc3", "paperwork/register"],
  ["20-register-medicine", "paperwork/medicine"],
  ["21-register-movements", "paperwork/movements"],
  ["22-register-sc-scheme", "paperwork/sc"],
  ["23-fqa", "paperwork/fqa"],
  ["24-inspector", "paperwork/inspect"],
  ["25-tb", "paperwork/tb"],
  ["26-finishing", "finishing"],
  ["27-feed", "feed"],
  ["28-money", "money"],
  ["29-tools", "tools"],
  ["30-tool-max-bid", "tools/max-bid"],
  ["31-tool-dose", "tools/dose"],
  ["32-targets", "targets"],
  ["33-groups", "groups"],
  ["34-sires", "sires"],
  ["35-disease", "disease"],
  ["36-sale-sheet", "animal/{bull}/sale-sheet"],
  ["37-more", "more"],
  ["51-tool-calving", "tools/calving"],
  ["52-tool-heifer", "tools/heifer"],
  ["53-tool-wean", "tools/wean"],
  ["54-tool-finish", "tools/finish"],
  ["55-tool-meal", "tools/meal"],
  ["56-tool-slurry", "tools/slurry"],
  ["57-tool-scale", "tools/scale"],
  ["58-register-calvings", "paperwork/calvings"],
  ["59-register-deaths", "paperwork/deaths"],
];
const SHEETS = [
  ["40-quick-add", null],
  ["41-calving-sheet", "Calving"],
  ["42-treatment-sheet", "Treatment"],
  ["43-weigh-sheet", "Weigh"],
  ["44-sale-sheet", "Sale or kill sheet"],
  ["45-purchase-sheet", "Purchase"],
  ["46-death-sheet", "Death"],
  ["47-move-sheet", "Move to group"],
  ["48-bull-ai-sheet", "Bull in/out or AI"],
  ["49-scan-sheet", "Scan result"],
  ["50-add-animal-sheet", "Add an animal"],
];

for (const mode of ["light", "dark"]) {
  test(`beef screens (${mode})`, { timeout: 420000 }, async () => {
    const p = await H.phone(env, { dark: mode === "dark" });
    await H.signUp(p, { email: `beef-${mode}@x.test` }); await H.onboard(p, { types: ["beef"] });
    const lid = await seedBeef(p);
    const ids = await p.evaluate(async (lid) => {
      const { listRecords } = await import("./js/services/records.js"); const a = await listRecords(lid, "animals");
      const t = (s) => a.find((x) => x.tag.replace(/\s/g, "").includes(s));
      return { fin: t("01080")?.id || t("0108")?.id, cow: a.find((x) => x.name === "Daisy").id, calf: t("0231").id, bull: a.find((x) => x.stockBull).id };
    }, lid);
    const shot = (n) => H.shot(p, `b-${n}-${mode}`);
    for (const [name, hash, opt = {}] of SCREENS) {
      if (opt.mode) await p.evaluate(([lid, m]) => localStorage.setItem(`fl10-beef-mode-${lid}`, m), [lid, opt.mode]);
      await H.go(p, `/l/${lid}/more`); // leave the screen so the same hash re-renders
      await H.go(p, `/l/${lid}/${hash.replace(/\{(\w+)\}/g, (_, k) => ids[k])}`); await H.settle(p, 500);
      if (opt.click) { await p.locator(opt.click).first().click(); await H.settle(p, 400); }
      await shot(name);
      if (opt.click) { await p.locator(opt.click).first().click().catch(() => {}); await H.settle(p, 300); }
      if (opt.mode) await p.evaluate((lid) => localStorage.removeItem(`fl10-beef-mode-${lid}`), lid);
    }
    // TB test day + reading (plan one first)
    await H.go(p, `/l/${lid}/paperwork/tb`); await p.locator("[data-plan]").click(); await H.settle(p, 500);
    await p.locator(".sheet").last().locator(".sheet-foot .btn").click(); await H.settle(p, 900);
    await shot("39-tb-test");
    await p.locator("a.btn", { hasText: "Start test day" }).click(); await H.settle(p, 800);
    await p.locator(".tb-row").nth(0).click(); await p.locator(".tb-row").nth(1).click(); await H.settle(p, 300);
    await shot("38-tb-day");
    await p.locator("[data-finish]").click(); await H.settle(p, 500);
    const fin = p.locator(".sheet .btn", { hasText: "Finish day 1" }); if (await fin.count()) { await fin.first().click(); await H.settle(p, 900); }
    await p.locator("a.btn", { hasText: "Record the reading" }).click(); await H.settle(p, 800);
    await shot("60-tb-reading");
    // entry sheets from the + button (on Today)
    for (const [name, label] of SHEETS) {
      await H.go(p, `/l/${lid}/today`);
      await p.locator(".fab").click(); await H.settle(p, 500);
      if (label) {
        if (!(await p.locator(".share-tile", { hasText: label }).count()) && (await p.getByRole("button", { name: "Something else…" }).count())) { await p.getByRole("button", { name: "Something else…" }).click(); await H.settle(p, 200); }
        await p.locator(".share-tile", { hasText: label }).first().click(); await H.settle(p, 700);
      }
      await shot(name);
      for (let i = 0; i < 3; i++) { if (!(await p.locator(".sheet").count())) break; await p.keyboard.press("Escape"); await H.settle(p, 350); const c = p.locator(".sheet .btn", { hasText: /Discard/ }); if (await c.count()) { await c.first().click(); await H.settle(p, 300); } }
    }
    assert.deepEqual(p.errors, []);
    await p.ctx.close();
  });
}
