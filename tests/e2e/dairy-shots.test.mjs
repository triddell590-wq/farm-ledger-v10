// Screenshots of every Dairy screen at 390x844, light and dark, into build/screens/d-*.png.
// Fails if any screen logs a JavaScript error.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedDairy } from "./dairy-seed.mjs";

let env;
before(async () => { env = await H.setup(); });
after(async () => { await env.close(); });

const recs = (p, lid, coll) => p.evaluate(async ([lid, coll]) => (await import("./js/services/records.js")).listRecords(lid, coll), [lid, coll]);
const MODES = (process.env.DAIRY_MODES || "light,dark").split(",");

for (const mode of MODES) {
  test(`dairy screens (${mode})`, { timeout: 300000 }, async () => {
    const p = await H.phone(env, { dark: mode === "dark" });
    await H.signUp(p, { email: `dairy-${mode}@x.test` }); await H.onboard(p, { types: ["dairy"] });
    const lid = await seedDairy(p);
    const s = (n) => H.shot(p, `d-${n}-${mode}`);
    const L = (r) => H.go(p, `/l/${lid}${r}`);
    const close = async () => { for (let i = 0; i < 3 && (await p.locator(".sheet").count()); i++) { await p.keyboard.press("Escape"); await H.settle(p, 350); const d = p.getByRole("button", { name: /^Discard/ }); if (await d.count()) { await d.first().click(); await H.settle(p, 350); } } };
    await L("/milking"); await s("01-milking");
    await p.evaluate(() => window.scrollTo(0, 900)); await s("01b-milking-scrolled"); await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator(".fab").click(); await H.settle(p, 500); await s("02-quick-add"); await close();
    const animals = await recs(p, lid, "animals"); const cow = (no) => animals.find((a) => a.cowNo === String(no)).id;
    await L("/cows"); await s("03-cows");
    await L(`/cow/${cow(214)}`); await s("04-cow"); await p.evaluate(() => window.scrollTo(0, 900)); await s("04b-cow-scrolled"); await p.evaluate(() => window.scrollTo(0, 0));
    const calf = animals.find((a) => a.calf && a.tag); await L(`/cow/${calf.id}`); await s("05-calf");
    await L("/fertility"); await s("06-fertility");
    for (const v of ["vet", "sires", "kpis"]) { await L(`/fertility/${v}`); await s(`07-fertility-${v}`); }
    await L("/milk"); await s("08-milk");
    for (const seg of ["tank", "quality", "mastitis", "cheques"]) { await L(`/milk/${seg}`); await s(`09-milk-${seg}`); }
    await L("/milking");
    for (const [id, name] of [["treat", "10-treatment"], ["bulling", "11-seen-bulling"], ["served", "12-served"], ["calving", "13-calving"], ["tank", "14-tank"], ["note", "15-handover"], ["pd", "16-pd"], ["dry", "17-dry-off"], ["fresh", "18-fresh"], ["btv", "19-btv"], ["add", "20-add-cow"], ["off", "21-off-farm"]]) {
      await p.evaluate(async ([lid, id]) => { const q = await import("./js/sectors/dairy/quick-add.js"); const { session } = window.__fl; q.runFlow(id, session.ledgers.find((l) => l.id === lid)); }, [lid, id]);
      await H.settle(p, 800); await s(name); await close();
    }
    await L("/more"); await s("30-more");
    await L("/paperwork"); await s("31-paperwork");
    for (const r of ["register", "medicine", "withhold", "tank", "quality", "mastitis", "dryoffs", "machine", "scores", "training", "abfailures", "collation"]) { await L(`/paperwork/${r}`); await s(`32-reg-${r}`); }
    await L("/rt"); await s("33-red-tractor");
    await L("/inspect"); await s("34-inspect");
    await L("/calves"); await s("35-calves");
    await L("/feed"); await s("36-feed");
    await L("/slurry"); await s("37-slurry");
    await L("/money"); await s("38-money");
    await L("/scores"); await s("39-scores");
    await p.evaluate(async (lid) => { const { session } = window.__fl; const { loadDairy } = await import("./js/sectors/dairy/data.js"); const f = await import("./js/sectors/dairy/flows/scores.js"); f.scoreSession(await loadDairy(session.ledgers.find((l) => l.id === lid)), { method: "mobility" }); }, lid);
    await H.settle(p, 700); await p.locator("[data-no]").fill("214"); await p.locator("[data-s='2']").click(); await p.locator("[data-no]").fill("302"); await p.locator("[data-s='1']").click(); await H.settle(p, 200); await s("40-mobility-session"); await close();
    for (const k of ["parlour-machine", "training", "ab-failures", "tb", "foot", "people-log"]) { await L(`/${k}`); await s(`41-${k}`); }
    await L("/tools"); await s("42-tools");
    for (const t of ["dates", "cheque", "mopf", "conc", "mixing", "growth", "tape", "slurry", "cull", "sdct", "disease"]) { await L(`/tools/${t}`); await s(`43-tool-${t}`); }
    await L("/imports"); await s("44-imports");
    await L("/dairy-settings"); await s("45-settings");
    assert.deepEqual(p.errors, []);
    await p.ctx.close();
  });
}
