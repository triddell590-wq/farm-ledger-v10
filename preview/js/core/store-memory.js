// In-memory store backend. Same interface as store-firestore.js. Used by unit tests, the
// Playwright suite (?backend=memory) and demo mode. When `enforceRules` is on, every read and
// write is checked by policy-rules.js (the JS model of firestore.rules), so tests see the same
// "permission-denied" errors the real database would give.
//
// Extras for tests: setOnline(false) queues writes locally (like Firestore offline) and they
// "sync" when setOnline(true); dump()/load() snapshot the whole database.
import { allowed } from "./policy-rules.js";
import { matches, sortAndLimit } from "./query-eval.js";
import { randomId } from "./ids.js";
import { emit } from "./bus.js";

const isDel = (v) => v && typeof v === "object" && v.__flDelete === true;

function clone(v) {
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = clone(v[k]); return o; }
  return v;
}
function denied(op, path) {
  const e = new Error(`Missing or insufficient permissions (${op} ${path})`);
  e.code = "permission-denied"; return e;
}
function applyMerge(base, partial, dotted) {
  const out = clone(base || {});
  for (const [k, v] of Object.entries(partial)) {
    const keys = dotted ? k.split(".") : [k];
    let o = out;
    for (let i = 0; i < keys.length - 1; i++) { if (!o[keys[i]] || typeof o[keys[i]] !== "object") o[keys[i]] = {}; o = o[keys[i]]; }
    const last = keys[keys.length - 1];
    if (isDel(v)) delete o[last];
    else if (!dotted && v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && o[last] && typeof o[last] === "object" && !Array.isArray(o[last]))
      o[last] = applyMerge(o[last], v, false);
    else o[last] = clone(v);
  }
  return out;
}
function stripDeletes(d) { const o = {}; for (const [k, v] of Object.entries(d)) if (!isDel(v)) o[k] = clone(v); return o; }
const segs = (p) => p.split("/").filter(Boolean);
const isDocPath = (p) => segs(p).length % 2 === 0;
const parentOf = (p) => segs(p).slice(0, -1).join("/");

export function createMemoryBackend(opts = {}) {
  const docs = new Map(); // path -> data
  const watchers = new Set(); // {kind:'doc'|'query'|'group', path, opts, cb, uid}
  let online = true;
  let pending = 0;
  const queue = [];
  const pendingPaths = new Map(); // path -> writes not yet "synced" (offline), like Firestore's hasPendingWrites
  const B = {
    name: "memory",
    enforceRules: opts.enforceRules !== false,
    uid: null, // set by auth-memory (or tests) to the signed-in user
    now: opts.now || (() => new Date()),

    newId: () => randomId(20),

    async get(path) {
      check("get", path);
      const d = docs.get(path);
      return d ? withId(path, d) : null;
    },
    async set(path, data, o = {}) { return commit([{ type: "set", path, data, merge: !!o.merge }]); },
    async update(path, partial) { return commit([{ type: "update", path, data: partial }]); },
    async remove(path) { return commit([{ type: "delete", path }]); },

    async query(collPath, o = {}) { checkList(collPath, o); return runQuery(collPath, o); },
    async queryGroup(collId, o = {}) { checkGroup(collId, o); return runGroup(collId, o); },

    watchDoc(path, cb, onErr) {
      try { check("get", path); } catch (e) { queueMicrotask(() => onErr(e)); return () => {}; }
      const w = { kind: "doc", path, cb, onErr, uid: B.uid };
      watchers.add(w); queueMicrotask(() => fire(w));
      return () => watchers.delete(w);
    },
    watchQuery(collPath, o, cb, onErr) {
      try { checkList(collPath, o); } catch (e) { queueMicrotask(() => onErr(e)); return () => {}; }
      const w = { kind: "query", path: collPath, opts: o, cb, onErr, uid: B.uid };
      watchers.add(w); queueMicrotask(() => fire(w));
      return () => watchers.delete(w);
    },
    batch() {
      const ops = [];
      const b = {
        set(path, data, o = {}) { ops.push({ type: "set", path, data, merge: !!o.merge }); return b; },
        update(path, data) { ops.push({ type: "update", path, data }); return b; },
        remove(path) { ops.push({ type: "delete", path }); return b; },
        commit: () => commit(ops),
        get size() { return ops.length; },
      };
      return b;
    },

    // ---- test helpers ----
    setOnline(v) {
      online = !!v; emit("sync:state", B.syncState());
      if (online) { while (queue.length) queue.shift()(); }
    },
    syncState: () => ({ online, pending }),
    dump() { const o = {}; for (const [k, v] of docs) o[k] = clone(v); return o; },
    load(obj) { docs.clear(); for (const [k, v] of Object.entries(obj)) docs.set(k, clone(v)); notifyAll(); },
    /** write bypassing rules (test fixtures, like the emulator's withSecurityRulesDisabled) */
    seed(path, data) { docs.set(path, clone(data)); notifyAll(); persist(); },
    raw: docs,
  };

  function withId(path, d) { const o = clone(d); o.id = segs(path).pop(); return o; }
  function ctxFor(op, path, after) {
    return { op, path, uid: B.uid, now: B.now(), get: (p) => docs.get(p) || null, getAfter: (p) => (after.has(p) ? after.get(p) : docs.get(p) || null) };
  }
  function check(op, path) {
    if (!isDocPath(path)) throw new Error("Not a document path: " + path);
    if (B.enforceRules && !allowed(ctxFor(op, path, new Map()))) throw denied(op, path);
  }
  function checkList(collPath, o) {
    if (isDocPath(collPath)) throw new Error("Not a collection path: " + collPath);
    if (!B.enforceRules) return;
    // One probe path decides. Rules that read the document (photos: `money`) can only be proved
    // from the query's equality filters, as in Firestore, so those are passed as `doc`.
    if (!allowed(listCtx(collPath, o, B.uid))) throw denied("list", collPath);
  }
  function listCtx(collPath, o, uid) {
    const doc = {}; for (const [f, op, v] of (o && o.where) || []) if (op === "==") doc[f] = v;
    return { ...ctxFor("list", `${collPath}/__probe__`, new Map()), uid, doc };
  }
  function checkGroup(collId, o) {
    if (!B.enforceRules) return;
    if (collId !== "members") throw denied("list", "**/" + collId);
    // Firestore only allows the query if it can prove every result has uid == me.
    const ok = (o.where || []).some(([f, op, v]) => f === "uid" && op === "==" && v === B.uid && B.uid);
    if (!ok) throw denied("list", "**/members");
  }
  function runQuery(collPath, o) {
    const depth = segs(collPath).length + 1;
    const out = [];
    for (const [p, d] of docs) if (parentOf(p) === collPath && segs(p).length === depth && matches(d, o.where)) out.push(withId(p, d));
    return sortAndLimit(out, o);
  }
  function runGroup(collId, o) {
    const out = [];
    for (const [p, d] of docs) { const s = segs(p); if (s[s.length - 2] === collId && matches(d, o.where)) { const r = withId(p, d); r._path = p; out.push(r); } }
    return sortAndLimit(out, o);
  }

  function commit(ops) {
    // Build the after-state, then check every op against before/after (like a Firestore batch).
    const after = new Map();
    const cur = (p) => (after.has(p) ? after.get(p) : docs.get(p) || null);
    const plan = [];
    for (const op of ops) {
      if (!isDocPath(op.path)) return Promise.reject(new Error("Not a document path: " + op.path));
      const before = cur(op.path);
      let next;
      if (op.type === "delete") next = null;
      else if (op.type === "update") {
        if (!before) { const e = new Error("No document to update: " + op.path); e.code = "not-found"; return Promise.reject(e); }
        next = applyMerge(before, op.data, true);
      } else next = op.merge ? applyMerge(before, op.data, false) : stripDeletes(op.data);
      after.set(op.path, next);
      plan.push({ op, existed: !!docs.get(op.path) });
    }
    if (B.enforceRules) {
      for (const { op, existed } of plan) {
        const kind = op.type === "delete" ? "delete" : existed ? "update" : "create";
        if (op.type === "delete" && !existed) { if (!allowed(ctxFor("delete", op.path, after))) return Promise.reject(denied("delete", op.path)); continue; }
        if (!allowed(ctxFor(kind, op.path, after))) return Promise.reject(denied(kind, op.path));
      }
    }
    for (const [p, d] of after) { if (d == null) docs.delete(p); else docs.set(p, d); }
    if (!online) for (const p of after.keys()) pendingPaths.set(p, (pendingPaths.get(p) || 0) + 1);
    notifyAll(); persist();
    if (online) return Promise.resolve();
    pending++; emit("sync:state", B.syncState());
    const mine = [...after.keys()];
    return new Promise((res) => queue.push(() => {
      pending--; for (const p of mine) { const n = (pendingPaths.get(p) || 1) - 1; if (n > 0) pendingPaths.set(p, n); else pendingPaths.delete(p); }
      emit("sync:state", B.syncState()); notifyAll(); res();
    }));
  }

  // Optional: keep the fake database in localStorage (demo mode, multi-page Playwright flows).
  function persist() {
    if (!opts.persistKey) return;
    try { localStorage.setItem(opts.persistKey, JSON.stringify([...docs], function (k, v) { return this[k] instanceof Date ? { __d: this[k].getTime() } : v; })); } catch (e) { /* full or blocked */ }
  }
  if (opts.persistKey) {
    try {
      const raw = localStorage.getItem(opts.persistKey);
      if (raw) for (const [p, d] of JSON.parse(raw, (k, v) => (v && typeof v === "object" && typeof v.__d === "number" ? new Date(v.__d) : v))) docs.set(p, d);
    } catch (e) { /* ignore */ }
  }

  function fire(w) {
    if (!watchers.has(w)) return;
    try {
      if (w.kind === "doc") {
        if (B.enforceRules && !allowed({ ...ctxFor("get", w.path, new Map()), uid: w.uid })) { watchers.delete(w); w.onErr(denied("get", w.path)); return; }
        const d = docs.get(w.path); w.cb(d ? withId(w.path, d) : null, { fromCache: !online, hasPendingWrites: pending > 0 });
      } else {
        if (B.enforceRules && !allowed(listCtx(w.path, w.opts, w.uid))) { watchers.delete(w); w.onErr(denied("list", w.path)); return; }
        const list = runQuery(w.path, w.opts || {});
        w.cb(list, { fromCache: !online, hasPendingWrites: pending > 0, pendingIds: new Set(list.filter((r) => pendingPaths.has(`${w.path}/${r.id}`)).map((r) => r.id)) });
      }
    } catch (e) { console.error(e); }
  }
  let scheduled = false;
  function notifyAll() {
    if (scheduled) return; scheduled = true;
    queueMicrotask(() => { scheduled = false; for (const w of [...watchers]) fire(w); });
  }
  return B;
}
