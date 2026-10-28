// Photo maths with no browser or database in it, so node tests can check it: the shrink loop
// (longest side 1600 px, JPEG quality stepped down until the file is 350 KB or less), base64
// sizing, splitting the image into Firestore-sized chunks and joining them back, and who may
// see / add a photo. Firebase Storage needs the paid plan, so photos live in Firestore:
//   ledgers/{lid}/photos/{photoId}            metadata + a small inline thumbnail
//   ledgers/{lid}/photos/{photoId}/chunks/{n} { n, data } base64 JPEG, <= 700,000 chars each
// A photo follows its parent record: a photo on a money record (`finance`) is a money photo
// (`money: true`), seen only by owner / manager / accountant; any other photo is seen by those
// who see records (owner / manager / worker / viewer). Keep in step with firestore.rules.
import { canRead, canWrite } from "../core/policy.js";

export const MAX_SIDE = 1600;
export const TARGET_BYTES = 350 * 1024;
export const THUMB_SIDE = 240;
export const THUMB_QUALITY = 0.6;
export const CHUNK_CHARS = 700000;       // the rules reject a chunk over 750,000 characters
export const MAX_CHUNKS = 8;
export const QUALITIES = [0.72, 0.64, 0.56, 0.48, 0.4];
export const SHRINK_STEP = 0.8;          // when even the lowest quality is too big, 80 % of the size
export const MIN_SIDE = 480;

/** Size that fits inside max × max, keeping the shape. Never enlarges. */
export function fitSize(w, h, max = MAX_SIDE) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (w <= max && h <= max) return { w, h };
  const s = max / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Bytes a base64 string (or data: URL) decodes to. */
export function b64Bytes(s) {
  const b = String(s || ""); const i = b.indexOf(","); const body = b.startsWith("data:") ? b.slice(i + 1) : b;
  const pad = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - pad);
}
export const stripDataUrl = (s) => (String(s).startsWith("data:") ? String(s).slice(String(s).indexOf(",") + 1) : String(s));
export const toDataUrl = (b64, mime = "image/jpeg") => `data:${mime};base64,${b64}`;

/**
 * Shrink until the JPEG is small enough. encode(w, h, quality) -> Promise<{ dataUrl }> draws the
 * picture at w × h and re-encodes it (which also drops EXIF, GPS included). Tries each quality at
 * 1600 px, then 80 % of that size, and so on down to MIN_SIDE.
 * Returns { dataUrl, bytes, w, h, quality, tries, over } (over: still above target at the end).
 */
export async function shrink(w0, h0, encode, { max = MAX_SIDE, target = TARGET_BYTES, qualities = QUALITIES, minSide = MIN_SIDE } = {}) {
  let side = Math.min(max, Math.max(w0, h0)); let last = null; let tries = 0;
  for (;;) {
    const { w, h } = fitSize(w0, h0, side);
    for (const q of qualities) {
      const out = await encode(w, h, q); tries++;
      const bytes = out.bytes ?? b64Bytes(out.dataUrl);
      last = { dataUrl: out.dataUrl, bytes, w, h, quality: q, tries, over: bytes > target };
      if (bytes <= target) return last;
    }
    const next = Math.round(Math.max(w, h) * SHRINK_STEP);
    if (next < minSide || next >= Math.max(w, h)) return last;
    side = next;
  }
}

/** base64 text -> chunk strings of at most `size` characters (always at least one chunk). */
export function splitChunks(b64, size = CHUNK_CHARS) {
  const s = String(b64 || ""); const out = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out.length ? out : [""];
}
/** Chunk docs ({n, data}) in any order -> the base64 text. Throws if one is missing. */
export function joinChunks(chunks, count) {
  const byN = new Map((chunks || []).map((c) => [Number(c.n ?? c.id), c.data]));
  const n = count ?? byN.size; let s = "";
  for (let i = 0; i < n; i++) { if (!byN.has(i)) throw new Error(`Photo part ${i + 1} of ${n} is missing`); s += byN.get(i); }
  return s;
}

// ---- who sees what ----
export const isMoneyColl = (coll) => coll === "finance";
/** May this role see photos on records in `coll`? Same as reading the record. */
export const canSeePhotos = (role, coll) => canRead(role, coll);
/** May this role add / delete photos on records in `coll`? Same as writing the record. */
export const canAddPhotos = (role, coll) => canWrite(role, coll);
/** money flag -> may see (the rules' view: works without knowing the parent collection) */
export function seesPhoto(role, money) {
  if (role === "owner" || role === "manager") return true;
  return money ? role === "accountant" : role === "worker" || role === "viewer";
}
export function writesPhoto(role, money) {
  if (role === "owner" || role === "manager") return true;
  return money ? role === "accountant" : role === "worker";
}
/**
 * The query filter a role must use to list a ledger's photos (Firestore only allows a list the
 * rules can prove): null = no filter (owner, manager), true/false = where money == that,
 * "none" = this role sees no photos.
 */
export function moneyFilterFor(role) {
  if (role === "owner" || role === "manager") return null;
  if (role === "accountant") return true;
  if (role === "worker" || role === "viewer") return false;
  return "none";
}

/** Metadata document for a new photo (the rules check the same shape). */
export function photoDoc({ parentColl, parentId, parentLabel = "", takenAt, by = "", byName = "", w, h, bytes, caption = "", chunkCount, thumb = "", mime = "image/jpeg" }) {
  return {
    parentColl, parentId: String(parentId), parentLabel: String(parentLabel || "").slice(0, 120), money: isMoneyColl(parentColl),
    takenAt: takenAt || new Date().toISOString(), by, byName, w, h, bytes, caption: String(caption || "").slice(0, 300), chunkCount, thumb, mime,
  };
}
/** "photo-2026-10-27-death-ab12cd.jpg" style name for exports and the share sheet. */
export function photoFileName(p) {
  const day = String(p.takenAt || "").slice(0, 10) || "photo";
  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return [day, slug(p.parentLabel || p.parentColl), String(p.id || "").slice(0, 6)].filter(Boolean).join("-") + ".jpg";
}
