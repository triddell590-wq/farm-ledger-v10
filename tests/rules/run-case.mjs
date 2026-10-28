// Runs one matrix case against an adapter and reports allow/deny.
// Adapter: { as(uid) -> ctx } where ctx has get/list/set(path,data,merge)/remove/group/batch(ops)
// "update" ops are sent as set(..., {merge:true}) so a missing document is a rules decision
// (create) rather than a not-found error, in both the model and the emulator.
import { ACTIONS } from "./matrix.mjs";

export async function runCase(adapter, c) {
  const ctx = await adapter.as(c.uid);
  const ops = ACTIONS[c.action].ops(c.uid);
  try {
    const writes = ops.filter((o) => ["set", "update", "delete"].includes(o.type));
    if (writes.length > 1) {
      await ctx.batch(writes);
    } else {
      for (const o of ops) {
        if (o.type === "get") await ctx.get(o.path);
        else if (o.type === "list") await ctx.list(o.path, o.where);
        else if (o.type === "group") await ctx.group(o.path, o.mine ? c.uid : "uOther");
        else if (o.type === "set") await ctx.set(o.path, o.data, false);
        else if (o.type === "update") await ctx.set(o.path, o.data, true);
        else if (o.type === "delete") await ctx.remove(o.path);
      }
    }
    return "allow";
  } catch (e) {
    const code = String(e.code || e.message || e);
    if (/permission[-_ ]denied|PERMISSION_DENIED|insufficient permissions/i.test(code)) return "deny";
    throw e;
  }
}
