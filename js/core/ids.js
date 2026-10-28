// Random ids. Record ids are 20 chars like Firestore's; invite codes are longer and unguessable.
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function randomId(len = 20) {
  const a = new Uint8Array(len); crypto.getRandomValues(a);
  let s = ""; for (const b of a) s += ALPHA[b % 62]; return s;
}
// Invite codes: 26 characters from a 31-letter alphabet with no 0/O/1/I/L (easy to read out),
// drawn with crypto.getRandomValues and rejection sampling: 31^26 ~ 2^128.8, so >= 128 bits.
const FRIENDLY = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function inviteCode(len = 26) {
  let s = "";
  while (s.length < len) {
    const a = new Uint8Array(len * 2); crypto.getRandomValues(a);
    for (const b of a) { if (b < 248 && s.length < len) s += FRIENDLY[b % 31]; } // 248 = 8*31, no bias
  }
  return s;
}
/** "7K4P-QX9M-2RTA-…" for reading; normalise() undoes it (case-insensitive, dashes ignored). */
export const groupCode = (c) => c.replace(/(.{4})(?=.)/g, "$1-");
export const normaliseCode = (c) => String(c || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
export function hexToken(bytes = 24) {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
