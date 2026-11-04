import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { makeScreen, largeTitle, backLink, farmTabs, groupLabel } from "./common.js";
import { SUPPORT } from "../config.js";

/** 07851 635259 → 447851635259 for WhatsApp links. */
const ukIntl = (p) => { const d = String(p).replace(/[^\d+]/g, "").replace(/^\+/, ""); return d.startsWith("0") ? "44" + d.slice(1) : d; };
/** The contact block: buttons only for what's set in config SUPPORT, otherwise one plain line. */
export function supportBlock(sup = SUPPORT) {
  const email = String(sup.email || "").trim(); const phone = String(sup.phone || "").trim();
  if (!email && !phone) return html`<div class="info-card" data-support="none" style="margin-top:16px">${raw(icon("info"))}<span>Stuck? Ask the person who invited you to Farm Ledger — they can see the same screens and help you through it.</span></div>`;
  return html`<div class="section" data-support="set">${groupLabel("Get in touch")}<div class="stack" style="display:grid;gap:12px">
    ${phone ? html`<a class="btn secondary" href="tel:${phone.replace(/[^\d+]/g, "")}">${raw(icon("message"))}Phone ${phone}</a>
      <a class="btn secondary" href="https://wa.me/${ukIntl(phone)}?text=${encodeURIComponent("Farm Ledger help: ")}" target="_blank" rel="noopener">${raw(icon("message"))}WhatsApp ${phone}</a>` : ""}
    ${email ? html`<a class="btn secondary" href="mailto:${email}?subject=${encodeURIComponent("Farm Ledger help")}">${raw(icon("mail"))}Email ${email}</a>` : ""}</div></div>`;
}
export default async function help() {
  const q = [
    ["Does it work with no signal?", "Yes. Everything you enter is saved on your phone and syncs by itself when you get a signal. The pill at the top says “Saved on phone” or “Synced”."],
    ["Who can see my records?", "Only people you invite, with the role you choose. Workers and Vet / Advisers never see money; Accountants only see money."],
    ["How do I add someone?", "Farm → People → Invite someone (or open the herd or flock → More → People). Send the link by WhatsApp, text or email. It works once."],
    ["Can I get my records out?", "Yes — Account and settings → Download my data, as spreadsheets, a printable page or everything."],
    ["Are the checklists official?", "They're based on published standards and say which version and date they follow. They aren't issued or endorsed by DAERA, LMC, Red Tractor or anyone else."],
  ];
  const body = el(html`<div>${backLink("#/farm/more", "More")}${largeTitle("Help and contact")}
    ${q.map(([t, a]) => html`<details class="card pad" style="margin-bottom:12px"><summary class="t-strong" style="min-height:44px;display:flex;align-items:center;cursor:pointer">${t}</summary><p class="t-body ink-2" style="margin-top:8px">${a}</p></details>`)}
    ${supportBlock()}</div>`);
  return makeScreen({ body, title: "Help", area: "farm", tab: "more", depth: 1, chrome: { tabs: farmTabs(), tab: "more" } });
}
