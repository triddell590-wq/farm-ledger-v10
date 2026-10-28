// Every case in matrix.mjs against the JS model of the rules (policy-rules.js) running inside
// the in-memory store. Runs without Java or downloads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryBackend } from "../../app/js/core/store-memory.js";
import { CASES, seed, NOW } from "./matrix.mjs";
import { runCase } from "./run-case.mjs";

function memoryAdapter() {
  const B = createMemoryBackend({ now: () => new Date(NOW) });
  B.load(seed());
  return {
    async as(uid) {
      B.uid = uid;
      return {
        get: (p) => B.get(p),
        list: (p, where) => B.query(p, { where: where || [] }),
        group: (id, uid2) => B.queryGroup(id, { where: [["uid", "==", uid2]] }),
        set: (p, d, merge) => B.set(p, d, { merge }),
        remove: (p) => B.remove(p),
        batch: (ops) => { const b = B.batch(); for (const o of ops) { if (o.type === "delete") b.remove(o.path); else b.set(o.path, o.data, { merge: o.type === "update" }); } return b.commit(); },
      };
    },
  };
}

for (const c of CASES) {
  test(`model ${c.id} -> ${c.expect}`, async () => {
    const got = await runCase(memoryAdapter(), c);
    assert.equal(got, c.expect);
  });
}
