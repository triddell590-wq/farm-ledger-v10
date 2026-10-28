// Notification rules (app/js/services/notify-core.js): time zones incl. the BST/GMT change,
// summary window, quiet hours, prefs, classification, money redaction, aggregation, dedupe keys.
import test from "node:test";
import assert from "node:assert/strict";
import * as N from "../../app/js/services/notify-core.js";

const TZ = "Europe/London";
const at = (iso) => new Date(iso);

test("local time in Europe/London across the clock changes (BST starts 29 Mar, ends 25 Oct 2026)", () => {
  assert.deepEqual(N.localParts(at("2026-03-28T07:00:00Z"), TZ), { date: "2026-03-28", hour: 7, minute: 0, min: 420 }); // GMT
  assert.equal(N.localParts(at("2026-03-29T06:00:00Z"), TZ).hour, 7);  // BST: UTC+1
  assert.equal(N.localParts(at("2026-03-29T00:59:00Z"), TZ).hour, 0);  // still GMT before 01:00 UTC
  assert.equal(N.localParts(at("2026-03-29T01:00:00Z"), TZ).hour, 2);  // jumps to 02:00 BST
  assert.equal(N.localParts(at("2026-10-24T06:00:00Z"), TZ).hour, 7);  // last BST morning
  assert.equal(N.localParts(at("2026-10-25T06:00:00Z"), TZ).hour, 6);  // GMT again
  assert.equal(N.localParts(at("2026-10-25T07:00:00Z"), TZ).hour, 7);
  assert.equal(N.localParts(at("2026-06-30T23:30:00Z"), TZ).date, "2026-07-01"); // local date rolls over before UTC
  assert.equal(N.localParts(at("2026-06-30T23:30:00Z"), "Not/AZone").date, "2026-07-01"); // bad zone -> London
});

test("daily summary goes in the right hour all year, once a day, within the 3-hour window", () => {
  const p = { summaryTime: "07:00" };
  // winter (GMT): 07:00 local = 07:00 UTC
  assert.equal(N.summaryDue(at("2026-01-15T07:00:00Z"), p, TZ, null), true);
  assert.equal(N.summaryDue(at("2026-01-15T06:00:00Z"), p, TZ, null), false);
  // summer (BST): 07:00 local = 06:00 UTC
  assert.equal(N.summaryDue(at("2026-07-15T06:00:00Z"), p, TZ, null), true);
  assert.equal(N.summaryDue(at("2026-07-15T05:59:00Z"), p, TZ, null), false);
  // the change-over mornings
  assert.equal(N.summaryDue(at("2026-03-29T06:05:00Z"), p, TZ, null), true);   // first BST day
  assert.equal(N.summaryDue(at("2026-10-25T06:05:00Z"), p, TZ, null), false);  // first GMT day: 06:05 local
  assert.equal(N.summaryDue(at("2026-10-25T07:05:00Z"), p, TZ, null), true);
  // a late cron run still sends; after the window it doesn't
  assert.equal(N.summaryDue(at("2026-01-15T09:59:00Z"), p, TZ, null), true);
  assert.equal(N.summaryDue(at("2026-01-15T10:00:00Z"), p, TZ, null), false);
  // already sent today (local date) -> no
  assert.equal(N.summaryDue(at("2026-01-15T08:00:00Z"), p, TZ, "2026-01-15"), false);
  assert.equal(N.summaryDue(at("2026-01-16T07:10:00Z"), p, TZ, "2026-01-15"), true);
  // switched off
  assert.equal(N.summaryDue(at("2026-01-15T07:00:00Z"), { summary: false }, TZ, null), false);
  // a 21:00 summary in another zone
  assert.equal(N.summaryDue(at("2026-01-15T20:00:00Z"), { summaryTime: "21:00" }, "Europe/Dublin", null), false);
  assert.equal(N.summaryDue(at("2026-01-15T21:00:00Z"), { summaryTime: "21:00" }, "Europe/Dublin", null), true);
});

test("quiet hours, including across midnight", () => {
  const q = { quiet: { on: true, start: "22:00", end: "06:00" } };
  assert.equal(N.inQuiet(at("2026-01-15T23:00:00Z"), q, TZ), true);
  assert.equal(N.inQuiet(at("2026-01-15T05:59:00Z"), q, TZ), true);
  assert.equal(N.inQuiet(at("2026-01-15T06:00:00Z"), q, TZ), false);
  assert.equal(N.inQuiet(at("2026-07-15T21:30:00Z"), q, TZ), true);   // 22:30 BST
  assert.equal(N.inQuiet(at("2026-07-15T20:30:00Z"), q, TZ), false);  // 21:30 BST
  assert.equal(N.inQuiet(at("2026-01-15T23:00:00Z"), { quiet: { on: false, start: "22:00", end: "06:00" } }, TZ), false);
  assert.equal(N.inQuiet(at("2026-01-15T13:00:00Z"), { quiet: { on: true, start: "12:00", end: "14:00" } }, TZ), true);
});

test("prefs: defaults, bad values dropped", () => {
  const d = N.normPrefs();
  assert.equal(d.summaryTime, "07:00"); assert.equal(d.summary, true); assert.equal(d.ledgers, "all");
  assert.deepEqual(Object.keys(d.kinds), N.KINDS); assert.ok(N.KINDS.every((k) => d.kinds[k]));
  const p = N.normPrefs({ summaryTime: "7am", kinds: { tasks: false, bogus: true }, ledgers: ["L1", 4], quiet: { on: 1, start: "25:00" } });
  assert.equal(p.summaryTime, "07:00"); assert.equal(p.kinds.tasks, false); assert.equal(p.kinds.bogus, undefined);
  assert.deepEqual(p.ledgers, ["L1"]); assert.equal(p.quiet.on, true); assert.equal(p.quiet.start, "22:00");
});

const L1 = { id: "L1", name: "Beef", type: "beef", role: "owner" };
const W1 = { ...L1, role: "worker" };

test("classification: withdrawal is never a 'now late' legal item; info stays in the app", () => {
  const items = N.itemsFrom(L1, [
    { key: "wd", level: "late", legal: true, title: "3 cattle under withdrawal", body: "Don't sell for meat until 7 Dec." },
    { key: "nifais", level: "late", legal: true, title: "Notify NIFAIS of death: 0412", body: "" },
    { key: "bvd", level: "due", legal: false, title: "BVD test bought-in cattle", body: "" },
    { key: "fyi", level: "info", title: "Footvax expires 16 Nov" },
    { key: "milk", level: "due", title: "110 can go back in the tank from the am milking" },
  ], [], "2026-10-27");
  const k = Object.fromEntries(items.map((i) => [i.key, i.kind]));
  assert.deepEqual(k, { wd: "withdrawal", nifais: "legal", bvd: "sampling", fyi: null, milk: "withdrawal" });
  assert.deepEqual(N.lateLegal(items).map((i) => i.key), ["nifais"]);
  assert.equal(N.badgeCount(items), 4);
});

test("aggregation: alerts first, tasks deduped against alerts, late before due, ledger grouping", () => {
  const items = N.itemsFrom(L1,
    [{ key: "a1", level: "due", legal: true, title: "Register calf of 0471 Holly on NIFAIS by 30 Oct", href: "#/l/L1/breeding/register" },
     { key: "a2", level: "late", legal: true, title: "Alarm test overdue — Finishing house", href: "#/l/L1/alarm/F" }],
    [{ key: "t1", title: "Register calf of 0471 Holly on NIFAIS", due: "2026-10-30", legal: true, href: "#/l/L1/breeding/register" },
     { key: "t2", title: "Test the ventilation alarm — Finishing house", due: "2026-10-25", legal: true, href: "#/l/L1/alarm/F" },
     { key: "t3", title: "Weigh stores", due: "2026-10-20" },
     { key: "t4", title: "Done already", due: "2026-10-27", done: true }],
    "2026-10-27");
  assert.deepEqual(items.map((i) => i.key), ["a2", "t3", "a1"]);
  assert.equal(items.find((i) => i.key === "t3").level, "late");
  assert.equal(items.find((i) => i.key === "t3").kind, "tasks");
  const g = N.groupByLedger([...items, ...N.itemsFrom({ id: "L2", name: "Sheep", type: "sheep", role: "owner" }, [{ key: "s", level: "due", title: "Notify movement", legal: true }], [], "2026-10-27")], [L1, { id: "L2" }, { id: "L3" }]);
  assert.deepEqual(g.map((x) => [x.ledger.id, x.items.length]), [["L1", 3], ["L2", 1]]);
});

test("prefs filtering: kinds and ledgers", () => {
  const items = [
    ...N.itemsFrom(L1, [{ key: "a", level: "late", legal: true, title: "Notify NIFAIS" }, { key: "w", level: "due", title: "Withdrawal ends today for 0412" }], [{ key: "t", title: "Weigh stores", due: "2026-10-27" }], "2026-10-27"),
    ...N.itemsFrom({ id: "L2", name: "Pigs", type: "pigs", role: "owner" }, [{ key: "p", level: "due", legal: true, title: "Room checks" }], [], "2026-10-27"),
  ];
  assert.equal(N.filterForPrefs(items, {}).length, 4);
  assert.deepEqual(N.filterForPrefs(items, { kinds: { tasks: false, withdrawal: false } }).map((i) => i.key), ["a", "p"]);
  assert.deepEqual(N.filterForPrefs(items, { ledgers: ["L2"] }).map((i) => i.key), ["p"]);
  assert.deepEqual(N.filterForPrefs(items, { kinds: { legal: false } }).map((i) => i.key).sort(), ["t", "w"]);
});

test("money redaction: no £ amount ever reaches a Worker or Vet / Adviser", () => {
  const a = [{ key: "m", level: "due", title: "0433 Nancy must calve by 20 May to count (£100)", body: "Sold 3 at £1,250 per head · −£311 margin · £4.62/kg dw" }];
  const t = [{ key: "h", title: "Pay the haulier £420.50 for the mart run", due: "2026-10-27" }];
  for (const role of ["worker", "viewer"]) {
    const items = N.itemsFrom({ ...L1, role }, a, t, "2026-10-27");
    for (const i of items) assert.doesNotMatch(i.title + i.body, /£\s?\d/, `${role}: ${i.title} ${i.body}`);
    assert.match(items[0].title, /amount hidden/);
    const s = N.summaryMessage(items); assert.doesNotMatch(s.body + s.title, /£\s?\d/);
  }
  for (const role of ["owner", "manager", "accountant"]) assert.match(N.itemsFrom({ ...L1, role }, a, [], "2026-10-27")[0].title, /£100/);
  assert.equal(N.redactMoney("Pay £420.50 for it"), "Pay (amount hidden) for it");
  assert.equal(N.redactMoney("No money"), "No money");
});

test("messages: summary, late (single and grouped), invite", () => {
  const items = N.itemsFrom(W1, [{ key: "a", level: "late", legal: true, title: "Notify NIFAIS of death" }, { key: "b", level: "due", legal: true, title: "Room checks" }], [{ key: "t", title: "Weigh stores", due: "2026-10-27" }], "2026-10-27");
  const s = N.summaryMessage(items, { farmName: "Drumlin Farm" });
  assert.equal(s.title, "Today on Drumlin Farm"); assert.match(s.body, /1 legal job is late: Notify NIFAIS of death\./); assert.match(s.body, /1 legal deadline due/); assert.match(s.body, /1 job to do/);
  assert.equal(s.url, "#/notifications"); assert.equal(s.count, 3);
  assert.equal(N.summaryMessage([]), null);
  const one = N.lateMessage([items[0]]); assert.equal(one.title, "Late: Notify NIFAIS of death"); assert.match(one.body, /^Beef/); assert.equal(one.url, "#/l/L1");
  const many = N.lateMessage([items[0], items[0], items[0], items[0]]); assert.equal(many.title, "4 legal jobs are late"); assert.equal(many.url, "#/notifications");
  const inv = N.inviteMessage({ usedByName: "Seán", ledgerName: "Beef", ledgerId: "L1", role: "worker", code: "X" });
  assert.equal(inv.title, "Seán joined Beef"); assert.equal(inv.url, "#/l/L1/more/people");
});

test("dedupe keys: stable, Firestore-safe, distinct; log pruning after 60 days", () => {
  const k = N.lateKey({ ledgerId: "L1", key: "move:abc/def" });
  assert.equal(k, "late:L1:move:abc/def");
  const id = N.logId(k); assert.equal(id, N.logId(k)); assert.doesNotMatch(id, /\//); assert.match(id, /^late-[0-9a-f]{16}$/);
  assert.notEqual(id, N.logId("late:L1:move:abc/deg"));
  assert.notEqual(N.logId(N.summaryKey("d1", "2026-10-27")), N.logId(N.summaryKey("d1", "2026-10-28")));
  const now = at("2026-10-27T12:00:00Z");
  assert.equal(N.isStale({ sentAt: at("2026-08-29T12:00:00Z") }, now), false); // 59 days
  assert.equal(N.isStale({ sentAt: at("2026-08-27T11:00:00Z") }, now), true);  // 61 days
  assert.equal(N.isStale({}, now), true);
});
