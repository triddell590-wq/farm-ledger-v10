// Overview → More (design/01 §7.5).
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { canEditLedger } from "../core/policy.js";
import { largeTitle } from "./common.js";

const row = (href, ic, label, sub = "") => html`<a class="row" href="${href}"><span class="tile neutral">${raw(icon(ic))}</span><span class="main"><span class="primary">${label}</span>${sub ? html`<span class="secondary">${sub}</span>` : ""}</span><span class="chev">${raw(icon("chevron"))}</span></a>`;
export default async function more(farm) {
  const space = farm && farm.space;
  const ops = farm && [space, ...farm.ledgers].filter(Boolean).some((l) => l.role !== "accountant");
  const canAdd = space && canEditLedger(space.role);
  const body = el(html`<div>${largeTitle("More", farm?.farmName || "")}
    <div class="list">
      ${space && ops ? row("#/farm/medicines", "syringe", "Medicine store (all ledgers)", "Products, batches, expiry") : ""}
      ${space ? row("#/farm/documents", "document", "Documents", "Certificates, plans, vet letters") : ""}
      ${space ? row("#/farm/photos", "camera", "Farm photos", "Documents, medicines, money records") : ""}
      ${space ? row("#/farm/contacts", "people", "Contacts", "Vet, haulier, mart, feed rep, processor") : ""}
      ${canAdd || !space ? row("#/add-ledger", "plus", "Add a ledger") : ""}
    </div>
    <div class="section"><div class="list">
      ${row("#/settings", "settings", "Account and settings")}
      ${row("#/help", "help", "Help and contact")}
    </div></div></div>`);
  return { el: body, title: "More" };
}
