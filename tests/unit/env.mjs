// Shared setup for unit tests: one in-memory database with rules ON, a memory auth with test
// users, and helpers to act as each of them.
import { createMemoryBackend } from "../../app/js/core/store-memory.js";
import { createMemoryAuth } from "../../app/js/core/auth-memory.js";
import { useBackend } from "../../app/js/core/store.js";
import { useAuthBackend, auth } from "../../app/js/core/auth.js";

export function freshEnv() {
  const db = createMemoryBackend();
  const a = createMemoryAuth(db);
  useBackend(db); useAuthBackend(a);
  const users = {};
  for (const [k, name] of [["tom", "Tom Riddell"], ["sean", "Seán McKee"], ["jane", "Jane Vet"], ["mark", "Mark Books"], ["eve", "Eve Stranger"], ["mo", "Mo Manager"]]) {
    users[k] = a.addUser(`${k}@x.test`, "password123", name, k === "tom" ? "Nul4LGSWD4Zclv0lLGYjynVq2QZ2" : "u_" + k, true);
  }
  return {
    db, a, users,
    async as(k) { await auth.signOut(); await auth.signIn(`${k}@x.test`, "password123"); return users[k]; },
    /** every document path under a prefix (rules bypassed) */
    under(prefix) { return [...db.raw.keys()].filter((p) => p === prefix || p.startsWith(prefix + "/")); },
  };
}
export const denied = async (p) => { try { await p; return false; } catch (e) { return e.code === "permission-denied"; } };
