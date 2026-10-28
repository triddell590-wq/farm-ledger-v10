// Writes tests/rules-matrix.md from matrix.mjs (single source of truth).
import { writeFileSync } from "node:fs";
import { ACTIONS, EXPECTED, WHO } from "./matrix.mjs";

const head = ["Action", ...WHO.map((w) => w[0].toUpperCase() + w.slice(1))];
const rows = Object.entries(EXPECTED).map(([a, e]) => [ACTIONS[a].label + ` \`${a}\``, ...[...e].map((x) => (x === "A" ? "✅ allow" : "⛔ deny"))]);
const md = `# Security rules matrix — Farm Ledger 10

Generated from \`tests/rules/matrix.mjs\` by \`tests/rules/gen-matrix-md.mjs\`. Do not edit by hand.

Each row is one action; each column is who tries it on ledger **L1** (a Beef ledger on farm F1).
Owner, Manager, Worker, Viewer (shown to users as "Vet / Adviser"), Accountant are members of L1.
Stranger is signed in but not a member. Anon is not signed in.

Checked by: \`tests/rules/model.test.mjs\` (JS model of the rules, runs every build) and
\`tests/rules/emulator.test.mjs\` (the real \`firebase/firestore.rules\` in the Firestore emulator;
ready to run, blocked in the build sandbox because the emulator download is not allowed).

| ${head.join(" | ")} |
| ${head.map(() => "---").join(" | ")} |
${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}

Extra cases: Tom's UID may write \`boardFeed/{token}\` (Morning Board) ✅ and read the v9 \`farms/\` document ✅ (needed for migration).

Notes
- "Soft-delete" = setting \`deleted: true\`; records stay for inspections. Only owner and manager hard-delete.
- Records must be stamped \`createdBy\`/\`updatedBy\` = the writer, and \`createdBy\`/\`createdAt\` can never change.
- Accept-invite only works in one batch that creates the member doc with the invite's exact role **and** marks the invite used by the same person, before it expires.
- Photos have two kinds: on an ordinary record (\`money: false\`, seen by owner/manager/worker/viewer) and on a money record (\`money: true\`, seen by owner/manager/accountant). Whoever may write the parent may add or delete. Workers, viewers and accountants must filter lists on \`money\` (an unfiltered list is refused). Image chunks over 750,000 characters are refused.
- Ledger delete is allowed for the owner as a single write, but the app always deletes records → meta → private → invites → other members → ledger + own member doc (see \`services/ledgers.js deleteLedger\`), so nothing is orphaned.
`;
writeFileSync(new URL("../rules-matrix.md", import.meta.url), md);
console.log("wrote tests/rules-matrix.md:", rows.length, "actions x", WHO.length, "people");
