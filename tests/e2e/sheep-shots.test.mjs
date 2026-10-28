// Screenshots of every Sheep screen at 390x844, light and dark, into build/screens/s-*.png.
// Fails if any screen logs a JavaScript error.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedSheep } from "./sheep-seed.mjs";

let env;
before(async () => { env = await H.setup(); });
after(async () => { await env.close(); });

const recs = (p, lid, coll) => p.evaluate(async ([lid, coll]) => (await import("./js/services/records.js")).listRecords(lid, coll), [lid, coll]);

for (const mode of ["light", "dark"]) {
  test(`sheep screens (${mode})`, { timeout: 240000 }, async () => {
    const p = await H.phone(env, { dark: mode === "dark" });
    await H.signUp(p, { email: `sheep-${mode}@x.test` }); await H.onboard(p, { types: ["sheep"] });
    const lid = await seedSheep(p);
    const s = (n) => H.shot(p, `s-${n}-${mode}`);
    const L = (r) => H.go(p, `/l/${lid}${r}`);
    const close = async () => { await p.keyboard.press("Escape"); await H.settle(p, 300); if (await p.locator(".sheet").count()) { await p.keyboard.press("Escape"); await H.settle(p, 400); } };
    await L("/flock"); await s("01-flock-tupping");
    await p.evaluate(() => window.scrollTo(0, 700)); await s("01b-flock-scrolled"); await p.evaluate(() => window.scrollTo(0, 0));
    for (const st of ["scanning", "lambing", "grazing", "weaning"]) { await p.evaluate(([lid, st]) => localStorage.setItem(`fl10-sheep-stage-${lid}`, st), [lid, st]); await L("/mobs"); await L("/flock"); await s(`02-flock-${st}`); }
    await p.evaluate((lid) => localStorage.setItem(`fl10-sheep-stage-${lid}`, "auto"), lid);
    await L("/flock"); await p.locator(".fab").click(); await H.settle(p, 500); await s("03-quick-add"); await close();
    await L("/mobs"); await s("04-mobs");
    const mobs = await recs(p, lid, "mobs"); await L(`/mob/${mobs.find((m) => m.name.startsWith("Mule")).id}`); await s("05-mob");
    const sheep = await recs(p, lid, "sheep"); await L(`/sheep/${sheep.find((x) => x.class === "ewe").id}`); await s("06-ewe");
    await L("/rams"); await s("07-rams");
    await L("/year"); await s("08-year");
    for (const st of ["tupping", "scanning", "lambing", "grazing", "weaning"]) { await L(`/year/${st}`); await s(`09-year-${st}`); }
    await L("/funnel"); await s("10-funnel");
    await L("/shed"); await s("11-shed");
    await p.locator(".shed [data-a=mob]").click(); await p.locator(".shed [data-mob]").first().click(); await p.locator(".shed [data-raddle]").first().click();
    await p.locator(".shed [data-n='2']").click(); await p.locator(".shed [data-l='1'][data-f=dead]").click(); await H.settle(p, 200); await s("11b-shed-filled");
    await p.locator(".shed [data-done]").click(); await H.settle(p, 500);
    await L("/flock");
    for (const [flow, name] of [["raddle", "12-raddle"], ["scan", "13-scan"], ["treat", "14-dose"], ["lame", "15-lame"], ["bcs", "16-bcs"], ["weigh", "17-weigh"], ["draft", "18-sell"], ["buy", "19-buy"], ["death", "20-death"], ["offMove", "21-move-off"], ["tag", "22-tag-lambs"], ["fec", "23-fec"], ["cull", "24-cull"], ["newMob", "25-new-mob"]]) {
      await p.evaluate(async ([lid, flow]) => { const q = await import("./js/sectors/sheep/quick-add.js"); const { session } = window.__fl; await q.runFlow(flow, session.ledgers.find((l) => l.id === lid)); }, [lid, flow]);
      await H.settle(p, 700); await s(name); await close();
    }
    await L("/paperwork"); await s("30-paperwork");
    for (const r of ["register", "movements", "medicine", "deaths", "tagging", "inventory", "fqa", "inspect", "disease"]) { await L(`/paperwork/${r}`); await s(`31-${r}`); }
    const mv = await recs(p, lid, "movements"); await L(`/movement/${mv.find((m) => m.kind === "off" && !m.notifiedOn).id}`); await s("32-movement");
    await L("/more"); await s("40-more");
    await L("/worms"); await s("41-worms");
    await L("/tools"); await s("42-tools");
    await L("/tools/meal"); await s("43-tool-meal");
    await L("/money"); await s("44-money");
    await L("/targets"); await s("45-targets");
    assert.deepEqual(p.errors, []);
    await p.ctx.close();
  });
}
