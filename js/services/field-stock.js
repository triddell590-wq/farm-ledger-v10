// Who is in which field (review A #28): beef and dairy groups and sheep mobs linked to a mapped
// field, with head counts for the map. A group/mob is in a field when it carries that field's id
// (`fieldId`, set from the field's sheet on the map), or — for older records — when its free-text
// place (beef group `shed`, sheep mob field / latest field move) is the field's name.
import { listRecords, updateRecord } from "./records.js";
import { canRead, canWrite } from "../core/policy.js";
import { onFarm } from "../sectors/beef/model/animals.js";
import { countsAt, mobField, activeMobs } from "../sectors/sheep/model/mobs.js";

const norm = (s) => String(s || "").trim().toLowerCase();
const GROUP_TYPES = ["beef", "dairy"];
const WORD = { beef: ["animal", "cattle"], dairy: ["cow", "cows"], sheep: ["sheep", "sheep"] };
export const headWord = (type, n) => `${n.toLocaleString("en-GB")} ${WORD[type] ? WORD[type][n === 1 ? 0 : 1] : "head"}`;

/** Pure: stock units per field. fields: [{id,name}]; units: [{ type, key, name, n, fieldId, place }] -> Map fieldId -> units[] */
export function matchStock(fields, units) {
  const byName = new Map(fields.map((f) => [norm(f.name), f.id]));
  const ids = new Set(fields.map((f) => f.id));
  const out = new Map(fields.map((f) => [f.id, []]));
  for (const u of units) {
    const fid = u.fieldId && ids.has(u.fieldId) ? u.fieldId : !u.fieldId && u.place ? byName.get(norm(u.place)) : null;
    if (fid) out.get(fid).push(u);
  }
  return out;
}

/** Every group / mob the person can see on these ledgers, with its head count now. */
export async function stockUnits(ledgers) {
  const units = [];
  for (const l of ledgers) {
    if (!l || l.role === "accountant") continue;
    try {
      if (GROUP_TYPES.includes(l.type) && canRead(l.role, "groups")) {
        const [groups, animals] = await Promise.all([listRecords(l.id, "groups"), listRecords(l.id, "animals")]);
        for (const g of groups) if (!g.deleted) units.push({ type: l.type, ledger: l, coll: "groups", rec: g, key: `${l.id}:${g.id}`, name: g.name, fieldId: g.fieldId || null, place: g.shed || g.location || "", n: animals.filter((a) => onFarm(a) && a.groupId === g.id).length });
      }
      if (l.type === "sheep" && canRead(l.role, "mobs")) {
        const data = {};
        await Promise.all(["mobs", "events", "lambCrops", "deaths", "movements"].map(async (c) => { data[c] = await listRecords(l.id, c).catch(() => []); }));
        const counts = countsAt(data);
        for (const m of activeMobs(data)) units.push({ type: "sheep", ledger: l, coll: "mobs", rec: m, key: `${l.id}:${m.id}`, name: m.name, fieldId: m.fieldId || null, place: mobField(data, m).name, n: counts.get(m.id) || 0 });
      }
    } catch (e) { /* no access offline etc. */ }
  }
  return units;
}

/** Link (or unlink) a group/mob to a field. */
export function setUnitField(u, fieldId) {
  if (!canWrite(u.ledger.role, u.coll)) return false;
  updateRecord(u.ledger.id, u.coll, u.rec, { fieldId: fieldId || null });
  return true;
}

/** "42 cattle · 120 sheep" for a field's units. */
export function fieldHeadline(units) {
  const by = {}; for (const u of units) by[u.type] = (by[u.type] || 0) + u.n;
  return Object.entries(by).filter(([, n]) => n > 0).map(([t, n]) => headWord(t, n)).join(" · ");
}
