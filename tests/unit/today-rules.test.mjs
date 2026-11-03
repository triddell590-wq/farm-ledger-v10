// "What's on today" (app/js/services/today-rules.js, review fixes 1B): To do today holds only
// jobs due today or late (late first, legal first), the rest wait in Coming up with their date,
// due lines never contradict their date, one obligation shows once, and the bell counts only
// distinct legal items that are late or due within 3 days.
import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../../app/js/services/today-rules.js";
import * as N from "../../app/js/services/notify-core.js";

const T = "2026-10-29";

test("To do today = due today or late; late first, legal first; the rest is Coming up by date", () => {
  const jobs = [
    { id: "a", title: "Post DNA sample", due: "2026-12-04" },
    { id: "b", title: "Feed calves", due: T },
    { id: "c", title: "Notify NIFAIS of a move", due: "2026-10-27", legal: true },
    { id: "d", title: "Weigh stores", due: "2026-10-11" },
    { id: "e", title: "Tag calf of 107", due: T, legal: true },
    { id: "f", title: "Register calf with the society", due: "2026-11-01" },
    { id: "g", title: "Done already", due: T, done: true },
    { id: "h", title: "No date at all" },
  ];
  const s = R.splitTasks(jobs, T);
  assert.deepEqual(s.now.map((x) => x.id), ["c", "d", "e", "b", "h"]);
  assert.deepEqual(s.later.map((x) => x.id), ["f", "a"]);
  assert.deepEqual(s.done.map((x) => x.id), ["g"]);
  assert.equal(R.nowCount(jobs, T), 5);
});

test("due lines: never 'due today' next to another date, no 'by in N days', plain late wording", () => {
  assert.equal(R.dueLine({ due: T }, T), "due today");
  assert.equal(R.dueLine({ due: T, sub: "by 20:00" }, T), "due today · by 20:00");
  assert.equal(R.dueLine({ due: "2026-11-01" }, T), "Sun 1 Nov · in 3 days");
  assert.equal(R.dueLine({ due: "2026-11-01", legal: true }, T), "Legal deadline Sun 1 Nov · in 3 days");
  assert.equal(R.dueLine({ due: "2026-10-30" }, T), "Fri 30 Oct · tomorrow");
  assert.equal(R.dueLine({ due: "2026-10-28", legal: true }, T), "1 day late · legal deadline");
  assert.equal(R.dueLine({ due: "2026-10-11" }, T), "18 days late");
  assert.equal(R.dueLine({ due: "2027-05-22" }, T), "Sat 22 May 2027 · in 205 days");
  for (const d of ["2026-10-20", T, "2026-10-30", "2026-11-23", "2027-01-02"]) {
    const l = R.dueLine({ due: d, legal: true }, T);
    assert.doesNotMatch(l, /by in|due today.*\d{1,2} [A-Z][a-z]{2}|in 0 days/, l);
  }
});

test("dates written in alerts are understood", () => {
  assert.equal(R.inferDue("TB test in 25 days", T), "2026-11-23");
  assert.equal(R.inferDue("Register calf … by 1 Nov · 3 days left.", T), "2026-11-01");
  assert.equal(R.inferDue("Boot swabs — House 2 due Sat 31 Oct", T), "2026-10-31");
  assert.equal(R.inferDue("Milking machine test due by 23/11 (ISO 6690, yearly)", T), "2026-11-23");
  assert.equal(R.inferDue("0433 Nancy must calve by 22 May 2027 to count (£100)", T), "2027-05-22");
  assert.equal(R.inferDue("Health review due 23 Nov", T), "2026-11-23");
  assert.equal(R.inferDue("Due 23/11/2026.", T), "2026-11-23");
  assert.equal(R.inferDue("3 cattle under withdrawal", T), null);
  assert.equal(R.alertLevel({ level: "due", title: "TB test in 25 days" }, T), "info");
  assert.equal(R.alertLevel({ level: "due", title: "Notify NIFAIS by 31 Oct" }, T), "due");
  assert.equal(R.alertLevel({ level: "late", title: "Alarm test overdue" }, T), "late");
});

test("one obligation, one item: alert and job twins are recognised, distinct jobs are not", () => {
  const L = "#/l/D";
  const iso = { key: "parlour:ISO 6690 static test", level: "due", title: "Milking machine test due by 23/11 (ISO 6690, yearly)", href: `${L}/parlour-machine` };
  const isoJob = { key: "parlour:ISO 6690 static test:2026-11-23", title: "ISO 6690 machine test due by 23/11", due: "2026-11-23", href: `${L}/parlour-machine` };
  assert.ok(R.sameObligation(iso, isoJob));
  const tb = { key: "tb", level: "due", legal: true, title: "TB test in 25 days", href: `${L}/tb` };
  assert.ok(R.sameObligation(tb, { key: "tb:2026-11-23", title: "TB test due 23/11 — book it with your vet", legal: true, href: `${L}/tb`, due: "2026-11-09" }));
  assert.ok(R.sameObligation({ key: "tb", level: "info", title: "TB test in 25 days", href: `${L}/paperwork/tb` }, { key: "tb30:x", title: "TB test: book the vet", href: `${L}/paperwork/tb` }));
  assert.ok(R.sameObligation({ key: "tank-missing", level: "due", legal: true, title: "Tank temperature not logged after morning milking", href: `${L}/milk/tank` }, { key: "tank:x:am", title: "Log tank temperature after morning milking", href: `${L}/milk/tank` }));
  const nif = { key: "nif:1", level: "due", legal: true, title: "Register calf of 0471 Holly on NIFAIS by 1 Nov", href: `${L}/breeding/register` };
  assert.ok(R.sameObligation(nif, { key: "reg:1:nifais", title: "Register calf of 0471 Holly on NIFAIS", legal: true, href: `${L}/breeding/register` }));
  assert.ok(!R.sameObligation(nif, { key: "reg:1:society", title: "Register calf of 0471 Holly with the Charolais Cattle Society", href: `${L}/breeding/register` }));
  assert.ok(!R.sameObligation(nif, { key: "reg:1:dna", title: "Post DNA sample for calf of 0471 Holly", href: `${L}/breeding/register` }));
  assert.ok(!R.sameObligation({ key: "nsb", level: "info", title: "3 cows not seen bulling", href: `${L}/fertility/vet` }, { key: "pd:x", title: "PD with the vet: 5 cows", href: `${L}/fertility/vet` }));
  // a home keeps a late alert at the top (its job leaves the list) and otherwise shows the job
  const late = { key: "notice:F", level: "late", legal: true, title: "1 day late — tell DAERA now about the new flock for House 3", href: `${L}/flock/F` };
  const lateJob = { key: "notice:F", title: "1 day late — tell DAERA now about the new flock for House 3", due: "2026-10-28", legal: true, href: `${L}/flock/F` };
  const d = R.homeDedupe([late, iso], [lateJob, isoJob]);
  assert.deepEqual(d.alerts.map((a) => a.key), ["notice:F"]);
  assert.deepEqual(d.tasks.map((t) => t.key), ["parlour:ISO 6690 static test:2026-11-23"]);
});

test("notification items: twins merged (alert takes the job's date), far-off 'due' becomes Coming up", () => {
  const led = { id: "D", name: "Dairy", type: "dairy", role: "owner" };
  const items = N.itemsFrom(led, [
    { key: "parlour:ISO 6690 static test", level: "due", title: "Milking machine test due by 23/11 (ISO 6690, yearly)", href: "#/l/D/parlour-machine" },
    { key: "tb", level: "due", legal: true, title: "TB test in 25 days", href: "#/l/D/tb" },
    { key: "tank-missing", level: "due", legal: true, title: "Tank temperature not logged after morning milking", href: "#/l/D/milk/tank" },
  ], [
    { key: "parlour:ISO 6690 static test:2026-11-23", title: "ISO 6690 machine test due by 23/11", due: "2026-11-23", href: "#/l/D/parlour-machine" },
    { key: "tb:2026-11-23", title: "TB test due 23/11 — book it with your vet", due: "2026-11-09", legal: true, href: "#/l/D/tb" },
    { key: "tank:2026-10-29:am", title: "Log tank temperature after morning milking", due: T, href: "#/l/D/milk/tank" },
    { key: "heats", title: "Watch for heats: 9 cows", due: T, href: "#/l/D/fertility" },
  ], T);
  assert.equal(items.length, 4, items.map((i) => i.title).join(" | "));
  assert.equal(items.filter((i) => /ISO 6690/.test(i.title)).length, 1);
  assert.equal(items.filter((i) => /TB test/.test(i.title)).length, 1);
  assert.equal(items.find((i) => i.key === "tb").level, "info");
  assert.equal(items.find((i) => i.key === "parlour:ISO 6690 static test").level, "info");
  assert.equal(N.badgeCount(items, T), 1, "only the tank temperature (legal, due today)");
});

test("bell: distinct legal items, late or due within 3 days; never withdrawal, info or plain jobs", () => {
  const it = (o) => ({ ledgerId: "B", kind: o.legal ? "legal" : "tasks", ...o });
  const items = [
    it({ title: "Notify NIFAIS of death: 0412", level: "late", legal: true }),
    it({ title: "Notify NIFAIS of death: 0412", level: "late", legal: true }), // same thing twice
    it({ title: "Register calf on NIFAIS", level: "due", legal: true, due: "2026-11-01" }),
    it({ title: "TB test", level: "due", legal: true, due: "2026-11-23" }),
    it({ title: "3 cattle under withdrawal", level: "late", legal: true, kind: "withdrawal" }),
    it({ title: "Weigh stores", level: "late" }),
    it({ title: "Footvax expires", level: "info" }),
  ];
  assert.equal(R.bellCount(items, T), 2);
  assert.equal(R.bellCount([], T), 0);
});
