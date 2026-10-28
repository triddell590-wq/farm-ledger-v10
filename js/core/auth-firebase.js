// Firebase Email/Password auth (compat 10.7.0). Auth state is kept on the phone (LOCAL
// persistence), so a farmer who signed in once opens straight into the app with no signal.
export function createFirebaseAuth() {
  const firebase = window.firebase;
  const a = firebase.auth();
  try { a.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) { /* default is LOCAL */ }
  const pub = (u) => (u ? { uid: u.uid, email: u.email, displayName: u.displayName || "", emailVerified: !!u.emailVerified } : null);
  const actionSettings = () => ({ url: location.href.split("#")[0] + "#/signin", handleCodeInApp: false });
  return {
    name: "firebase",
    user: () => pub(a.currentUser),
    onChange: (cb) => a.onAuthStateChanged((u) => cb(pub(u))),
    async signUp(email, password, displayName) {
      const cred = await a.createUserWithEmailAndPassword(email, password);
      if (displayName) await cred.user.updateProfile({ displayName });
      try { await cred.user.sendEmailVerification(actionSettings()); } catch (e) { console.warn("verification email", e); }
      return pub(a.currentUser);
    },
    signIn: async (email, password) => pub((await a.signInWithEmailAndPassword(email, password)).user),
    signOut: () => a.signOut(),
    sendVerification: () => a.currentUser.sendEmailVerification(actionSettings()),
    async reload() { if (a.currentUser) await a.currentUser.reload(); return pub(a.currentUser); },
    resetPassword: (email) => a.sendPasswordResetEmail(email, actionSettings()),
    updateName: (name) => a.currentUser.updateProfile({ displayName: name }),
    changeEmail: (email) => a.currentUser.verifyBeforeUpdateEmail(email, actionSettings()),
    reauthenticate(password) {
      const u = a.currentUser;
      return u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, password));
    },
    deleteUser: () => a.currentUser.delete(),
  };
}
