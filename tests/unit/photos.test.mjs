// Photos: shrink sizing, chunking, who sees what, and the service against the in-memory store
// with the rules model ON (money photos hidden from workers / viewers, ordinary photos hidden
// from accountants, offline "waiting to upload", delete removes the image parts, export).
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshEnv, denied } from "./env.mjs";
import * as C from "../../app/js/services/photo-codec.js";
import { savePhoto, listPhotos, watchPhotos, watchAllPhotos, loadImage, imageBytes, deletePhoto, setCaption, deletePhotosOf } from "../../app/js/services/photos.js";
import { createLedger, listMine, deleteLedger } from "../../app/js/services/ledgers.js";
import { createInvite, acceptInvite } from "../../app/js/services/invites.js";
import { exportLedger, photoFiles } from "../../app/js/services/export.js";
import { addRecord, hardDelete } from "../../app/js/services/records.js";
import { store } from "../../app/js/core/store.js";

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

// ---------- pure maths ----------
test("fitSize keeps the shape, never enlarges, longest side 1600", () => {
  assert.deepEqual(C.fitSize(4000, 3000), { w: 1600, h: 1200 });
  assert.deepEqual(C.fitSize(3000, 4000), { w: 1200, h: 1600 });
  assert.deepEqual(C.fitSize(800, 600), { w: 800, h: 600 });
  assert.deepEqual(C.fitSize(1600, 10), { w: 1600, h: 10 });
  assert.deepEqual(C.fitSize(240, 240, 240), { w: 240, h: 240 });
  assert.deepEqual(C.fitSize(5000, 1, 1600), { w: 1600, h: 1 });
});

test("b64Bytes: base64 length to bytes, with padding and data: URLs", () => {
  assert.equal(C.b64Bytes(Buffer.from("hello").toString("base64")), 5);
  assert.equal(C.b64Bytes("data:image/jpeg;base64," + Buffer.from("hello!").toString("base64")), 6);
  assert.equal(C.b64Bytes(Buffer.from("ab").toString("base64")), 2);
  assert.equal(C.b64Bytes(""), 0);
});

// A fake encoder: bytes ∝ pixels × quality, like JPEG roughly does.
const fakeEnc = (k) => { const calls = []; const enc = async (w, h, q) => { calls.push([w, h, q]); const bytes = Math.round(w * h * q * k); return { dataUrl: "data:image/jpeg;base64,x", bytes }; }; enc.calls = calls; return enc; };

test("shrink: first quality that fits wins (1600 px, 0.72 down)", async () => {
  const enc = fakeEnc(0.25); // 1600×1200 at .72 = 345,600 bytes <= 358,400 -> first try
  const r = await C.shrink(4000, 3000, enc);
  assert.equal(r.w, 1600); assert.equal(r.h, 1200); assert.equal(r.quality, 0.72); assert.equal(r.tries, 1); assert.equal(r.over, false);
});
test("shrink: steps quality down, then size down, until <= 350 KB", async () => {
  const enc = fakeEnc(0.5); // 1600×1200: .72→691k … .40→384k all too big; 1280×960 at .72 → 442k, .56 → 344k fits
  const r = await C.shrink(4000, 3000, enc);
  assert.ok(r.bytes <= C.TARGET_BYTES, `${r.bytes} <= target`);
  assert.equal(r.w, 1280); assert.equal(r.h, 960); assert.equal(r.quality, 0.56);
  assert.deepEqual(enc.calls.slice(0, 5).map((c) => c[2]), C.QUALITIES);
  assert.ok(enc.calls.every(([w, h]) => Math.max(w, h) <= 1600));
});
test("shrink: small pictures are not enlarged and stop at the minimum size", async () => {
  const small = await C.shrink(640, 480, fakeEnc(0.1));
  assert.deepEqual([small.w, small.h, small.quality], [640, 480, 0.72]);
  const huge = await C.shrink(4000, 3000, fakeEnc(50)); // never fits
  assert.equal(huge.over, true); assert.ok(Math.max(huge.w, huge.h) >= C.MIN_SIDE);
});

test("splitChunks / joinChunks round trip; each chunk <= 700,000 chars; missing part throws", () => {
  const big = "A".repeat(1_500_001);
  const parts = C.splitChunks(big);
  assert.equal(parts.length, 3); assert.ok(parts.every((p) => p.length <= C.CHUNK_CHARS));
  const docs = parts.map((data, n) => ({ n, data })).reverse(); // any order
  assert.equal(C.joinChunks(docs, 3), big);
  assert.throws(() => C.joinChunks(docs.slice(1), 3), /missing/);
  assert.deepEqual(C.splitChunks(""), [""]);
  const typical = Buffer.alloc(350 * 1024, 7).toString("base64");
  assert.equal(C.splitChunks(typical).length, 1, "a 350 KB photo is one chunk");
});

test("who sees and adds photos follows the parent record", () => {
  const R = ["owner", "manager", "worker", "viewer", "accountant", null];
  const see = (coll) => R.map((r) => C.canSeePhotos(r, coll));
  const add = (coll) => R.map((r) => C.canAddPhotos(r, coll));
  assert.deepEqual(see("deaths"), [true, true, true, true, false, false]);
  assert.deepEqual(add("deaths"), [true, true, true, false, false, false]);
  assert.deepEqual(see("finance"), [true, true, false, false, true, false]);
  assert.deepEqual(add("finance"), [true, true, false, false, true, false]);
  assert.deepEqual(see("checklist"), [true, true, true, true, false, false]);
  // the rules' view (money flag only) agrees with the record view
  for (const r of R) for (const coll of ["deaths", "finance", "documents"]) {
    assert.equal(C.seesPhoto(r, C.isMoneyColl(coll)), !!r && C.canSeePhotos(r, coll), `${r} ${coll}`);
    assert.equal(C.writesPhoto(r, C.isMoneyColl(coll)), !!r && C.canAddPhotos(r, coll), `${r} ${coll} write`);
  }
  assert.deepEqual(R.map(C.moneyFilterFor), [null, null, false, false, true, "none"]);
});

test("photoDoc sets money from the parent and trims caption/label; file names are tidy", () => {
  const d = C.photoDoc({ parentColl: "finance", parentId: 7, parentLabel: "Receipt", chunkCount: 1, caption: "x".repeat(400) });
  assert.equal(d.money, true); assert.equal(d.parentId, "7"); assert.equal(d.caption.length, 300);
  assert.equal(C.photoDoc({ parentColl: "deaths", parentId: "a", chunkCount: 1 }).money, false);
  assert.equal(C.photoFileName({ id: "abcdef123", takenAt: "2026-10-27T09:00:00Z", parentLabel: "Death · UK9 012345" }), "2026-10-27-death-uk9-012345-abcdef.jpg");
});

// ---------- service with the rules model ----------
const PIC = { b64: Buffer.from("not really a jpeg").toString("base64"), w: 1600, h: 1200, bytes: 17, thumb: "data:image/jpeg;base64,dA==", takenAt: "2026-10-27T09:00:00.000Z" };
async function farm(env) {
  await env.as("tom");
  const beef = await createLedger({ type: "beef", farmName: "Drumlin Farm" });
  for (const [who, role] of [["sean", "worker"], ["jane", "viewer"], ["mark", "accountant"], ["mo", "manager"]]) {
    await env.as("tom"); const l = (await listMine()).find((x) => x.id === beef);
    const code = await createInvite(l, role, "owner"); await env.as(who); await acceptInvite(code);
  }
  await env.as("tom");
  return beef;
}

test("save -> list -> load -> caption -> delete; image parts go with the photo", async () => {
  const env = freshEnv(); const lid = await farm(env);
  const id = savePhoto(lid, { coll: "deaths", id: "d1", label: "Death · UK9 1" }, PIC);
  await tick();
  const [p] = await listPhotos(lid, "owner", { coll: "deaths", id: "d1" });
  assert.equal(p.id, id); assert.equal(p.money, false); assert.equal(p.chunkCount, 1); assert.equal(p.parentLabel, "Death · UK9 1"); assert.equal(p.byName, "Tom Riddell");
  assert.ok(env.db.raw.has(`ledgers/${lid}/photos/${id}/chunks/0`));
  assert.equal(await loadImage(lid, p), "data:image/jpeg;base64," + PIC.b64);
  assert.equal(Buffer.from(await imageBytes(lid, p)).toString(), "not really a jpeg");
  await env.as("sean"); // a worker may caption and delete record photos
  setCaption(lid, p, "Docket 4471"); await tick();
  assert.equal((await listPhotos(lid, "worker", { coll: "deaths", id: "d1" }))[0].caption, "Docket 4471");
  await deletePhoto(lid, p);
  assert.deepEqual(env.under(`ledgers/${lid}/photos`), []);
});

test("money photos: only owner / manager / accountant; record photos: not the accountant", async () => {
  const env = freshEnv(); const lid = await farm(env);
  const rec = savePhoto(lid, { coll: "animals", id: "a1", label: "Cow" }, PIC);
  await env.as("mark"); const money = savePhoto(lid, { coll: "finance", id: "f1", label: "Receipt" }, PIC);
  await tick();
  const ids = async (who, role) => { await env.as(who); return (await listPhotos(lid, role)).map((p) => p.id).sort(); };
  assert.deepEqual(await ids("tom", "owner"), [rec, money].sort());
  assert.deepEqual(await ids("mo", "manager"), [rec, money].sort());
  assert.deepEqual(await ids("sean", "worker"), [rec]);
  assert.deepEqual(await ids("jane", "viewer"), [rec]);
  assert.deepEqual(await ids("mark", "accountant"), [money]);
  // the database itself refuses, not just the app
  await env.as("sean");
  assert.ok(await denied(store.get(`ledgers/${lid}/photos/${money}`)));
  assert.ok(await denied(store.get(`ledgers/${lid}/photos/${money}/chunks/0`)));
  assert.ok(await denied(store.query(`ledgers/${lid}/photos`)), "unfiltered list is refused for a worker");
  assert.ok(await denied(store.query(`ledgers/${lid}/photos`, { where: [["money", "==", true]] })));
  assert.equal((await listPhotos(lid, "worker", { coll: "finance", id: "f1" })).length, 0);
  await env.as("mark");
  assert.ok(await denied(store.get(`ledgers/${lid}/photos/${rec}/chunks/0`)));
  // viewer can look but not add or delete
  await env.as("jane");
  const [p] = await listPhotos(lid, "viewer");
  assert.ok(await denied(deletePhoto(lid, p)));
});

test("viewer's save is refused by the rules; worker cannot add a money photo", async () => {
  const env = freshEnv(); const lid = await farm(env);
  const errors = []; const { on } = await import("../../app/js/core/bus.js");
  const off = on("store:error", (e) => errors.push(e.error.code));
  await env.as("jane"); savePhoto(lid, { coll: "animals", id: "a1" }, PIC);
  await env.as("sean"); savePhoto(lid, { coll: "finance", id: "f1" }, PIC);
  await tick(); off();
  assert.deepEqual(errors, ["permission-denied", "permission-denied"]);
  assert.deepEqual(env.under(`ledgers/${lid}/photos`), []);
});

test("offline: photo shows at once with waiting-to-upload, clears when the signal comes back", async () => {
  const env = freshEnv(); const lid = await farm(env);
  const seen = [];
  const stop = watchPhotos(lid, "owner", { coll: "deaths", id: "d9" }, (list, pending) => seen.push([list.length, [...pending]]));
  await tick();
  env.db.setOnline(false);
  const id = savePhoto(lid, { coll: "deaths", id: "d9", label: "Death" }, PIC);
  await tick();
  assert.deepEqual(seen.at(-1), [1, [id]], "listed and pending while offline");
  env.db.setOnline(true); await tick(20);
  assert.deepEqual(seen.at(-1), [1, []], "synced");
  stop();
});

test("watchAllPhotos for a worker uses the money filter (no permission error)", async () => {
  const env = freshEnv(); const lid = await farm(env);
  savePhoto(lid, { coll: "animals", id: "a1" }, PIC); savePhoto(lid, { coll: "finance", id: "f1" }, PIC); await tick();
  await env.as("sean");
  const got = await new Promise((res, rej) => { const s = watchAllPhotos(lid, "worker", (l) => { res(l); setTimeout(s); }, rej); });
  assert.equal(got.length, 1); assert.equal(got[0].money, false);
});

test("export lists photos the role may see, with image files; finance photos only for money roles", async () => {
  const env = freshEnv(); const lid = await farm(env);
  savePhoto(lid, { coll: "animals", id: "a1", label: "Cow" }, PIC); savePhoto(lid, { coll: "finance", id: "f1", label: "Receipt" }, PIC); await tick();
  const l = (await listMine()).find((x) => x.id === lid);
  const x = await exportLedger(l);
  assert.equal(x.collections.photos.length, 2); assert.ok(x.collections.photos.every((p) => !("thumb" in p) && /^photos\/.*\.jpg$/.test(p.file)));
  const files = await photoFiles(x);
  assert.equal(files.length, 2); assert.equal(Buffer.from(files[0].bytes).toString(), "not really a jpeg");
  await env.as("sean");
  const w = await exportLedger({ ...l, role: "worker" });
  assert.equal(w.collections.photos.length, 1); assert.equal(w.collections.photos[0].money, false);
  await env.as("mark");
  const a = await exportLedger({ ...l, role: "accountant" });
  assert.equal(a.collections.photos.length, 1); assert.equal(a.collections.photos[0].money, true);
});

test("hard-deleting a record removes its photos; deleting the ledger removes every photo and part", async () => {
  const env = freshEnv(); const lid = await farm(env);
  const rid = addRecord(lid, "deaths", { date: "2026-10-27" }); await tick();
  savePhoto(lid, { coll: "deaths", id: rid }, PIC); savePhoto(lid, { coll: "deaths", id: rid }, PIC); savePhoto(lid, { coll: "animals", id: "a1" }, PIC); await tick();
  assert.equal(env.under(`ledgers/${lid}/photos`).length, 6);
  hardDelete(lid, "deaths", rid); await tick(30);
  assert.equal(env.under(`ledgers/${lid}/photos`).length, 2, "only the animal photo and its part left");
  await deleteLedger(lid);
  assert.deepEqual(env.under(`ledgers/${lid}`), []);
});
