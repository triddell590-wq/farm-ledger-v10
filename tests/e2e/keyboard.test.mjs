// iPhone keyboard: iOS keeps the page height, shrinks the *visual* viewport and pans it to the
// field (offsetTop). We fake exactly that and check the sheet and the field stay in view.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";

let env, p;
before(async () => {
  env = await H.setup();
  const context = await env.browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await context.addInitScript(() => {
    const vv = new EventTarget(); let h = innerHeight, top = 0;
    Object.defineProperties(vv, { height: { get: () => h }, offsetTop: { get: () => top }, width: { get: () => innerWidth }, offsetLeft: { get: () => 0 }, scale: { get: () => 1 } });
    Object.defineProperty(window, "visualViewport", { get: () => vv, configurable: true });
    window.__kb = (open, pan = 300) => { h = open ? innerHeight - 336 : innerHeight; top = open ? pan : 0; vv.dispatchEvent(new Event("resize")); vv.dispatchEvent(new Event("scroll")); };
  });
  p = await H.phone(env, { context });
  await H.signUp(p); await H.onboard(p, { types: ["sheep"] });
});
after(async () => { await env.close(); });

for (const pan of [0, 300]) test(`a form field stays in sight when the keyboard opens (iOS pan ${pan}px)`, async () => {
  await H.go(p, "/settings/profile"); await H.settle(p, 400);
  const lid = await p.evaluate(() => window.__fl.session.sectorLedgers()[0].id);
  await H.go(p, `/l/${lid}`); await p.locator(".fab").click(); await H.settle(p, 500);
  await p.getByRole("button", { name: /^(Note or job)$/ }).click(); await H.settle(p, 700);
  const input = p.locator(".sheet input[name='title']"); await input.focus();
  await p.evaluate((pan) => window.__kb(true, pan), pan); await H.settle(p, 600);
  assert.ok(await p.evaluate(() => document.documentElement.classList.contains("kb-open")), "keyboard mode on");
  const r = await input.boundingBox(); const visTop = pan, visBottom = pan + 844 - 336;
  assert.ok(r.y >= visTop - 1 && r.y + r.height <= visBottom + 1, `field ${r.y}–${r.y + r.height} must sit inside ${visTop}–${visBottom}`);
  const sh = await p.locator(".sheet").last().boundingBox();
  assert.ok(sh.y >= visTop - 1 && sh.y + sh.height <= visBottom + 1, `sheet ${sh.y}–${sh.y + sh.height} inside ${visTop}–${visBottom}`);
  await p.evaluate(() => window.__kb(false)); await H.settle(p, 300);
  assert.ok(!(await p.evaluate(() => document.documentElement.classList.contains("kb-open"))));
  await p.keyboard.press("Escape"); await H.settle(p, 300); const d = p.locator(".sheet button", { hasText: "Discard" }); if (await d.count()) await d.first().click(); await H.settle(p, 400);
});
