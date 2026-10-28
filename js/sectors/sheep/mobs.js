// Sheep → Mobs (design/11 §5.1): mob cards with count, field, last dose, lame %; rams; the
// optional individual sheep (EID) are reached inside a mob or by searching a tag.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { canWrite } from "../../core/policy.js";
import { plural } from "../../ui/format.js";
import { largeTitle, emptyState } from "../../screens/common.js";
import { liveScreen } from "./screen.js";
import { mobRow, short, groupChip } from "./ui.js";
import { activeMobs, ramSummary } from "./model/mobs.js";
import { doses, lastLame, mobWithdrawal, fecDue } from "./model/health.js";

export function mobLines(snap, m) {
  const { data, today, cy } = snap; const out = [];
  if (m.class === "rams") { const r = ramSummary(data); out.push(`${r.working} working · ${r.resting} resting${r.lastMot ? ` · MOT ✓ ${short(r.lastMot)}` : ""}`); return out; }
  const tally = data.events.filter((e) => e.kind === "raddle" && e.mobId === m.id && e.date >= cy.ramsIn && e.date < cy.nextRamsIn);
  if (tally.length && snap.stage.stage !== "weaning") { const by = {}; tally.forEach((e) => (by[e.counts.colour] = (by[e.counts.colour] || 0) + (+e.counts.newlyMarked || 0))); out.push(Object.entries(by).map(([c, n]) => `${c} ${n}`).join(" / ")); }
  const w = mobWithdrawal(data, m.id, today); const d = doses(data, m.id)[0]; const l = lastLame(data, m.id);
  const health = [w ? `Withdrawal to ${short(w.until)}` : d ? `Dosed ${short(d.date)}${d.wormerGroup ? ` (${d.wormerColour}${d.productName ? ", " + d.productName : ""})` : d.productName ? ` (${d.productName})` : ""}` : null, l ? `lame ${l.pct}%` : null, fecDue(data, m.id, today) && !["rams"].includes(m.class) ? "FEC due" : null].filter(Boolean).join(" · ");
  if (health) out.push(health);
  return out;
}

export default async function mobs(ctx) {
  return liveScreen(ctx, { title: "Mobs", tab: "mobs", depth: 0, paint: (snap) => {
    const t = snap.totals; const list = activeMobs(snap.data); const write = canWrite(snap.role, "mobs");
    const closed = (snap.data.mobs || []).filter((m) => m.active === false);
    const ctxLine = `${plural(t.ewes, "ewe")} · ${plural(t.rams, "ram")} · ${plural(t.eweLambs, "ewe lamb")} · ${plural(t.lambs, "lamb")}${t.goats ? " · " + plural(t.goats, "goat") : ""}`;
    return html`<div>${largeTitle("Mobs", ctxLine)}
      ${write && list.length ? html`<div style="display:flex;justify-content:flex-end;margin-top:-4px"><button type="button" class="text-btn" data-flow="newMob">${raw(icon("plus"))} New mob</button></div>` : ""}
      <div class="field search-field card" style="display:flex;align-items:center;gap:8px;padding:0 14px;margin:8px 0 12px">${raw(icon("search"))}<input type="search" placeholder="Find a sheep: tag or last 5 digits" aria-label="Find a sheep by tag" data-q style="flex:1;border:0;background:transparent;font:inherit;min-height:48px;color:var(--ink);outline:none"></div><div data-hits></div>
      ${list.length ? html`<div class="list">${list.map((m) => mobRow(snap, m, { lines: mobLines(snap, m) }))}</div>`
        : emptyState({ sector: "sheep", title: "No sheep yet", body: "Start with your mobs — how many ewes, rams and lambs and where they are. Add tags later if you use EID.", action: write ? "Add a mob" : null, actAttr: 'data-flow="newMob"' })}
      <p class="foot-note">Counts change with lambing, tagging, deaths, sales and moves. Individual sheep appear inside a mob when you use EID.</p>
      ${closed.length ? html`<details class="card pad"><summary class="t-strong">Closed mobs (${closed.length})</summary><div class="list" style="margin-top:8px">${closed.map((m) => html`<a class="row no-lead" href="#/l/${snap.lid}/mob/${m.id}"><span class="main"><span class="primary">${m.name}</span><span class="secondary">merged or emptied</span></span></a>`)}</div></details>` : ""}</div>`;
  }, after: (node, snap) => {
    const q = node.querySelector("[data-q]"); const hits = node.querySelector("[data-hits]");
    q.oninput = () => { const s = q.value.replace(/\s+/g, "").toUpperCase(); if (s.length < 3) { hits.replaceChildren(); return; }
      const found = (snap.data.sheep || []).filter((x) => String(x.tag || "").replace(/\s+/g, "").toUpperCase().includes(s) || String(x.eid || "").includes(s)).slice(0, 20);
      hits.replaceChildren(el(html`<div class="list" style="margin-bottom:12px">${found.length ? found.map((x) => html`<a class="row no-lead" href="#/l/${snap.lid}/sheep/${x.id}"><span class="main"><span class="primary">${x.tag || x.eid}</span><span class="secondary">${[x.breed, x.birthYear, snap.data.mobs.find((m) => m.id === x.mobId)?.name].filter(Boolean).join(" · ")}</span></span></a>`) : html`<p class="hint" style="padding:12px 16px;margin:0">No individual sheep with that tag. Sheep only have their own record if tagged individually (EID).</p>`}</div>`)); };
  } });
}
export { groupChip };
