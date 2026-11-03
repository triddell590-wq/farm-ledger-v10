// Review fixes, wave 1B (clarity and polish): "To do today" holds only due/late jobs with the rest
// folded into Coming up, one item per obligation, the bell counts distinct legal items late or
// due within 3 days, toasts clear on navigation and when a sheet opens, Help shows a plain support
// line, Bigger text really enlarges the Herd list, and the last row of a screen scrolls clear of
// the + button. Screenshots 1b-*.png (light + dark) for review.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedBeef } from "./beef-seed.mjs";
import { seedDairy } from "./dairy-seed.mjs";

let env, p, ids = {};
before(async () => {
  env = await H.setup(); p = await H.phone(env);
  await H.signUp(p); await H.onboard(p, { types: ["beef", "dairy"] });
  ids.beef = await seedBeef(p); ids.dairy = await seedDairy(p);
  await H.go(p, "/farm/more"); await H.go(p, "/farm/today"); await H.settle(p, 1500);
});
after(async () => { await env.close(); });

const today = () => p.evaluate(async () => (await import("./js/core/dates.js")).todayStr());
/** Rows of a "To do today" card: { title, line, coming } */
const rows = (scope) => p.locator(`${scope} [data-tasks] .task`).evaluateAll((els) => els.map((e) => ({ title: e.querySelector(".primary").textContent.trim(), line: e.querySelector(".secondary").textContent.trim(), coming: !!e.closest("[data-coming]"), done: e.classList.contains("done") })));

test("Dairy home: To do today has only today/late jobs; ISO 6690 and TB wait in a folded Coming up with their dates", async () => {
  await H.go(p, `/l/${ids.dairy}`); await H.settle(p, 800);
  const r = await rows(".screen");
  const now = r.filter((x) => !x.coming && !x.done);
  assert.ok(now.length > 3, JSON.stringify(now));
  for (const x of now) assert.match(x.line, /^(due today|\d+ days? late)/, `${x.title}: ${x.line}`);
  assert.ok(!now.some((x) => /ISO 6690|TB test/.test(x.title)), "far-off jobs are not in To do today");
  // late jobs come before today's (the seed is fixed in time, so which job is late depends on the date)
  const lateIdx = now.map((x, i) => (/late/.test(x.line) ? i : -1)).filter((i) => i >= 0);
  const todayIdx = now.map((x, i) => (/^due today/.test(x.line) ? i : -1)).filter((i) => i >= 0);
  if (lateIdx.length && todayIdx.length) assert.ok(Math.max(...lateIdx) < Math.min(...todayIdx), JSON.stringify(now));
  const coming = r.filter((x) => x.coming);
  assert.ok(coming.some((x) => /ISO 6690/.test(x.title) && /^[A-Z][a-z]{2} \d+ [A-Z][a-z]{2} · in \d+ days$/.test(x.line)), JSON.stringify(coming));
  assert.ok(coming.some((x) => /TB test/.test(x.title) && /^Legal deadline /.test(x.line)), JSON.stringify(coming));
  assert.ok(!(await p.locator(".screen [data-coming]").first().isVisible()), "Coming up starts folded");
  const label = await p.locator(".screen [data-tasks] .group-label").first().textContent();
  assert.match(label, new RegExp(`To do today\\s*${now.length}$`));
  // one obligation once: the ISO test is not also an alert card on the home
  assert.equal(await p.locator(".screen .alert", { hasText: "ISO 6690" }).count(), 0);
  assert.equal(await p.locator(".screen .alert", { hasText: "Tank temperature not logged" }).count(), 0, "the tank job shows once, as the job");
  // the withhold board is the first thing on the screen
  const first = await p.locator(".screen [data-board]").first().evaluate((b) => { const all = [...b.parentElement.children]; return all.indexOf(b); });
  assert.ok(first <= 1, `board is at position ${first}`);
  assert.deepEqual(p.errors, []);
});

test("Every due line is honest: never 'due today' beside another date, never 'by in N days'", async () => {
  for (const h of [`/l/${ids.dairy}`, `/l/${ids.beef}`, "/farm/today"]) {
    await H.go(p, h); await H.settle(p, 800);
    const text = await p.locator(".screen").last().textContent();
    assert.doesNotMatch(text, /by in \d+ days/, h);
    for (const r of await rows(".screen")) {
      if (/due today/.test(r.line)) assert.doesNotMatch(r.line, /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d/, `${h} ${r.title}: ${r.line}`);
    }
  }
  assert.doesNotMatch(await p.locator(".screen").last().textContent(), /society society/i);
});

test("Farm → Today: only today's jobs across ledgers, the rest under Coming up; the whole row opens it", async () => {
  await H.go(p, "/farm/today"); await H.settle(p, 1200);
  const T = await today();
  const r = await rows(".screen");
  assert.ok(r.some((x) => x.coming), "beef's later jobs (DNA sample, society) wait in Coming up");
  assert.ok(!r.filter((x) => !x.coming).some((x) => /Post DNA sample/.test(x.title)), "a job 36 days away is not in To do today");
  // tap target: the link is the whole text block, at least 44 px tall, separate from the tick
  const box = await p.locator(".screen [data-tasks] .task a.t-text").first().boundingBox();
  assert.ok(box.height >= 44, `row link is ${box.height}px tall`);
  const tick = await p.locator(".screen [data-tasks] .task .tick").first().boundingBox();
  assert.ok(tick.width >= 44 && tick.height >= 44, "tick is its own 44px target");
  assert.ok(tick.x + tick.width <= box.x + 1, "tick and link don't overlap");
  assert.ok(T);
});

test("Bell: counts distinct legal items late or due within 3 days (not withdrawals, not plain jobs, not far-off tests)", async () => {
  await p.evaluate(async () => (await import("./js/services/notify.js")).refreshItems({ force: true }));
  await H.go(p, "/farm/today"); await H.settle(p, 800);
  const shown = +((await p.locator(".bell .bell-count").textContent()) || 0);
  const expect = await p.evaluate(async () => {
    const N = await import("./js/services/notify.js"); const D = await import("./js/core/dates.js");
    const items = await N.refreshItems({ force: true }); const T = D.todayStr();
    const keep = items.filter((i) => i.legal && i.kind !== "withdrawal" && i.level !== "info" && (i.level === "late" || !i.due || (new Date(i.due) - new Date(T)) / 864e5 <= 3));
    return { n: new Set(keep.map((i) => i.ledgerId + "|" + i.title.toLowerCase().replace(/[^a-z0-9]/g, ""))).size, all: items.length, titles: items.map((i) => `${i.level}${i.legal ? "L" : ""} ${i.title}`) };
  });
  assert.equal(shown, expect.n, expect.titles.join("\n"));
  assert.ok(shown < expect.all, "the badge is far smaller than the full list");
  // the notification centre lists ISO 6690 and the TB test once each
  await H.go(p, "/notifications"); await H.settle(p, 1500);
  const titles = await p.locator(".nc-item .a-title").allTextContents();
  assert.equal(titles.filter((t) => /ISO 6690/.test(t)).length, 1, titles.join(" | "));
  assert.ok(titles.filter((t) => /TB test/.test(t)).length <= 2, titles.join(" | ")); // one per ledger at most
  const dairyTb = await p.locator(`.nc-group[data-ledger="${ids.dairy}"] .nc-item .a-title`, { hasText: "TB test" }).count();
  assert.equal(dairyTb, 1);
});

test("Toasts: short, cleared when you move to another screen and when a sheet opens; never over the + button", async () => {
  await H.go(p, `/l/${ids.beef}/herd`);
  await p.evaluate(async () => (await import("./js/ui/toast.js")).toast("Animal added", { action: "Undo" }));
  assert.equal(await p.locator(".toast").count(), 1);
  const t = await p.locator(".toast").boundingBox(); const f = await p.locator(".fab").boundingBox();
  assert.ok(t.x + t.width <= f.x + 1, "toast sits beside the + button");
  await H.settle(p, 1000);
  await H.go(p, `/l/${ids.beef}/breeding`);
  assert.equal(await p.locator(".toast").count(), 0, "gone after moving screen");
  await p.evaluate(async () => (await import("./js/ui/toast.js")).toast("1 death saved", { action: "Undo" }));
  await p.evaluate(async () => { const m = await import("./js/ui/sheet.js"); m.confirmSheet({ title: "Delete this?", confirm: "Delete", danger: true }); }); // don't wait for an answer
  await H.settle(p, 400);
  assert.equal(await p.locator(".toast").count(), 0, "a sheet opening clears the toast");
  // a toast raised while a sheet is open sits over the dimmed screen, not the sheet's buttons
  await p.evaluate(async () => (await import("./js/ui/toast.js")).toast("Nothing to import"));
  const tb = await p.locator(".toast").boundingBox(); const sb = await p.locator(".sheet").last().boundingBox();
  assert.ok(tb.y + tb.height <= sb.y + 1, `toast ${tb.y}+${tb.height} above sheet ${sb.y}`);
  await p.keyboard.press("Escape"); await H.settle(p, 400);
  // short-lived: a plain toast is gone within about 3.5 s
  await p.evaluate(async () => (await import("./js/ui/toast.js")).toast("Saved"));
  await H.settle(p, 3600);
  assert.equal(await p.locator(".toast").count(), 0);
});

test("The last thing on a screen scrolls clear of the + button and the tab bar", async () => {
  await H.go(p, `/l/${ids.dairy}`); await H.settle(p, 800);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await H.settle(p, 400);
  const last = await p.locator(".screen").last().evaluate((s) => { const els = [...s.querySelectorAll(".task, .row, .btn, .card")].filter((e) => e.offsetParent); return els[els.length - 1].getBoundingClientRect().bottom; });
  const fab = await p.locator(".fab").boundingBox();
  assert.ok(last <= fab.y + 1, `last content bottom ${last} vs + top ${fab.y}`);
  // the Release button on the board can be scrolled clear too
  const rel = p.locator(".screen [data-release]").first();
  if (await rel.count()) { await rel.scrollIntoViewIfNeeded(); const b = await rel.boundingBox(); await p.evaluate((y) => window.scrollBy(0, y), b.y - 200); const b2 = await rel.boundingBox(); assert.ok(b2.y + b2.height < fab.y || b2.x + b2.width < fab.x, "Release not under the +"); }
});

test("Help: no 'to be set up'; Tom's phone and WhatsApp shown; plain line when no contact is set", async () => {
  await H.go(p, "/help"); await H.settle(p, 500);
  const text = await p.locator(".screen").last().textContent();
  assert.doesNotMatch(text, /to be set up|will go here/);
  assert.equal(await p.locator("[data-support=set]").count(), 1);
  assert.ok(await p.locator('a[href="tel:07851635259"]').count());
  assert.ok(await p.locator('a[href^="https://wa.me/447851635259"]').count());
  const none = await p.evaluate(async () => { const m = await import("./js/screens/help.js"); const { el } = await import("./js/ui/dom.js"); return el(m.supportBlock({ email: "", phone: "" })).textContent; });
  assert.match(none, /Ask the person who invited you/);
  const html = await p.evaluate(async () => { const m = await import("./js/screens/help.js"); const { el } = await import("./js/ui/dom.js"); return el(m.supportBlock({ email: "help@example.com", phone: "" })).outerHTML; });
  assert.match(html, /mailto:help@example\.com/); assert.doesNotMatch(html, /tel:/);
});

test("Bigger text makes the Herd list visibly bigger (~18%)", async () => {
  await H.go(p, `/l/${ids.beef}/herd`); await H.settle(p, 600);
  const size = () => p.locator(".screen .row .primary").first().evaluate((e) => e.getBoundingClientRect().height);
  const before = await size();
  await p.evaluate(async () => (await import("./js/services/appearance.js")).setAppearance({ hiVis: true })); await H.settle(p, 300);
  const after = await size();
  assert.ok(after / before > 1.12, `row text ${before} → ${after}`);
  await H.shot(p, "1b-herd-bigger");
  await p.evaluate(async () => (await import("./js/services/appearance.js")).setAppearance({ hiVis: false }));
});

test("Screens: Today lists, bell and Help, light and dark, no JS errors", async () => {
  for (const dark of [false, true]) {
    await p.emulateMedia({ colorScheme: dark ? "dark" : "light" }); const sfx = dark ? "-dark" : "";
    for (const [name, hash] of [["dairy-home", `/l/${ids.dairy}`], ["farm-today", "/farm/today"], ["bell", "/notifications"], ["help", "/help"]]) {
      await H.go(p, hash); await H.settle(p, 900);
      const c = p.locator(".screen [data-coming-toggle]").last(); if (await c.count()) await c.click();
      await p.screenshot({ path: `${H.SCREENS}1b-${name}${sfx}.png`, fullPage: true });
    }
  }
  await p.emulateMedia({ colorScheme: "light" });
  assert.deepEqual(p.errors, []);
});
