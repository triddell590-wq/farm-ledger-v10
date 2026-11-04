// Tiny pub/sub for app-wide events (store errors, auth changes, toasts).
const subs = new Map();
export function on(evt, fn) { if (!subs.has(evt)) subs.set(evt, new Set()); subs.get(evt).add(fn); return () => subs.get(evt).delete(fn); }
export function emit(evt, data) { (subs.get(evt) || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(evt, e); } }); }
