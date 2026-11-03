// The one big "start here" card a sector home shows until it has animals or houses (review A #19,
// B #6): no rows of zero tiles, just what to do first. Each sector home calls startHome() at the
// top of its paint and wires the buttons it passes (data-start="<id>").
import { html, raw } from "../core/html.js";
import { illustration } from "./illustrations.js";
import { WORDS } from "../sectors/meta.js";
import { largeTitle } from "../screens/common.js";

/**
 * type: sector key; title/context: the page's own large title; actions: [{ id, label, href?, primary? }]
 * (empty for people who can't add); note: an extra line (e.g. "You said about 120 sows").
 */
export function startHome({ type, title, context = "", actions = [], note = "" }) {
  const w = WORDS[type] || {};
  return html`<div data-start-home="${type}">
    ${largeTitle(title, context)}
    <div class="start-card card" data-sector="${type}">
      <div class="start-illus">${raw(illustration(type, 96))}</div>
      <h2 class="t-title">${w.start || "Get started"}</h2>
      <p class="t-body ink-2">${w.startBody || ""}</p>
      ${note ? html`<p class="t-callout ink-2">${note}</p>` : ""}
      ${actions.length ? html`<div class="btn-col">${actions.map((a, i) => a.href
        ? html`<a class="btn${a.primary || i === 0 ? "" : " secondary"}" href="${a.href}" data-start="${a.id}">${a.label}</a>`
        : html`<button type="button" class="btn${a.primary || i === 0 ? "" : " secondary"}" data-start="${a.id}" ${raw(a.attr || "")}>${a.label}</button>`)}</div>`
        : html`<p class="t-callout ink-2">The owner or a manager adds these. Once they're in, everything shows here.</p>`}
    </div>
  </div>`;
}
