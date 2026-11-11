// Packer statement reader (design/14 §6.2): text from a photo (shared OCR) or pasted, e.g.
//   "XL 11,400 158 1,501.00" · "Large 98520 147p" · "Seconds 3,600 @ 40" · "Levy and transport -310.00"
// Returns { lines[{grade, eggs, ppd}], deductions[{label, amount}], paid, week } — the farmer checks it.
const GRADE = [["XL", /^(xl|x-?large|very large)\b/i], ["L", /^(l|large)\b/i], ["M", /^(m|medium)\b/i], ["S", /^(s|small)\b/i], ["Seconds", /^(seconds|2nds|cracks|cracked|dirties|outgrades?)\b/i]];
const nums = (s) => [...s.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((m) => +m[0].replace(/,/g, ""));

export function parseStatement(text) {
  const out = { lines: [], deductions: [], paid: null, week: null };
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    const wk = line.match(/\bw(?:ee)?k\.?\s*(\d{1,2})\b/i); if (wk && out.week == null) out.week = +wk[1];
    const g = GRADE.find(([, re]) => re.test(line));
    if (g) {
      const n = nums(line.replace(/^\S+\s*/, "")); if (!n.length) continue;
      const eggs = n.find((x) => x >= 30 && Number.isInteger(x)) ?? n[0];
      const rest = n.slice(n.indexOf(eggs) + 1); const ppd = rest.find((x) => x > 5 && x < 400) ?? null;
      if (!out.lines.some((l) => l.grade === g[0])) out.lines.push({ grade: g[0], eggs, ppd });
      continue;
    }
    if (/\b(levy|transport|haulage|deduct|charge|commission)/i.test(line)) { const n = nums(line); if (n.length) out.deductions.push({ label: line.replace(/[-£\d.,\s]+$/, "").trim() || "Deduction", amount: Math.abs(n[n.length - 1]) }); continue; }
    if (/\b(paid|net|total payment|amount due|to pay)\b/i.test(line)) { const n = nums(line); if (n.length) out.paid = Math.abs(n[n.length - 1]); }
  }
  return out;
}
