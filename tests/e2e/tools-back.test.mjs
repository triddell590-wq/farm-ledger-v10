// A tool goes back to the page it was opened from (Tom, 10 Nov) — opened from any link, not only
// the "Tools for this" strip — and keeps that back link when the page redraws itself.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedBeef } from "./beef-seed.mjs";

let env, p, lid;
before(async () => { env = await H.setup(); p = await H.phone(env, { verified: true }); await H.signUp(p, { email: "back@x.test" }); await H.onboard(p, { types: ["beef"] }); lid = await seedBeef(p); });
after(async () => { await env.close(); });
const back = async () => { const b = p.locator(".screen:last-child .back-link").first(); return [await b.getAttribute("href"), (await b.textContent()).trim()]; };
const tap = async (sel) => { await p.locator(`.screen:last-child ${sel}`).first().click(); await H.settle(p, 700); };

test("Groups → Feed & silage → Meal calculator, and back the same way", async () => {
  await H.go(p, `/l/${lid}/groups`);
  await tap(".grp-feedsum");
  assert.deepEqual(await back(), [`#/l/${lid}/groups`, "Groups"]);
  await tap(`a[href="#/l/${lid}/tools/meal"]`);
  assert.deepEqual(await back(), [`#/l/${lid}/feed`, "Feed & silage"]);
  await tap(".back-link");
  assert.match(p.url(), /\/feed$/);
});
test("the back link survives Feed & silage redrawing", async () => {
  await H.go(p, `/l/${lid}/herd`); await H.go(p, `/l/${lid}/feed`);
  assert.deepEqual(await back(), [`#/l/${lid}/herd`, "Herd"]);
  await p.evaluate(async (lid) => { const { addRecord } = await import("./js/services/records.js"); await addRecord(lid, "feedAdjust", { groupId: "x", date: "2026-01-01", meal: 1 }); }, lid);
  await H.settle(p, 600);
  assert.deepEqual(await back(), [`#/l/${lid}/herd`, "Herd"]);
});
test("a tool opened from the Tools list still goes back to Tools", async () => {
  await H.go(p, `/l/${lid}/tools`); await tap(`a[href="#/l/${lid}/tools/dose"]`);
  assert.deepEqual(await back(), [`#/l/${lid}/tools`, "Tools"]);
});
