// "Is this right?" (review A #2): shown before saving when a number looks odd (core/sanity.js).
// Never blocks: "Change" goes back to the form, "Yes, save" carries on.
import { html } from "../core/html.js";
import { el } from "./dom.js";
import { openSheet } from "./sheet.js";

/** issues: string[] (or a function returning them). Resolves true to save, false to go back. */
export function isThisRight(issues) {
  const list = [...new Set((typeof issues === "function" ? issues() : issues || []).filter(Boolean))];
  if (!list.length) return Promise.resolve(true);
  const shown = list.slice(0, 6);
  const b = el(html`<div data-sanity>
    <p class="sheet-title-sm">Is this right?</p>
    <ul class="sanity-list t-callout ink-2" style="margin:0 4px 16px;padding-left:20px;display:grid;gap:6px">${shown.map((t) => html`<li>${t}</li>`)}${list.length > shown.length ? html`<li>and ${list.length - shown.length} more</li>` : ""}</ul>
    <div class="btn-col"><button type="button" class="btn secondary" data-change>Change</button><button type="button" class="btn" data-yes>Yes, save</button></div>
  </div>`);
  const s = openSheet({ size: "small", body: b, label: "Is this right?", auto: true });
  b.querySelector("[data-yes]").onclick = () => s.close(true, { force: true });
  b.querySelector("[data-change]").onclick = () => s.close(false, { force: true });
  setTimeout(() => b.querySelector("[data-change]")?.focus({ preventScroll: true }), 40);
  return s.done.then((r) => r === true);
}
