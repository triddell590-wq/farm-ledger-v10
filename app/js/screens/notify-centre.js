// Notification centre (bell): everything late or due today across all my ledgers, grouped by
// ledger, from each sector's own alerts() and tasks() (services/duties.js). Tap → that screen.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { session } from "../services/session.js";
import { META } from "../sectors/meta.js";
import { longDate } from "../ui/format.js";
import { makeScreen, largeTitle, groupLabel, farmTabs, sectorTile, emptyState } from "./common.js";
import { refreshItems, myLedgers, localState, support } from "../services/notify.js";
import { groupByLedger, badgeCount } from "../services/notify-core.js";

const LEVEL_ICON = { late: "alert", due: "clock", info: "info" };
const LEVEL_WORD = { late: "Late", due: "Due", info: "" };

// A withdrawal is a period running, not a missed deadline: say so instead of "Late".
function tags(i) {
  const word = i.kind === "withdrawal" ? "Withdrawal" : LEVEL_WORD[i.level];
  const tone = i.kind === "withdrawal" ? "due" : i.level;
  if (!word && !i.legal) return "";
  return html`<div class="nc-tags">${word ? html`<span class="pill ${tone}">${word}</span>` : ""}${i.legal && i.kind !== "withdrawal" ? html`<span class="pill neutral">The law</span>` : ""}</div>`;
}
function itemRow(i) {
  return html`<a class="alert ${i.level} nc-item" href="${i.href}" data-level="${i.level}">
    <span class="a-icon">${raw(icon(LEVEL_ICON[i.level] || "info"))}</span>
    <div style="flex:1;min-width:0"><div class="a-title">${i.title}</div>
      ${i.body ? html`<div class="a-body">${i.body}</div>` : ""}
      ${tags(i)}</div>
    <span class="chev">${raw(icon("chevron"))}</span></a>`;
}

export default async function notifyCentre() {
  const body = el(html`<div>${largeTitle("Needs attention", longDate())}<div data-hint></div><div data-list><div class="card pad t-callout ink-2">Checking your ledgers…</div></div></div>`);
  const st = localState(); const sup = support();
  if (!st.on && sup.state !== "unsupported" && sup.state !== "denied") body.querySelector("[data-hint]").append(el(html`<a class="info-card" href="#/settings/notifications" style="margin-bottom:16px;text-decoration:none">${raw(icon("bell"))}<span><b>Get these on your phone</b> — a morning summary and a note when a legal job goes late. <span class="text-btn">Turn on ›</span></span></a>`));
  const list = body.querySelector("[data-list]");
  const paint = (items) => {
    const ledgers = myLedgers();
    const groups = groupByLedger(items, ledgers);
    if (!groups.length) { list.replaceChildren(el(emptyState({ iconName: "check", title: "Nothing needs doing", body: "Nothing is late or due today across your ledgers." }))); return; }
    const n = badgeCount(items);
    list.replaceChildren(el(html`<div>
      <p class="t-callout ink-2" data-count style="margin:-8px 0 8px">${n ? `${n} late or due` : "Nothing late or due"} · ${groups.length} ${groups.length === 1 ? "ledger" : "ledgers"}</p>
      ${groups.map((g) => {
        const urgent = g.items.filter((i) => i.level !== "info"); const info = g.items.filter((i) => i.level === "info");
        return html`<section class="section nc-group" data-ledger="${g.ledger.id}" data-sector="${g.ledger.type}">
          <a class="nc-head" href="#/l/${g.ledger.id}">${sectorTile(g.ledger.type)}<span class="main"><span class="primary">${g.ledger.name || META[g.ledger.type]?.short}</span><span class="secondary">${session.farms().length > 1 ? `${g.ledger.farmName || ""} · ` : ""}${urgent.length} late or due</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
          <div class="nc-items">${urgent.map(itemRow)}</div>
          ${info.length ? html`<details class="nc-info"><summary>${info.length} for your information</summary><div class="nc-items">${info.map(itemRow)}</div></details>` : ""}
        </section>`;
      })}</div>`));
  };
  refreshItems({ force: true }).then(paint).catch(() => list.replaceChildren(el(html`<div class="card pad t-callout ink-2">Couldn't check your ledgers just now. Pull down or open this again.</div>`)));
  return makeScreen({ body, title: "Needs attention", area: "farm", tab: "today", depth: 1, chrome: { tabs: farmTabs(), tab: "today" } });
}
