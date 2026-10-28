import { html } from "../core/html.js";
import { el } from "../ui/dom.js";
import { makeScreen } from "./common.js";
import { logoSvg } from "./welcome.js";
import { raw } from "../core/html.js";
export default async function deleted() {
  const body = el(html`<div style="padding-top:calc(64px + var(--safe-t))">${raw(logoSvg(64))}<h1 class="t-title" style="margin-top:24px">Your account has been deleted.</h1><p class="t-body ink-2" style="margin-top:8px">Thanks for using Farm Ledger. Ledgers you handed over carry on with their new owner.</p><div class="section"><a class="btn secondary" href="#/welcome">Back to the start</a></div></div>`);
  return makeScreen({ body, title: "Account deleted", area: "auth", chrome: { rail: false }, remember: false });
}
