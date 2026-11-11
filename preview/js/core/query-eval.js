// Shared query evaluation for the in-memory backend.
import { toDate } from "./dates.js";

function getField(obj, f) { return f.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function cmpVal(v) { const d = v instanceof Date ? v.getTime() : v; return d; }
function compare(a, b) {
  a = cmpVal(a); b = cmpVal(b);
  if (a === b) return 0; if (a == null) return -1; if (b == null) return 1;
  return a < b ? -1 : 1;
}
export function matches(data, where = []) {
  return where.every(([f, op, v]) => {
    const x = getField(data, f);
    switch (op) {
      case "==": return compare(x, v) === 0 && x !== undefined;
      case "!=": return x !== undefined && compare(x, v) !== 0;
      case "<": return x != null && compare(x, v) < 0;
      case "<=": return x != null && compare(x, v) <= 0;
      case ">": return x != null && compare(x, v) > 0;
      case ">=": return x != null && compare(x, v) >= 0;
      case "in": return v.some((y) => compare(x, y) === 0);
      case "array-contains": return Array.isArray(x) && x.some((y) => compare(y, v) === 0);
      default: throw new Error("Unsupported query op " + op);
    }
  });
}
export function sortAndLimit(list, opts = {}) {
  const order = opts.orderBy || [];
  if (order.length) list.sort((a, b) => { for (const [f, dir] of order) { const c = compare(getField(a, f), getField(b, f)); if (c) return dir === "desc" ? -c : c; } return 0; });
  return opts.limit ? list.slice(0, opts.limit) : list;
}
export { toDate };
