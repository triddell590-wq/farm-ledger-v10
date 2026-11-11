// Small DOM helpers. el(html`...`) turns a safe template into an element.
import { toString } from "../core/html.js";

export function el(tpl) {
  const t = document.createElement("template");
  t.innerHTML = toString(tpl).trim();
  return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
/** Delegated click: on(root, '[data-act=save]', fn) */
export function on(root, sel, fn, evt = "click") {
  const h = (e) => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); };
  root.addEventListener(evt, h);
  return () => root.removeEventListener(evt, h);
}
export function replace(node, tpl) { const n = el(tpl); node.replaceChildren(n); return n; }
export const reduceMotion = () => document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
export function vibrate(ms = 8) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* not supported */ } }
