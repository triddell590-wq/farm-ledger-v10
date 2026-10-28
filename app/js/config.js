// App configuration. The Firebase project is v9's (farm-ledger-5ba2e). NOTE: nothing in the
// build or tests ever talks to it — tests run ?backend=memory, and on localhost/file the app
// defaults to the in-memory demo backend. The live backend is only used on the real host,
// and only after Tom approves going live (rules + migration + publish).
export const VERSION = "10.0";
export const BUILD = "2026-10-14-p2";
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCNqha3iaGZPPqcNQeeFxQ3a3uwLbB7-TM",
  authDomain: "farm-ledger-5ba2e.firebaseapp.com",
  projectId: "farm-ledger-5ba2e",
  storageBucket: "farm-ledger-5ba2e.firebasestorage.app",
  messagingSenderId: "639128573539",
  appId: "1:639128573539:web:ecfdc1d0e6e1b82aac4a56",
};
export const LIVE_HOSTS = ["triddell590-wq.github.io"];
export const TERMS_VERSION = "draft-2026-10-14";
export const PRIVACY_VERSION = "draft-2026-10-14";
export const RESEND_WAIT_S = 60;
export const REMEMBER_PLACE_MS = 12 * 3600 * 1000; // reopen where you were within 12 hours
export const WARM_START_MS = 30 * 60 * 1000;       // skip the splash if resumed within 30 min
// Phone push: the Web Push certificate's PUBLIC key from Firebase console → Project settings →
// Cloud Messaging → Web configuration (see build/notify/README.md). Empty = push not set up yet:
// the Notifications screen says so, and in-app alerts, the bell and the badge still work.
export const FCM_VAPID_KEY = "";
