// Notifications end to end on the in-memory backend, with Notification / PushManager / app badge
// stubbed (headless Chromium has no real push). Covers: opt-in only on a tap, device doc and
// prefs, push not set up, test push token, iPhone-not-installed and blocked states, the bell and
// notification centre across ledgers, the "became late" notice on resume (deduped with the
// sender's log), sign-out removing the phone, the service worker's push handler (CDP push) and
// screenshots nt-*.png light + dark at 390x844.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as H from "./harness.mjs";
import { seedBeef } from "./beef-seed.mjs";
import { seedPigs } from "./pigs-seed.mjs";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
function stubs({ permission = "default", answer = "granted" } = {}) {
  return ([permission, answer]) => {
    window.__notes = []; window.__asked = 0; window.__badge = null;
    class FakeNotification { constructor(title, o = {}) { window.__notes.push({ title, ...o }); } }
    FakeNotification.permission = permission;
    FakeNotification.requestPermission = async () => { window.__asked++; FakeNotification.permission = answer; return answer; };
    window.Notification = FakeNotification;
    window.PushManager = function PushManager() {};
    navigator.setAppBadge = async (n) => { window.__badge = n; };
    navigator.clearAppBadge = async () => { window.__badge = 0; };
  };
}
async function phoneWith(env, { dark = false, permission, answer, ua, hash = "/welcome" } = {}) {
  const ctx = await env.browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: dark ? "dark" : "light", hasTouch: true, isMobile: true, ...(ua ? { userAgent: ua } : {}) });
  await ctx.addInitScript(stubs(), [permission || "default", answer || "granted"]);
  return H.phone(env, { dark, hash, context: ctx });
}
const devices = (p) => p.evaluate(() => { const uid = window.__fl.auth.user()?.uid || window.__fl.session.user?.uid; return [...window.__fl.store.raw.entries()].filter(([k]) => k.startsWith(`users/${uid}/devices/`)).map(([k, v]) => ({ id: k.split("/").pop(), ...v })); });

let env, p, ids = {};
before(async () => {
  env = await H.setup();
  p = await phoneWith(env);
  await H.signUp(p); await H.onboard(p, { types: ["beef", "pigs"] });
  ids.beef = await seedBeef(p); ids.pigs = await seedPigs(p);
  await H.go(p, "/farm/more"); await H.go(p, "/farm/today"); await H.settle(p, 1800);
});
after(async () => { await env.close(); });

test("Settings → Notifications: nothing asked until the tap; push not set up is said plainly", async () => {
  await H.go(p, "/settings");
  const row = p.locator("a.row", { hasText: "Notifications" });
  assert.match(await row.textContent(), /Off/);
  await row.click(); await H.settle(p, 600);
  assert.equal(await p.evaluate(() => window.__asked), 0, "no permission prompt on opening the screen");
  assert.match(await p.locator("[data-notify-state]").textContent(), /morning/);
  await p.locator("[data-on]").click(); await H.settle(p, 900);
  assert.equal(await p.evaluate(() => window.__asked), 1);
  const ds = await devices(p);
  assert.equal(ds.length, 1); assert.equal(ds[0].token, null); assert.equal(ds[0].tz, "Europe/London");
  assert.equal(ds[0].prefs.summaryTime, "07:00"); assert.ok(ds[0].createdAt && ds[0].lastSeen && ds[0].platform && ds[0].ua);
  assert.match(await p.locator("[data-push-missing]").textContent(), /isn't set up yet/);
  await H.go(p, "/settings");
  assert.match(await p.locator("a.row", { hasText: "Notifications" }).textContent(), /On, 07:00/);
  assert.deepEqual(p.errors, []);
});

test("prefs save to this phone's device doc: time, kinds, ledgers, quiet hours", async () => {
  await H.go(p, "/settings/notifications");
  await p.locator("select[name=summaryTime]").selectOption("06:30");
  await p.locator("[data-check=kind_tasks]").click();
  await p.locator("[data-chips=ledgers] .chip", { hasText: "Pigs" }).click();
  await p.locator("[data-check=quiet]").click();
  await p.locator("select[name=quietStart]").selectOption("21:30");
  await H.settle(p, 900);
  const d = (await devices(p))[0].prefs;
  assert.equal(d.summaryTime, "06:30"); assert.equal(d.kinds.tasks, false); assert.equal(d.kinds.legal, true);
  assert.deepEqual(d.ledgers, [ids.beef]); assert.deepEqual(d.quiet, { on: true, start: "21:30", end: "06:00" });
  // put them back for the rest of the run
  await p.locator("[data-check=kind_tasks]").click(); await p.locator("[data-chips=ledgers] .chip", { hasText: "Pigs" }).click(); await p.locator("[data-check=quiet]").click(); await H.settle(p, 900);
  assert.equal((await devices(p))[0].prefs.ledgers, "all");
});

test("with push set up the FCM token is stored; turning off removes the phone", async () => {
  await p.evaluate(async () => { (await import("./js/services/notify.js")).useTestPush({ vapidKey: "test-key", token: async () => "fcm-token-123", deleteToken: async () => { window.__deleted = true; } }); });
  await H.go(p, "/settings/notifications");
  await p.locator("[data-off]").click(); await H.settle(p, 700);
  assert.equal((await devices(p)).length, 0); assert.equal(await p.evaluate(() => window.__deleted), true);
  await p.locator("[data-on]").click(); await H.settle(p, 900);
  assert.equal((await devices(p))[0].token, "fcm-token-123");
  assert.equal(await p.locator("[data-push-missing]").count(), 0);
  assert.match(await p.locator(".row", { hasText: "On for this phone" }).textContent(), /even when the app is closed/);
  await p.locator("[data-test]").click(); await H.settle(p, 4500);
  assert.ok((await p.evaluate(() => window.__notes)).some((n) => n.title === "Farm Ledger test"));
});

test("bell with a count on the Overview and in each ledger header; centre lists both ledgers; tap opens the screen", async () => {
  await p.evaluate(async () => (await import("./js/services/notify.js")).refreshItems({ force: true }));
  await H.go(p, "/farm/today"); await H.settle(p, 500);
  const n = +(await p.locator(".bell .bell-count").textContent());
  assert.ok(n > 3, `bell count ${n}`);
  assert.equal(await p.evaluate(() => window.__badge), n, "app badge = bell count");
  await H.go(p, `/l/${ids.pigs}`); assert.ok(await p.locator(".topbar .bell").isVisible());
  await H.go(p, `/l/${ids.beef}`); assert.ok(await p.locator(".topbar .bell").isVisible());
  await p.locator(".topbar .bell").click(); await H.settle(p, 1500);
  assert.equal(await p.evaluate(() => location.hash), "#/notifications");
  const groups = await p.locator(".nc-group").evaluateAll((els) => els.map((e) => e.dataset.sector));
  assert.deepEqual(groups, ["beef", "pigs"]);
  assert.ok(await p.locator(".nc-group[data-sector=pigs] .nc-item[data-level=late]").count() >= 1);
  const first = p.locator(".nc-group[data-sector=pigs] .nc-items .nc-item").first();
  const href = await first.getAttribute("href");
  await first.click(); await H.settle(p, 900);
  assert.equal(await p.evaluate(() => location.hash), href);
  assert.deepEqual(p.errors, []);
});

test("on resume, a legal job that turned late pops up once (and is logged so the sender won't repeat it)", async () => {
  // first look only remembers what is already late
  await p.evaluate(async () => (await import("./js/services/notify.js")).refreshItems({ force: true }));
  await H.settle(p, 300);
  await p.evaluate(() => { window.__notes = []; });
  await p.evaluate(async (lid) => { const R = await import("./js/services/records.js"); R.addRecord(lid, "tasks", { title: "Notify NIFAIS of a death: UK9 012345 00999", due: "2001-01-01", legal: true, done: false }, "late-new"); }, ids.beef);
  await p.evaluate(async () => (await import("./js/services/notify.js")).refreshItems({ force: true }));
  await H.settle(p, 4800); // no service worker here: waits for it, then shows a page notification
  const notes = await p.evaluate(() => window.__notes);
  assert.deepEqual(notes.map((x) => x.title), ["Late: Notify NIFAIS of a death: UK9 012345 00999"]);
  assert.match(notes[0].data.url, new RegExp(`^#/l/${ids.beef}`));
  const log = await p.evaluate(() => { const uid = window.__fl.auth.user().uid; return [...window.__fl.store.raw.entries()].filter(([k]) => k.startsWith(`users/${uid}/notifyLog/`)).map(([, v]) => v); });
  assert.ok(log.some((e) => e.key === `late:${ids.beef}:task:late-new` && e.by === "app"));
  await p.evaluate(async () => (await import("./js/services/notify.js")).refreshItems({ force: true })); await H.settle(p, 600);
  assert.equal((await p.evaluate(() => window.__notes)).length, 1, "not shown twice");
});

test("signing out removes this phone from the person's devices", async () => {
  const uid = await p.evaluate(() => window.__fl.auth.user().uid);
  assert.equal((await devices(p)).length, 1);
  await H.go(p, "/settings"); await p.locator("[data-out]").click(); await H.settle(p, 500);
  await p.locator(".sheet [data-yes]").click(); await H.settle(p, 900);
  const left = await p.evaluate((uid) => [...window.__fl.store.raw.keys()].filter((k) => k.startsWith(`users/${uid}/devices/`)), uid);
  assert.deepEqual(left, []);
  assert.equal(await p.evaluate(() => location.hash), "#/welcome");
});

test("iPhone in Safari (not on the Home Screen): explains Add to Home Screen, no Turn on button", async () => {
  const q = await phoneWith(env, { ua: IPHONE_UA });
  await H.signUp(q, { email: "ios@example.com" }); await H.onboard(q, { types: ["sheep"] });
  await H.go(q, "/settings/notifications");
  assert.match(await q.locator("[data-notify-state]").textContent(), /Add to Home Screen/);
  assert.equal(await q.locator("[data-on]").count(), 0);
  assert.equal(await q.evaluate(() => window.__asked), 0);
  await q.ctx.close();
});

test("blocked on this phone: says how to allow, no prompt", async () => {
  const q = await phoneWith(env, { permission: "denied" });
  await H.signUp(q, { email: "blocked@example.com" }); await H.onboard(q, { types: ["layers"] });
  await H.go(q, "/settings/notifications");
  assert.match(await q.locator("[data-notify-state]").textContent(), /blocked/);
  assert.equal(await q.locator("[data-on]").count(), 0);
  await q.ctx.close();
});

test("service worker: registers with the push handlers, still caches the app (incl. messaging), and the page opens the screen it is told", async () => {
  // Headless Chromium crashes when a worker shows a real notification, so the push and click
  // handlers themselves are tested in tests/unit/notify-sw.test.mjs with a fake worker scope.
  const ctx = await env.browser.newContext({ viewport: { width: 390, height: 844 } });
  const q = await ctx.newPage(); q.errors = []; q.on("pageerror", (e) => q.errors.push(e.message));
  await q.goto(`${env.server.url}index.html?backend=memory#/welcome`);
  await q.evaluate(() => navigator.serviceWorker.ready);
  await q.waitForTimeout(1500);
  const [sw] = ctx.serviceWorkers();
  assert.ok(sw, "service worker running");
  assert.equal(await sw.evaluate(() => self.registration.active !== null), true);
  // notificationclick focuses this window and posts { type: 'fl-open', url } — the page follows it
  await sw.evaluate(async () => { const cs = await self.clients.matchAll({ type: "window" }); cs.forEach((c) => c.postMessage({ type: "fl-open", url: "#/legal/privacy" })); });
  await q.waitForTimeout(800);
  assert.equal(await q.evaluate(() => location.hash), "#/legal/privacy");
  // offline caching still intact: the whole app (with the new files) is in the cache
  assert.ok(await q.evaluate(async () => { const keys = await caches.keys(); const c = await caches.open(keys.find((k) => k.startsWith("fl10-") && k !== "fl10-tiles-v1")); return !!(await c.match("./js/services/notify.js")) && !!(await c.match("./vendor/firebase-messaging-compat.js")) && !!(await c.match("./index.html")); }));
  await ctx.setOffline(true); await q.reload(); await q.waitForTimeout(1500);
  assert.ok(await q.locator("#stage").count() === 1 && (await q.title()).length > 0, "opens offline");
  assert.deepEqual(q.errors, []);
  await ctx.close();
});

for (const mode of ["light", "dark"]) {
  test(`notification screens (${mode})`, { timeout: 120000 }, async () => {
    const dark = mode === "dark"; let q = await phoneWith(env, { dark });
    const s = (n) => H.shot(q, `nt-${n}-${mode}`);
    await H.signUp(q, { email: `shots-${mode}@example.com` }); await H.onboard(q, { types: ["beef", "pigs"] });
    const b = await seedBeef(q); await seedPigs(q);
    await H.go(q, "/farm/more"); await H.go(q, "/farm/today");
    await q.evaluate(async () => (await import("./js/services/notify.js")).refreshItems({ force: true })); await H.settle(q, 600);
    await q.evaluate(() => window.scrollTo(0, 0)); await s("01-overview-bell");
    await H.go(q, `/l/${b}`); await H.settle(q, 800); await s("02-ledger-bell");
    await H.go(q, "/notifications"); await H.settle(q, 1500); await s("03-centre");
    await q.evaluate(() => window.scrollTo(0, 900)); await s("04-centre-scrolled");
    await H.go(q, "/settings"); await s("05-settings-row");
    await H.go(q, "/settings/notifications"); await s("06-off");
    await q.locator("[data-on]").click(); await H.settle(q, 900); await q.evaluate(() => window.scrollTo(0, 0)); await s("07-on-push-not-set-up");
    await q.evaluate(() => window.scrollTo(0, 600)); await s("08-prefs");
    await q.evaluate(() => window.scrollTo(0, 5000)); await s("09-prefs-bottom");
    await q.evaluate(async () => { (await import("./js/services/notify.js")).useTestPush({ vapidKey: "k", token: async () => "t" }); });
    await H.go(q, "/farm/today"); await H.go(q, "/settings/notifications"); await s("10-on-push-ready");
    await H.go(q, "/settings/reminders"); await s("11-reminders-pointer");
    assert.deepEqual(q.errors, []);
    await q.ctx.close();
    q = await phoneWith(env, { dark, ua: IPHONE_UA });
    await H.signUp(q, { email: `ios-${mode}@example.com` }); await H.onboard(q, { types: ["dairy"] });
    await H.go(q, "/settings/notifications"); await H.shot(q, `nt-12-iphone-install-${mode}`); await q.ctx.close();
    q = await phoneWith(env, { dark, permission: "denied" });
    await H.signUp(q, { email: `den-${mode}@example.com` }); await H.onboard(q, { types: ["broilers"] });
    await H.go(q, "/settings/notifications"); await H.shot(q, `nt-13-blocked-${mode}`);
    await H.go(q, "/notifications"); await H.settle(q, 1200); await H.shot(q, `nt-14-centre-empty-${mode}`); await q.ctx.close();
  });
}
