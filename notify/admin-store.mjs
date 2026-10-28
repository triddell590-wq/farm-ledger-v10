// Store backend over firebase-admin Firestore, with the same interface as
// app/js/core/store-firestore.js (see app/js/core/store.js). It lets the sender run the app's own
// sector loaders and alert rules in Node, unchanged. The Admin SDK bypasses security rules, so
// the sender itself must only read what each person may see (it passes each person's role to
// the sector code, exactly as the app does).

function fromFs(v) {
  if (v == null) return v;
  if (typeof v.toDate === "function" && typeof v.seconds === "number") return v.toDate();
  if (Array.isArray(v)) return v.map(fromFs);
  if (typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) { const o = {}; for (const k of Object.keys(v)) o[k] = fromFs(v[k]); return o; }
  return v;
}
function snapData(s) { if (!s.exists) return null; const d = fromFs(s.data()); d.id = s.id; return d; }

export function createAdminBackend(db, FieldValue) {
  const toFs = (v) => {
    if (v && typeof v === "object" && v.__flDelete === true) return FieldValue.delete();
    if (v instanceof Date || v == null) return v === undefined ? null : v;
    if (Array.isArray(v)) return v.map(toFs);
    if (typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = toFs(x); return o; }
    return v;
  };
  const build = (ref, o = {}) => {
    let q = ref;
    for (const [f, op, v] of o.where || []) q = q.where(f, op, v);
    for (const [f, dir] of o.orderBy || []) q = q.orderBy(f, dir || "asc");
    if (o.limit) q = q.limit(o.limit);
    return q;
  };
  const B = {
    name: "admin",
    newId: () => db.collection("_").doc().id,
    get: async (path) => snapData(await db.doc(path).get()),
    set: (path, data, o = {}) => db.doc(path).set(toFs(data), { merge: !!o.merge }),
    update: (path, partial) => db.doc(path).update(toFs(partial)),
    remove: (path) => db.doc(path).delete(),
    async query(collPath, o) { const s = await build(db.collection(collPath), o).get(); return s.docs.map(snapData); },
    async queryGroup(collId, o) { const s = await build(db.collectionGroup(collId), o).get(); return s.docs.map((d) => Object.assign(snapData(d), { _path: d.ref.path })); },
    // The sender never needs live updates: a "watch" reads once.
    watchDoc(path, cb, onErr) { B.get(path).then((d) => cb(d, { fromCache: false, hasPendingWrites: false }), onErr); return () => {}; },
    watchQuery(collPath, o, cb, onErr) { B.query(collPath, o).then((l) => cb(l, { fromCache: false, hasPendingWrites: false }), onErr); return () => {}; },
    batch() {
      const wb = db.batch(); let n = 0;
      const b = {
        set(path, data, o = {}) { wb.set(db.doc(path), toFs(data), { merge: !!o.merge }); n++; return b; },
        update(path, data) { wb.update(db.doc(path), toFs(data)); n++; return b; },
        remove(path) { wb.delete(db.doc(path)); n++; return b; },
        commit: () => wb.commit(),
        get size() { return n; },
      };
      return b;
    },
    syncState: () => ({ online: true, pending: 0 }),
  };
  return B;
}
