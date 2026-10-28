// Screenshots of every Layers screen at 390x844, light and dark, into build/screens/l-*.png.
// Fails if any screen logs a JavaScript error.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedLayers } from "./layers-seed.mjs";

let env;
before(async () => { env = await H.setup(); });
after(async () => { await env.close(); });

const recs = (p, lid, coll) => p.evaluate(async ([lid, coll]) => (await import("./js/services/records.js")).listRecords(lid, coll), [lid, coll]);
const flow = (p, lid, id, arg = {}) => p.evaluate(async ([lid, id, arg]) => { const q = await import("./js/sectors/layers/quick-add.js"); const { session } = window.__fl; Promise.resolve(q.runFlow(id, session.ledgers.find((l) => l.id === lid), arg)).catch((e) => console.error(`flow ${id}: ${e.stack}`)); }, [lid, id, arg]);

for (const mode of ["light", "dark"]) {
  test(`layers screens (${mode})`, { timeout: 400000 }, async () => {
    const p = await H.phone(env, { dark: mode === "dark" });
    await H.signUp(p, { email: `layers-${mode}@x.test` }); await H.onboard(p, { types: ["layers"] });
    const s = (n) => H.shot(p, `l-${n}-${mode}`);
    const close = async () => { for (let i = 0; i < 4 && (await p.locator(".sheet").count()); i++) { await p.keyboard.press("Escape"); await H.settle(p, 350); const d = p.getByRole("button", { name: /^Discard/ }); if (await d.count()) { await d.first().click(); await H.settle(p, 350); } } };
    { // empty states before anything is recorded (design/14 §14)
      const lid0 = await p.evaluate(() => window.__fl.session.ledgers.find((l) => l.type === "layers").id);
      for (const [r, n] of [["/houses", "00-empty-houses"], ["/flock", "00b-empty-flock"], ["/eggs/packer", "00c-empty-packer"], ["/health", "00d-empty-health"]]) { await H.go(p, `/l/${lid0}${r}`); await s(n); }
    }
    const lid = await seedLayers(p);
    const L = (r) => H.go(p, `/l/${lid}${r}`);
    const houses = await recs(p, lid, "houses"); const flocks = await recs(p, lid, "flocks"); const sts = await recs(p, lid, "packerStatements");
    const HS = (n) => houses.find((h) => h.name === n).id;
    const live = (n) => flocks.find((f) => f.houseId === HS(n) && !f.depopDate && f.placedDate <= new Date().toISOString().slice(0, 10)).id;
    const next = flocks.find((f) => f.houseId === HS("House 3") && !f.depopDate).id;
    const T = new Date().toISOString().slice(0, 10);

    await L("/houses"); await s("01-houses");
    await p.evaluate(() => window.scrollTo(0, 760)); await s("01b-houses-cards"); await p.evaluate(() => window.scrollTo(0, 1600)); await s("01c-houses-todo"); await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator(".fab").click(); await H.settle(p, 500); await s("02-quick-add"); await close();
    await flow(p, lid, "sheet", { houseId: HS("House 2") }); await H.settle(p, 800); await s("03-daily-sheet");
    await p.locator(".sheet input[name=eggs]").fill("13572"); await H.settle(p, 300); await s("03b-daily-sheet-typed");
    await p.locator(".sheet [data-causes]").click(); await H.settle(p, 600); await s("03c-death-causes"); await close();
    await L(`/sheet/${HS("House 1")}/${T}`); await H.settle(p, 900); await s("03d-sheet-deep-link"); await close();
    await L(`/house/${HS("House 2")}`); await s("04-house-2"); await p.evaluate(() => window.scrollTo(0, 900)); await s("04b-house-2-lower"); await p.evaluate(() => window.scrollTo(0, 0));
    await L(`/house/${HS("House 3")}`); await s("05-house-empty");
    await L("/flock"); await s("10-flock");
    for (const [line, n] of [["eggWt", "10b-flock-eggwt"], ["feed", "10c-flock-feed"], ["bw", "10d-flock-bw"], ["mort", "10e-flock-mort"]]) { await p.locator(`[data-line=${line}]`).click(); await H.settle(p, 500); await s(n); }
    await p.locator("[data-line=lay]").click(); await H.settle(p, 300);
    await p.evaluate(() => window.scrollTo(0, 700)); await s("10f-flock-lower"); await p.evaluate(() => window.scrollTo(0, 0));
    await L(`/curve/${live("House 2")}`); await s("11-curve-house-2");
    await L(`/weekly/${live("House 2")}`); await s("12-weekly");
    await L(`/flock/${live("House 2")}/passport`); await s("13-passport"); await p.evaluate(() => window.scrollTo(0, 900)); await s("13b-passport-lower"); await p.evaluate(() => window.scrollTo(0, 0));
    await L(`/flock/${next}`); await s("14-next-flock");
    for (const seg of ["production", "packer", "store", "money"]) { await L(`/eggs/${seg}`); await s(`20-eggs-${seg}`); }
    await L(`/statement/${sts.sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0].id}`); await s("21-statement");
    await L("/health"); await s("30-health"); await p.evaluate(() => window.scrollTo(0, 800)); await s("30b-health-lower"); await p.evaluate(() => window.scrollTo(0, 0));
    for (const sec of ["mortality", "vaccinations", "treatments", "samples"]) { await L(`/health/${sec}`); await s(`31-health-${sec}`); }
    await L(`/mite/${HS("House 1")}`); await s("32-mite");
    await L(`/salmonella/${live("House 2")}`); await s("33-salmonella");
    for (const k of ["weights", "eggs", "feather"]) { await L(`/samples/${HS("House 1")}/${k}`); await s(`34-samples-${k}`); }
    await L("/more"); await s("40-more");
    await L("/layers-paperwork"); await s("41-paperwork");
    for (const r of ["production", "collections", "store", "passports", "salmonella", "mortality", "medicines", "moves", "space", "birdRegister"]) { await L(`/reg/${r}`); await s(`42-reg-${r}`); }
    await L("/lion"); await s("43-lion"); await L("/inspect"); await s("44-inspect");
    await L("/range"); await s("45-range"); await L("/range/biosecurity"); await s("46-biosecurity");
    await L("/lighting"); await s("47-lighting");
    for (const k of ["alarm", "visitors", "rodent", "feed", "moves", "healthPlan", "manure"]) { await L(`/logs/${k}`); await s(`48-log-${k}`); }
    await L("/tools"); await s("50-tools");
    for (const t of ["sheet", "water", "spike", "uniformity", "dozen", "depop", "space", "dusk"]) { await L(`/tools/${t}`); await s(`51-tool-${t}`); }
    await L("/layers-money"); await s("52-money");
    await L("/layers-settings"); await s("53-settings"); await L("/layers-settings/prices"); await H.settle(p, 500); await s("53b-settings-prices");
    await L("/houses-setup"); await s("54-setup");
    await L("/import"); await s("55-import");
    await p.locator("[data-src=maximus]").click(); await H.settle(p, 300);
    await p.locator("details summary").click(); await p.locator("[data-paste]").fill(`Date;Water meter;Temp min;Temp max;Feed kg\n${T.split("-").reverse().join("/")};1284560;18,5;23,9;1880`); await p.locator("[data-read]").click(); await H.settle(p, 400); await s("55b-import-map");
    await L("/bird-register"); await s("56-bird-register");
    await L("/houses");
    const flows = [["deaths", "60-flow-deaths", { houseId: HS("House 2") }], ["collection", "61-flow-collection", {}], ["feed", "62-flow-feed", {}], ["mite", "63-flow-mite", { houseId: HS("House 1") }], ["note", "64-flow-note", {}], ["statement", "65-flow-statement", {}], ["storeTemp", "66-flow-store-temp", {}],
      ["salm", "67-flow-salmonella", { flockId: live("House 2") }], ["treat", "68-flow-treat", { houseId: HS("House 2") }], ["vacc", "69-flow-vacc", { flockId: live("House 2") }], ["weights", "70-flow-weigh", { houseId: HS("House 1") }], ["feather", "71-flow-feather", { houseId: HS("House 1") }],
      ["house", "72-flow-house", { id: HS("House 1") }], ["place", "73-flow-place", { houseId: HS("House 3") }], ["editFlock", "74-flow-flock-plan", { id: live("House 2") }], ["depop", "75-flow-depop", { id: live("House 2") }], ["log", "76-flow-alarm", { kind: "alarm" }], ["log", "77-flow-visitor", { kind: "visitors" }]];
    for (const [f, name, arg] of flows) { await flow(p, lid, f, arg); await H.settle(p, 800); await s(name); await close(); }
    // RSPCA (optional) and farm gate (small flock settings)
    await p.evaluate(async (lid) => { const R = await import("./js/services/records.js"); const m = await R.getMeta(lid, "settings"); await R.setMeta(lid, "settings", { ...m, rspca: true, farmGate: true }); }, lid);
    await L("/rspca"); await s("80-rspca"); await L("/eggs/farm-gate"); await s("81-eggs-farm-gate");
    assert.deepEqual(p.errors, [], "no JS errors on Layers screens");
    await p.ctx.close();
  });
}
