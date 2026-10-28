// Screenshots of every Pigs screen at 390x844, light and dark, into build/screens/p-g-*.png.
// Fails if any screen logs a JavaScript error.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedPigs } from "./pigs-seed.mjs";

let env;
before(async () => { env = await H.setup(); });
after(async () => { await env.close(); });

const recs = (p, lid, coll) => p.evaluate(async ([lid, coll]) => (await import("./js/services/records.js")).listRecords(lid, coll), [lid, coll]);
const flow = (p, lid, id, arg = {}) => p.evaluate(async ([lid, id, arg]) => { const q = await import("./js/sectors/pigs/quick-add.js"); const { session } = window.__fl; q.runFlow(id, session.ledgers.find((l) => l.id === lid), arg); }, [lid, id, arg]);

for (const mode of ["light", "dark"]) {
  test(`pigs screens (${mode})`, { timeout: 300000 }, async () => {
    const p = await H.phone(env, { dark: mode === "dark" });
    await H.signUp(p, { email: `pigs-${mode}@x.test` }); await H.onboard(p, { types: ["pigs"] });
    { // empty states before anything is recorded (design/13 §14)
      const lid0 = await p.evaluate(() => window.__fl.session.ledgers.find((l) => l.type === "pigs").id);
      for (const [r, n] of [["/week", "00-empty-week"], ["/sows", "00b-empty-sows"], ["/batches", "00c-empty-batches"], ["/gate", "00d-empty-visitors"]]) { await H.go(p, `/l/${lid0}${r}`); await H.shot(p, `p-g-${n}-${mode}`); }
    }
    const lid = await seedPigs(p);
    const s = (n) => H.shot(p, `p-g-${n}-${mode}`);
    const L = (r) => H.go(p, `/l/${lid}${r}`);
    const close = async () => { for (let i = 0; i < 3; i++) { if (!(await p.locator(".sheet").count())) break; await p.keyboard.press("Escape"); await H.settle(p, 350); } };
    const rooms = await recs(p, lid, "rooms"); const batches = await recs(p, lid, "batches"); const sows = await recs(p, lid, "sows");
    const R = (n) => rooms.find((r) => r.name === n).id; const B = (no) => batches.find((b) => b.no === no).id; const S = (no) => sows.find((x) => x.sowNo === no).id;
    await L("/week"); await s("01-week");
    await p.evaluate(() => window.scrollTo(0, 820)); await s("01b-week-rooms"); await p.evaluate(() => window.scrollTo(0, 1640)); await s("01c-week-todo"); await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator("[data-wk='1']").click(); await H.settle(p, 500); await s("02-week-next");
    await p.locator("[data-wk='-1']").click(); await H.settle(p, 400);
    await p.locator(".pg-wd.today").click(); await H.settle(p, 500); await s("03-day-sheet"); await close();
    await p.locator(".fab").click(); await H.settle(p, 500); await s("04-quick-add"); await close();
    await L("/sows"); await s("10-sows");
    await L(`/sow/${S("1190")}`); await s("11-sow-suckling");
    await L(`/sow/${S("1205")}`); await s("12-sow-in-crate");
    await L(`/sow/${S("1302")}`); await s("13-sow-served");
    await L("/service"); await s("14-service");
    await L("/rooms"); await s("20-rooms");
    await L(`/room/${R("Finisher 2")}`); await s("21-room-finisher"); await p.evaluate(() => window.scrollTo(0, 700)); await s("21b-room-finisher-lower"); await p.evaluate(() => window.scrollTo(0, 0));
    await L(`/room/${R("Farrowing 3")}`); await s("22-room-farrowing");
    await L(`/room/${R("Finisher 4")}`); await s("23-room-wash");
    await L(`/room/${R("Weaner 1")}`); await s("24-room-weaner");
    await L(`/crate/${R("Farrowing 3")}/12`); await H.settle(p, 700); await s("25-crate-card"); await p.evaluate(() => document.querySelector(".sheet .sheet-body")?.scrollTo(0, 900)); await H.settle(p, 200); await s("25b-crate-card-lower"); await close();
    await L(`/room/${R("Farrowing 3")}`); await p.locator("[data-crates] [data-crate='3']").click(); await H.settle(p, 700); await s("26-crate-new-litter"); await close();
    await L("/batches"); await s("30-batches");
    await L(`/batch/${B(35)}`); await s("31-batch-card"); await p.locator("[data-f]").first().click(); await H.settle(p, 200); await s("31b-batch-formula"); await p.evaluate(() => window.scrollTo(0, 800)); await s("31c-batch-lower"); await p.evaluate(() => window.scrollTo(0, 0));
    await L(`/batch/${B(38)}`); await s("32-batch-weaner");
    await L(`/ship/${B(34)}`); await s("33-ready-to-ship");
    await L("/compare"); await s("34-compare");
    await L("/move-farrowing"); await s("35-move-farrowing");
    await L("/week");
    const flows = [["farrowing", "40-flow-farrowing", {}], ["served", "41-flow-served", {}], ["weaned", "42-flow-wean", { roomId: R("Farrowing 1") }], ["death", "43-flow-death", { roomId: R("Finisher 2") }], ["check", "44-flow-room-check", { roomId: R("Finisher 2") }], ["feed", "45-flow-feed", {}], ["pigsIn", "46-flow-pigs-in", {}], ["pigsOut", "47-flow-pigs-out", { batchId: B(34) }], ["treat", "48-flow-treat", { batchId: B(35) }], ["visitor", "49-flow-visitor", {}], ["alarm", "50-flow-alarm", { house: "Finishing house" }], ["readings", "51-flow-readings", { roomId: R("Finisher 2") }], ["weigh", "52-flow-weigh", { batchId: B(35) }], ["planLoad", "53-flow-plan-load", { batchId: B(34) }], ["closeBatch", "54-flow-close-batch", { batchId: B(34) }], ["vetVisit", "55-flow-vet-visit", {}], ["sow", "56-flow-sow", {}], ["room", "57-flow-room", {}], ["moveBatch", "58-flow-move-batch", { batchId: B(38) }], ["intoCrate", "59-flow-into-crate", { sowId: S("1222") }]];
    for (const [f, name, arg] of flows) { await flow(p, lid, f, arg); await H.settle(p, 800); await s(name); await close(); }
    // kill sheet: the paste step and the form
    await flow(p, lid, "killSheet", { batchId: B(34) }); await H.settle(p, 700);
    await p.locator(".sheet textarea").fill("Karro Cookstown 15/10/26\n1234 88.4 12 S 182.0\n1234 91.2 11 S 182.0\n1234 79.0 14 E 176.5\n1234 102.6 16 U 170.0\nTotal 4 361.2");
    await s("60-kill-sheet-paste"); await p.locator(".sheet .sheet-foot .btn").click(); await H.settle(p, 800); await s("61-kill-sheet-form"); await close();
    await L("/pigs-paperwork"); await s("70-paperwork");
    for (const r of ["pm1", "pm2", "herd", "medicines", "mortality", "tailbites", "alarms", "wash", "visitors"]) { await L(`/reg/${r}`); await s(`71-reg-${r}`); }
    await L(`/reg/contract-${B(35)}`); await s("72-contract-report");
    for (const r of ["qvr", "emb", "inventory", "plans", "rt", "inspect"]) { await L(`/${r}`); await s(`73-${r}`); }
    await L("/gate"); await s("74-gate"); await L("/gate/sign"); await s("75-gate-sign"); await L("/gate/form"); await s("76-gate-form");
    await L("/more"); await s("80-more");
    await L("/tools"); await s("81-tools");
    for (const t of ["space", "planner", "bins", "cop", "margin", "dates"]) { await L(`/tools/${t}`); await s(`82-tool-${t}`); }
    await L("/kpis"); await s("83-kpis"); await L("/pigs-money"); await s("84-money"); await L("/pigs-settings"); await s("85-settings");
    await L("/setup"); await s("86-setup"); await L("/setup/sows"); await s("87-import-sows"); await L("/disease"); await s("88-disease");
    // finishing-only farm on contract: the same unit's rooms and batches, finishing tabs and tiles
    await p.evaluate(async (lid) => { const R = await import("./js/services/records.js"); const m = await R.getMeta(lid, "settings"); await R.setMeta(lid, "settings", { ...m, system: "finishing", smallHerd: false, contract: { on: true, integrator: "Hillside Pork", basis: "per pig place per week", integratorOwns: true } }); const d = new Date(); d.setDate(d.getDate() - 12); R.addRecord(lid, "finance", { kind: "revenue", category: "Contract", amount: 9240, date: d.toISOString().slice(0, 10), note: "Hillside Pork · 1,540 places · September", source: "contract" }); }, lid);
    await L("/rooms"); await L("/week"); await H.settle(p, 600); await s("96-finishing-home"); await L("/paperwork"); await s("97-finishing-paperwork"); await L("/pigs-money"); await s("98-contract-money");
    assert.deepEqual(p.errors, [], "no JS errors on breeding-farm screens");
    await p.ctx.close();
  });

  test(`pigs small herd and finishing (${mode})`, { timeout: 200000 }, async () => {
    const p = await H.phone(env, { dark: mode === "dark" });
    await H.signUp(p, { email: `pigs-sm-${mode}@x.test` }); await H.onboard(p, { types: ["pigs"] });
    const lid = await seedPigs(p, { small: true });
    const s = (n) => H.shot(p, `p-g-${n}-${mode}`); const L = (r) => H.go(p, `/l/${lid}${r}`);
    await L("/week"); await H.go(p, `/l/${lid}/litters`); await L("/week"); await s("90-small-home");
    await L("/litters"); await s("91-small-litters"); await L("/sales"); await s("92-small-sales"); await L("/paperwork"); await s("93-small-paperwork");
    await p.locator(".fab").click(); await H.settle(p, 500); await s("94-small-quick-add"); await p.keyboard.press("Escape"); await H.settle(p, 300);
    await flow(p, lid, "litter", {}); await H.settle(p, 700); await s("95-small-litter-born"); await p.keyboard.press("Escape"); await H.settle(p, 400);
    assert.deepEqual(p.errors, [], "no JS errors on small-herd / finishing screens");
    await p.ctx.close();
  });
}
