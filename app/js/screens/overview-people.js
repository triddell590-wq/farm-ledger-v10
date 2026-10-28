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
import { waitingRow, openWaitingSheet } from "./people.js";

export default async function peopleTab(farm) {
  const mine = farm ? farm.ledgers.filter((l) => invitableRoles(l.role).length) : [];
  const body = el(html`<div>${largeTitle("People", farm?.farmName || "")}<div data-out></div></div>`);
  const paint = async () => {
    const out = body.querySelector("[data-out]");
    if (!mine.length) { out.replaceChildren(el(emptyState({ iconName: "people", title: "Only owners and managers see this", body: "It lists everyone on the ledgers you look after." }))); return; }
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
      <div class="list">${list.map((p) => html`<div class="row">${avatar(p.name)}<span class="main"><span class="primary">${p.name}${p.uid === auth.user.uid ? " (you)" : ""}</span>
        <span class="secondary">${p.roles.map((r) => `${ROLE_DISPLAY[r.role]} on ${META[r.l.type]?.short || r.l.name}`).join(" · ")}</span></span></div>`)}</div>
      ${waiting.length ? html`<div class="section">${groupLabel("Waiting to join")}<div class="list">${waiting.map(({ i, l }) => waitingRow(i, l))}</div></div>` : ""}
      <p class="hint">To change someone's role or remove them, open the ledger → More → People on this ledger.</p>
      <div class="section"><button type="button" class="btn" data-invite>Invite someone</button></div>
    </div>`));
    out.querySelector("[data-invite]").onclick = () => openInviteSheet(mine, { onDone: paint });
    out.querySelectorAll("[data-inv]").forEach((b) => (b.onclick = () => { const w = waiting.find((x) => x.i.code === b.dataset.inv); openWaitingSheet(w.i, w.l, paint); }));
  };
  await paint();
  return { el: body, title: "People" };
}
export { raw, icon };
