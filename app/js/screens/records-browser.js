// Ledger More → "Fix a mistake" (#/l/<lid>/more/records) and its "Recently deleted" view
// (#/l/<lid>/more/records/bin). Anything ever added to a ledger can be found here, opened,
// changed or deleted (ui/record-sheet.js), and brought back for 30 days. Rows are worded as a
// farmer would say them ("Death · Finisher 2 pen 3 · 1 finisher · tail bite"), newest first,
// with a "Recently added" list across every kind of record at the top (review B #2, A #8).
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { session } from "../services/session.js";
import { sectorModule } from "../sectors/ui.js";
import { collectionsFor } from "../sectors/registry.js";
import { canRead, canWrite } from "../core/policy.js";
import { shortDate } from "../core/dates.js";
import { loadAll } from "../services/linked.js";
import { makeLookup, recordTitle, kindWord, recordDay, createdMs, collHeading } from "../content/record-kinds.js";
import { openRecord, bringBack, ensureRecordCss, LEGAL, BIN_DAYS } from "../ui/record-sheet.js";
import { makeScreen, largeTitle, groupLabel, emptyState } from "./common.js";
import { ledgerTabs } from "./ledger.js";

const RECENT = 20, PER_GROUP = 60;
const asDate = (d) => (d instanceof Date ? d : d?.toDate ? d.toDate() : d ? new Date(d) : null);
// Bookkeeping the farmer never typed in: ticked jobs, the price settings doc.
const internal = (c, r) => (c === "tasks" && r.sourceRef) || (c === "finance" && r.kind === "prices");
export const collLabel = collHeading;

export default async function recordsBrowser({ params }) {
  ensureRecordCss();
  const ledger = session.ledger(params.lid);
  const bin = params.view === "bin";
  const mod = await sectorModule(ledger.type);
  const colls = collectionsFor(ledger.type).filter((c) => c !== "photos" && canRead(ledger.role, c) && canWrite(ledger.role, c));
  const title = bin ? "Recently deleted" : "Fix a mistake";
  const body = el(html`<div>
    <a class="back-link" href="#/l/${ledger.id}/more">${raw(icon("back"))}More</a>
    ${largeTitle(title, bin ? `Deleted records stay here for ${BIN_DAYS} days, then go for good.` : `Everything added to ${ledger.name}. Tap anything to see it, change it or delete it — the old version is kept.`)}
    ${bin ? "" : html`<div class="section"><div class="list"><a class="row" href="#/l/${ledger.id}/more/records/bin"><span class="tile neutral">${raw(icon("trash"))}</span><span class="main"><span class="primary">Recently deleted</span><span class="secondary">Bring back something deleted by mistake</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div></div>`}
    <div class="form-group rb-search" style="margin-top:16px"><div class="field"><label for="rb-q">Search</label><input id="rb-q" type="search" placeholder="Number, name, product…" autocomplete="off"></div></div>
    <div data-list><p class="hint" style="margin-top:16px">Loading…</p></div>
  </div>`);
  const box = body.querySelector("[data-list]"); const q = body.querySelector("#rb-q");
  let all = {}, L = null, rows = [];
  const load = async () => {
    const now = Date.now();
    all = await loadAll(ledger, colls); L = makeLookup(ledger.type, all);
    rows = [];
    for (const c of colls) for (const r of all[c] || []) {
      if (internal(c, r)) continue;
      if (bin ? !r.deleted : r.deleted) continue;
      if (bin) { const d = asDate(r.deletedAt); if (d && now - d.getTime() >= BIN_DAYS * 864e5) continue; }
      const title = recordTitle(ledger.type, c, r, L); const kind = kindWord(ledger.type, c, r);
      rows.push({ c, r, title, kind, rest: title.startsWith(kind + " · ") ? title.slice(kind.length + 3) : title === kind ? "" : title, day: recordDay(r), made: createdMs(r), del: asDate(r.deletedAt)?.getTime() || 0, search: `${title} ${collHeading(c)} ${r.tag || ""} ${(r.animalTags || []).join(" ")}`.toLowerCase() });
    }
    paint();
  };
  const rowHtml = (x) => {
    const same = bin && x.r.cascadeId ? rows.filter((y) => y !== x && y.r.cascadeId === x.r.cascadeId).length : 0;
    return html`<div class="row rb-row-wrap" style="padding:0">
      <button type="button" class="row no-lead rb-row" data-c="${x.c}" data-id="${x.r.id}" style="flex:1;min-width:0"><span class="main"><span class="primary"><span class="rb-kind">${x.kind}</span>${x.rest ? ` · ${x.rest}` : ""}</span>
        <span class="secondary">${[x.day ? shortDate(x.day) : "", LEGAL.has(x.c) ? "legal record" : "", same ? `deleted with ${same} more` : ""].filter(Boolean).join(" · ")}</span></span>${bin ? "" : html`<span class="chev">${raw(icon("chevron"))}</span>`}</button>
      ${bin ? html`<button type="button" class="rb-bring" data-bring data-c="${x.c}" data-id="${x.r.id}" style="margin-right:12px">Bring back</button>` : ""}</div>`;
  };
  const paint = () => {
    const term = q.value.trim().toLowerCase();
    const shown = term ? rows.filter((x) => x.search.includes(term)) : rows;
    if (!shown.length) { box.replaceChildren(el(emptyState({ iconName: bin ? "trash" : "records", title: bin ? "Nothing deleted" : term ? "Nothing matches" : "No records yet", body: bin ? `Anything you delete shows here for ${BIN_DAYS} days.` : "" }))); return; }
    const parts = [];
    if (bin) {
      const list = [...shown].sort((a, b) => b.del - a.del);
      parts.push(html`<div class="section">${groupLabel("Deleted, newest first", list.length)}<div class="list">${list.slice(0, 200).map(rowHtml)}</div></div>`);
    } else {
      if (!term) {
        const recent = [...shown].sort((a, b) => b.made - a.made).slice(0, RECENT);
        parts.push(html`<div class="section" data-recent>${groupLabel("Recently added")}<div class="list">${recent.map(rowHtml)}</div></div>`);
      }
      const byColl = new Map(); for (const x of shown) { if (!byColl.has(x.c)) byColl.set(x.c, []); byColl.get(x.c).push(x); }
      const groups = [...byColl.entries()].map(([c, list]) => ({ c, list: list.sort((a, b) => String(b.day).localeCompare(String(a.day)) || b.made - a.made) }))
        .sort((a, b) => Math.max(...b.list.map((x) => x.made)) - Math.max(...a.list.map((x) => x.made)));
      for (const g of groups) parts.push(html`<div class="section" data-coll="${g.c}">${groupLabel(collHeading(g.c), g.list.length)}<div class="list">${g.list.slice(0, PER_GROUP).map(rowHtml)}</div>
        ${g.list.length > PER_GROUP ? html`<p class="hint">Showing the newest ${PER_GROUP} — search to find older ones.</p>` : ""}</div>`);
    }
    box.replaceChildren(el(html`<div>${parts}</div>`));
  };
  q.addEventListener("input", paint);
  box.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-id]"); if (!b) return;
    const c = b.dataset.c; const r = (all[c] || []).find((x) => x.id === b.dataset.id); if (!r) return;
    if (b.hasAttribute("data-bring")) { bringBack({ ledger, coll: c, rec: r, all }); setTimeout(load, 120); return; }
    await openRecord({ ledger, coll: c, rec: r, all, onChange: () => setTimeout(load, 120) });
  });
  load();
  return makeScreen({ body, title, area: `ledger:${ledger.id}`, sector: ledger.type, depth: bin ? 3 : 2, chrome: { tabs: ledgerTabs(ledger, mod), tab: "more" } });
}
