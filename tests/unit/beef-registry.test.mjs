// Beef: every collection / meta doc the sector's code touches is in sectors/registry.js (export
// and delete-ledger walk only listed collections), and any meta doc a Worker can't write
// (rules allow workers only META_WORKER) is written only behind a canWriteMeta() guard.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectionsFor, metaFor } from "../../app/js/sectors/registry.js";
import { META_WORKER } from "../../app/js/core/policy.js";
import { BEEF_COLLECTIONS, BEEF_META } from "../../app/js/sectors/beef/data.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../app/js/sectors/beef");
const files = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : f.endsWith(".js") ? [join(d, f)] : []));
const LID = String.raw`(?:lid|snap\.lid|ledger\.id|ctx\.ledger\.id|L\.id)`;

function scan() {
  const colls = new Map(BEEF_COLLECTIONS.map((c) => [c, "data.js"])); const metas = new Map(BEEF_META.map((m) => [m, "data.js"])); const unguarded = [];
  for (const f of files(ROOT)) {
    const src = readFileSync(f, "utf8"); const rel = f.slice(ROOT.length + 1);
    for (const m of src.matchAll(new RegExp(String.raw`\b(?:addRecord|updateRecord|softDelete|restore|getRecord|listRecords|watchRecords)\(\s*${LID}\s*,\s*["'\`]([A-Za-z]+)["'\`]`, "g"))) if (!colls.has(m[1])) colls.set(m[1], rel);
    for (const m of src.matchAll(new RegExp(String.raw`\b(setMeta|getMeta|watchMeta)\(\s*${LID}\s*,\s*["'\`]([A-Za-z]+)["'\`]`, "g"))) {
      if (!metas.has(m[2])) metas.set(m[2], rel);
      if (m[1] === "setMeta" && !META_WORKER.includes(m[2]) && !/canWriteMeta\(/.test(src)) unguarded.push(`${m[2]} (${rel})`);
    }
  }
  return { colls, metas, unguarded };
}

test("registry lists every collection and meta doc the Beef code writes or reads", () => {
  const { colls, metas } = scan();
  const have = new Set(collectionsFor("beef")); const haveMeta = new Set(metaFor("beef"));
  assert.ok(colls.size >= 15 && metas.size >= 5, "scan found the Beef calls");
  assert.deepEqual([...colls].filter(([c]) => !have.has(c)).map(([c, f]) => `${c} (${f})`), [], "add to registry.js TYPES.beef.collections");
  assert.deepEqual([...metas].filter(([c]) => !haveMeta.has(c)).map(([c, f]) => `${c} (${f})`), [], "add to registry.js TYPES.beef.meta");
});

test("meta docs a Worker may not write are only written behind canWriteMeta()", () => {
  assert.deepEqual(scan().unguarded, []);
});
