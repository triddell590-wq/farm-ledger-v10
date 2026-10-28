// Pigs ledger: the most-used entry flows, end to end on the in-memory backend (design/13 §5, §7).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedPigs } from "./pigs-seed.mjs";

let env, p, lid, rooms;
before(async () => {
  env = await H.setup(); p = await H.phone(env, { verified: true });
  await H.signUp(p, { email: "pigs-flows@x.test" }); await H.onboard(p, { types: ["pigs"] });
  lid = await seedPigs(p);
  rooms = await recs("rooms");
});
after(async () => { await env.close(); });

function recs(coll) { return p.evaluate(async ([lid, coll]) => (await import("./js/services/records.js")).listRecords(lid, coll), [lid, coll]); }
const R = (n) => rooms.find((r) => r.name === n).id;
const sheet = () => p.locator(".sheet").last();
const foot = () => sheet().locator(".sheet-foot .btn");
const text = async () => (await p.locator("body").textContent()).replace(/\s+/g, " ");
async function closeAll() {
  for (let i = 0; i < 4 && await p.locator(".sheet").count(); i++) {
    const d = p.locator(".sheet .btn", { hasText: /^\s*Discard/ }); if (await d.count()) await d.first().click(); else await p.keyboard.press("Escape");
    await H.settle(p, 400);
  }
}
async function flow(id, arg = {}) {
  await closeAll(); await H.go(p, `/l/${lid}/week`);
  await p.evaluate(async ([lid, id, arg]) => { const q = await import("./js/sectors/pigs/quick-add.js"); const { session } = window.__fl; q.runFlow(id, session.ledgers.find((l) => l.id === lid), arg); }, [lid, id, arg]);
  await H.settle(p, 800);
}
const plus = (name, n = 1) => sheet().locator(`[data-stepper="${name}"] [data-dir="1"]`).click({ clickCount: n, delay: 40 });
const stepVal = (name) => sheet().locator(`[data-stepper="${name}"] input`).inputValue();

test("Week home: production week title, week strip, alarm overdue first; no errors", async () => {
  await H.go(p, `/l/${lid}/week`);
  const t = await text();
  assert.match(t, /Week \d{1,2}/);
  assert.match(t, /3-week batches/);
  assert.match(t, /Alarm test overdue — Finishing house/);
  assert.ok(await p.locator(".pg-wd").count() >= 7, "seven day columns");
  assert.deepEqual(p.errors, []);
});

test("Farrowing: FAB → room → crate → count with steppers → Alive now → Save (§7.1)", async () => {
  const before = (await recs("litters")).length;
  await flow("farrowing", { roomId: R("Farrowing 3") });
  await sheet().locator("[data-crate='3']").click(); await H.settle(p, 700);
  assert.match((await foot().textContent()).trim(), /Count the litter to save/);
  await plus("bornAlive", 14); await plus("stillborn", 1);
  assert.equal(await stepVal("bornAlive"), "14");
  // two death taps, then take the mistaken one back before saving
  await sheet().locator("[data-cause='Overlaid']").click(); await sheet().locator("[data-cause='Scour']").click(); await H.settle(p, 200);
  await sheet().locator("[data-undeath='1']").click(); await H.settle(p, 200);
  assert.equal((await sheet().locator("[data-alive]").textContent()).trim(), "13");
  // teeth is never routine: needs "injuries seen"
  await sheet().locator("[data-chips=tasks] [data-value=teeth]").click(); await H.settle(p, 200);
  assert.match((await foot().textContent()).trim(), /Tick injuries seen for teeth/);
  await sheet().locator("[data-chips=tasks] [data-value=teeth]").click();
  await sheet().locator("[data-chips=tasks] [data-value=iron]").click(); await H.settle(p, 200);
  assert.equal((await foot().textContent()).trim(), "Save crate 3");
  await foot().click(); await H.settle(p, 800);
  assert.match(await text(), /Crate 3 saved · 13 alive/);
  const all = await recs("litters"); assert.equal(all.length, before + 1);
  const l = all.find((x) => x.roomId === R("Farrowing 3") && x.crate === 3 && !x.weaned);
  assert.equal(l.bornAlive, 14); assert.equal(l.stillborn, 1); assert.deepEqual(l.deaths.map((d) => d.cause), ["Overlaid"]);
  assert.ok(l.tasks.iron); assert.equal(l.tasks.teeth, null); assert.ok(l.batchId);
  assert.deepEqual(p.errors, []);
});

test("Fostering off from crate 12 writes the matching foster-on on crate 3 (§5.4)", async () => {
  await H.go(p, `/l/${lid}/crate/${R("Farrowing 3")}/12`); await H.settle(p, 700);
  await plus("fosterOff", 2); await H.settle(p, 200);
  assert.match((await foot().textContent()).trim(), /Choose the crate they went to/);
  await sheet().locator("[data-chips=offTo] .chip", { hasText: /^\s*C3 ·/ }).click(); await H.settle(p, 200);
  await foot().click(); await H.settle(p, 900);
  const all = await recs("litters");
  const c12 = all.find((x) => x.roomId === R("Farrowing 3") && x.crate === 12 && !x.weaned);
  const c3 = all.find((x) => x.roomId === R("Farrowing 3") && x.crate === 3 && !x.weaned);
  assert.equal(c12.fosterOff.reduce((t, f) => t + f.n, 0), 2);
  assert.deepEqual(c3.fosterOn.map((f) => [f.n, f.fromLitterId]), [[2, c12.id]]);
  // the card now says where they went
  await H.go(p, `/l/${lid}/week`); await H.go(p, `/l/${lid}/crate/${R("Farrowing 3")}/12`); await H.settle(p, 700);
  assert.match((await sheet().textContent()).replace(/\s+/g, " "), /→ to C3 \(2\)/);
  await p.keyboard.press("Escape"); await H.settle(p, 400);
  assert.deepEqual(p.errors, []);
});

test("Room check: All pens OK + one tail bite → check and injurious-behaviour record (§5.3)", async () => {
  const bites = (await recs("tailBites")).length;
  await flow("check", { roomId: R("Finisher 2") });
  assert.match((await foot().textContent()).trim(), /8 pens still to check/);
  await sheet().locator("[data-pc='3'] [data-s='Tail bite']").click(); await H.settle(p, 200);
  await sheet().locator("[data-sev] [data-v='Bleeding']").click();
  await sheet().locator("[data-act] [data-v='Extra enrichment']").click();
  await sheet().locator("[data-allok]").click(); await H.settle(p, 200);
  assert.equal((await foot().textContent()).trim(), "Save check");
  await foot().click(); await H.settle(p, 800);
  const today = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const ck = (await recs("roomChecks")).find((c) => c.roomId === R("Finisher 2") && c.date === today);
  assert.ok(ck); assert.equal(ck.pens.length, 8);
  assert.deepEqual(ck.pens.find((x) => x.no === 3).status, ["Tail bite"]);
  assert.equal(ck.pens.filter((x) => x.status[0] === "OK").length, 7);
  const tb = await recs("tailBites"); assert.equal(tb.length, bites + 1);
  assert.equal(tb.find((x) => x.date === today && x.roomId === R("Finisher 2")).severity, "Bleeding");
  assert.deepEqual(p.errors, []);
});

test("Alarm test: must say whether it sounded; saving clears the overdue alert (§7.10)", async () => {
  await flow("alarm", { house: "Finishing house" });
  assert.equal((await foot().textContent()).trim(), "Did the alarm sound?");
  await sheet().locator("[data-chips=sounded] [data-value=no]").click(); await H.settle(p, 200);
  assert.equal((await foot().textContent()).trim(), "Say what you did");
  await sheet().locator("[data-chips=sounded] [data-value=yes]").click(); await H.settle(p, 200);
  await foot().click(); await H.settle(p, 800);
  assert.match(await text(), /Alarm test saved · next due/);
  await H.go(p, `/l/${lid}/week`);
  assert.doesNotMatch(await text(), /Alarm test overdue — Finishing house/);
  assert.deepEqual(p.errors, []);
});

test("Death: Put down needs the signs-of-life check; saved against the batch (§7.4)", async () => {
  const before = (await recs("deaths")).length;
  await flow("death", { roomId: R("Finisher 2") });
  const chip = (g, v) => sheet().locator(`[data-chips=${g}] [data-value="${v}"]`);
  if (await chip("cause", "Put down").count()) await chip("cause", "Put down").click(); else await sheet().locator(".chip", { hasText: "Put down" }).click();
  await H.settle(p, 300);
  const why = (await foot().textContent()).trim();
  assert.notEqual(why, "Save death", "Put down can't save without the euthanasia check");
  // fill whatever the sheet still asks for (method + signs of life)
  for (let i = 0; i < 4 && (await foot().textContent()).trim() !== "Save death"; i++) {
    const t = (await foot().textContent()).trim();
    if (/method/i.test(t)) await sheet().locator("[data-chips=method] .chip").first().click();
    else if (/signs of life/i.test(t)) await sheet().locator("[data-check=checked]").click();
    else if (/collection|fallen/i.test(t)) await sheet().locator("[data-chips=collection] .chip").first().click();
    else break;
    await H.settle(p, 200);
  }
  assert.equal((await foot().textContent()).trim(), "Save death");
  await foot().click(); await H.settle(p, 800);
  const all = await recs("deaths"); assert.equal(all.length, before + 1);
  const d = all.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  assert.equal(d.cause, "Put down"); assert.ok(d.euthanasia?.checked); assert.ok(d.batchId);
  assert.deepEqual(p.errors, []);
});

test("Weaning under 21 days can't be saved (Schedule 8 paras 38–39)", async () => {
  await flow("weaned", { roomId: R("Farrowing 3") });
  assert.equal((await foot().textContent()).trim(), "Too young to wean (under 21 days)");
  await p.keyboard.press("Escape"); await H.settle(p, 400);
  if (await p.locator(".sheet").count()) { const b = p.locator(".sheet .btn", { hasText: /Discard/ }); if (await b.count()) await b.first().click(); await H.settle(p, 400); }
  assert.deepEqual(p.errors, []);
});

test("Gate visitor form signs a visitor in from the QR page; record carries last pig contact (§8.2)", async () => {
  const before = (await recs("visitors")).length;
  await closeAll(); await H.go(p, `/l/${lid}/gate/form`); await H.settle(p, 600);
  const f = p.locator("form").last();
  await f.locator("[name=name]").fill("Mark Feeds"); await f.locator("[name=company]").fill("Feeds Ltd");
  await f.locator("[data-chips=reason] [data-value]").first().click();
  await f.locator("[data-chips=lastPigContact] [data-value]").first().click();
  await f.locator("[data-check=readRules]").click(); await f.locator("[data-check=bootsChanged]").click();
  await H.settle(p, 300);
  assert.equal((await f.locator("[data-go]").textContent()).trim(), "Sign in");
  await f.locator("[data-go]").click(); await H.settle(p, 800);
  assert.match(await text(), /Thanks, Mark/);
  const vs = await recs("visitors"); assert.equal(vs.length, before + 1);
  const v = vs.find((x) => x.name === "Mark Feeds"); assert.equal(v.lastPigContact, "today"); assert.equal(v.source, "qr"); assert.equal(v.company, "Feeds Ltd");
  assert.deepEqual(p.errors, []);
});

test("Feed delivery: read the docket text → fields filled → saved to the bin and batch, £ in finance (§7.8)", async () => {
  const before = (await recs("feedDeliveries")).length; const fin = (await recs("finance")).length;
  await flow("feed");
  await sheet().locator("[data-docket]").click(); await H.settle(p, 700);
  await p.locator(".sheet").last().locator("textarea").fill("Thompsons Feeds Ltd\nDelivery Note No: QX990001\nDate 14/10/2026\nFinisher Pellets 3mm 16.4 t\nPrice £312.50/t");
  await p.locator(".sheet").last().locator(".sheet-foot .btn").click(); await H.settle(p, 800);
  assert.equal(await sheet().locator("[name=tonnes]").inputValue(), "16.4");
  assert.equal(await sheet().locator("[name=pricePerT]").inputValue(), "312.5");
  assert.equal(await sheet().locator("[name=date]").inputValue(), "2026-10-14");
  await sheet().locator("[data-chips=binId] .chip", { hasText: "Bin 3" }).click(); await H.settle(p, 300);
  assert.equal((await foot().textContent()).trim(), "Save delivery");
  await foot().click(); await H.settle(p, 800);
  const all = await recs("feedDeliveries"); assert.equal(all.length, before + 1);
  const d = all.find((x) => x.docketNo === "QX990001"); assert.equal(d.kg, 16400); assert.ok(d.batchIds.length >= 1); assert.equal(d.pricePerT, undefined, "no £ on the delivery itself");
  const f = (await recs("finance")); assert.equal(f.length, fin + 1); assert.equal(f.find((x) => x.feedDeliveryId === d.id).amount, 5125);
  assert.deepEqual(p.errors, []);
});

test("stockman (Worker): week, rooms and crate cards yes; no £ anywhere (§16)", async () => {
  await closeAll();
  const batches = await recs("batches"); const b35 = batches.find((b) => b.no === 35).id;
  await H.go(p, `/l/${lid}/more/people`);
  await p.getByRole("button", { name: "Invite someone" }).click(); await H.settle(p, 600);
  await p.getByLabel("Their name").fill("Seán");
  await p.locator(".sheet-foot .btn").click(); await H.settle(p, 900);
  const code = /#\/invite\/([A-Z0-9]{26})/.exec(await p.locator("[data-msg]").textContent())[1];
  await p.keyboard.press("Escape"); await H.settle(p, 400);
  await p.evaluate(() => window.__fl.auth.signOut());
  await H.go(p, `/invite/${code}`);
  await p.getByRole("button", { name: "Create an account to join" }).click(); await H.settle(p);
  await p.getByLabel("Your name").fill("Seán McKee"); await p.getByLabel("Email").fill("sean-pigs@x.test");
  await p.getByLabel("Password", { exact: true }).fill("password123"); await p.getByRole("checkbox", { name: /I agree/ }).click();
  await p.locator(".sheet-foot .btn").click();
  await p.waitForFunction((l) => location.hash.startsWith("#/l/" + l), lid); await H.settle(p, 900);
  assert.deepEqual(await p.locator(".tabbar .tab span").allTextContents(), ["Week", "Sows", "Rooms", "Batches", "More"]);
  await H.go(p, `/l/${lid}/week`); assert.match(await text(), /Week \d+/);
  await H.go(p, `/l/${lid}/room/${R("Farrowing 3")}`); assert.ok(await p.locator("[data-crates] [data-crate]").count() >= 12);
  await H.go(p, `/l/${lid}/batch/${b35}`);
  const t = await text(); assert.match(t, /FCR/); assert.doesNotMatch(t, /£|Feed cost \/ kg gain/);
  await H.go(p, `/l/${lid}/more`); assert.doesNotMatch(await text(), /Money per pig/);
  await H.go(p, `/l/${lid}/tools/margin`); assert.doesNotMatch(await text(), /£\s?\d/);
  assert.deepEqual(p.errors, []);
});
