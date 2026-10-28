import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { makeScreen, largeTitle, backLink, farmTabs } from "./common.js";
export default async function help() {
  const q = [
    ["Does it work with no signal?", "Yes. Everything you enter is saved on your phone and syncs by itself when you get a signal. The pill at the top says “Saved on phone” or “Synced”."],
    ["Who can see my records?", "Only people you invite, with the role you choose. Workers and Vet / Advisers never see money; Accountants only see money."],
    ["How do I add someone?", "Open the ledger → More → People on this ledger → Invite someone. Send the link by WhatsApp, text or email. It works once."],
    ["Can I get my records out?", "Yes — Account and settings → Download my data, as spreadsheets, a printable page or everything."],
    ["Are the checklists official?", "They're based on published standards and say which version and date they follow. They aren't issued or endorsed by DAERA, LMC, Red Tractor or anyone else."],
  ];
  const body = el(html`<div>${backLink("#/farm/more", "More")}${largeTitle("Help and contact")}
    ${q.map(([t, a]) => html`<details class="card pad" style="margin-bottom:12px"><summary class="t-strong" style="min-height:44px;display:flex;align-items:center;cursor:pointer">${t}</summary><p class="t-body ink-2" style="margin-top:8px">${a}</p></details>`)}
    <div class="info-card" style="margin-top:16px">${raw(icon("mail"))}<span>Contact details for support will go here before launch (to be set up).</span></div></div>`);
  return makeScreen({ body, title: "Help", area: "farm", tab: "more", depth: 1, chrome: { tabs: farmTabs(), tab: "more" } });
}
