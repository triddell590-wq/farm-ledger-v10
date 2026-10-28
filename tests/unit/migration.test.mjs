// Tom's v9 document -> v10 Beef ledger (DRY RUN on a synthetic v9 document; never live data).
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshEnv } from "./env.mjs";
import { v9Doc, v9Photos } from "../fixtures/v9-synthetic.mjs";
import { planMigration, verifyRoundTrip, applyPlan, recordsFromWrites } from "../../app/js/migrate/v9-to-v10.js";
import { boardSummary, stateFromRecords } from "../../app/board-feed.js";
import { listMine } from "../../app/js/services/ledgers.js";
import { listRecords } from "../../app/js/services/records.js";
import { store } from "../../app/js/core/store.js";

const TOM = "Nul4LGSWD4Zclv0lLGYjynVq2QZ2";
const opts = { ownerUid: TOM, ownerName: "Tom Riddell", ownerEmail: "tom@x.test", farmName: "Drumlin Farm", now: new Date("2026-10-14T10:00:00Z") };

test("plan covers every v9 record and loses nothing (round trip)", () => {
  const v9 = v9Doc(), ph = v9Photos();
  const plan = planMigration(v9, ph, opts);
  assert.deepEqual(verifyRoundTrip(v9, ph, plan), []);
  assert.equal(plan.counts.animals, v9.herd.length);
  assert.equal(plan.counts.medicines, v9.medicine.length);
  assert.equal(plan.counts.finance, v9.finance.length);
  assert.equal(plan.counts.photos, 2);
  assert.deepEqual(plan.warnings, []);
});

test("round trip still holds with awkward v9 data (no ids, duplicate ids, unknown fields)", () => {
  const v9 = v9Doc();
  v9.herd.push({ tag: "UK9 123456 700099", dob: "2025-01-01" }); // no id
  v9.herd.push({ ...v9.herd[0] }); // duplicate id
  v9.somethingNew = { a: 1 };
  const plan = planMigration(v9, {}, opts);
  assert.ok(plan.warnings.some((w) => /no usable id/.test(w)));
  assert.ok(plan.warnings.some((w) => /duplicate id/.test(w)));
  // ids are rewritten for those two, so compare after putting them back the way v9 had them
  const diffs = verifyRoundTrip(v9, {}, plan);
  assert.deepEqual(diffs, []);
});

test("applied as Tom under the rules model: ledgers, records, meta, token all written", async () => {
  const env = freshEnv();
  await env.as("tom");
  const plan = planMigration(v9Doc(), v9Photos(), opts);
  await applyPlan(store, plan);
  const mine = await listMine();
  assert.deepEqual(mine.map((l) => [l.type, l.role]), [["farm", "owner"], ["beef", "owner"]]);
  const animals = await listRecords(plan.beefId, "animals");
  assert.equal(animals.length, 4);
  assert.equal((await store.get(`ledgers/${plan.beefId}/meta/keeper`)).herdNo, "123456");
  assert.equal((await store.get(`ledgers/${plan.beefId}/private/boardFeed`)).token, "f".repeat(48));
});

test("Morning Board output from the v10 Beef ledger equals v9's output", () => {
  const v9 = v9Doc();
  const plan = planMigration(v9, {}, opts);
  const { recs } = recordsFromWrites(plan);
  const before = boardSummary({ herd: v9.herd, medicine: v9.medicine, finance: v9.finance, purchases: v9.purchases }, "b");
  const after = boardSummary(stateFromRecords({ animals: recs.animals, medicines: recs.medicines, finance: recs.finance, purchases: recs.purchases }), "b");
  assert.deepEqual(after, before);
  assert.equal(before.herd.length, 3); // h3 is off the farm
  assert.equal(before.withdrawals.length, 1);
});

test("an animal that leaves in v10 drops off the board like v9's offDate", () => {
  const v9 = v9Doc();
  const plan = planMigration(v9, {}, opts);
  const { recs } = recordsFromWrites(plan);
  recs.animals[0].dateOff = "2026-10-20"; recs.animals[0].status = "gone";
  recs.animals.push({ id: "new", tag: "XI9 000001 000017", sex: "Heifer", breed: "CH", dob: "2026-10-01", createdAt: new Date() });
  const s = boardSummary(stateFromRecords(recs), "b");
  assert.deepEqual(s.herd.map((a) => a.tag), ["UK9 123456 700023", "UK9 123456 700045", "XI9 000001 000017"]);
});
