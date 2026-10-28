// Pigs alerts (design/13 §11) and "To do today" (§3.4) from one snapshot built the way the screens build it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnap } from "../../app/js/sectors/pigs/data.js";
import { pigAlerts } from "../../app/js/sectors/pigs/model/alerts.js";
import { todayTasks } from "../../app/js/sectors/pigs/model/duties.js";

const T = "2026-10-20";
function snap(over = {}, meta = {}) {
  const data = {
    sows: [{ id: "s1", sowNo: "1187", type: "sow", entered: "2024-01-01" }, { id: "s2", sowNo: "0932", type: "sow", entered: "2024-01-01" }],
    services: [{ id: "v1", sowId: "s1", date: "2026-06-30", batchId: "b41" }, { id: "v2", sowId: "s2", date: "2026-09-30", batchId: "b43" }],
    scans: [{ id: "sc1", sowId: "s1", date: "2026-07-29", result: "+" }], litters: [],
    rooms: [{ id: "f3", name: "Farrowing 3", house: "Farrowing house", kind: "farrowing", crates: 24 },
      { id: "fin2", name: "Finisher 2", house: "Finishing house", kind: "finisher", batchId: "b35", pens: [{ no: 1, areaM2: 40 }] }],
    batches: [{ id: "b41", no: 41, serveDate: "2026-06-29" }, { id: "b43", no: 43, serveDate: "2026-09-28" },
      { id: "b35", no: 35, stage: "finisher", roomId: "fin2", numberIn: 50, avgKgIn: 35, inDate: "2026-08-28" }],
    readings: [{ roomId: "fin2", date: "2026-10-18", waterM3: 100 }, { roomId: "fin2", date: "2026-10-19", waterM3: 110 }, { roomId: "fin2", date: "2026-10-20", waterM3: 117.8 }],
    alarmTests: [{ house: "Finishing house", date: "2026-10-11", sounded: true }, { house: "Farrowing house", date: "2026-10-18", sounded: true }],
    moves: [{ id: "m1", direction: "off", date: "2026-10-14", n: 180, category: "finishers" }],
    vetVisits: [{ id: "q1", date: "2026-06-23" }], roomChecks: [], tasks: [], deaths: [], feedDeliveries: [], bins: [], medicines: [], tailBites: [], siteChecks: [], embUploads: [], inventories: [], killSheets: [], enrichment: [], semen: [], visitors: [], plans: [], finance: [],
    ...over,
  };
  return buildSnap({ id: "L1", role: "owner", settings: { sows: 240, batchInterval: "3-weekly", herdMark: "NI 1234" } }, data, { settings: meta }, { now: `${T}T13:00` });
}

test("alerts: late legal first — alarm, movement, space; then due; ASF never automatic (§11)", () => {
  const a = pigAlerts(snap().c);
  const titles = a.map((x) => x.title);
  assert.equal(a[0].level, "late");
  assert.ok(titles.includes("Alarm test overdue — Finishing house"));
  assert.ok(!titles.some((t) => /Farrowing house/.test(t)));
  assert.ok(titles.includes("Notify the move of 180 finishers by 21 Oct"));
  assert.ok(titles.some((t) => /Finisher 2 water down 22% on yesterday/.test(t)));
  assert.ok(titles.includes("Book your quarterly vet visit — 17 weeks since the last"));
  assert.ok(titles.includes("1 room not checked yet today")); // after 12:00
  assert.ok(!titles.some((t) => /ASF|notifiable/i.test(t)));
  const order = a.map((x) => ({ late: 0, due: 1, info: 2 })[x.level]);
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
});

test("alerts: sow in the crate more than 7 days before she's due (HF.9.2.a)", () => {
  const sows = [{ id: "s1", sowNo: "1187", type: "sow", location: { roomId: "f3", crate: 12, since: "2026-10-12" } }];
  const a = pigAlerts(snap({ sows, services: [{ sowId: "s1", date: "2026-06-30", batchId: "b41" }] }).c);
  assert.ok(a.some((x) => x.title === "Sow 1187 went into the crate 10 days before she's due — Red Tractor allows 7"));
});

test("to do today: room checks, alarm, returns, movement notification, QVR (§3.4)", () => {
  const t = todayTasks(snap().c).map((x) => x.title);
  assert.ok(t.includes("Room checks — 0 of 1 done"));
  assert.ok(t.includes("Test the ventilation alarm — Finishing house"));
  assert.ok(t.includes("Watch for returns: 1 sow served 18–24 days ago"));
  assert.ok(t.some((x) => /^Notify movement of 180 finishers \(by Wed 21 Oct\)$/.test(x)));
  assert.ok(t.includes("Book your quarterly vet visit — 17 weeks since the last"));
  // ticking a job (a done task with the same sourceRef) hides it
  const keyed = todayTasks(snap().c).find((x) => x.title.startsWith("Room checks"));
  const t2 = todayTasks(snap({ tasks: [{ sourceRef: keyed.key, done: true }] }).c).map((x) => x.title);
  assert.ok(!t2.some((x) => x.startsWith("Room checks")));
  // a room check today clears it
  const t3 = todayTasks(snap({ roomChecks: [{ roomId: "fin2", date: T, pens: [] }] }).c).map((x) => x.title);
  assert.ok(!t3.some((x) => x.startsWith("Room checks")));
});

test("to do today: move sows to farrowing before due (§3.4)", () => {
  // served 2026-07-01 → due 2026-10-23 → move 2026-10-18 (5 days before)
  const t = todayTasks(snap({ services: [{ sowId: "s1", date: "2026-07-01", batchId: "b41" }], scans: [] }).c).map((x) => x.title);
  assert.ok(t.includes("Move 1 sow to farrowing (B41 due Fri)"), t.join("\n"));
});
