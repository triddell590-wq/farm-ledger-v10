// People on a ledger (design/01 §9.4): members, waiting invites, invite, change role, remove,
// hand over ownership. Also exports the pieces the Overview → People tab reuses.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { openSheet, confirmSheet } from "../ui/sheet.js";
import { radioGroup, textField, wireForm, guardButton, fieldError } from "../ui/form.js";
import { auth } from "../core/auth.js";
import { session } from "../services/session.js";
import { listMembers, changeRole, removeMember } from "../services/members.js";
import { listInvites, revokeInvite } from "../services/invites.js";
import { transferOwnership } from "../services/ledgers.js";
import { canChangeRoles, invitableRoles } from "../core/policy.js";
import { toast } from "../ui/toast.js";
import { avatar, recordDate } from "../ui/format.js";
import { go } from "../core/router.js";
import { makeScreen, largeTitle, groupLabel, backLink, emptyState } from "./common.js";
import { ROLE_DISPLAY, ROLE_SHORT_HELP } from "./roles.js";
import { openInviteSheet, openShareSheet } from "./invite-sheet.js";

export function waitingRow(i, ledger) {
  const who = i.forName || "Someone";
  return html`<button type="button" class="row" data-inv="${i.code}" data-lid="${ledger.id}">
    <span class="tile neutral">${raw(icon("clock"))}</span>
    <span class="main"><span class="primary">${who} · ${ROLE_DISPLAY[i.role]} on ${ledger.name}</span><span class="secondary">${i.state === "open" ? `invited ${recordDate(new Date(i.createdAt).toISOString()).replace(/ \d{4}$/, "")}, runs out ${recordDate(new Date(i.expiresAt).toISOString()).replace(/ \d{4}$/, "")}` : i.state === "used" ? "Joined" : "Ran out"}</span></span>
    <span class="chev">${raw(icon("chevron"))}</span></button>`;
}
export function openWaitingSheet(i, ledger, after) {
  const b = el(html`<div><p class="sheet-title-sm">${i.forName || "Invite"} · ${ROLE_DISPLAY[i.role]} on ${ledger.name}</p>
    <div class="btn-col">${i.state === "open" ? html`<button type="button" class="btn secondary" data-share>${raw(icon("share"))}Share again</button>` : ""}<button type="button" class="btn secondary" data-cancel style="color:var(--late)">${i.state === "open" ? "Cancel invite" : "Remove from list"}</button></div></div>`);
  const sh = openSheet({ size: "small", body: b, label: "Invite", auto: true });
  const s = b.querySelector("[data-share]");
  if (s) s.onclick = () => { sh.close(undefined, { force: true }); openShareSheet({ name: i.forName, role: i.role, made: [{ l: ledger, code: i.code }], days: Math.max(1, Math.round((new Date(i.expiresAt) - Date.now()) / 86400000)) }); };
  b.querySelector("[data-cancel]").onclick = async () => {
    try { await revokeInvite(ledger.id, i.code); sh.close(undefined, { force: true }); toast("Invite cancelled. The link won't work now."); after && after(); }
    catch (e) { toast(navigator.onLine ? "Only the person who sent it or the owner can cancel this invite." : "Cancelling needs a signal."); }
  };
}

function memberSheet(ledger, m, after) {
  const isOwner = ledger.role === "owner";
  const b = el(html`<div>
    <div style="display:flex;gap:12px;align-items:center;margin:4px 4px 16px">${avatar(m.displayName || m.email)}<div><div class="t-headline">${m.displayName || m.email}</div><div class="t-callout ink-2">${m.email || ""}</div></div></div>
    ${isOwner ? html`<h2 class="group-label">Role on ${ledger.name}</h2>${radioGroup("role", ["manager", "worker", "viewer", "accountant"].map((r) => ({ value: r, label: ROLE_DISPLAY[r], help: ROLE_SHORT_HELP[r] })), m.role)}
      <div class="btn-col" style="margin-top:16px"><button type="button" class="btn" data-save>Save role</button><button type="button" class="btn secondary" data-remove style="color:var(--late)">Remove from ${ledger.name}</button></div>`
    : html`<p class="t-callout ink-2" style="margin:0 4px">${ROLE_DISPLAY[m.role]}. Only the owner can change roles.</p>`}
  </div>`);
  const sh = openSheet({ size: "small", body: b, label: m.displayName || "Person", auto: true });
  if (!isOwner) return;
  const f = wireForm(b);
  b.querySelector("[data-save]").onclick = async () => {
    const role = f.values().role; if (role === m.role) { sh.close(); return; }
    try { await changeRole(ledger.id, m.uid, role); sh.close(undefined, { force: true }); toast(`${(m.displayName || "They").split(" ")[0]} is now ${ROLE_DISPLAY[role]}`); after(); }
    catch (e) { toast(navigator.onLine ? "Couldn't change the role." : "Changing roles needs a signal."); }
  };
  b.querySelector("[data-remove]").onclick = async () => {
    const first = (m.displayName || "this person").split(" ")[0];
    if (!(await confirmSheet({ title: `Remove ${first} from ${ledger.name}?`, body: `${first} will lose access straight away. Records they made stay, with their name on them.`, confirm: "Remove", danger: true }))) return;
    try { await removeMember(ledger.id, m.uid); sh.close(undefined, { force: true }); toast(`${first} removed from ${ledger.name}`); after(); }
    catch (e) { toast(navigator.onLine ? "Couldn't remove." : "Removing people needs a signal."); }
  };
}

function handOverSheet(ledger, members, after) {
  const others = members.filter((m) => m.uid !== auth.user.uid);
  const b = el(html`<form novalidate>
    <p class="t-callout ink-2" style="margin:0 4px 16px">They become the owner of ${ledger.name}. You stay on as a Manager. Used when the farm passes on, or a partner takes over.</p>
    <h2 class="group-label">Hand over to</h2>${radioGroup("to", others.map((m) => ({ value: m.uid, label: m.displayName || m.email, help: ROLE_DISPLAY[m.role] })), null)}
    <div class="form-group" style="margin-top:16px">${textField({ name: "confirm", label: "Type the ledger name", placeholder: ledger.name })}</div>
    <p class="hint">Type “${ledger.name}” to confirm.</p><div data-err></div></form>`);
  const btn = el(html`<button type="button" class="btn danger">Hand over</button>`);
  const f = wireForm(b);
  const miss = () => { const v = f.values(); if (!v.to) return "Pick who to hand over to"; if (v.confirm.trim().toLowerCase() !== ledger.name.trim().toLowerCase()) return "Type the ledger name to confirm"; return null; };
  f.onChange(() => guardButton(btn, "Hand over", miss)); guardButton(btn, "Hand over", miss);
  const sh = openSheet({ title: "Hand over ownership", body: b, footer: btn });
  btn.onclick = async () => {
    try { await transferOwnership(ledger.id, f.values().to); await session.load(true); sh.close(undefined, { force: true }); toast(`${ledger.name} handed over`); after(); }
    catch (e) { b.querySelector("[data-err]").replaceChildren(el(fieldError(navigator.onLine ? "Couldn't hand over. Try again." : "Handing over needs a signal."))); }
  };
}

export default async function people({ params }) {
  const ledger = session.ledger(params.lid);
  if (!ledger) { setTimeout(() => go("/farm/today", { replace: true })); return makeScreen({ body: el(html`<div></div>`), area: "farm" }); }
  const body = el(html`<div>${backLink(`#/l/${ledger.id}/more`, "More")}${largeTitle(`People on ${ledger.name}`)}<div data-out></div></div>`);
  const paint = async () => {
    const members = await listMembers(ledger.id);
    const manage = invitableRoles(ledger.role).length > 0;
    const invites = manage ? (await listInvites(ledger.id).catch(() => [])).filter((i) => i.state === "open") : [];
    const out = body.querySelector("[data-out]");
    out.replaceChildren(el(html`<div>
      <div class="list">${members.map((m) => html`<button type="button" class="row" data-m="${m.uid}">${avatar(m.displayName || m.email)}
        <span class="main"><span class="primary">${m.displayName || m.email}</span></span><span class="ink-2 t-callout">${ROLE_DISPLAY[m.role]}${m.uid === auth.user.uid ? " (you)" : ""}</span>${canChangeRoles(ledger.role) && m.uid !== auth.user.uid ? raw(`<span class="chev">${icon("chevron")}</span>`) : ""}</button>`)}</div>
      ${invites.length ? html`<div class="section">${groupLabel("Waiting to join")}<div class="list">${invites.map((i) => waitingRow(i, ledger))}</div></div>` : ""}
      ${manage ? html`<div class="section btn-col"><button type="button" class="btn" data-invite>Invite someone</button>${ledger.role === "owner" && members.length > 1 ? html`<button type="button" class="btn secondary" data-handover>Hand over ownership</button>` : ""}</div>` : ""}
      <p class="hint" style="margin-top:16px">Every record shows who made it and when.</p>
    </div>`));
    out.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { const m = members.find((x) => x.uid === b.dataset.m); if (m.uid !== auth.user.uid) memberSheet(ledger, m, paint); }));
    out.querySelectorAll("[data-inv]").forEach((b) => (b.onclick = () => openWaitingSheet(invites.find((i) => i.code === b.dataset.inv), ledger, paint)));
    const iv = out.querySelector("[data-invite]"); if (iv) iv.onclick = () => openInviteSheet([ledger], { onDone: paint });
    const ho = out.querySelector("[data-handover]"); if (ho) ho.onclick = () => handOverSheet(ledger, members, () => { go(`/l/${ledger.id}/more`, { replace: true }); });
  };
  await paint();
  return makeScreen({ body, title: `People on ${ledger.name}`, area: `ledger:${ledger.id}`, sector: ledger.type, depth: 1, chrome: { tabs: (await import("./ledger.js")).ledgerTabs(ledger, await (await import("../sectors/ui.js")).sectorModule(ledger.type)), tab: "more" } });
}
export { emptyState };
