// Sector UI registry: loads a ledger's own module (sectors/<type>/index.js) when it exists,
// otherwise the generic placeholder (sectors/generic.js) until that ledger's design is built.
// Contract for a sector module (default export):
//   tabs: [{ id, label, icon, roles? }]  first = home, last = "more"
//   screen(tabId, ctx) -> Promise<{ el, title, context }>
//   routes?: [{ pattern (RegExp on the part after /l/<id>/), load(ctx) -> Screen }]
//   headline(ledger) -> Promise<{ value, unit, line }>
//   alerts(ledger, role) -> Promise<[{ level:'late'|'due'|'info', title, body, href, legal }]>
//   quickAdd(ledger) -> [{ id, label, icon, run() }]
//   contextLine(ledger) -> Promise<string>
const BUILT = new Set(["beef", "sheep", "dairy", "pigs", "layers", "broilers"]); // sectors with their own module (Phase 3 adds them)
const cache = {};
export function hasOwnModule(type) { return BUILT.has(type); }
export async function sectorModule(type) {
  if (cache[type]) return cache[type];
  const mod = BUILT.has(type) ? await import(`./${type}/index.js`) : await import("./generic.js");
  cache[type] = BUILT.has(type) ? mod.default : mod.genericFor(type);
  return cache[type];
}
export function registerBuilt(type) { BUILT.add(type); }
