// users/{uid}: the person's own profile (name, region, last ledger opened, preferences).
import { store } from "../core/store.js";
import { auth } from "../core/auth.js";

const path = (uid) => `users/${uid}`;
export async function ensureProfile(user = auth.user) {
  const p = await store.get(path(user.uid));
  if (p) return p;
  const fresh = { displayName: user.displayName || "", email: user.email, region: "NI", createdAt: new Date(), prefs: { theme: "auto", units: "acres" } };
  await store.set(path(user.uid), fresh);
  return { id: user.uid, ...fresh };
}
export const getProfile = (uid = auth.user.uid) => store.get(path(uid));
export const updateProfile = (partial, uid = auth.user.uid) => store.set(path(uid), { ...partial, updatedAt: new Date() }, { merge: true });
export const watchProfile = (cb, uid = auth.user.uid) => store.watchDoc(path(uid), cb);
