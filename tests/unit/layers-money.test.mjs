// Layers money rule (01-platform §15): £ values live only in `finance`. Every Layers write goes
// through sectors/layers/actions.js, so scan each addRecord/updateRecord there: a write to any
// collection other than finance must not carry a money field.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../app/js/sectors/layers/actions.js", import.meta.url), "utf8");
const MONEY = /\b(amount|price|prices|ppd|paid|cost|pulletCost|pricePerT|feedPerTonne|deductions|total£|avgPpd)\s*:/;

/** Each write call with its collection and the text of its arguments (balanced brackets). */
function writes() {
  const out = []; const re = /(addRecord|updateRecord)\(snap\.lid, "([a-zA-Z]+)"/g; let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, depth = 1; const start = i;
    for (; i < src.length && depth; i++) { if (src[i] === "(") depth++; else if (src[i] === ")") depth--; }
    out.push({ coll: m[2], text: src.slice(start, i) });
  }
  return out;
}

test("layers actions: no £ field written outside finance", () => {
  const all = writes(); assert.ok(all.length > 20, "found the writes");
  const bad = all.filter((w) => w.coll !== "finance" && MONEY.test(w.text));
  assert.deepEqual(bad.map((w) => `${w.coll}: ${w.text.slice(0, 80)}`), []);
  assert.ok(all.some((w) => w.coll === "finance" && /source: "packerStatement"/.test(w.text)), "statement money goes to finance");
});

test("the egg price profile is a finance doc, never meta", () => {
  assert.match(src, /savePriceProfile[\s\S]*?addRecord\(snap\.lid, "finance", doc, PRICE_PROFILE_ID\)/);
  assert.doesNotMatch(src, /setMeta\([^)]*prices/);
});
