// Release clean-up guard (review A #6, #7, #11, #38): no internal notes, placeholders or dead
// "Coming soon" text in anything a farmer can read. Scans every file under app/js with code
// comments removed, so notes for developers stay allowed in comments. Legal drafts may keep
// their draft markers (content/legal-text.js) until the final wording is agreed.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../app/js/", import.meta.url));
const BANNED = [
  [/\bResearch [A-C]\b/, "internal research note"],
  [/verification pass/i, "internal research note"],
  [/to be set up/i, "unfinished: 'to be set up'"],
  [/will go here/i, "unfinished: 'will go here'"],
  [/coming soon/i, "dead 'Coming soon' row"],
  [/\bTODO\b|\bFIXME\b|\bXXX\b/, "developer marker"],
  [/…\s*days\s*\(limit\s*…\)|\(limit …\)|limit \.\.\.\)/, "unfilled template"],
  [/\bby in \d|\bby in \$\{/, "'by in N days' wording"],
  [/lorem ipsum/i, "placeholder text"],
  [/confirm not delayed|could not confirm/i, "internal research note"],
];
// [file (relative to app/js), pattern source] pairs that are allowed on purpose.
const ALLOW = [
  ["content/legal-text.js", "to be set up"],   // legal drafts: contact addresses are chosen with the lawyer
];

function files(dir) {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith(".js") ? [p] : []; });
}
/** Code without comments: block comments, whole-line // comments and trailing // comments after code. */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n").map((l) => (/^\s*\/\//.test(l) ? "" : l.replace(/([;,)}\]{])\s+\/\/ .*$/, "$1"))).join("\n");
}

test("no unfinished or internal text in user-facing strings", () => {
  const hits = [];
  for (const f of files(ROOT)) {
    const rel = relative(ROOT, f).split("\\").join("/");
    const lines = stripComments(readFileSync(f, "utf8")).split("\n");
    lines.forEach((line, i) => {
      for (const [re, why] of BANNED) {
        const m = re.exec(line); if (!m) continue;
        if (ALLOW.some(([af, pat]) => af === rel && new RegExp(pat, "i").test(m[0]))) continue;
        hits.push(`${rel}:${i + 1} ${why}: …${line.slice(Math.max(0, m.index - 40), m.index + 60).trim()}…`);
      }
    });
  }
  assert.deepEqual(hits, [], "\n" + hits.join("\n"));
});

test("the scanner itself: comments are ignored, strings are not", () => {
  const s = stripComments('// Research B said so\nconst a = "ok"; // TODO later\n/* Coming soon */\nconst b = "Coming soon";');
  assert.doesNotMatch(s.split("\n").slice(0, 3).join("\n"), /Research|TODO|Coming/);
  assert.match(s, /const b = "Coming soon"/);
});
