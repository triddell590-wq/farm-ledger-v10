// Invite someone (design/01 §9.2) and the share sheet. One invite per ledger picked; when several
// ledgers are picked, the message carries one link per ledger (each link works once).
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { openSheet } from "../ui/sheet.js";
import { radioGroup, chipGroup, textField, segmented, wireForm, guardButton, fieldError } from "../ui/form.js";
import { createInvite, inviteLink, DEFAULT_DAYS } from "../services/invites.js";
import { invitableRoles } from "../core/policy.js";
import { auth } from "../core/auth.js";
import { session } from "../services/session.js";
import { toast } from "../ui/toast.js";
import { recordDate } from "../ui/format.js";
import { ROLE_DISPLAY, ROLE_SHORT_HELP } from "./roles.js";
import { META } from "../sectors/meta.js";
import { resendVerification } from "./verify.js";

/** ledgers: candidates the person may invite to (owner/manager); preselect: ledger id */
export function openInviteSheet(ledgers, { preselect, onDone } = {}) {
  const u = auth.user;
  if (!u.emailVerified) return confirmFirst();
  if (!navigator.onLine) { toast("Inviting needs a signal. Try again when you have one bar."); return; }
  const pick = new Set([preselect || ledgers[0]?.id].filter(Boolean));
  const roleOpts = () => {
    const allowed = ["manager", "worker", "viewer", "accountant"].filter((r) => [...pick].every((id) => invitableRoles(ledgers.find((l) => l.id === id)?.role).includes(r)));
    return ["manager", "worker", "viewer", "accountant"].map((r) => ({ value: r, label: ROLE_DISPLAY[r], help: ROLE_SHORT_HELP[r], disabled: !allowed.includes(r) }));
  };
  const body = el(html`<form novalidate>
    ${ledgers.length > 1 ? html`<h2 class="group-label">Which ledger?</h2><div class="card pad">${chipGroup("ledgers", ledgers.map((l) => ({ value: l.id, label: l.name, sector: l.type })), [...pick])}</div>` : ""}
    <h2 class="group-label" style="margin-top:20px">What can they do?</h2>
    <div data-roles>${radioGroup("role", roleOpts(), "worker")}</div>
    <div class="form-group" style="margin-top:16px">${textField({ name: "name", label: "Their name", optional: true, placeholder: "Seán" })}</div>
    <h2 class="group-label" style="margin-top:20px">Link runs out after</h2>
    ${segmented("days", [{ value: "1", label: "1 day" }, { value: "7", label: "7 days" }, { value: "14", label: "14 days" }], String(DEFAULT_DAYS))}
    <p class="hint" data-expiry>The link works once and runs out in 7 days.</p>
    <div data-err></div>
  </form>`);
  const btn = el(html`<button type="button" class="btn">Create invite link</button>`);
  const f = wireForm(body);
  const miss = () => { const v = f.values(); if (ledgers.length > 1 && !(v.ledgers || []).length) return "Pick a ledger to continue"; if (!v.role) return "Pick what they can do"; return null; };
  f.onChange((name) => {
    const v = f.values();
    if (name === "ledgers") { pick.clear(); (v.ledgers || []).forEach((id) => pick.add(id)); const cur = v.role; body.querySelector("[data-roles]").replaceChildren(el(radioGroup("role", roleOpts(), roleOpts().find((o) => o.value === cur && !o.disabled) ? cur : "worker"))); }
    if (name === "days") body.querySelector("[data-expiry]").textContent = `The link works once and runs out in ${v.days} ${v.days === "1" ? "day" : "days"}.`;
    guardButton(btn, "Create invite link", miss);
  });
  guardButton(btn, "Create invite link", miss);
  const sh = openSheet({ title: "Invite someone", body, footer: btn });
  btn.onclick = async () => {
    if (miss()) return;
    const v = f.values(); const ids = ledgers.length > 1 ? v.ledgers : [ledgers[0].id];
    btn.disabled = true; btn.textContent = "Creating link…";
    try {
      const made = [];
      for (const id of ids) { const l = ledgers.find((x) => x.id === id); const code = await createInvite(l, v.role, l.role, +v.days, v.name); made.push({ l, code }); }
      sh.close(true, { force: true });
      openShareSheet({ name: v.name, role: v.role, made, days: +v.days });
      onDone && onDone();
    } catch (e) {
      console.error(e); guardButton(btn, "Create invite link", miss);
      body.querySelector("[data-err]").replaceChildren(el(fieldError(e.code === "permission-denied" ? "You can't invite that role to this ledger." : navigator.onLine ? "Couldn't create the link. Try again." : "Inviting needs a signal.")));
    }
  };
}

function confirmFirst() {
  const b = el(html`<div><p class="sheet-title-sm">Confirm your email first</p><p class="t-callout ink-2" style="margin:0 4px 16px">So nobody can invite people in your name, you need to confirm your email before inviting anyone. Check your inbox for our link.</p><button type="button" class="btn" data-r>Send the link again</button></div>`);
  const sh = openSheet({ size: "small", body: b, label: "Confirm your email", auto: true });
  b.querySelector("[data-r]").onclick = async () => { try { await resendVerification(); toast("Sent. Check your spam folder too."); sh.close(); } catch (e) { toast(e.friendly || "Couldn't send"); } };
}

export function inviteMessage({ inviter, name, made, days }) {
  const farm = made[0].l.farmName || session.farm()?.farmName || "the farm";
  const what = made.map((m) => m.l.name).join(" and ");
  const runs = recordDate(new Date(Date.now() + days * 86400000).toISOString()).replace(/ \d{4}$/, "");
  const links = made.length === 1 ? inviteLink(made[0].code) : made.map((m) => `${m.l.name}: ${inviteLink(m.code)}`).join(" ");
  return `${inviter} has invited ${name ? name.split(" ")[0] : "you"} to help with the ${what} records on ${farm} in Farm Ledger. Tap to join: ${links} . The link works once and runs out on ${runs}.`;
}

export function openShareSheet({ name, role, made, days }) {
  const inviter = (auth.user.displayName || auth.user.email).split(" ")[0];
  const msg = inviteMessage({ inviter, name, made, days });
  const link = made.length === 1 ? inviteLink(made[0].code) : msg;
  const b = el(html`<div>
    <p class="sheet-title-sm" style="margin-bottom:2px">Invite ready${name ? ` for ${name}` : ""}</p>
    <p class="t-callout ink-2" style="margin:0 4px 16px">${ROLE_DISPLAY[role]} on ${made.map((m) => META[m.l.type]?.short || m.l.name).join(" and ")}</p>
    <div class="share-grid">
      <a class="share-tile" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">${raw(icon("whatsapp"))}WhatsApp</a>
      <a class="share-tile" href="sms:?&body=${encodeURIComponent(msg)}">${raw(icon("message"))}Text</a>
      <a class="share-tile" href="mailto:?subject=${encodeURIComponent("Join " + (made[0].l.farmName || "our farm") + " on Farm Ledger")}&body=${encodeURIComponent(msg)}">${raw(icon("mail"))}Email</a>
      <button type="button" class="share-tile" data-copy>${raw(icon("copy"))}Copy link</button>
      ${navigator.share ? html`<button type="button" class="share-tile" data-more style="grid-column:1/-1">${raw(icon("share"))}More…</button>` : ""}
    </div>
    <p class="hint" style="margin-top:16px;overflow-wrap:anywhere" data-msg></p>
  </div>`);
  b.querySelector("[data-msg]").textContent = msg;
  openSheet({ size: "small", body: b, label: "Share invite", auto: true });
  b.querySelector("[data-copy]").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch (e) { toast("Couldn't copy — press and hold the message to copy it"); } };
  const m = b.querySelector("[data-more]"); if (m) m.onclick = () => navigator.share({ title: "Farm Ledger invite", text: msg }).catch(() => {});
}
