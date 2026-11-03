// Overview → People (design/01 §7.4): everyone across the ledgers I own or manage, grouped by
// person with their role per ledger; waiting invites; invite (pick ledgers).
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { auth } from "../core/auth.js";
import { listMembers } from "../services/members.js";
import { listInvites } from "../services/invites.js";
import { invitableRoles } from "../core/policy.js";
import { avatar } from "../ui/format.js";
import { META } from "../sectors/meta.js";
import { largeTitle, groupLabel, emptyState } from "./common.js";
import { ROLE_DISPLAY } from "./roles.js";
import { openInviteSheet } from "./invite-sheet.js";
import { waitingRow, openWaitingSheet, memberSheet } from "./people.js";
import { openSheet } from "../ui/sheet.js";
import { el as mk } from "../ui/dom.js";

export default async function peopleTab(farm) {
  const mine = farm ? farm.ledgers.filter((l) => invitableRoles(l.role).length) : [];
  const body = el(html`<div>${largeTitle("People", farm?.farmName || "")}<div data-out></div></div>`);
  const paint = async () => {
    const out = body.querySelector("[data-out]");
    if (!mine.length) { out.replaceChildren(el(emptyState({ iconName: "people", title: "Only owners and managers see this", body: "It lists everyone on the herds and flocks you look after." }))); return; }
    const people = new Map(); const waiting = [];
    for (const l of mine) {
      for (const m of await listMembers(l.id).catch(() => [])) {
        if (!people.has(m.uid)) people.set(m.uid, { name: m.displayName || m.email, email: m.email, uid: m.uid, roles: [] });
        people.get(m.uid).roles.push({ l, role: m.role });
      }
      (await listInvites(l.id).catch(() => [])).filter((i) => i.state === "open").forEach((i) => waiting.push({ i, l }));
    }
    const list = [...people.values()].sort((a, b) => (b.uid === auth.user.uid) - (a.uid === auth.user.uid) || a.name.localeCompare(b.name));
    out.replaceChildren(el(html`<div>
      <div class="list">${list.map((p) => p.uid === auth.user.uid
        ? html`<div class="row">${avatar(p.name)}<span class="main"><span class="primary">${p.name} (you)</span><span class="secondary">${p.roles.map((r) => `${ROLE_DISPLAY[r.role]} on ${r.l.name}`).join(" · ")}</span></span></div>`
        : html`<button type="button" class="row" data-person="${p.uid}">${avatar(p.name)}<span class="main"><span class="primary">${p.name}</span>
        <span class="secondary">${p.roles.map((r) => `${ROLE_DISPLAY[r.role]} on ${r.l.name}`).join(" · ")}</span></span><span class="chev">${raw(icon("chevron"))}</span></button>`)}</div>
      ${waiting.length ? html`<div class="section">${groupLabel("Waiting to join")}<div class="list">${waiting.map(({ i, l }) => waitingRow(i, l))}</div></div>` : ""}
      <p class="hint">Tap someone to change what they can do or remove them.</p>
      <div class="section"><button type="button" class="btn" data-invite>Invite someone</button></div>
    </div>`));
    // A person opens straight to their role (A #43): one herd/flock -> its role sheet; several -> pick which.
    out.querySelectorAll("[data-person]").forEach((b) => (b.onclick = () => {
      const p = people.get(b.dataset.person);
      const open = (r) => memberSheet(r.l, { uid: p.uid, displayName: p.name, email: p.email, role: r.role }, paint);
      if (p.roles.length === 1) return open(p.roles[0]);
      const sb = mk(html`<div><p class="sheet-title-sm">${p.name}</p><div class="list">${p.roles.map((r, i) => html`<button type="button" class="row" data-pick="${i}" data-sector="${r.l.type}"><span class="tile">${raw(icon(r.l.type))}</span><span class="main"><span class="primary">${r.l.name}</span><span class="secondary">${ROLE_DISPLAY[r.role]}</span></span><span class="chev">${raw(icon("chevron"))}</span></button>`)}</div></div>`);
      const sh = openSheet({ size: "small", body: sb, label: p.name, auto: true });
      sb.addEventListener("click", (e) => { const x = e.target.closest("[data-pick]"); if (!x) return; sh.close(undefined, { force: true }); setTimeout(() => open(p.roles[+x.dataset.pick]), 220); });
    }));
    out.querySelector("[data-invite]").onclick = () => openInviteSheet(mine, { onDone: paint });
    out.querySelectorAll("[data-inv]").forEach((b) => (b.onclick = () => { const w = waiting.find((x) => x.i.code === b.dataset.inv); openWaitingSheet(w.i, w.l, paint); }));
  };
  await paint();
  return { el: body, title: "People" };
}
export { raw, icon };
