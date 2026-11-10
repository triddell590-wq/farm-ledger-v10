// Big calendar (Tom, 10 Nov): the calendar button by a date box opens the large calendar; choosing a
// day fills the box and fires input/change; a form sheet underneath stays open; min/max respected.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";

let env, p;
before(async () => { env = await H.setup(); p = await H.phone(env, { verified: true }); await H.signUp(p, { email: "dates@x.test" }); await H.onboard(p, { types: ["beef"] }); });
after(async () => { await env.close(); });

async function sheetWithDate(attrs = "") {
  await p.evaluate(async (attrs) => {
    const { openSheet } = await import("./js/ui/sheet.js");
    const f = document.createElement("form"); f.innerHTML = `<div class="form-group"><div class="field"><label for="dd">Date moved</label><input id="dd" type="date" name="d" ${attrs}></div></div>`;
    window.__changes = 0; f.querySelector("input").addEventListener("change", () => window.__changes++);
    openSheet({ title: "Test", body: f });
  }, attrs);
  await H.settle(p, 500);
}

test("a tap opens the big calendar, choosing a day fills the box and keeps the sheet", async () => {
  await sheetWithDate('value="2026-03-14"');
  await p.locator(".sheet .dp-btn").tap(); await H.settle(p, 300);
  assert.equal(await p.locator(".dp-layer").count(), 1);
  assert.match(await p.locator(".dp-chosen").textContent(), /Saturday 14 March 2026/);
  const size = await p.locator('.dp-day[data-d="2026-03-20"]').boundingBox();
  assert.ok(size.width >= 44 && size.height >= 44, `day buttons are big (${size.width}×${size.height})`);
  await p.locator('.dp-day[data-d="2026-03-20"]').tap(); await H.settle(p, 200);
  assert.equal(await p.locator(".dp-layer").count(), 0);
  assert.equal(await p.locator("#dd").inputValue(), "2026-03-20");
  assert.equal(await p.evaluate(() => window.__changes), 1);
  assert.equal(await p.locator(".sheet").count(), 1, "the form underneath is still open");
});

test("month arrows, year jump, Escape and min/max", async () => {
  await p.keyboard.press("Escape"); await H.settle(p, 400);
  await sheetWithDate('value="2026-03-14" min="2026-03-01" max="2026-04-30"');
  await p.locator(".sheet .dp-btn").click(); await H.settle(p, 300);
  assert.ok(await p.locator('[data-step="-1"]').isDisabled(), "can't go before the earliest month");
  assert.ok(await p.locator('.dp-day[data-d="2026-03-01"]').isEnabled());
  await p.locator('[data-step="1"]').click();
  assert.ok(await p.locator('[data-step="1"]').isDisabled(), "can't go past the latest month");
  assert.equal(await p.locator(".dp-month").inputValue(), "3");
  await p.keyboard.press("Escape"); await H.settle(p, 200);
  assert.equal(await p.locator(".dp-layer").count(), 0);
  assert.equal(await p.locator(".sheet").count(), 1, "Escape closes only the calendar");
  assert.equal(await p.locator("#dd").inputValue(), "2026-03-14");
});

test("typing a date in one go fills the date box; a wrong date is flagged", async () => {
  await p.keyboard.press("Escape"); await H.settle(p, 400);
  await sheetWithDate('value="2026-03-14"');
  const box = p.locator(".sheet .dp-text");
  assert.equal(await box.inputValue(), "14/03/2026");
  await box.fill(""); await box.pressSequentially("01112026");
  assert.equal(await box.inputValue(), "01/11/2026", "slashes come by themselves");
  assert.equal(await p.locator("#dd").inputValue(), "2026-11-01");
  assert.equal(await p.evaluate(() => window.__changes), 1);
  await box.fill(""); await box.pressSequentially("311226"); await box.press("Tab");
  assert.equal(await p.locator("#dd").inputValue(), "2026-12-31", "a two-figure year works once you move on");
  await box.fill(""); await box.pressSequentially("31022026"); await box.press("Tab");
  assert.equal(await box.getAttribute("aria-invalid"), "true");
  await p.evaluate(() => { document.querySelector("#dd").value = "2026-12-25"; });
  assert.equal(await box.inputValue(), "25/12/2026", "a date set by the app shows in the box");
});
