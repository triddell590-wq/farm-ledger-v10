// Sibling pages under one bottom tab, as one row of big pills (e.g. Beef Herd: All cattle ·
// Groups · Finishing). Each view is its own route, so Back and links keep working and the same
// bottom tab stays lit on all of them. views: [[routeAfterLid, label], ...]
import { html, raw } from "../core/html.js";
export function viewPills(lid, views, current, label = "Views") {
  return html`<nav class="view-pills" aria-label="${label}">${views.map(([k, l]) => html`<a href="#/l/${lid}/${k}" class="${k === current ? "on" : ""}" ${k === current ? raw('aria-current="page"') : ""}>${l}</a>`)}</nav>`;
}
