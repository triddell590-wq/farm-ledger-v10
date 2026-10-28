// Every case in matrix.mjs against the REAL firestore.rules in the Firestore emulator.
// Needs Java + the emulator jar (download from storage.googleapis.com was blocked in the build
// sandbox on 2026-10-14). Run with: tests/run.sh --emulator
//   (= cd build/tools && npx firebase emulators:exec --project demo-fl10 --config ../firebase/firebase.json
//        --only firestore "node --test ../tests/rules/emulator.test.mjs")
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { CASES, seed } from "./matrix.mjs";
import { runCase } from "./run-case.mjs";

const require = createRequire(new URL("../../tools/package.json", import.meta.url));
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const RULES = readFileSync(new URL("../../firebase/firestore.rules", import.meta.url), "utf8");
let env;

before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-fl10", firestore: { rules: RULES, host: "127.0.0.1", port: 8085 } });
});
after(async () => { if (env) await env.cleanup(); });

async function reseed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const b = db.batch();
    for (const [p, d] of Object.entries(seed())) b.set(db.doc(p), d);
    await b.commit();
  });
}
const adapter = {
  async as(uid) {
    await reseed();
    const db = (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
    return {
      get: (p) => db.doc(p).get(),
      list: (p, where) => (where || []).reduce((q, [f, op, v]) => q.where(f, op, v), db.collection(p)).get(),
      group: (id, uid2) => db.collectionGroup(id).where("uid", "==", uid2).get(),
      set: (p, d, merge) => db.doc(p).set(d, { merge }),
      remove: (p) => db.doc(p).delete(),
      batch: (ops) => { const b = db.batch(); for (const o of ops) { if (o.type === "delete") b.delete(db.doc(o.path)); else b.set(db.doc(o.path), o.data, { merge: o.type === "update" }); } return b.commit(); },
    };
  },
};

for (const c of CASES) {
  test(`emulator ${c.id} -> ${c.expect}`, async () => {
    assert.equal(await runCase(adapter, c), c.expect);
  });
}
