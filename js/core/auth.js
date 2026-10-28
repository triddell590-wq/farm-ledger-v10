// The ONE auth interface. Screens and services import `auth` from here.
// Backends: auth-firebase.js (Email/Password) and auth-memory.js (tests, demo).
//
//   auth.user                -> { uid, email, displayName, emailVerified } | null
//   auth.onChange(cb)        -> unsubscribe   (cb(user) on every sign-in/out/verify change; fires once at start)
//   auth.signUp(email, password, displayName)  -> user   (sends the verification email)
//   auth.signIn(email, password)               -> user
//   auth.signOut()
//   auth.sendVerification()  auth.reload() -> user (refresh emailVerified)
//   auth.resetPassword(email)
//   auth.updateName(name)
//   auth.changeEmail(email)        (sends a confirm link to the new address)
//   auth.reauthenticate(password)   (needed before deleting the account)
//   auth.deleteUser()
// Errors carry .code (Firebase style, e.g. "auth/wrong-password") and .friendly (plain words).
import { emit } from "./bus.js";

let backend = null;
export function useAuthBackend(b) { backend = b; }

const FRIENDLY = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/user-not-found": "No account with that email. Check it, or create an account.",
  "auth/wrong-password": "Wrong password. Try again or reset it.",
  "auth/invalid-credential": "Email or password is wrong. Try again or reset your password.",
  "auth/invalid-login-credentials": "Email or password is wrong. Try again or reset your password.",
  "auth/email-already-in-use": "There's already an account with that email. Sign in instead.",
  "auth/weak-password": "Use at least 8 characters for your password.",
  "auth/too-many-requests": "Too many tries. Wait a few minutes and try again.",
  "auth/network-request-failed": "No signal. Signing in needs the internet the first time on this phone.",
  "auth/requires-recent-login": "For safety, enter your password again to do that.",
};
export function friendly(e) {
  return (e && (e.friendly || FRIENDLY[e.code])) || "Something went wrong. Try again.";
}
function wrap(fn) {
  return async (...a) => {
    try { return await fn(...a); } catch (e) { e.friendly = friendly(e); throw e; }
  };
}
export const MIN_PASSWORD = 8;

export const auth = {
  get user() { return backend ? backend.user() : null; },
  onChange: (cb) => backend.onChange((u) => { emit("auth:change", u); cb(u); }),
  signUp: wrap(async (email, password, displayName) => {
    if (!password || password.length < MIN_PASSWORD) { const e = new Error("weak"); e.code = "auth/weak-password"; throw e; }
    return backend.signUp(email.trim(), password, (displayName || "").trim());
  }),
  signIn: wrap((email, password) => backend.signIn(email.trim(), password)),
  signOut: wrap(() => backend.signOut()),
  sendVerification: wrap(() => backend.sendVerification()),
  reload: wrap(() => backend.reload()),
  resetPassword: wrap((email) => backend.resetPassword(email.trim())),
  updateName: wrap((name) => backend.updateName(name.trim())),
  changeEmail: wrap((email) => backend.changeEmail(email.trim())),
  reauthenticate: wrap((password) => backend.reauthenticate(password)),
  deleteUser: wrap(() => backend.deleteUser()),
  backendName: () => (backend ? backend.name : "none"),
};
