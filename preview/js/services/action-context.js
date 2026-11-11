// "One thing the farmer did = one action" (review B #3, drastic idea 1). While an action runs,
// every record added gets the same `actionId`, and every existing record it changes is noted
// as an effect (what was set, what was there before). services/linked.js uses both to delete,
// bring back and edit the whole entry together. No imports here (records.js depends on it).

let cur = null;
let newId = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
let onFinish = () => {};

/** Wiring from records.js: id maker and what to do when an action ends. */
export function configureActions({ makeId, finish }) { if (makeId) newId = makeId; if (finish) onFinish = finish; }
export const currentAction = () => cur;

/** Run fn as one action (nested calls join the outer one). Returns fn's result. */
export function runAction(fn, { lid = null } = {}) {
  if (cur) return fn();
  const a = { id: newId(), lid, created: [], effects: [] };
  cur = a;
  try { return fn(); } finally { cur = null; onFinish(a); }
}
/** Wrap a writer so every call is one action. */
export const asAction = (fn) => function (...args) { return runAction(() => fn.apply(this, args)); };
