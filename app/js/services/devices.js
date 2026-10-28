// This person's phones for notifications and the notification log (security rules: only the
// person themselves may read or write these; the hourly sender uses the Admin SDK).
//   users/{uid}/devices/{deviceId}  { token, platform, ua, createdAt, lastSeen, tz, prefs }
//   users/{uid}/notifyLog/{logId}   { key, sentAt, kind, ... }   dedupe; pruned after 60 days
import { store } from "../core/store.js";

export const devicePath = (uid, id) => `users/${uid}/devices/${id}`;
export const logPath = (uid, id) => `users/${uid}/notifyLog/${id}`;

export const getDevice = (uid, id) => store.get(devicePath(uid, id));
export const saveDevice = (uid, id, data) => store.set(devicePath(uid, id), data, { merge: true });
export const removeDevice = (uid, id) => store.remove(devicePath(uid, id));
export const listDevices = (uid) => store.query(`users/${uid}/devices`);
export const getLog = (uid, id) => store.get(logPath(uid, id));
export const writeLog = (uid, id, data) => store.set(logPath(uid, id), data);
export const listLog = (uid) => store.query(`users/${uid}/notifyLog`);

/** Everything under the person's devices and notifyLog (export and delete account). */
export async function myNotifyData(uid) {
  const [devices, log] = await Promise.all([listDevices(uid).catch(() => []), listLog(uid).catch(() => [])]);
  return { devices: devices.map(({ token, ...d }) => ({ ...d, token: token ? "(kept private)" : null })), notifyLog: log };
}
export async function removeAllNotifyData(uid) {
  const paths = [...(await listDevices(uid).catch(() => [])).map((d) => devicePath(uid, d.id)), ...(await listLog(uid).catch(() => [])).map((e) => logPath(uid, e.id))];
  for (let i = 0; i < paths.length; i += 400) { const b = store.batch(); paths.slice(i, i + 400).forEach((p) => b.remove(p)); await b.commit(); }
  return paths.length;
}
