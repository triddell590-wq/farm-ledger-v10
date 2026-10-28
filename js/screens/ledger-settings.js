// Ledger settings (design/01 §8.2): name, official numbers, setup numbers, people, delete.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { session } from "../services/session.js";
import { updateLedger, binLedger, BIN_DAYS } from "../services/ledgers.js";
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
  const mod0 = await sectorModule(ledger.type);
  const extra = mod0.settingsRows ? await mod0.settingsRows({ ledger, role: ledger.role }) : [];
  const body = el(html`<div>${backLink(`#/l/${ledger.id}/more`, "More")}${largeTitle("Ledger settings", `${sectorName(ledger.type)} ledger`)}
    <form novalidate><div class="form-group">${textField({ name: "name", label: "Ledger name", value: ledger.name })}${textFields.map((f) => textField({ name: f.key, label: f.label, value: s[f.key] || "", inputmode: f.inputmode, optional: true }))}</div></form>
    ${can ? "" : html`<p class="hint">Only the owner or a manager can change these.</p>`}
    <div data-save></div>
    ${extra.length ? html`<div class="section"><div class="list">${extra.map((r) => html`<a class="row" href="${r.href}"><span class="tile">${raw(icon(r.icon))}</span><span class="main"><span class="primary">${r.label}</span>${r.sub ? html`<span class="secondary">${r.sub}</span>` : ""}</span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>` : ""}
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
    <div class="warn-card">${raw(icon("alert"))}<span>${ledger.name} disappears for everyone on it. It stays in Account → Recently deleted ledgers for ${BIN_DAYS} days so you can bring it back, then it's gone for good. Medicine and movement records must be kept for at least 5 years by law — <a href="#/settings/data">download them first</a>.</span></div>
    <div class="form-group" style="margin-top:16px">${textField({ name: "confirm", label: "Type the ledger name", placeholder: ledger.name })}</div>
    <p class="hint">Type “${ledger.name}” to confirm.</p><div data-p></div></form>`);
  const btn = el(html`<button type="button" class="btn danger">Delete ledger</button>`);
  const f = wireForm(b); const miss = () => (f.values().confirm.trim().toLowerCase() === ledger.name.trim().toLowerCase() ? null : "Type the ledger name to confirm");
  f.onChange(() => guardButton(btn, "Delete ledger", miss)); guardButton(btn, "Delete ledger", miss);
  const sh = openSheet({ title: `Delete ${ledger.name}?`, body: b, footer: btn });
  btn.onclick = async () => {
    if (miss()) return;
    btn.disabled = true;
    try {
      binLedger(ledger.id);
      await session.load(true); sh.close(true, { force: true }); toast(`${ledger.name} deleted — restore it from Recently deleted for ${BIN_DAYS} days`); go("/farm/today", { replace: true });
    } catch (e) { console.error(e); b.querySelector("[data-p]").replaceChildren(el(fieldError("Couldn't delete it. Try again."))); guardButton(btn, "Delete ledger", miss); }
  };
}
