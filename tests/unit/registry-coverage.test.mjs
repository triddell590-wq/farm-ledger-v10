// Coordinator-owned safety net: every collection / meta doc a sector's code touches must be in
// sectors/registry.js, because export (UK GDPR download) and delete-ledger / delete-account walk
// only the listed collections (a Firestore client cannot list sub-collections). Runs over every
// sector folder automatically, so new sectors (pigs, layers, broilers) are covered as they land.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectionsFor, metaFor } from "../../app/js/sectors/registry.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../app/js/sectors");
const SECTORS = ["beef", "sheep", "dairy", "pigs", "layers", "broilers"];
// Written to the farm space (type "farm"), not to the sector ledger.
const FARM_ARG = /space|farm/i;

function files(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...files(p)); else if (f.endsWith(".js")) out.push(p);
  }
  return out;
}
function scan(sector) {
  const colls = new Map(); const metas = new Map();
  const add = (m, k, where) => { if (!m.has(k)) m.set(k, where); };
  for (const f of files(join(ROOT, sector))) {
    const src = readFileSync(f, "utf8"); const rel = f.slice(ROOT.length + 1);
    for (const m of src.matchAll(/\b(addRecord|updateRecord|softDelete|hardDelete|restore|getRecord|listRecords|watchRecords)\(\s*([^,()]+(?:\([^()]*\))?)\s*,\s*["'`]([A-Za-z]+)["'`]/g)) {
      if (!FARM_ARG.test(m[2])) add(colls, m[3], rel);
    }
    for (const m of src.matchAll(/\b(setMeta|getMeta|watchMeta)\(\s*([^,()]+)\s*,\s*["'`]([A-Za-z]+)["'`]/g)) {
      if (!FARM_ARG.test(m[2])) add(metas, m[3], rel);
    }
    for (const m of src.matchAll(/\b[A-Z]+_COLLECTIONS\s*=\s*\[([^\]()]*)\]/g)) for (const s of m[1].matchAll(/"([A-Za-z]+)"/g)) add(colls, s[1], rel);
    for (const m of src.matchAll(/\b[A-Z]+_META\s*=\s*\[([^\]()]*)\]/g)) for (const s of m[1].matchAll(/"([A-Za-z]+)"/g)) add(metas, s[1], rel);
  }
  return { colls, metas };
}

for (const sector of SECTORS) {
  test(`registry lists every collection and meta doc the ${sector} code uses`, { skip: !existsSync(join(ROOT, sector)) && `${sector} not built yet` }, () => {
    const { colls, metas } = scan(sector);
    const have = new Set(collectionsFor(sector)); const haveMeta = new Set(metaFor(sector));
    const missing = [...colls].filter(([c]) => !have.has(c)).map(([c, f]) => `${c} (${f})`);
    const missingMeta = [...metas].filter(([c]) => !haveMeta.has(c)).map(([c, f]) => `${c} (${f})`);
    assert.deepEqual(missing, [], `add to registry.js TYPES.${sector}.collections`);
    assert.deepEqual(missingMeta, [], `add to registry.js TYPES.${sector}.meta`);
  });
}
