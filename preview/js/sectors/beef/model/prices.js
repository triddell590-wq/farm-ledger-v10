// Where Beef keeps £ (design/01 §15 + §15.2): ONLY in the finance collection, which Workers and
// Vet/Advisers cannot read. Sale and purchase records keep weights, grade, lot and buyer; the
// linked finance entry carries the copied lines with prices. Two finance docs are not money
// entries (kind "prices", skipped by every total): "beef-prices" (today's £/kg dead, meal £/t)
// and "v9-prices" (prices moved out of Tom's v9 animals/purchases by the migration).
export const MARKET_ID = "beef-prices";
export const V9_PRICES_ID = "v9-prices";
export const isEntry = (e) => e && !e.deleted && e.kind !== "prices";

/** Price book from finance records: sale lines and purchase prices by animal id, market prices. */
export function priceBook(finance = []) {
  const sale = new Map(); const bought = new Map(); const byPurchase = new Map(); let market = null; let v9 = null;
  for (const e of finance) {
    if (!e || e.deleted) continue;
    if (e.id === MARKET_ID) { market = e; continue; }
    if (e.id === V9_PRICES_ID) { v9 = e; continue; }
    if (e.kind === "revenue" && e.source === "sale") for (const l of e.lines || []) if (l.animalId) sale.set(l.animalId, { price: +l.price || 0, pricePerKg: +l.pricePerKg || null, financeId: e.id });
    if (e.kind === "expense" && e.purchaseId) {
      byPurchase.set(e.purchaseId, +e.amount || 0);
      for (const l of e.lines || []) if (l.animalId && +l.price) bought.set(l.animalId, +l.price);
    }
  }
  if (v9?.animals) for (const [id, k] of Object.entries(v9.animals)) if (+k.price && !bought.has(id)) bought.set(id, +k.price);
  if (v9?.purchases) for (const [id, k] of Object.entries(v9.purchases)) if (k.cost != null && !byPurchase.has(id)) byPurchase.set(id, +k.cost);
  return { sale, bought, byPurchase, market };
}

/** Fields that must never appear on a non-finance record (unit-tested). */
export const MONEY_KEYS = ["price", "pricePerKg", "total", "cost", "amount", "value", "perKgDead", "pricePerTonne"];
export function moneyKeysIn(obj, path = "") {
  const out = [];
  if (Array.isArray(obj)) obj.forEach((x, i) => out.push(...moneyKeysIn(x, `${path}[${i}]`)));
  else if (obj && typeof obj === "object" && !(obj instanceof Date)) for (const [k, v] of Object.entries(obj)) { if (MONEY_KEYS.includes(k) && v != null && v !== "") out.push(`${path}.${k}`); out.push(...moneyKeysIn(v, `${path}.${k}`)); }
  return out;
}
