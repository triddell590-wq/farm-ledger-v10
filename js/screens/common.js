// Shared bits for platform screens: screen factory, large title, farm tabs, empty state.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { illustration } from "../ui/illustrations.js";
import { session } from "../services/session.js";

/** Build a Screen object for the router. */
export function makeScreen({ body, title = "", area = "farm", tab = null, depth = 0, chrome = {}, sector = null, destroy, mounted, transition, remember }) {
  const node = document.createElement("section");
  node.className = "screen";
  const page = document.createElement("div"); page.className = "page";
  if (body) page.appendChild(body instanceof Node ? body : el(body));
  node.appendChild(page);
  if (title) document.title = `${title} · Farm Ledger`;
  return { el: node, page, title, area, tab, depth, chrome: { compactTitle: title, ...chrome }, sector, destroy, mounted, transition, remember };
}

export function largeTitle(title, context = "") {
  return html`<div class="large-title"><h1>${title}</h1>${context ? html`<p class="context">${context}</p>` : ""}</div>`;
}
export function backLink(href, label = "Back") {
  return html`<a class="back-link" href="${href}">${raw(icon("back"))}${label}</a>`;
}
export function groupLabel(text, right = "") { return html`<h2 class="group-label"><span>${text}</span>${right ? html`<span>${right}</span>` : ""}</h2>`; }

/** Overview tab bar: Today · Money · Map · People · More, filtered by what the person can see. */
export function farmTabs() {
  const farm = session.farm();
  const roles = new Set((farm ? [...farm.ledgers, farm.space].filter(Boolean) : []).map((l) => l.role));
  const money = ["owner", "manager", "accountant"].some((r) => roles.has(r));
  const ops = ["owner", "manager", "worker", "viewer"].some((r) => roles.has(r));
  const people = ["owner", "manager"].some((r) => roles.has(r));
  return [
    { id: "today", label: "Today", icon: "today", href: "#/farm/today" },
    money && { id: "money", label: "Money", icon: "money", href: "#/farm/money" },
    ops && { id: "map", label: "Map", icon: "map", href: "#/farm/map" },
    people && { id: "people", label: "People", icon: "people", href: "#/farm/people" },
    { id: "more", label: "More", icon: "more", href: "#/farm/more" },
  ].filter(Boolean);
}

export function emptyState({ sector, iconName, title, body, action, href, actAttr = "" }) {
  return html`<div class="empty" ${raw(sector ? `data-sector="${sector}"` : "")}>
    ${sector ? raw(illustration(sector, 96).replace('class="illus"', 'class="illus" style="--x:0"')) : raw(`<span class="tile lg neutral">${icon(iconName || "info", { size: 40 })}</span>`)}
    <h2>${title}</h2>${body ? html`<p>${body}</p>` : ""}
    ${action ? (href ? html`<a class="btn" href="${href}">${action}</a>` : html`<button type="button" class="btn" ${raw(actAttr)}>${action}</button>`) : ""}
  </div>`;
}
export function sectorTile(type, size = "") {
  return html`<span class="tile ${size}" data-sector="${type}">${raw(icon(type, size === "lg" ? { size: 40, stroke: 1.75 } : {}))}</span>`;
}
export function sectorTag(type, label) {
  return html`<span class="sector-tag" data-sector="${type}">${raw(icon(type, { size: 16 }))}${label}</span>`;
}
/** Needs a signal (design/01 §13): returns an error string when offline, else null. */
export function needsSignal(what = "This") { return navigator.onLine ? null : `${what} needs a signal. Try again when you have one bar.`; }
