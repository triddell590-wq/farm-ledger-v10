#!/usr/bin/env node
// Farm Ledger notification sender. Run hourly by .github/workflows/notify.yml.
//   node send.mjs              live: reads Firestore and sends through Firebase Cloud Messaging.
//                              Needs the env var FIREBASE_SERVICE_ACCOUNT (the service-account JSON,
//                              stored as a GitHub secret). The key is never printed.
//   node send.mjs --dry-run    no Firebase at all: builds the fixture farm (all six sectors) on the
//                              in-memory store and prints what would be sent.
// Options: --json (print the report as JSON).
import { useBackend } from "../app/js/core/store.js";
import { runSender, fcmMessage } from "./sender.mjs";
import { localParts } from "../app/js/services/notify-core.js";

const args = new Set(process.argv.slice(2));
const dry = args.has("--dry-run");
const now = new Date();

async function live() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) { console.error("FIREBASE_SERVICE_ACCOUNT is not set. Add it as a GitHub secret (see notify/README.md)."); process.exit(2); }
  let cred;
  try { cred = JSON.parse(raw); } catch (e) { console.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON (contents not shown)."); process.exit(2); }
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const { getMessaging } = await import("firebase-admin/messaging");
  const app = initializeApp({ credential: cert(cred), projectId: cred.project_id });
  cred = null;
  const { createAdminBackend } = await import("./admin-store.mjs");
  useBackend(createAdminBackend(getFirestore(app), FieldValue));
  const messaging = getMessaging(app);
  const send = async (token, msg) => {
    try { await messaging.send(fcmMessage(token, msg)); return { ok: true }; }
    catch (e) { return { ok: false, error: e.code || e.message, dead: /registration-token-not-registered|invalid-registration-token/.test(e.code || "") }; }
  };
  return runSender({ send, now, log: (m) => console.log(m) });
}

async function dryRun() {
  const { buildFixtureFarm } = await import("./fixtures.mjs");
  const fx = await buildFixtureFarm();
  fx.db.enforceRules = false; // the real sender uses the Admin SDK, which bypasses rules
  // make the fixture phones' summary time "this hour" so the dry run shows a summary
  const hm = `${String(localParts(now, "Europe/London").hour).padStart(2, "0")}:00`;
  for (const p of [...fx.db.raw.keys()].filter((k) => /^users\/[^/]+\/devices\//.test(k))) {
    const d = fx.db.raw.get(p); fx.db.seed(p, { ...d, prefs: { ...(d.prefs || {}), summaryTime: hm } });
  }
  useBackend(fx.db);
  const outbox = [];
  const send = async (token, msg) => { outbox.push({ token, message: fcmMessage(token, msg) }); return { ok: true }; };
  const report = await runSender({ send, now, log: (m) => console.log(m) });
  report.outbox = outbox; report.fixture = fx;
  return report;
}

const report = await (dry ? dryRun() : live());
if (args.has("--json")) {
  const { fixture, ...rest } = report;
  console.log(JSON.stringify(rest, null, 2));
} else {
  console.log(`${dry ? "DRY RUN (fixture farm, nothing sent)" : "Sent"} at ${now.toISOString()}: ${report.people} people, ${report.devices} devices, ${report.sent.length} notifications, ${report.removed.length} dead tokens removed, ${report.pruned} old log entries pruned.`);
  for (const s of report.sent) console.log(`  [${s.what}] ${s.uid.slice(0, 6)}…/${s.device}: ${s.title} — ${s.body}  → ${s.url}`);
  for (const s of report.skipped) console.log(`  (skipped ${s.what || "person"} ${s.device || ""}: ${s.reason || s.error})`);
}
if (!dry && report.skipped.some((s) => s.error)) process.exitCode = 1;
