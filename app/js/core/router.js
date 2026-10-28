// Hash router with screen transitions (relative URLs, so it works under /farm-ledger/ on
// GitHub Pages with no server rewrites). Routes: define(pattern, loader, opts).
//   loader(params) -> Promise<module>; module.default(ctx) -> Promise<Screen>
//   Screen = { el, title, area, tab, depth, chrome, sector, ledgerId, destroy?() }
//   area: 'auth' | 'farm' | 'ledger:<id>' — decides the transition kind:
//     different app area -> 'ledger'; same area deeper -> 'push', shallower -> 'pop',
//     same depth other tab -> 'tab'; anything involving auth screens -> 'fade'.
import { emit } from "./bus.js";

const routes = [];
let current = null; // { path, screen }
let stage = null;
let guard = null; // (path) -> redirect path | null
let onScreen = null;
const scrollMemo = new Map();
let navId = 0;

export function define(pattern, loader, opts = {}) { routes.push({ pattern, loader, opts }); }
export function setGuard(fn) { guard = fn; }
export function onScreenChange(fn) { onScreen = fn; }
export const currentPath = () => (location.hash.replace(/^#/, "") || "/");
export const currentScreen = () => current && current.screen;

export function go(path, { replace = false } = {}) {
  if (!path.startsWith("/")) path = "/" + path;
  const url = "#" + path;
  if (location.hash === url) { render(path); return; }
  if (replace) { history.replaceState(history.state, "", url); render(path); }
  else location.hash = url;
}
export function back(fallback = "/farm/today") {
  if (history.length > 1 && current && current.cameFromApp) history.back();
  else go(fallback, { replace: true });
}

function match(path) {
  const [p, q] = path.split("?");
  for (const r of routes) {
    const m = r.pattern.exec(p);
    if (m) return { route: r, params: { ...(m.groups || {}), query: Object.fromEntries(new URLSearchParams(q || "")) } };
  }
  return null;
}

export function kindBetween(a, b) {
  if (!a) return "fade";
  if (a.area === "auth" || b.area === "auth" || a.area !== b.area) return a.area === "auth" || b.area === "auth" ? "fade" : "ledger";
  if ((b.depth || 0) > (a.depth || 0)) return "push";
  if ((b.depth || 0) < (a.depth || 0)) return "pop";
  if (a.tab !== b.tab) return "tab";
  return "fade";
}

async function render(path) {
  const my = ++navId;
  if (guard) { const to = await guard(path); if (my !== navId) return; if (to && to !== path) { go(to, { replace: true }); return; } }
  const hit = match(path) || match("/404");
  if (!hit) return;
  let screen;
  try {
    const mod = await hit.route.loader(hit.params);
    if (my !== navId) return;
    screen = await mod.default({ params: hit.params, path });
  } catch (e) {
    console.error("screen failed", path, e);
    emit("router:error", { path, error: e });
    return;
  }
  if (my !== navId) { screen.destroy && screen.destroy(); return; }
  const prev = current;
  if (prev) scrollMemo.set(prev.path, window.scrollY);
  const kind = screen.transition || kindBetween(prev && prev.screen, screen);
  screen.el.classList.add("screen");
  screen.el.dataset.path = path;
  current = { path, screen, cameFromApp: !!prev };
  onScreen && onScreen(screen, prev && prev.screen, kind);
  const restore = kind === "pop" || kind === "tab" ? scrollMemo.get(path) || 0 : 0;
  const { transition } = await import("../ui/transition.js");
  const oldEl = prev ? prev.screen.el : stage.firstElementChild;
  await transition(stage, oldEl || null, screen.el, oldEl ? kind : "fade", { scrollTo: restore });
  if (prev && prev.screen.destroy) { try { prev.screen.destroy(); } catch (e) { console.error(e); } }
  screen.mounted && screen.mounted();
  emit("router:done", { path, kind });
}

export function start(stageEl) {
  stage = stageEl;
  addEventListener("hashchange", () => render(currentPath()));
  return render(currentPath());
}
/** Re-render the current route in place (after a role change etc.). */
export function refresh() { if (current) { const p = current.path; current = { ...current, path: p }; render(p); } }
