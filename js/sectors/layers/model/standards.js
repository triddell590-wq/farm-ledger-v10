// Breed standard bands by week of age (design/14 §5.1). Linear between the published anchor
// weeks in content.js; flat before the first and after the last.
import { BREED_STANDARDS, DEFAULT_BREED } from "./content.js";

export const LINES = { lay: "Lay %", eggWt: "Egg weight", feed: "Feed", bw: "Body weight", mort: "Mortality" };
export const UNITS = { lay: "%", eggWt: "g", feed: "g/bird/day", bw: "g", mort: "% cumulative" };

export function standardFor(id) { return BREED_STANDARDS.find((b) => b.id === id) || BREED_STANDARDS.find((b) => b.id === DEFAULT_BREED); }

/** [min, max] for a line at a week of age, or null if the standard has no such line. */
export function band(std, line, wk) {
  const pts = std?.[line]; if (!pts || !pts.length || wk == null) return null;
  if (wk <= pts[0][0]) return [pts[0][1], pts[0][2]];
  const last = pts[pts.length - 1]; if (wk >= last[0]) return [last[1], last[2]];
  for (let i = 1; i < pts.length; i++) {
    const [w1, a1, b1] = pts[i - 1], [w2, a2, b2] = pts[i];
    if (wk <= w2) { const f = (wk - w1) / (w2 - w1); return [round1(a1 + (a2 - a1) * f), round1(b1 + (b2 - b1) * f)]; }
  }
  return null;
}
export const mid = (b) => (b ? (b[0] + b[1]) / 2 : null);
const round1 = (n) => Math.round(n * 10) / 10;

/** Before first eggs the lay band is 0 (the band starts at the first anchor week minus 2). */
export function layBand(std, wk) { const first = std.lay[0][0]; if (wk < first - 2) return [0, 0]; if (wk < first) { const f = (wk - (first - 2)) / 2; return [round1(std.lay[0][1] * f * 0.5), round1(std.lay[0][2] * f * 0.5)]; } return band(std, "lay", wk); }

/** Where a value sits against the band: 'in' | 'below' | 'above' with the gap to the band. */
export function vsBand(value, b) {
  if (value == null || !b) return null;
  if (value < b[0]) return { pos: "below", gap: round1(b[0] - value) };
  if (value > b[1]) return { pos: "above", gap: round1(value - b[1]) };
  return { pos: "in", gap: 0 };
}
