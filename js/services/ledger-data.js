// Loading a sector ledger, the same for every sector's data.js: its collections and meta docs
// (what the role can't read comes back empty), plus the farm space's shared medicine store and
// contacts (and any other `farmColls`). `build(ledger, data, meta, far)` makes the sector's snap.
import { listRecords, watchRecords, getMeta, watchMeta } from "./records.js";
import { loadFarmProducts, watchFarmProducts } from "./med-store.js";
import { canRead } from "../core/policy.js";
import { session } from "./session.js";
import { on } from "../core/bus.js";

/** The farm's hidden space ledger (shared medicine store, contacts, fields), if this user has it. */
export function farmSpace(ledger) { return session.farms?.().find((f) => f.farmId === ledger.farmId)?.space || null; }
const sharedSpace = (ledger) => { const s = farmSpace(ledger); return s && canRead(s.role, "medProducts") ? s : null; };

// Records fetched in the last moment, per ledger and role (see load). Any write drops them all.
const KEEP_MS = 2000; const recent = new Map(); let writes = 0;
on("store:write", () => { writes++; recent.clear(); });

/** { load, watch, live } for one sector. clock: also repaint every minute (jobs due at a time). */
export function ledgerData({ name, colls, metas, farmColls = ["contacts"], build, clock = false }) {
  const emptyFar = () => ({ farmStore: [], ...Object.fromEntries(farmColls.map((k) => [k, []])) });

  async function fetchAll(ledger) {
    const data = {}; const meta = {}; const far = emptyFar();
    await Promise.all(colls.map(async (k) => { data[k] = canRead(ledger.role, k) ? await listRecords(ledger.id, k).catch(() => []) : []; }));
    if (canRead(ledger.role, "meta")) await Promise.all(metas.map(async (k) => { meta[k] = await getMeta(ledger.id, k).catch(() => null); }));
    const space = sharedSpace(ledger);
    if (space) await Promise.all([loadFarmProducts(space, ledger).then((l) => { far.farmStore = l; }), ...farmColls.map((k) => listRecords(space.id, k).catch(() => []).then((l) => { far[k] = l; }))]);
    return { data, meta, far };
  }
  /** One-off snapshot. extra goes to build (e.g. { now }). A screen asks several times (jobs,
   *  alerts, headline), so the records are fetched once and kept for a moment (dropped on any write). */
  async function load(ledger, extra = {}) {
    const key = `${ledger.id}|${ledger.role}`; let hit = recent.get(key);
    if (!hit || Date.now() - hit.at > KEEP_MS) {
      const gen = writes; hit = { at: Date.now(), p: fetchAll(ledger) }; recent.set(key, hit);
      hit.p.then(() => { if (gen !== writes) recent.delete(key); }, () => recent.delete(key));
    }
    const { data, meta, far } = await hit.p;
    const lists = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v.slice() : v])); // each caller may sort or add
    return build(ledger, lists(data), { ...meta }, { ...lists(far), ...extra });
  }

  /** cb(snap) once everything readable has arrived, then on every change (batched 30 ms). */
  function watch(ledger, cb) {
    const data = {}; const meta = {}; const far = emptyFar();
    const subs = []; let timer = null; let ready = false;
    const fire = () => { clearTimeout(timer); timer = setTimeout(() => { if (ready) cb(build(ledger, { ...data }, { ...meta }, { ...far })); }, 30); };
    const want = colls.filter((k) => canRead(ledger.role, k)); const pending = new Set(want);
    const arrived = (k) => { pending.delete(k); if (!pending.size) ready = true; fire(); };
    for (const k of colls) data[k] = [];
    for (const k of want) subs.push(watchRecords(ledger.id, k, {}, (list) => { data[k] = list; arrived(k); }, () => arrived(k)));
    if (canRead(ledger.role, "meta")) for (const k of metas) subs.push(watchMeta(ledger.id, k, (d) => { meta[k] = d; fire(); }, () => {}));
    const space = sharedSpace(ledger);
    if (space) {
      subs.push(watchFarmProducts(space, ledger, (l) => { far.farmStore = l; fire(); }));
      for (const k of farmColls) subs.push(watchRecords(space.id, k, {}, (l) => { far[k] = l; fire(); }, () => {}));
    }
    if (!want.length) { ready = true; fire(); }
    const tick = clock ? setInterval(fire, 60000) : null;
    return () => { clearTimeout(timer); clearInterval(tick); subs.forEach((u) => u && u()); };
  }

  /** Live screen helper: paint(snap, n) on every change; `first` resolves after the first paint. */
  function live(ledger, paint) {
    let resolve; const first = new Promise((r) => (resolve = r)); let n = 0; let busy = Promise.resolve();
    const stop = watch(ledger, (snap) => { busy = busy.then(async () => { try { await paint(snap, n++); } catch (e) { console.error(`${name} paint`, e); } resolve(snap); }); });
    return { first, stop };
  }
  return { load, watch, live };
}
