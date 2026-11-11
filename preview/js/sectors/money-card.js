// The margin card on every ledger's Today (Tom, 10 Nov): the figures that say whether the stock is
// paying — beef feed cost a head and margin over feed, sheep gross margin a ewe, dairy margin over
// purchased feed, pigs margin a pig, layers feed a dozen and margin a bird, broilers income a m² —
// one tap from the Money screen that explains them. Each sector works out its own lines; this only
// draws them the same way everywhere. Only shown to people who can see the money.
import { html, raw } from "../core/html.js";
import { icon } from "../ui/icons.js";

/** card = { title, href, lines: [[label, value, tone?]], note?, open? } — tone: "ok" | "late" | "due". */
export function moneyCard(card) {
  if (!card || !card.lines || !card.lines.length) return "";
  return html`<div class="section"><a class="card pad money-card" href="${card.href}">
    <span class="mc-label">${card.title}</span>
    ${card.lines.map(([label, value, tone]) => html`<span class="mc-line"><span>${label}</span><b class="${tone ? `${tone}-ink` : ""}">${value}</b></span>`)}
    ${card.note ? html`<span class="mc-note">${card.note}</span>` : ""}
    <span class="mc-open">${card.open || "See the money"}${raw(icon("chevron"))}</span></a></div>`;
}
/** A card asking for the one thing missing (a price, a statement) before figures can show. */
export function moneyPrompt(title, text, href) {
  return html`<div class="section"><a class="card pad money-card" href="${href}"><span class="mc-label">${title}</span><span class="mc-note">${text}</span><span class="mc-open">Add it${raw(icon("chevron"))}</span></a></div>`;
}
