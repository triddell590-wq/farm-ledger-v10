// Fake auth for tests and demo mode. Users live in memory (optionally localStorage).
// Test hooks: verifyEmail(email) marks an address verified (as if the link was clicked);
// lastEmail holds the last "sent" email so tests can read reset/verify links.
import { randomId } from "./ids.js";

function err(code) { const e = new Error(code); e.code = code; return e; }

export function createMemoryAuth(store, opts = {}) {
  const key = opts.persistKey;
  let users = {}; let current = null;
  try { if (key) { const s = JSON.parse(localStorage.getItem(key) || "{}"); users = s.users || {}; current = s.current || null; } } catch (e) { /* ignore */ }
  const subs = new Set();
  const save = () => { try { if (key) localStorage.setItem(key, JSON.stringify({ users, current })); } catch (e) { /* ignore */ } };
  const pub = () => { const u = current && users[current]; return u ? { uid: u.uid, email: u.email, displayName: u.displayName, emailVerified: u.emailVerified } : null; };
  const changed = () => { store.uid = current ? users[current].uid : null; save(); const u = pub(); subs.forEach((cb) => cb(u)); return u; };
  store.uid = current && users[current] ? users[current].uid : null;
  const A = {
    name: "memory",
    lastEmail: null,
    user: pub,
    onChange(cb) { subs.add(cb); queueMicrotask(() => cb(pub())); return () => subs.delete(cb); },
    async signUp(email, password, displayName) {
      const k = email.toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err("auth/invalid-email");
      if (users[k]) throw err("auth/email-already-in-use");
      users[k] = { uid: opts.uidFor ? opts.uidFor(email) : randomId(28), email, password, displayName, emailVerified: !!opts.autoVerify };
      current = k; A.lastEmail = { to: email, kind: "verify" };
      return changed();
    },
    async signIn(email, password) {
      const u = users[email.toLowerCase()];
      if (!u || u.password !== password) throw err("auth/invalid-credential");
      current = email.toLowerCase(); return changed();
    },
    async signOut() { current = null; changed(); },
    async sendVerification() { if (current) A.lastEmail = { to: users[current].email, kind: "verify" }; },
    async reload() { return changed(); },
    async resetPassword(email) { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err("auth/invalid-email"); A.lastEmail = { to: email, kind: "reset" }; },
    async updateName(name) { if (current) users[current].displayName = name; changed(); },
    async changeEmail(email) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err("auth/invalid-email");
      if (users[email.toLowerCase()]) throw err("auth/email-already-in-use");
      const u = users[current]; delete users[current]; current = email.toLowerCase(); users[current] = { ...u, email, emailVerified: false };
      A.lastEmail = { to: email, kind: "verify" }; return changed();
    },
    async reauthenticate(password) { if (!current || users[current].password !== password) throw err("auth/wrong-password"); },
    async deleteUser() { if (current) { delete users[current]; current = null; changed(); } },
    // test hooks
    verifyEmail(email) { const u = users[email.toLowerCase()]; if (u) u.emailVerified = true; save(); },
    addUser(email, password, displayName, uid, verified = true) { users[email.toLowerCase()] = { uid: uid || randomId(28), email, password, displayName, emailVerified: verified }; save(); return users[email.toLowerCase()].uid; },
  };
  return A;
}
