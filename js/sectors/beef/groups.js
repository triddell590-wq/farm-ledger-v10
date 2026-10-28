// Groups and sheds (design/10 §4.1, §6.6): management groups with head count, class, shed and
// spaces. Tap a group to see its cattle in the herd list; edit or add groups.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { canWrite } from "../../core/policy.js";
import { backLink, largeTitle, emptyState } from "../../screens/common.js";
import { herdViews } from "./ui.js";
import { liveSnap } from "./data.js";
import { onFarm, CLASS_NAMES } from "./model/animals.js";

export default async function groups(ctx) {
  const body = el(html`<div class="beef-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => {
    const gs = [...snap.ix.groups.values()].sort((a, b) => a.name.localeCompare(b.name)); const can = canWrite(snap.role, "groups");
    const count = (g) => snap.data.animals.filter((a) => onFarm(a) && a.groupId === g.id).length;
    const loose = snap.data.animals.filter((a) => onFarm(a) && !a.groupId).length;
    const node = el(html`<div>${largeTitle("Groups and sheds", `${gs.length} groups · ${loose} cattle not in a group`)}${herdViews(snap.lid, "groups")}
      ${gs.length ? html`<div class="list">${gs.map((g) => { const n = count(g); return html`<div class="row"><a class="main" href="#/l/${snap.lid}/herd?f=group:${g.id}"><span class="primary">${g.name}</span><span class="secondary">${n} head${g.class ? ` · ${CLASS_NAMES[g.class]}` : ""}${g.shed && g.shed !== g.name ? ` · ${g.shed}` : ""}${g.spaces ? ` · ${g.spaces} spaces${n > g.spaces ? " — over!" : ""}` : ""}</span></a>${can ? html`<button type="button" class="icon-btn" data-edit="${g.id}" aria-label="Edit ${g.name}">${raw(icon("edit"))}</button>` : ""}</div>`; })}</div>`
        : emptyState({ sector: "beef", title: "No groups yet", body: "Groups are how you treat, weigh, feed and move cattle together — e.g. “Shed 2 finishers”." })}
      ${can ? html`<div class="act-grid"><button type="button" class="btn" data-new>Add a group</button><button type="button" class="btn secondary" data-move>Move cattle</button></div>` : ""}</div>`);
    node.querySelector("[data-new]")?.addEventListener("click", () => import("./flows/move.js").then((m) => m.groupSheet(snap)));
    node.querySelector("[data-move]")?.addEventListener("click", () => import("./flows/move.js").then((m) => m.default(snap)));
    node.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => import("./flows/move.js").then((m) => m.groupSheet(snap, snap.ix.groups.get(b.dataset.edit)))));
    body.replaceChildren(node);
  });
  await first;
  return { el: body, title: "Groups", depth: 0, tab: "herd", destroy: stop };
}
