// Fixture farm for `send.mjs --dry-run` and the sender tests: one farm with all six sector
// ledgers, filled by the same seed scripts the Playwright tests use, on the in-memory store
// (rules on). Also a second person (a Worker on Beef and Pigs, no money) and two devices.
// Never touches Firebase.
import { register } from "node:module";
register(new URL("./fixture-hooks.mjs", import.meta.url));

const app = (p) => import(new URL(`../app/js/${p}`, import.meta.url).href);

export async function buildFixtureFarm({ sectors = ["beef", "sheep", "dairy", "pigs", "layers", "broilers"] } = {}) {
  const { createMemoryBackend } = await app("core/store-memory.js");
  const { createMemoryAuth } = await app("core/auth-memory.js");
  const { useBackend, store } = await app("core/store.js");
  const { useAuthBackend, auth } = await app("core/auth.js");
  const { session } = await app("services/session.js");
  const { createLedger, createFarm } = await app("services/ledgers.js");
  const db = createMemoryBackend();
  const a = createMemoryAuth(db);
  useBackend(db); useAuthBackend(a);
  const tomUid = a.addUser("tom@example.com", "password123", "Tom Riddell", "uTom", true);
  const seanUid = a.addUser("sean@example.com", "password123", "Seán McKee", "uSean", true);
  await auth.signIn("tom@example.com", "password123");
  const farmId = await createFarm({ farmName: "Drumlin Farm" });
  const ids = {};
  for (const type of sectors) ids[type] = await createLedger({ type, farmId, farmName: "Drumlin Farm" });
  await session.load(true);
  globalThis.window = globalThis.window || {}; globalThis.window.__fl = { session, store: db, auth: a };
  const page = { evaluate: (fn, arg) => fn(arg) };
  const seeds = { beef: "seedBeef", sheep: "seedSheep", dairy: "seedDairy", pigs: "seedPigs", layers: "seedLayers", broilers: "seedBroilers" };
  for (const type of sectors) {
    const mod = await import(new URL(`../tests/e2e/${type}-seed.mjs`, import.meta.url).href);
    await mod[seeds[type]](page);
    await new Promise((r) => setTimeout(r, 5));
  }
  // A Worker (no money) on Beef and Pigs, added straight into the store (rules bypassed for setup).
  for (const type of ["beef", "pigs"].filter((t) => ids[t])) db.seed(`ledgers/${ids[type]}/members/${seanUid}`, { uid: seanUid, role: "worker", addedAt: new Date(), addedBy: tomUid, displayName: "Seán McKee", email: "sean@example.com" });
  // A hand-made money task Tom wrote, to prove a worker never sees it and redaction of £.
  if (ids.beef) await store.set(`ledgers/${ids.beef}/tasks/fx-money`, { title: "Pay the haulier £420.50 for the mart run", due: "2000-01-01", done: false, money: false, createdBy: tomUid, updatedBy: tomUid, createdAt: new Date(), updatedAt: new Date() });
  // An accepted invite (Seán joined Beef 1 hour ago).
  db.seed("invites/FIXinvite000000000000001", { ledgerId: ids.beef || ids[sectors[0]], ledgerName: "Beef", role: "worker", createdBy: tomUid, createdAt: new Date(Date.now() - 86400000), expiresAt: new Date(Date.now() + 6 * 86400000), usedBy: seanUid, usedAt: new Date(Date.now() - 3600000), usedByName: "Seán McKee" });
  const device = (uid, id, prefs = {}) => db.seed(`users/${uid}/devices/${id}`, { token: `fixture-token-${id}`, platform: "android", ua: "fixture", tz: "Europe/London", createdAt: new Date(), lastSeen: new Date(), prefs });
  device(tomUid, "tomPhone", { summaryTime: "07:00" });
  device(seanUid, "seanPhone", { summaryTime: "07:00" });
  if (!db.raw.get(`users/${tomUid}`)) db.seed(`users/${tomUid}`, { displayName: "Tom Riddell", email: "tom@example.com" });
  if (!db.raw.get(`users/${seanUid}`)) db.seed(`users/${seanUid}`, { displayName: "Seán McKee", email: "sean@example.com" });
  await auth.signOut();
  return { db, ids, farmId, users: { tom: tomUid, sean: seanUid } };
}
