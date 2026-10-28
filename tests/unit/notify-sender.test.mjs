// The hourly sender (build/notify/sender.mjs) on the fixture farm: all six sectors seeded by the
// same scripts the Playwright tests use, in-memory store, a fake FCM. Never touches Firebase.
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildFixtureFarm } from "../../notify/fixtures.mjs";
import { useBackend, store } from "../../app/js/core/store.js";
import { session } from "../../app/js/services/session.js";
import { allItems } from "../../app/js/services/duties.js";
import { runSender, fcmMessage } from "../../notify/sender.mjs";
import { localParts, logId, lateKey, summaryKey } from "../../app/js/services/notify-core.js";

const TZ = "Europe/London";
/** A Date for today's local (London) date at hh:mm London time. */
function londonToday(hh, mm = 0) {
  const today = localParts(new Date(), TZ).date;
  for (const off of [0, 1, -1]) {
    const d = new Date(`${today}T${String(hh - off).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
    const lp = localParts(d, TZ); if (lp.date === today && lp.hour === hh && lp.minute === mm) return d;
  }
  throw new Error("no such local time");
}
const fakeFcm = (dead = new Set()) => { const out = []; const send = async (token, msg) => { if (dead.has(token)) return { ok: false, error: "messaging/registration-token-not-registered", dead: true }; out.push({ token, msg, fcm: fcmMessage(token, msg) }); return { ok: true }; }; return { out, send }; };

let fx;
test.before(async () => { fx = await buildFixtureFarm(); fx.db.enforceRules = false; useBackend(fx.db); });

async function ledgersFor(uid) {
  const mems = await store.queryGroup("members", { where: [["uid", "==", uid]] });
  const out = []; for (const m of mems) out.push({ ...(await store.get(`ledgers/${m._path.split("/")[1]}`)), role: m.role });
  return out;
}

test("every sector's alerts and jobs reach the sender through the app's own sector code", async () => {
  const ls = await ledgersFor(fx.users.tom); session.useLedgers(ls);
  const items = await allItems(ls);
  for (const type of ["beef", "sheep", "dairy", "pigs", "layers", "broilers"]) {
    const mine = items.filter((i) => i.ledgerType === type);
    assert.ok(mine.length > 0, `${type} has items`);
    assert.ok(mine.some((i) => i.level !== "info"), `${type} has something late or due`);
    assert.ok(mine.every((i) => i.href && i.href.startsWith(`#/l/${fx.ids[type]}`) || i.href.startsWith("#/farm/")), `${type} links into its ledger`);
  }
  assert.ok(items.some((i) => i.kind === "legal" && i.level === "late"), "some legal item is late");
  assert.ok(items.some((i) => i.kind === "withdrawal"), "withdrawal items present");
});

test("worker sees only their ledgers, no money, no accountant tasks", async () => {
  const ls = await ledgersFor(fx.users.sean); session.useLedgers(ls);
  assert.deepEqual(ls.map((l) => l.type).sort(), ["beef", "pigs"]);
  const items = await allItems(ls);
  assert.ok(items.length > 0);
  for (const i of items) assert.doesNotMatch(`${i.title} ${i.body}`, /£\s?\d/, i.title);
  assert.ok(items.some((i) => /haulier \(amount hidden\)/.test(i.title)));
});

test("a run at 07:30: late legal pushes (grouped when many), summaries, invite; second run sends nothing new", async () => {
  const now = londonToday(7, 30);
  const f1 = fakeFcm();
  const r1 = await runSender({ send: f1.send, now });
  assert.equal(r1.people, 2); assert.equal(r1.devices, 2);
  const tom = f1.out.filter((x) => x.token === "fixture-token-tomPhone"), sean = f1.out.filter((x) => x.token === "fixture-token-seanPhone");
  assert.ok(tom.some((x) => x.msg.tag === "fl-summary" && /^Today on Drumlin Farm/.test(x.msg.title)));
  assert.ok(tom.some((x) => /legal jobs are late$/.test(x.msg.title) && x.msg.url === "#/notifications"), "Tom: many late -> one grouped push");
  assert.ok(tom.some((x) => /joined Beef/.test(x.msg.title)), "invite accepted");
  assert.ok(sean.some((x) => x.msg.tag === "fl-summary"));
  assert.ok(sean.every((x) => !/£\s?\d/.test(x.msg.title + x.msg.body)), "no money to the worker");
  assert.ok(!sean.some((x) => /joined/.test(x.msg.title)), "worker didn't make the invite");
  // FCM v1 shape: data-only strings, urgency, TTL; token never in data
  const m = tom[0].fcm; assert.equal(m.token, "fixture-token-tomPhone");
  assert.ok(Object.values(m.data).every((v) => typeof v === "string")); assert.equal(m.webpush.headers.Urgency, "high");
  // dedupe log written
  const log = await store.query(`users/${fx.users.tom}/notifyLog`);
  assert.ok(log.some((e) => e.id === logId(summaryKey("tomPhone", localParts(now, TZ).date))));
  assert.ok(log.filter((e) => e.kind === "late").length >= 2);
  // again, same hour: nothing
  const f2 = fakeFcm(); await runSender({ send: f2.send, now: new Date(now.getTime() + 20 * 60000) });
  assert.equal(f2.out.length, 0, f2.out.map((x) => x.msg.title).join(" | "));
});

test("quiet hours hold back a late push until they end; prefs switch kinds off", async () => {
  // a brand new late item on Beef, Seán's phone in quiet hours 22:00–06:00
  await store.set(`ledgers/${fx.ids.beef}/tasks/fx-late`, { title: "Notify NIFAIS of a death: UK9 012345 00999", due: "2001-01-01", legal: true, done: false });
  await store.update(`users/${fx.users.sean}/devices/seanPhone`, { prefs: { summaryTime: "07:00", quiet: { on: true, start: "22:00", end: "06:00" } } });
  const night = new Date(londonToday(7, 30).getTime() - 4.5 * 3600000); // 03:00 local
  const f1 = fakeFcm(); const r = await runSender({ send: f1.send, now: night });
  assert.ok(!f1.out.some((x) => x.token === "fixture-token-seanPhone"), "nothing to Seán at night");
  assert.ok(r.skipped.some((s) => s.device === "seanPhone" && s.reason === "quiet hours"));
  const tomGot = f1.out.filter((x) => x.token === "fixture-token-tomPhone" && /NIFAIS of a death/.test(x.msg.title));
  assert.equal(tomGot.length, 1, "Tom has no quiet hours: told now");
  // Tom's push logged the item for Tom only; Seán's log has no entry yet -> sent when quiet ends
  const key = logId(lateKey({ ledgerId: fx.ids.beef, key: "task:fx-late" }));
  assert.equal(await store.get(`users/${fx.users.sean}/notifyLog/${key}`), null);
  const morning = new Date(night.getTime() + 3.5 * 3600000); // 06:30 local
  const f2 = fakeFcm(); await runSender({ send: f2.send, now: morning });
  assert.ok(f2.out.some((x) => x.token === "fixture-token-seanPhone" && /NIFAIS of a death/.test(x.msg.title)));
  assert.ok(!f2.out.some((x) => x.token === "fixture-token-tomPhone" && /NIFAIS of a death/.test(x.msg.title)), "Tom not told twice");
  // legal switched off: a newer late item is not pushed to Seán
  await store.set(`ledgers/${fx.ids.beef}/tasks/fx-late2`, { title: "Record a death on NIFAIS: UK9 012345 00998", due: "2001-01-01", legal: true, done: false });
  await store.update(`users/${fx.users.sean}/devices/seanPhone`, { prefs: { summaryTime: "07:00", kinds: { legal: false } } });
  const f3 = fakeFcm(); await runSender({ send: f3.send, now: morning });
  assert.ok(!f3.out.some((x) => x.token === "fixture-token-seanPhone"));
});

test("dead tokens are removed; old log entries pruned", async () => {
  await store.set(`users/${fx.users.tom}/devices/oldPhone`, { token: "dead-token", tz: TZ, prefs: { summaryTime: "07:00" }, createdAt: new Date(), lastSeen: new Date() });
  await store.set(`users/${fx.users.tom}/notifyLog/late-old`, { key: "late:x:y", sentAt: new Date(Date.now() - 61 * 86400000) });
  const tomorrow7 = new Date(londonToday(7, 30).getTime() + 86400000);
  const f = fakeFcm(new Set(["dead-token"]));
  const r = await runSender({ send: f.send, now: tomorrow7 });
  assert.ok(r.removed.some((x) => x.device === "oldPhone"));
  assert.equal(await store.get(`users/${fx.users.tom}/devices/oldPhone`), null);
  assert.equal(await store.get(`users/${fx.users.tom}/notifyLog/late-old`), null);
  assert.ok(r.pruned >= 1);
  assert.ok(f.out.some((x) => x.token === "fixture-token-tomPhone" && x.msg.tag === "fl-summary"), "next day's summary still goes");
});

test("send.mjs --dry-run prints what would be sent for the fixture farm", async () => {
  const dir = fileURLToPath(new URL("../../notify/", import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, ["send.mjs", "--dry-run", "--json"], { cwd: dir, env: { ...process.env, FIREBASE_SERVICE_ACCOUNT: "" } });
  const r = JSON.parse(stdout);
  assert.equal(r.people, 2); assert.ok(r.sent.length >= 4);
  assert.ok(r.sent.some((s) => s.what === "summary") && r.sent.some((s) => s.what === "late") && r.sent.some((s) => s.what === "invite"));
  assert.ok(r.outbox.every((o) => o.message.token && o.message.data.title));
});
