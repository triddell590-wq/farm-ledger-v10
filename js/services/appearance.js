// Per-phone appearance settings (design/00 §3.5, §8.8): theme, high visibility, reduce motion.
// Stored in localStorage (this phone only), applied as classes/attributes on <html>.
const KEY = "fl10-appearance";
const DEF = { theme: "auto", hiVis: false, reduceMotion: false };
export function getAppearance() { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (e) { return { ...DEF }; } }
export function setAppearance(p) { const a = { ...getAppearance(), ...p }; try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* blocked */ } applyAppearance(a); return a; }
export function applyAppearance(a = getAppearance()) {
  const r = document.documentElement;
  if (a.theme === "light" || a.theme === "dark") r.dataset.theme = a.theme; else delete r.dataset.theme;
  r.classList.toggle("hi-vis", !!a.hiVis);
  r.classList.toggle("reduce-motion", !!a.reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches);
  const dark = a.theme === "dark" || (a.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? "#121714" : "#ECEFE8";
}
