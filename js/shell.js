// The persistent chrome around screens: top bar (accent edge, ledger rail, sync pill, compact
// title), bottom tab bar with sliding pill, and the FAB. Screens describe what they need:
//   screen.chrome = { rail: bool, tabs: [{id,label,icon,href}] | null, tab: id, fab: fn|null, compactTitle }
//   screen.sector = 'beef' | ... | null (accent);  screen.area = 'farm' | 'ledger:<id>' | 'auth'
import { html, raw } from "./core/html.js";
import { el, reduceMotion } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { session } from "./services/session.js";
import { on as onBus } from "./core/bus.js";
import { sectorName } from "./sectors/registry.js";
import { META } from "./sectors/meta.js";
import { canEditLedger } from "./core/policy.js";
import { openSyncSheet, syncLabel } from "./screens/sync-sheet.js";
import { openFarmPicker } from "./screens/farm-picker.js";

let topbar, rail, syncPill, compact, tabbar, fab, app;
let lastScreen = null;

export function mountShell(appEl) {
  app = appEl;
  topbar = el(html`<header class="topbar" hidden>
    <div class="topbar-in">
      <nav class="rail" aria-label="Farm and ledgers"></nav>
      <a class="bell" href="#/notifications" aria-label="Needs attention">${raw(icon("bell"))}<span class="bell-count" hidden></span></a>
      <button type="button" class="sync" data-state="ok" aria-label="Sync status"><span class="dot"></span><span class="lbl">Synced</span></button>
    </div>
    <div class="compact-bar" aria-hidden="true"><span></span></div>
  </header>`);
  rail = topbar.querySelector(".rail"); syncPill = topbar.querySelector(".sync"); compact = topbar.querySelector(".compact-bar span");
  tabbar = el(html`<nav class="tabbar" role="tablist" aria-label="Sections" hidden><span class="tab-pill" aria-hidden="true"></span></nav>`);
  fab = el(html`<button type="button" class="fab" aria-label="Add" hidden>${raw(icon("plus", { size: 28 }))}</button>`);
  app.prepend(topbar);
  app.append(tabbar, fab);
  syncPill.addEventListener("click", () => openSyncSheet());
  fab.addEventListener("click", () => { if (lastScreen && lastScreen.chrome && lastScreen.chrome.fab) { fab.classList.add("open"); Promise.resolve(lastScreen.chrome.fab()).finally(() => fab.classList.remove("open")); } });
  tabbar.addEventListener("click", (e) => {
    const t = e.target.closest(".tab"); if (!t) return;
    if (t.getAttribute("aria-selected") === "true") { window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" }); e.preventDefault(); }
  });
  rail.addEventListener("click", (e) => {
    const farm = e.target.closest("[data-farm-pill]");
    if (farm && lastScreen && lastScreen.area === "farm" && session.farms().length > 1) { e.preventDefault(); openFarmPicker(); }
  });
  addEventListener("scroll", onScroll, { passive: true });
  onBus("sync:state", paintSync);
  onBus("session:ledgers", () => lastScreen && paintRail(lastScreen));
  onBus("session:farm", () => lastScreen && paintRail(lastScreen));
  onBus("notify:items", paintBell); // bell count: late + due across all my ledgers (services/notify.js)
  paintSync();
}

function paintBell(items) {
  const b = topbar.querySelector(".bell"); const c = b.querySelector(".bell-count");
  const n = (items || []).filter((i) => i.level === "late" || i.level === "due").length;
  const late = (items || []).some((i) => i.level === "late" && i.legal);
  c.hidden = !n; c.textContent = n > 99 ? "99+" : String(n); c.classList.toggle("late", late);
  b.setAttribute("aria-label", n ? `Needs attention: ${n}` : "Needs attention: nothing due");
}
function onScroll() { topbar.classList.toggle("collapsed", window.scrollY > 44); }

export function paintSync(state) {
  const s = syncLabel(state);
  syncPill.dataset.state = s.state; syncPill.querySelector(".lbl").textContent = s.label;
  syncPill.setAttribute("aria-label", "Sync status: " + s.label);
  if (s.state === "ok" && syncPill.dataset.prev && syncPill.dataset.prev !== "ok" && !reduceMotion()) { syncPill.classList.remove("pulse"); void syncPill.offsetWidth; syncPill.classList.add("pulse"); }
  syncPill.dataset.prev = s.state;
}

function paintRail(screen) {
  const farm = session.farm();
  const ledgers = session.sectorLedgers();
  const cur = screen.area && screen.area.startsWith("ledger:") ? screen.area.slice(7) : null;
  const multiFarm = session.farms().length > 1;
  const canAdd = farm && (farm.space ? canEditLedger(farm.space.role) : ledgers.some((l) => l.role === "owner"));
  rail.replaceChildren(el(html`<div style="display:contents">
    <a class="rail-pill" data-farm-pill href="#/farm/today" ${raw(screen.area === "farm" ? 'aria-current="page"' : "")}>
      <span class="tile neutral">${raw(icon("farm", { size: 20 }))}</span>Farm${multiFarm ? raw(icon("down", { size: 16 })) : ""}</a>
    ${ledgers.map((l) => html`<a class="rail-pill" data-sector="${l.type}" href="#/l/${l.id}" ${raw(l.id === cur ? 'aria-current="page"' : "")}>
      <span class="tile">${raw(icon(l.type, { size: 20 }))}</span>${railName(l, ledgers)}</a>`)}
    ${canAdd ? html`<a class="rail-add" href="#/add-ledger" aria-label="Add a ledger">${raw(icon("plus"))}</a>` : ""}
  </div>`));
  const sel = rail.querySelector("[aria-current=page]");
  if (sel) sel.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
}
function railName(l, all) {
  const same = all.filter((x) => x.type === l.type).length > 1;
  const short = META[l.type]?.short || sectorName(l.type);
  if (!same) return l.name && l.name !== sectorName(l.type) && l.name !== short ? l.name : short;
  return l.name || short;
}

function paintTabs(screen) {
  const tabs = screen.chrome && screen.chrome.tabs;
  tabbar.hidden = !tabs;
  if (!tabs) return;
  const key = tabs.map((t) => t.id + t.label + t.href).join("|");
  if (tabbar.dataset.key !== key) {
    const fresh = tabbar.dataset.key == null;
    tabbar.querySelectorAll(".tab").forEach((t) => t.remove());
    tabs.forEach((t) => tabbar.append(el(html`<a class="tab" role="tab" href="${t.href}" data-tab="${t.id}" aria-selected="false">${raw(icon(t.icon))}<span>${t.label}</span></a>`)));
    if (!fresh && !reduceMotion()) tabbar.querySelectorAll(".tab").forEach((t) => t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240 }));
    tabbar.dataset.key = key;
  }
  tabbar.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === screen.chrome.tab)));
  requestAnimationFrame(() => placePill());
}
function placePill() {
  const sel = tabbar.querySelector(".tab[aria-selected=true]"); const pill = tabbar.querySelector(".tab-pill");
  if (!sel) { pill.style.opacity = 0; return; }
  pill.style.opacity = 1;
  const w = Math.min(sel.offsetWidth - 8, Math.max(52, sel.querySelector("svg").getBoundingClientRect().width + 28));
  pill.style.width = w + "px";
  pill.style.transform = `translateX(${sel.offsetLeft + (sel.offsetWidth - w) / 2}px)`;
}
addEventListener("resize", () => tabbar && !tabbar.hidden && placePill());

/** Called by the router for every new screen, before the transition starts. */
export function updateShell(screen) {
  lastScreen = screen;
  const chrome = screen.chrome || {};
  const isApp = screen.area !== "auth";
  topbar.hidden = !isApp || chrome.rail === false;
  app.classList.toggle("side", isApp && matchMedia("(min-width:1024px)").matches);
  if (screen.sector) app.dataset.sector = screen.sector; else delete app.dataset.sector;
  topbar.classList.toggle("no-edge", !screen.sector);
  topbar.classList.toggle("no-compact", !chrome.compactTitle);
  compact.textContent = chrome.compactTitle || "";
  if (!topbar.hidden) paintRail(screen);
  paintTabs(screen);
  fab.hidden = !chrome.fab;
  screen.el.classList.toggle("no-chrome", !chrome.tabs);
  onScroll();
}
