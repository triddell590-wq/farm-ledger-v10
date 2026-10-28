// Ledger settings (design/01 §8.2): name, official numbers, setup numbers, people, delete.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { session } from "../services/session.js";
import { updateLedger, deleteLedger } from "../services/ledgers.js";
import { canEditLedger, canDeleteLedger } from "../core/policy.js";
import { textField, wireForm, guardButton, fieldError } from "../ui/form.js";
import { openSheet } from "../ui/sheet.js";
import { toast } from "../ui/toast.js";
import { go } from "../core/router.js";
import { SETUP_FIELDS } from "../sectors/meta.js";
import { sectorName } from "../sectors/registry.js";
import { sectorModule } from "../sectors/ui.js";
import { makeScreen, largeTitle, backLink, groupLabel } from "./common.js";
import { ledgerTabs } from "./ledger.js";

export default async function ledgerSettings({ params }) {
  const ledger = session.ledger(params.lid);
  if (!ledger) { setTimeout(() => go("/farm/today", { replace: true })); return makeScreen({ body: el(html`<div></div>`) }); }
  const can = canEditLedger(ledger.role); const s = ledger.settings || {};
  const textFields = SETUP_FIELDS[ledger.type].filter((f) => f.kind === "text");
  const body = el(html`<div>${backLink(`#/l/${ledger.id}/more`, "More")}${largeTitle("Ledger settings", `${sectorName(ledger.type)} ledger`)}
    <form novalidate><div class="form-group">${textField({ name: "name", label: "Ledger name", value: ledger.name })}${textFields.map((f) => textField({ name: f.key, label: f.label, value: s[f.key] || "", inputmode: f.inputmode, optional: true }))}</div></form>
    ${can ? "" : html`<p class="hint">Only the owner or a manager can change these.</p>`}
    <div data-save></div>
    ${canDeleteLedger(ledger.role) ? html`<div class="section">${groupLabel("Danger zone")}<div class="list"><button type="button" class="row destructive" data-del><span class="tile late">${raw(icon("trash"))}</span><span class="main"><span class="primary">Delete this ledger</span><span class="secondary">Removes every record in it for everyone</span></span></button></div></div>` : ""}
  </div>`);
  if (!can) body.querySelectorAll("input").forEach((i) => (i.disabled = true));
  else {
    const f = wireForm(body.querySelector("form"));
    const bar = el(html`<div class="section"><button type="button" class="btn">Save</button></div>`); body.querySelector("[data-save]").append(bar);
    const btn = bar.querySelector(".btn"); const miss = () => (f.values().name ? null : "Add a name to save");
    f.onChange(() => guardButton(btn, "Save", miss)); guardButton(btn, "Save", miss);
    btn.onclick = async () => {
      const v = f.values(); const settings = { ...s }; textFields.forEach((t) => (settings[t.key] = v[t.key]));
      updateLedger(ledger.id, { name: v.name, settings }).catch(() => toast("Couldn't save — check your signal"));
      await new Promise((r) => setTimeout(r, 30)); await session.load(true); toast("Ledger settings saved");
    };
  }
  const d = body.querySelector("[data-del]");
  if (d) d.onclick = () => deleteSheet(ledger);
  const mod = await sectorModule(ledger.type);
  return makeScreen({ body, title: "Ledger settings", area: `ledger:${ledger.id}`, sector: ledger.type, depth: 1, chrome: { tabs: ledgerTabs(ledger, mod), tab: "more" } });
}

function deleteSheet(ledger) {
  const b = el(html`<form novalidate>
    <div class="warn-card">${raw(icon("alert"))}<span>Every record in ${ledger.name} is deleted for everyone on it. Medicine and movement records must be kept for at least 5 years by law — <a href="#/settings/data">download them first</a>.</span></div>
    <div class="form-group" style="margin-top:16px">${textField({ name: "confirm", label: "Type the ledger name", placeholder: ledger.name })}</div>
    <p class="hint">Type “${ledger.name}” to confirm.</p><div data-p></div></form>`);
  const btn = el(html`<button type="button" class="btn danger">Delete ledger for good</button>`);
  const f = wireForm(b); const miss = () => (f.values().confirm.trim().toLowerCase() === ledger.name.trim().toLowerCase() ? null : "Type the ledger name to confirm");
  f.onChange(() => guardButton(btn, "Delete ledger for good", miss)); guardButton(btn, "Delete ledger for good", miss);
  const sh = openSheet({ title: `Delete ${ledger.name}?`, body: b, footer: btn });
  btn.onclick = async () => {
    if (!navigator.onLine) { b.querySelector("[data-p]").replaceChildren(el(fieldError("Deleting a ledger needs a signal."))); return; }
    btn.disabled = true;
    try {
      await deleteLedger(ledger.id, (t) => (btn.textContent = t));
      await session.load(true); sh.close(true, { force: true }); toast(`${ledger.name} deleted`); go("/farm/today", { replace: true });
    } catch (e) { console.error(e); b.querySelector("[data-p]").replaceChildren(el(fieldError("Couldn't finish deleting. Try again — nothing already deleted comes back."))); guardButton(btn, "Delete ledger for good", miss); }
  };
}
