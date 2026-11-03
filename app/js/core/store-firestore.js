// Firestore backend (Firebase 10.7.0 compat, loaded from vendor/ as classic scripts, so we use
// window.firebase). Offline persistence is switched on so the app works with no signal:
// reads come from the phone's cache and writes queue until the signal comes back.
import { emit } from "./bus.js";

function fb() { if (!window.firebase) throw new Error("Firebase SDK did not load"); return window.firebase; }

// Firestore Timestamps -> JS Date, recursively.
function fromFs(v) {
  if (v == null) return v;
  if (typeof v.toDate === "function" && typeof v.seconds === "number") return v.toDate();
  if (Array.isArray(v)) return v.map(fromFs);
  if (typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) { const o = {}; for (const k of Object.keys(v)) o[k] = fromFs(v[k]); return o; }
  return v;
}
// store.DELETE -> FieldValue.delete(); undefined values dropped (Firestore rejects them).
function toFs(v) {
  if (v && typeof v === "object" && v.__flDelete === true) return fb().firestore.FieldValue.delete();
  if (v instanceof Date || v == null) return v === undefined ? null : v;
  if (Array.isArray(v)) return v.map(toFs);
  if (typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = toFs(x); return o; }
  return v;
}
function snapData(snap) { if (!snap.exists) return null; const d = fromFs(snap.data()); d.id = snap.id; return d; }

export function createFirestoreBackend(config) {
  const firebase = fb();
  if (!firebase.apps.length) firebase.initializeApp(config);
  const db = firebase.firestore();
  try {
    const p = db.enablePersistence({ synchronizeTabs: true });
    if (p && p.catch) p.catch((e) => console.warn("Offline cache unavailable:", e && e.code));
  } catch (e) { console.warn("Offline cache unavailable", e); }

  let pendingWatch = 0;
  function buildQuery(ref, o = {}) {
    let q = ref;
    for (const [f, op, v] of o.where || []) q = q.where(f, op, v);
    for (const [f, dir] of o.orderBy || []) q = q.orderBy(f, dir || "asc");
    if (o.limit) q = q.limit(o.limit);
    return q;
  }
  const meta = (s) => ({ fromCache: s.metadata.fromCache, hasPendingWrites: s.metadata.hasPendingWrites });

  // One-off reads never wait on a weak signal (Tom, 3 Nov: Today stuck on a farm signal). Paths
  // this phone has had from the server ("warm") answer from the phone's copy if the server is
  // slower than FAST_MS; the server's answer still lands in the copy for next time. A path never
  // synced here waits for the server (up to COLD_MS) so a new phone doesn't show empty screens.
  const FAST_MS = 600, COLD_MS = 6000, WARM_KEY = "fl10-warm-paths";
  const warm = new Set((() => { try { return JSON.parse(localStorage.getItem(WARM_KEY) || "[]"); } catch (e) { return []; } })());
  let saveWarm = null;
  const markWarm = (path) => {
    if (warm.has(path)) return; warm.add(path);
    clearTimeout(saveWarm); saveWarm = setTimeout(() => { try { localStorage.setItem(WARM_KEY, JSON.stringify([...warm].slice(-3000))); } catch (e) { /* private mode */ } }, 500);
  };
  const qkey = (collPath, o = {}) => (o.where?.length || o.limit ? collPath + JSON.stringify(o) : collPath);
  const late = (ms) => new Promise((r) => setTimeout(() => r(LATE), ms)); const LATE = Symbol("late");
  async function read(path, ref) {
    const cache = () => ref.get({ source: "cache" });
    if (!navigator.onLine) return cache();
    const server = ref.get().then((s) => { markWarm(path); return s; });
    const first = await Promise.race([server, late(warm.has(path) ? FAST_MS : COLD_MS)]).catch((e) => (e.code === "unavailable" ? LATE : Promise.reject(e)));
    if (first !== LATE) return first;
    server.catch(() => {}); // still running: it refreshes the copy
    return cache();
  }

  const B = {
    name: "firestore",
    db,
    newId: () => db.collection("_").doc().id,
    async get(path) {
      try { return snapData(await read(path, db.doc(path))); }
      catch (e) { if (e.code === "unavailable") return null; throw e; } // not in the phone's copy and no signal
    },
    set: (path, data, o = {}) => db.doc(path).set(toFs(data), { merge: !!o.merge }),
    update: (path, partial) => db.doc(path).update(toFs(partial)),
    remove: (path) => db.doc(path).delete(),
    async query(collPath, o) { const s = await read(qkey(collPath, o), buildQuery(db.collection(collPath), o)); return s.docs.map(snapData); },
    async queryGroup(collId, o) {
      const s = await buildQuery(db.collectionGroup(collId), o).get();
      return s.docs.map((d) => Object.assign(snapData(d), { _path: d.ref.path }));
    },
    watchDoc(path, cb, onErr) {
      return db.doc(path).onSnapshot({ includeMetadataChanges: true }, (s) => { if (!s.metadata.fromCache) markWarm(path); cb(snapData(s), meta(s)); track(s); }, onErr);
    },
    watchQuery(collPath, o, cb, onErr) {
      return buildQuery(db.collection(collPath), o).onSnapshot({ includeMetadataChanges: true }, (s) => {
        if (!s.metadata.fromCache) markWarm(qkey(collPath, o));
        cb(s.docs.map(snapData), { ...meta(s), pendingIds: new Set(s.docs.filter((d) => d.metadata.hasPendingWrites).map((d) => d.id)) }); track(s);
      }, onErr);
    },
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
    syncState: () => ({ online: navigator.onLine, pending: pendingWatch }),
  };
  // Sync pill: pending writes as seen by live listeners, plus the browser's online flag.
  let lastPending = false;
  function track(s) {
    const p = s.metadata.hasPendingWrites;
    if (p !== lastPending) { lastPending = p; pendingWatch = p ? 1 : 0; emit("sync:state", B.syncState()); }
  }
  db.onSnapshotsInSync(() => { if (lastPending) return; emit("sync:state", B.syncState()); });
  addEventListener("online", () => emit("sync:state", B.syncState()));
  addEventListener("offline", () => emit("sync:state", B.syncState()));
  return B;
}
