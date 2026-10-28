// Safe HTML templating: html`<p>${userText}</p>` escapes values; raw() opts out.
const RAW = Symbol("raw");
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function raw(s) { return { [RAW]: true, s: String(s) }; }
function part(v) {
  if (v == null || v === false) return "";
  if (Array.isArray(v)) return v.map(part).join("");
  if (typeof v === "object" && v[RAW]) return v.s;
  return esc(v);
}
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return raw(out);
}
export function toString(t) { return t && t[RAW] ? t.s : esc(t); }
