// Delete account (design/01 §11.2): two steps, never one. Per owned ledger: hand over or delete.
import { RETENTION_LINE } from "../content/region-rules.js";
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { auth } from "../core/auth.js";
import { session } from "../services/session.js";
import { deletionPlan, deleteAccount } from "../services/account.js";
import { listMembers } from "../services/members.js";
import { textField, wireForm, guardButton, fieldError } from "../ui/form.js";
import { go } from "../core/router.js";
import { makeScreen, largeTitle, backLink, farmTabs, groupLabel } from "./common.js";

export default async function deleteAccountScreen() {
  const body = el(html`<div>${backLink("#/settings", "Settings")}${largeTitle("Delete your account?")}<div data-out><p class="t-body ink-2">Working out what you own…</p></div></div>`);
  const out = body.querySelector("[data-out]");
  let plan = { owned: [], joined: [] };
  try { plan = await deletionPlan(); } catch (e) { /* offline */ }
  // Every ledger I own, the farm-wide records too (money, map, medicine store): hand each over to
  // someone already on it, or delete it. Where nobody else is on it, say plainly it will go (A #31).
  const owned = plan.owned.sort((x, y) => (x.ledger.type === "farm") - (y.ledger.type === "farm"));
  const others = {};
  for (const o of owned) others[o.ledger.id] = (await listMembers(o.ledger.id).catch(() => [])).filter((m) => m.uid !== auth.user.uid);
  const label = (l) => (l.type === "farm" ? "Farm-wide records (money, map, medicine store)" : l.name);
  const canHand = owned.filter((o) => others[o.ledger.id].length);
  const alone = owned.filter((o) => !others[o.ledger.id].length);
  out.replaceChildren(el(html`<div>
    <p class="t-body">This removes your login and takes you off every herd and flock you've been invited to${plan.joined.length ? ` (${plan.joined.length})` : ""}.</p>
    ${canHand.length ? html`${groupLabel(`Hand over or delete — ${canHand.length === 1 ? "someone else is on this" : "other people are on these"}`)}
      <div class="form-group">${canHand.map((o) => html`<div class="field" data-owned="${o.ledger.id}"><span class="label">${label(o.ledger)}</span><span class="spacer"></span>
        <select name="lg-${o.ledger.id}" aria-label="What happens to ${label(o.ledger)}">${others[o.ledger.id].map((m, i) => html`<option value="${m.uid}" ${raw(i === 0 ? "selected" : "")}>Hand over to ${m.displayName || m.email}</option>`)}<option value="delete">Delete it</option></select></div>`)}</div>
      <p class="hint">Handing over makes them the owner. Everything in it stays for them.</p>` : ""}
    ${alone.length ? html`${groupLabel(`${alone.length === 1 ? "Nobody else is on this, so it will be deleted" : "Nobody else is on these, so they will be deleted"}`)}
      <div class="list">${alone.map((o) => html`<div class="row no-lead" data-owned="${o.ledger.id}"><span class="main"><span class="primary">${label(o.ledger)}</span></span><span class="t-callout" style="color:var(--late-ink)">Deleted</span></div>`)}</div>
      ${canHand.length || !owned.length ? "" : html`<p class="hint">To keep any of it, invite someone to it first and hand it over to them, or download your data below.</p>`}` : ""}
    <div class="warn-card" style="margin-top:16px">${raw(icon("alert"))}<span>${RETENTION_LINE}. <a href="#/settings/data">Download my data first</a></span></div>
    <form novalidate style="margin-top:16px"><div class="form-group">${textField({ name: "confirm", label: "Type DELETE to confirm", autocomplete: "off" })}${textField({ name: "password", label: "Your password", type: "password", autocomplete: "current-password" })}</div></form>
    <div data-err></div>
    <div class="section"><button type="button" class="btn danger" data-go>Delete my account for good</button></div>
  </div>`));
  const f = wireForm(out); const btn = out.querySelector("[data-go]");
  const miss = () => { const v = f.values(); if (v.confirm.trim().toUpperCase() !== "DELETE") return "Type DELETE to confirm"; if (!v.password) return "Enter your password to confirm"; return null; };
  f.onChange(() => guardButton(btn, "Delete my account for good", miss)); guardButton(btn, "Delete my account for good", miss);
  btn.onclick = async () => {
    const err = out.querySelector("[data-err]"); err.replaceChildren();
    if (!navigator.onLine) { err.append(el(fieldError("Deleting your account needs a signal."))); return; }
    const v = f.values(); const choices = {};
    for (const o of owned) { const c = v[`lg-${o.ledger.id}`]; if (c && c !== "delete") choices[o.ledger.id] = { handTo: c }; }
    btn.disabled = true;
    try { await deleteAccount(v.password, (t) => (btn.textContent = t), choices); session.reset(); go("/deleted", { replace: true }); }
    catch (e) { console.error(e); guardButton(btn, "Delete my account for good", miss); err.append(el(fieldError(e.code === "auth/wrong-password" || e.code === "auth/invalid-credential" ? "That password isn't right." : "Couldn't finish. Try again — anything already deleted stays deleted."))); }
  };
  return makeScreen({ body, title: "Delete account", area: "farm", tab: "more", depth: 2, chrome: { tabs: farmTabs(), tab: "more" } });
}
