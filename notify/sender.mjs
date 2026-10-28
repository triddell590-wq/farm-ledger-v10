// The sender's logic, separate from Firebase so it can be tested on the in-memory store.
//   runSender({ send, now, log }) -> report
// Before calling: useBackend(<admin or memory backend>) from app/js/core/store.js.
// `send(token, msg)` delivers one message and resolves { ok: true } or { ok: false, dead: bool, error }.
//
// Every run (hourly):
//   1. load every device (users/{uid}/devices/*), grouped by person;
//   2. for each person: their ledgers + roles (members collection group), then each ledger's
//      alerts and jobs through the app's own sector code (services/duties.js), worked out in the
//      device's time zone and already money-safe for the person's role on that ledger;
//   3. "now late" legal items: pushed once per item per person (users/{uid}/notifyLog), never in
//      quiet hours (they wait for the next run outside them), grouped when more than 3;
//   4. daily summary to devices whose local summary time falls in this run (3-hour window, once a day);
//   5. "X joined your ledger" for invites accepted in the last 7 days, once each;
//   6. dead tokens removed; log entries older than 60 days pruned.
import { store } from "../app/js/core/store.js";
import { session } from "../app/js/services/session.js";
import { allItems } from "../app/js/services/duties.js";
import { LEDGER_TYPES } from "../app/js/core/policy.js";
import {
  normPrefs, localParts, inQuiet, summaryDue, filterForPrefs, lateLegal, summaryMessage, lateMessage, inviteMessage,
  logId, lateKey, summaryKey, inviteKey, isStale, validTz, DEFAULT_TZ, MAX_LATE_PUSHES, badgeCount,
} from "../app/js/services/notify-core.js";

const DEAD = /registration-token-not-registered|invalid-registration-token|not-found|unregistered/i;

async function ledgersOf(uid) {
  const mems = await store.queryGroup("members", { where: [["uid", "==", uid]] });
  const out = [];
  for (const m of mems) {
    const lid = m._path.split("/")[1];
    const l = await store.get(`ledgers/${lid}`).catch(() => null);
    if (l) out.push({ ...l, role: m.role });
  }
  return out.sort((a, b) => LEDGER_TYPES.indexOf(a.type) - LEDGER_TYPES.indexOf(b.type) || String(a.name).localeCompare(String(b.name)));
}

/** Items for a person in a time zone. The app's date helpers use the process time zone. */
async function itemsIn(ledgers, tz, now) {
  const prev = process.env.TZ; process.env.TZ = tz;
  try { return await allItems(ledgers, { today: localParts(now, tz).date }); }
  finally { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
}

export async function runSender({ send, now = new Date(), log = () => {} } = {}) {
  const report = { people: 0, devices: 0, sent: [], removed: [], pruned: 0, skipped: [] };
  const devices = await store.queryGroup("devices", {});
  const byUser = new Map();
  for (const d of devices) {
    const seg = d._path.split("/"); if (seg[0] !== "users" || seg.length !== 4) continue;
    if (!d.token) continue;
    if (!byUser.has(seg[1])) byUser.set(seg[1], []);
    byUser.get(seg[1]).push({ ...d, id: seg[3], uid: seg[1], tz: validTz(d.tz) ? d.tz : DEFAULT_TZ, prefs: normPrefs(d.prefs) });
  }
  for (const [uid, devs] of byUser) {
    report.people++; report.devices += devs.length;
    try { await forPerson(uid, devs); } catch (e) { log(`person ${uid.slice(0, 6)}…: ${e.message}`); report.skipped.push({ uid, error: e.message }); }
  }
  return report;

  async function forPerson(uid, devs) {
    const ledgers = await ledgersOf(uid);
    session.useLedgers(ledgers);
    const sectorLedgers = ledgers.filter((l) => l.type !== "farm");
    const farmName = [...new Set(sectorLedgers.map((l) => l.farmName).filter(Boolean))].length === 1 ? sectorLedgers[0].farmName : null;
    // dedupe log: read once, prune old entries
    const logs = new Map();
    for (const e of await store.query(`users/${uid}/notifyLog`).catch(() => [])) {
      if (isStale(e, now)) { await store.remove(`users/${uid}/notifyLog/${e.id}`).catch(() => {}); report.pruned++; } else logs.set(e.id, e);
    }
    const logged = (key) => logs.has(logId(key));
    const mark = async (key, extra = {}) => { const id = logId(key); const e = { key, sentAt: now, ...extra }; logs.set(id, e); await store.set(`users/${uid}/notifyLog/${id}`, e); };
    const cache = new Map();
    const itemsFor = async (tz) => { if (!cache.has(tz)) cache.set(tz, await itemsIn(sectorLedgers, tz, now)); return cache.get(tz); };
    const dead = new Set();
    const deliver = async (dev, msg, what) => {
      if (dead.has(dev.id)) return false;
      const res = await send(dev.token, msg).catch((e) => ({ ok: false, error: e.message || String(e), dead: DEAD.test(String(e.code || e.message)) }));
      if (res && res.ok) { report.sent.push({ uid, device: dev.id, what, title: msg.title, body: msg.body, url: msg.url }); return true; }
      if (res && (res.dead || DEAD.test(String(res.error || "")))) {
        dead.add(dev.id); await store.remove(`users/${uid}/devices/${dev.id}`).catch(() => {});
        report.removed.push({ uid, device: dev.id, reason: res.error || "token no longer valid" });
      } else log(`send failed ${dev.id}: ${res && res.error}`);
      return false;
    };

    // 3. now-late legal items, once per item per person
    const fresh = new Map(); // key -> item
    for (const dev of devs) {
      const p = dev.prefs; if (!p.late || !p.kinds.legal) continue;
      for (const it of lateLegal(filterForPrefs(await itemsFor(dev.tz), p))) if (!logged(lateKey(it))) fresh.set(lateKey(it), it);
    }
    if (fresh.size) {
      const sentKeys = new Set();
      for (const dev of devs) {
        const p = dev.prefs; if (!p.late || !p.kinds.legal) continue;
        if (inQuiet(now, p, dev.tz)) { report.skipped.push({ uid, device: dev.id, what: "late", reason: "quiet hours" }); continue; }
        const mine = lateLegal(filterForPrefs(await itemsFor(dev.tz), p)).filter((it) => fresh.has(lateKey(it)));
        if (!mine.length) continue;
        const count = badgeCount(filterForPrefs(await itemsFor(dev.tz), p));
        const msgs = mine.length > MAX_LATE_PUSHES ? [lateMessage(mine)] : mine.map((it) => lateMessage([it]));
        let ok = false;
        for (const m of msgs) ok = (await deliver(dev, { ...m, badge: count }, "late")) || ok;
        if (ok) mine.forEach((it) => sentKeys.add(lateKey(it)));
      }
      for (const key of sentKeys) { const it = fresh.get(key); await mark(key, { kind: "late", ledgerId: it.ledgerId, title: it.title }); }
    }

    // 4. daily summary per device
    for (const dev of devs) {
      if (dead.has(dev.id)) continue;
      const lp = localParts(now, dev.tz); const key = summaryKey(dev.id, lp.date);
      if (!summaryDue(now, dev.prefs, dev.tz, logged(key) ? lp.date : null)) continue;
      const items = filterForPrefs(await itemsFor(dev.tz), dev.prefs);
      const msg = summaryMessage(items, { farmName });
      if (msg) await deliver(dev, { ...msg, badge: msg.count }, "summary");
      else report.skipped.push({ uid, device: dev.id, what: "summary", reason: "nothing due" });
      await mark(key, { kind: "summary", device: dev.id });
    }

    // 5. invites I made that someone accepted in the last 7 days
    const wantInvites = devs.filter((d) => d.prefs.kinds.invites && !dead.has(d.id));
    if (wantInvites.length) {
      const mine = await store.query("invites", { where: [["createdBy", "==", uid]] }).catch(() => []);
      const week = now.getTime() - 7 * 86400000;
      for (const inv of mine) {
        const at = inv.usedAt instanceof Date ? inv.usedAt.getTime() : 0;
        if (!inv.usedBy || at < week || logged(inviteKey(inv.id))) continue;
        if (!inv.usedByName) { const m = await store.get(`ledgers/${inv.ledgerId}/members/${inv.usedBy}`).catch(() => null); if (m) inv.usedByName = m.displayName || m.email; }
        if (!inv.ledgerName) inv.ledgerName = ledgers.find((l) => l.id === inv.ledgerId)?.name;
        let ok = false;
        for (const dev of wantInvites) { if (inQuiet(now, dev.prefs, dev.tz)) continue; ok = (await deliver(dev, inviteMessage({ ...inv, code: inv.id }), "invite")) || ok; }
        if (ok) await mark(inviteKey(inv.id), { kind: "invite", ledgerId: inv.ledgerId });
      }
    }
  }
}

/** The FCM HTTP v1 message for one device (data-only: our service worker shows it). */
export function fcmMessage(token, msg) {
  const data = { title: String(msg.title || "Farm Ledger"), body: String(msg.body || ""), url: String(msg.url || "#/notifications"), tag: String(msg.tag || "fl"), badge: String(msg.badge ?? "") };
  return { token, data, webpush: { headers: { Urgency: "high", TTL: String(20 * 3600) } } };
}
