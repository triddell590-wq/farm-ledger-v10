// Map maths and the postcode lookup for the Overview map (screens/overview-map.js). Pure
// functions apart from geocodePostcode, so they're unit-tested in tests/unit/map-geo.test.mjs.
export const NI_CENTRE = [54.65, -6.7];

/** Area of a field boundary [{lat,lng}] in acres (spherical excess; accurate at field scale). */
export function areaAcres(poly) {
  if (!poly || poly.length < 3) return 0;
  const R = 6378137, rad = Math.PI / 180; let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += (q.lng - p.lng) * rad * (2 + Math.sin(p.lat * rad) + Math.sin(q.lat * rad)); }
  return Math.abs(a * R * R / 2) / 4046.8564224;
}
export function distM(a, b) {
  const R = 6371008.8, rad = Math.PI / 180; const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const mFmt = (m) => (m >= 1000 ? (m / 1000).toFixed(2) + " km" : Math.round(m) + " m");

/** Sides of a field as a farmer sees them (v9 logic): points traced along a hedge join into one
 *  side; a new side starts at a real corner. Returns { sides: [{ len, mid:[lat,lng] }], perimeter }. */
const CORNER_DEG = 35, MAX_BEND_DEG = 60;
export function fieldSides(polygon) {
  const pts = (polygon || []).map((p) => (Array.isArray(p) ? p : [p.lat, p.lng]));
  if (pts.length < 3) return { sides: [], perimeter: 0 };
  const segs = pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; const dx = (b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180), dy = b[0] - a[0]; return { a, b, len: distM(a, b), brg: (Math.atan2(dx, dy) * 180) / Math.PI }; }).filter((s) => s.len > 0.01);
  const turn = (x, y) => { let d = y - x; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
  const n = segs.length; if (!n) return { sides: [], perimeter: 0 };
  let start = 0, best = -1;
  segs.forEach((s, i) => { const t = Math.abs(turn(segs[(i - 1 + n) % n].brg, s.brg)); if (t > best) { best = t; start = i; } });
  const sides = []; let cur = null;
  for (let k = 0; k < n; k++) {
    const s = segs[(start + k) % n], prev = segs[(start + k - 1 + n) % n];
    const t = k === 0 ? 999 : Math.abs(turn(prev.brg, s.brg)); const bend = cur ? Math.abs(turn(cur.startBrg, s.brg)) : 999;
    if (!cur || t >= CORNER_DEG || bend >= MAX_BEND_DEG) { cur = { segs: [], len: 0, startBrg: s.brg }; sides.push(cur); }
    cur.segs.push(s); cur.len += s.len;
  }
  for (const sd of sides) {
    let half = sd.len / 2;
    for (const s of sd.segs) { if (half <= s.len) { const r = s.len ? half / s.len : 0; sd.mid = [s.a[0] + (s.b[0] - s.a[0]) * r, s.a[1] + (s.b[1] - s.a[1]) * r]; break; } half -= s.len; }
    if (!sd.mid) sd.mid = sd.segs[0].a;
  }
  return { sides: sides.map((s) => ({ len: s.len, mid: s.mid })), perimeter: sides.reduce((t, s) => t + s.len, 0) };
}

export const normPostcode = (pc) => String(pc || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** UK postcode → { lat, lng } via postcodes.io (free, no key), cached on the phone. null if unknown/offline. */
export async function geocodePostcode(pc, cache) {
  const key = normPostcode(pc); if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(key)) return null;
  const c = cache && cache.get(`fl-pc-${key}`); if (c) { try { return JSON.parse(c); } catch (e) { /* refetch */ } }
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${key}`); if (!res.ok) return null;
    const j = await res.json(); const r = j && j.result; if (!r || r.latitude == null) return null;
    const hit = { lat: r.latitude, lng: r.longitude }; cache && cache.set(`fl-pc-${key}`, JSON.stringify(hit)); return hit;
  } catch (e) { return null; }
}
