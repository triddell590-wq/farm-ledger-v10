// Privacy notice and Terms (design/01 §10): plain-English summary, then the full text in a
// "Read the full version" disclosure. DRAFT text flagged for Tom's review.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { openSheet } from "../ui/sheet.js";
import { auth } from "../core/auth.js";
import { makeScreen, largeTitle, backLink } from "./common.js";
import { PRIVACY, TERMS, LEGAL_STATUS } from "../content/legal-text.js";

function content(doc) {
  const d = doc === "privacy" ? PRIVACY : TERMS;
  return html`<div>
    <div class="pill due" style="margin:4px 0 12px">Draft — for Tom's review</div>
    <div class="card pad prose">${d.summary.map(([k, v]) => html`<p><b>${k}:</b> ${v}</p>`)}</div>
    <details class="card pad prose" style="margin-top:16px"><summary class="t-strong" style="min-height:44px;display:flex;align-items:center;cursor:pointer">Read the full version</summary>${raw(d.full)}</details>
    <p class="hint">${LEGAL_STATUS}</p>
  </div>`;
}
export function openLegalSheet(doc) {
  const d = doc === "privacy" ? PRIVACY : TERMS;
  openSheet({ title: d.title, size: "large", body: el(content(doc)), cancelText: "Done" });
}
export default async function legal({ params }) {
  const d = params.doc === "privacy" ? PRIVACY : TERMS;
  const signedIn = !!auth.user;
  const body = el(html`<div>${backLink(signedIn ? "#/settings" : "#/welcome")}${largeTitle(d.title)}${content(params.doc)}</div>`);
  return makeScreen({ body, title: d.title, area: signedIn ? "farm" : "auth", depth: 2, chrome: { rail: signedIn } });
}
