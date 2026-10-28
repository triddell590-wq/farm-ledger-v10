// The ONE storage interface. Screens and services only ever import `store` from here.
// Two backends implement it: store-firestore.js (real) and store-memory.js (tests, demo).
//
// Paths are strings: "ledgers/abc" (document) or "ledgers/abc/animals" (collection).
// Data is plain objects. System times are JS Date objects (Firestore Timestamps are
// converted on read). Write `store.DELETE` as a value to remove a field.
//
//   get(path)                         -> Promise<data|null>   (data includes `id`)
//   set(path, data, {merge})          -> Promise
//   update(path, partial)             -> Promise   (keys may be dotted "a.b")
//   remove(path)                      -> Promise
//   add(collPath, data)               -> id  (written in the background; offline-safe)
//   query(collPath, opts)             -> Promise<data[]>   opts: {where:[[f,op,v]], orderBy:[[f,'asc'|'desc']], limit}
//   queryGroup(collId, opts)          -> Promise<data[]>   (collection-group; each item has `_path`)
//   watchDoc(path, cb, onErr)         -> unsubscribe
//   watchQuery(collPath, opts, cb, onErr) -> unsubscribe   cb(list, {fromCache, hasPendingWrites, pendingIds:Set})
//   batch()                           -> { set, update, remove, commit() }
//   newId()                           -> string
//
// Writes resolve when the backend confirms. With Firestore offline that is only when the
// signal comes back, so screens should not wait on writes; failures are announced on the
// bus as "store:error".
import { emit } from "./bus.js";

export const DELETE = Object.freeze({ __flDelete: true });
let backend = null;

export function useBackend(b) { backend = b; }
export function backendName() { return backend ? backend.name : "none"; }

function call(name, args) {
  if (!backend) throw new Error("Store backend not set");
  return backend[name](...args);
}

export const store = {
  DELETE,
  newId: () => call("newId", []),
  get: (path) => call("get", [path]),
  set: (path, data, opts) => call("set", [path, data, opts || {}]),
  update: (path, partial) => call("update", [path, partial]),
  remove: (path) => call("remove", [path]),
  add(collPath, data) {
    const id = call("newId", []);
    call("set", [`${collPath}/${id}`, data, {}]).catch((e) => emit("store:error", { op: "add", path: collPath, error: e }));
    return id;
  },
  query: (collPath, opts) => call("query", [collPath, opts || {}]),
  queryGroup: (collId, opts) => call("queryGroup", [collId, opts || {}]),
  watchDoc: (path, cb, onErr) => call("watchDoc", [path, cb, onErr || ((e) => emit("store:error", { op: "watch", path, error: e }))]),
  watchQuery: (collPath, opts, cb, onErr) => call("watchQuery", [collPath, opts || {}, cb, onErr || ((e) => emit("store:error", { op: "watch", path: collPath, error: e }))]),
  batch: () => call("batch", []),
  /** Fire-and-forget write that reports failure on the bus (for offline-friendly saves). */
  bg(promise, what) { promise.catch((e) => emit("store:error", { op: what || "write", error: e })); return promise; },
};
