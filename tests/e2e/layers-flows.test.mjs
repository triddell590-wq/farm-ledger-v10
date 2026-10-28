// The most-used Layers entry flows, through the real UI on the in-memory backend:
// daily house sheet (live lay % → house card tick), death causes, packer statement → reconciler
// with £ only in finance, mite traps, Salmonella positive → Class B lock, treatment with egg
// withdrawal → sheet warning, controller import pre-filling the sheet, and a Worker seeing no money.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedLayers } from "./layers-seed.mjs";

let env, p, lid, houses, flocks;
before(async () => {
  env = await H.setup();
  p = await H.phone(env, { verified: true });
  await H.signUp(p, { email: "layers-flows@x.test" }); await H.onboard(p, { types: ["layers"] });
  lid = await seedLayers(p);
  houses = await recs("houses"); flocks = await recs("flocks");
});
after(async () => { await env.close(); });

function recs(coll) { return p.evaluate(async ([lid, coll]) => (await import("./js/services/records.js")).listRecords(lid, coll), [lid, coll]); }
const L = (r) => H.go(p, `/l/${lid}${r}`);
const flow = async (id, arg = {}) => { await p.evaluate(async ([lid, id, arg]) => { const q = await import("./js/sectors/layers/quick-add.js"); const { session } = window.__fl; Promise.resolve(q.runFlow(id, session.ledgers.find((l) => l.id === lid), arg)).catch((e) => console.error(`flow ${id}: ${e.stack}`)); }, [lid, id, arg]); await H.settle(p, 800); };
const sheet = () => p.locator(".sheet").last();
const save = () => sheet().locator(".sheet-foot .btn").last();
const HS = (n) => houses.find((h) => h.name === n).id;
const T = () => p.evaluate(async () => (await import("./js/core/dates.js")).todayStr());

test("daily sheet: House 2 — live lay %, causes, save → card ticks, producer + mortality record", async () => {
  await L("/houses");
  const card = p.locator(`[data-house="${HS("House 2")}"]`);
  await card.locator("[data-sheet]").click(); await H.settle(p, 800);
  assert.match(await save().textContent(), /Add the eggs collected/);
  await sheet().locator("input[name=eggs]").fill("13572"); await H.settle(p, 200);
  assert.match(await sheet().locator("[data-sum]").textContent(), /lay 87\.\d%/);
  await sheet().locator("input[name=dead]").fill("4"); await sheet().locator("input[name=dead]").dispatchEvent("input");
  await sheet().locator("[data-causes]").click(); await H.settle(p, 600);
  await sheet().locator("input[name='c:Peritonitis']").fill("3"); await sheet().locator("input[name='c:Peritonitis']").dispatchEvent("input");
  await sheet().locator(".sheet-foot .btn").click(); await H.settle(p, 600);
  assert.match(await sheet().locator("[data-cv]").textContent(), /Peritonitis 3/);
  await save().click(); await H.settle(p, 900);
  const today = await T();
  const day = (await recs("days")).find((d) => d.houseId === HS("House 2") && d.date === today);
  assert.equal(day.eggsTotal, 13572); assert.equal(day.dead, 4);
  assert.deepEqual(day.deaths.map((x) => [x.cause, x.n]), [["Peritonitis", 3]]);
  assert.ok(day.checks.includes("Birds"), "inspection checks recorded");
  assert.match(await p.locator(`[data-house="${HS("House 2")}"] .ly-done`).textContent(), /Sheet done/);
  await L("/reg/mortality");
  assert.match(await p.locator("body").textContent(), /Peritonitis 3/);
});

test("packer statement → reconciler; prices only in finance", async () => {
  await flow("statement");
  const wk = await sheet().locator("[data-chips=weekStart] [aria-checked=true]").getAttribute("data-value");
  for (const [g, n] of [["XL", 11400], ["L", 98520], ["M", 71640], ["S", 4800], ["Seconds", 3600]]) await sheet().locator(`input[name='e:${g}']`).fill(String(n));
  await sheet().locator("input[name='e:XL']").dispatchEvent("input"); await H.settle(p, 300);
  assert.match(await sheet().locator("[data-recon]").textContent(), /packer counted 189,960/);
  await save().click(); await H.settle(p, 900);
  const st = (await recs("packerStatements")).find((x) => x.weekStart === wk && x.counted === 189960);
  assert.ok(st, "statement saved");
  for (const k of Object.keys(st)) assert.doesNotMatch(k, /price|ppd|amount|paid|total/i, `no £ field ${k} on packerStatements`);
  assert.ok(st.grades.every((g) => g.ppd == null), "grades carry counts only");
  const fin = (await recs("finance")).find((r) => r.id === st.financeId);
  assert.ok(fin && fin.amount > 0 && fin.lines.some((l) => l.ppd === 158), "the money copy lives in finance");
  await L(`/statement/${st.id}`);
  assert.match(await p.locator("body").textContent(), /Packer counted\s*189,960/);
});

test("mite traps: score all 12 traps → session and average", async () => {
  const before = (await recs("miteScores")).length;
  await flow("mite", { houseId: HS("House 2") });
  for (let i = 0; i < 12; i++) { await sheet().locator(`[data-s='${i % 2 ? 3 : 2}']`).click(); await H.settle(p, 60); }
  assert.match(await save().textContent(), /Save 12 traps · average 2\.5/);
  await save().click(); await H.settle(p, 700);
  const all = await recs("miteScores"); assert.equal(all.length, before + 1);
  await L(`/mite/${HS("House 2")}`);
  assert.match(await p.locator("body").textContent(), /2\.5/);
});

test("Salmonella positive locks House 1 eggs to Class B (unsnoozable banner)", async () => {
  const f1 = flocks.find((f) => f.houseId === HS("House 1") && !f.depopDate);
  await flow("salm", { flockId: f1.id });
  await sheet().locator("[data-chips=result] [data-value='S. Enteritidis']").click(); await H.settle(p, 200);
  assert.match(await sheet().textContent(), /Class B/);
  await save().click(); await H.settle(p, 900);
  await L("/houses");
  const body = await p.locator("body").textContent();
  assert.match(body, /House 1: Salmonella positive\. Eggs are Class B/);
  assert.match(await p.locator(`[data-house="${HS("House 1")}"]`).textContent(), /Class B/);
  // a negative confirmatory result lifts the lock
  await flow("salm", { flockId: f1.id });
  await sheet().locator("[data-chips=result] [data-value='Negative']").click();
  await sheet().locator("[data-check=confirmatory]").click(); await H.settle(p, 200);
  await save().click(); await H.settle(p, 900);
  await L("/houses");
  assert.doesNotMatch(await p.locator(`[data-house="${HS("House 1")}"]`).textContent(), /Class B/);
});

test("treatment with egg withdrawal → eggs withheld on the card and the sheet", async () => {
  await flow("treat", { houseId: HS("House 1") });
  await sheet().locator("input[name=productName]").fill("Baytril 10% oral");
  await sheet().locator("input[name=reason]").fill("E. coli");
  await sheet().locator("input[name=eggDays]").fill("9"); await sheet().locator("input[name=eggDays]").dispatchEvent("input"); await H.settle(p, 200);
  await save().click(); await H.settle(p, 900);
  const med = (await recs("medicines")).find((m) => m.productName === "Baytril 10% oral");
  assert.ok(med.eggsOkFrom > await T());
  await L("/houses");
  assert.match(await p.locator(`[data-house="${HS("House 1")}"]`).textContent(), /eggs withheld/);
  await flow("sheet", { houseId: HS("House 1") });
  assert.match(await sheet().textContent(), /Eggs withheld — Baytril/);
  await p.keyboard.press("Escape"); await H.settle(p, 400);
});

test("controller import pre-fills water, temperatures and feed on the sheet", async () => {
  const today = await T(); const dmy = today.split("-").reverse().join("/");
  await L("/import");
  await p.locator(`[data-house="${HS("House 1")}"]`).click(); await H.settle(p, 200);
  await p.locator("[data-src=fancom]").click(); await H.settle(p, 300);
  await p.locator("details summary").click();
  await p.locator("[data-paste]").fill(`Datum;Watermeter;Temp min;Temp max;Feed silo kg\n${dmy};1999000;17,5;22,5;1800`);
  await p.locator("[data-read]").click(); await H.settle(p, 400);
  assert.match(await p.locator("[data-import]").textContent(), /Import 1 day/);
  await p.locator("[data-import]").click(); await H.settle(p, 700);
  const imp = (await recs("imports")).pop();
  assert.deepEqual(imp.rows[0], { date: today, waterMeter: 1999000, tMin: 17.5, tMax: 22.5, feedKg: 1800 });
  // House 1's sheet already exists today (seed), so its saved values win on the form; the import row is there for the sheet to read
  const pre = await p.evaluate(async ([lid, hid, today]) => { const d = await import("./js/sectors/layers/data.js"); const { session } = window.__fl; const snap = await d.loadLayers(session.ledgers.find((l) => l.id === lid)); return snap.data.imports.flatMap((i) => (i.rows || []).filter((r) => r.date === today && (r.houseId || i.houseId) === hid)).length; }, [lid, HS("House 1"), today]);
  assert.equal(pre, 1);
});

test("Worker (stockman): sheet, deaths and mite traps yes — no money anywhere", async () => {
  await H.go(p, `/l/${lid}/more/people`);
  await p.getByRole("button", { name: "Invite someone" }).click(); await H.settle(p, 600);
  await p.getByLabel("Their name").fill("Seán");
  await p.locator(".sheet-foot .btn").click(); await H.settle(p, 900);
  const code = /#\/invite\/([A-Z0-9]{26})/.exec(await p.locator("[data-msg]").textContent())[1];
  await p.keyboard.press("Escape"); await H.settle(p, 400);
  await p.evaluate(() => window.__fl.auth.signOut());
  await H.go(p, `/invite/${code}`);
  await p.getByRole("button", { name: "Create an account to join" }).click(); await H.settle(p);
  await p.getByLabel("Your name").fill("Seán McKee"); await p.getByLabel("Email").fill("sean-layers@x.test");
  await p.getByLabel("Password", { exact: true }).fill("password123"); await p.getByRole("checkbox", { name: /I agree/ }).click();
  await p.locator(".sheet-foot .btn").click();
  await p.waitForFunction((l) => location.hash.startsWith("#/l/" + l), lid); await H.settle(p, 900);
  const tabs = await p.locator(".tabbar .tab span").allTextContents();
  assert.deepEqual(tabs, ["Houses", "Flock", "Eggs", "Health", "More"]);
  await p.locator(".fab").click(); await H.settle(p, 500);
  const qa = await p.locator(".sheet").textContent();
  assert.match(qa, /Daily sheet/); assert.match(qa, /Mite traps/); assert.doesNotMatch(qa, /Money/);
  await p.keyboard.press("Escape"); await H.settle(p, 400);
  await L("/eggs/packer");
  assert.doesNotMatch(await p.locator("body").textContent(), /£|p\/doz/);
  await L("/more");
  assert.doesNotMatch(await p.locator("body").textContent(), /Money per dozen/);
  await L("/tools");
  assert.doesNotMatch(await p.locator("body").textContent(), /Feed per dozen|Depop decision/);
  await L("/layers-settings");
  assert.doesNotMatch(await p.locator("body").textContent(), /Egg prices/);
});

test("no JavaScript errors", () => { assert.deepEqual(p.errors, []); });
