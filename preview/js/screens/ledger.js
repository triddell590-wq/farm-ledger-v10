// A ledger: #/l/<lid>[/<tab>|/<deeper route>]. Tabs and screens come from the sector module
// (sectors/<type>/ or the generic placeholder). The More tab always ends with the platform rows:
// people on this ledger, ledger settings, leave ledger (design/01 §8.2).
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { session } from "../services/session.js";
import { sectorModule } from "../sectors/ui.js";
import { sectorName } from "../sectors/registry.js";
import { canEditLedger } from "../core/policy.js";
import { leaveLedger } from "../services/members.js";
import { confirmSheet } from "../ui/sheet.js";
import { toast } from "../ui/toast.js";
import { go, shownScreen } from "../core/router.js";
import { makeScreen, largeTitle, groupLabel, emptyState } from "./common.js";
import { ROLE_DISPLAY } from "./roles.js";
import { WORDS } from "../sectors/meta.js";
import { toolsHere, toolStrip, toolCameFrom } from "../sectors/tool-links.js";

// Tools, and the pages tools open (beef Feed & silage, dairy Slurry, pigs mg/PCU), whose back link
// returns to wherever they were opened from.
const TOOL_PAGE = /^(tools\/[a-z-]+|feed|slurry|emb)$/;
/** The screen being left, as a back link — if it's in this ledger and isn't this page. */
function cameFrom(lid, rest) {
  const prev = shownScreen(); if (!prev || !prev.path) return null;
  const p = prev.path.split("?")[0]; const m = p.match(/^\/l\/([^/]+)(?:\/(.*))?$/);
  if (!m || m[1] !== lid || (m[2] || "") === rest) return null;
  return { href: `#${p}`, label: prev.title || "Back" };
}

export function ledgerTabs(ledger, mod) {
  return mod.tabs.filter((t) => !t.roles || t.roles.includes(ledger.role)).map((t) => ({ ...t, href: `#/l/${ledger.id}/${t.id}` }));
}

export default async function ledgerScreen({ params }) {
  const ledger = session.ledger(params.lid);
  if (!ledger || ledger.type === "farm") {
    const body = el(html`<div>${largeTitle("Not found")}${emptyState({ iconName: "lock", title: "You can't open this", body: "It may have been deleted, or you were removed from it.", action: "Go to your farm", href: "#/farm/today" })}</div>`);
    return makeScreen({ body, title: "Not found", area: "farm", depth: 1, chrome: { tabs: null } });
  }
  session.setFarm(ledger.farmId);
  const mod = await sectorModule(ledger.type);
  const tabs = ledgerTabs(ledger, mod);
  const rest = params.rest || "";
  let s;
  const tab = tabs.find((t) => t.id === rest) || (!rest ? tabs[0] : null);
  // `where` tells the + button which screen it was tapped on (tab id or deeper route).
  const ctx = { ledger, role: ledger.role, params, mod, where: rest || (tab ? tab.id : "") };
  if (tab && tab.id === "more") s = await moreTab(ledger, mod, ctx);
  else if (tab) s = await mod.screen(tab.id, ctx);
  else {
    const r = (mod.routes || []).find((x) => x.pattern.test(rest));
    if (!r) { go(`/l/${ledger.id}`, { replace: true }); s = await mod.screen(tabs[0].id, ctx); }
    else s = await r.load({ ...ctx, match: rest.match(r.pattern) });
  }
  const isTab = !!tab;
  const screen = makeScreen({
    body: s.el, title: s.title || (tab ? tab.label : ""), area: `ledger:${ledger.id}`, tab: isTab ? tab.id : s.tab || null, depth: isTab ? 0 : s.depth || 1,
    sector: ledger.type, destroy: s.destroy, mounted: s.mounted,
    chrome: { tabs, tab: isTab ? tab.id : s.tab || null, fab: s.fab || (isTab && tab.id !== "more" && mod.fab ? () => mod.fab(ctx) : null), compactTitle: s.title || (tab && tab.label) },
  });
  // "Tools for this": the More tools that belong on this screen (Tom, 5 Nov). Under the page, so a
  // screen that redraws itself doesn't wipe it.
  if (!(tab && tab.id === "more") && !/^tools(\/|$)/.test(rest)) {
    const where = rest || (tab ? tab.id : "");
    const strip = toolStrip(ledger.id, where, s.title || (tab && tab.label) || "Back", toolsHere(ledger.type, where, ledger.role));
    if (strip) screen.page.appendChild(strip);
  }
  if (TOOL_PAGE.test(rest)) {
    // a tool goes back to the page it was opened from (Tom, 10 Nov), whichever way it was opened
    const came = toolCameFrom(ctx) || cameFrom(ledger.id, rest);
    if (came) {
      const fix = () => { const b = screen.page.querySelector(".back-link"); if (b && b.getAttribute("href") !== came.href) { b.setAttribute("href", came.href); b.lastChild.textContent = came.label; } };
      fix(); // and again whenever the page redraws itself (Feed & silage does on every change)
      const mo = new MutationObserver(fix); mo.observe(screen.page, { childList: true, subtree: true });
      const d = screen.destroy; screen.destroy = () => { mo.disconnect(); d && d(); };
    }
  }
  return screen;
}

async function moreTab(ledger, mod, ctx) {
  const extra = mod.moreRows ? await mod.moreRows(ctx) : [];
  const owner = ledger.role === "owner";
  const W = WORDS[ledger.type] || { noun: "herd", settings: "Settings" };
  const body = el(html`<div>
    ${largeTitle("More", `${ledger.name} · ${ROLE_DISPLAY[ledger.role]}`)}
    ${extra.length ? html`<div class="list">${extra.map((r) => html`<a class="row" href="${r.href}"><span class="tile">${raw(icon(r.icon))}</span><span class="main"><span class="primary">${r.label}</span>${r.sub ? html`<span class="secondary">${r.sub}</span>` : ""}</span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div>` : ""}
    <div class="section">${groupLabel(ledger.name)}
    <div class="list">
      <a class="row" href="#/l/${ledger.id}/more/people"><span class="tile neutral">${raw(icon("people"))}</span><span class="main"><span class="primary">People on this ${W.noun}</span><span class="secondary">Who can open ${ledger.name}, and what they can do</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
      <a class="row" href="#/l/${ledger.id}/more/photos"><span class="tile neutral">${raw(icon("camera"))}</span><span class="main"><span class="primary">Photos</span><span class="secondary">${ledger.role === "accountant" ? "Photos on money records" : "Every photo on these records"}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
      ${ledger.role !== "viewer" ? html`<a class="row" href="#/l/${ledger.id}/more/records"><span class="tile neutral">${raw(icon("edit"))}</span><span class="main"><span class="primary">Fix a mistake</span><span class="secondary">Edit, delete or bring back records</span></span><span class="chev">${raw(icon("chevron"))}</span></a>` : ""}
      <a class="row" href="#/l/${ledger.id}/more/settings"><span class="tile neutral">${raw(icon("settings"))}</span><span class="main"><span class="primary">${W.settings}</span><span class="secondary">${canEditLedger(ledger.role) ? "Name, official numbers, targets, reminders" : "See the details"}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
      ${owner ? "" : html`<button type="button" class="row destructive" data-leave><span class="tile late">${raw(icon("logout"))}</span><span class="main"><span class="primary">Leave ${ledger.name}</span></span></button>`}
    </div></div>
    <div class="section"><div class="list"><a class="row" href="#/settings"><span class="tile neutral">${raw(icon("user"))}</span><span class="main"><span class="primary">Account and settings</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div></div>
  </div>`);
  const lv = body.querySelector("[data-leave]");
  if (lv) lv.onclick = async () => {
    if (!(await confirmSheet({ title: `Leave ${ledger.name}?`, body: "You'll lose access straight away. Records you made stay, with your name on them.", confirm: "Leave", danger: true }))) return;
    try { await leaveLedger(ledger.id); await session.load(true); toast(`You've left ${ledger.name}`); go("/farm/today", { replace: true }); }
    catch (e) { toast(navigator.onLine ? "Couldn't leave. Try again." : "Leaving needs a signal."); }
  };
  return { el: body, title: "More" };
}
export { sectorName };
