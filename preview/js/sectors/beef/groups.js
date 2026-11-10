// Groups and sheds (design/10 §4.1, §6.6): management groups with head count, class, shed and
// spaces. Tap a group to see its cattle in the herd list; edit or add groups. Each group also shows
// what it's eating and can change it here (Tom, 5 Nov) — the same feed the Feed & silage budget uses.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { canWrite } from "../../core/policy.js";
import { listDateY, num } from "../../ui/format.js";
import { largeTitle, emptyState } from "../../screens/common.js";
import { herdViews, toolLinks } from "./ui.js";
import { liveSnap } from "./data.js";
import { onFarm, CLASS_NAMES } from "./model/animals.js";
import { feedForGroup, rationOn, mealToday, pitGeom, silageList } from "./model/feed.js";

const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const kgT = (v) => `${num(v, v < 10 ? 1 : 0)} kg`;
/** Group line (Tom, 10 Nov): what the whole group gets a day, then what each head gets. */
export function rationLines(row) {
  if (!row || !row.ration) return null;
  const blocksOnly = row.blocks && !row.silage;
  const group = [row.meal ? `${kgT(row.meal)} meal` : "", blocksOnly ? `${num(row.blocks, 1)} silage block${row.blocks === 1 ? "" : "s"}` : row.silage ? `${kgT(row.silage)} silage` : ""].filter(Boolean);
  const head = [row.meal ? `${kgT(row.perHead)} meal` : "", row.silage ? `${kgT(row.silageHead)} silage` : ""].filter(Boolean);
  return { group: group.length ? `${group.join(" + ")} a day` : "No meal or silage", head: row.heads ? (head.length ? `${head.join(" + ")} a head` : "") : "No cattle in the group" };
}

export default async function groups(ctx) {
  const body = el(html`<div class="beef-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => { const y = window.scrollY; body.replaceChildren(render(snap)); if (y) window.scrollTo(0, y); });
  await first;
  return { el: body, title: "Groups", depth: 0, tab: "herd", destroy: stop };
}

function render(snap) {
  const { data, ix, lid, today } = snap;
  const gs = [...ix.groups.values()].sort((a, b) => a.name.localeCompare(b.name)); const can = canWrite(snap.role, "groups"); const canFeed = canWrite(snap.role, "feedGroups");
  const count = (g) => data.animals.filter((a) => onFarm(a) && a.groupId === g.id).length;
  const loose = data.animals.filter((a) => onFarm(a) && !a.groupId).length;
  const blockKg = pitGeom(silageList(snap.meta.silage)[0] || {})?.blockKg || 0;
  const meal = mealToday(data.feedGroups, data.feedAdjust, data, today, blockKg); const rowOf = new Map(meal.rows.map((r) => [r.group.id, r]));
  const bud = snap.silage;
  const node = el(html`<div>${largeTitle("Groups and sheds", `${plural(gs.length, "group", "groups")} · ${loose === 1 ? "1 animal" : num(loose) + " cattle"} not in a group`)}${herdViews(lid, "groups")}
    ${gs.length ? html`<a class="card pad grp-feedsum" href="#/l/${lid}/feed">
        <span class="grp-fs-line"><span>Meal a day</span><b>${kgT(meal.kg)}</b></span>
        ${meal.silage ? html`<span class="grp-fs-line"><span>Silage a day</span><b>${meal.silage >= 1000 ? `${num(meal.silage / 1000, 2)} t` : kgT(meal.silage)}</b></span>` : ""}
        ${bud ? html`<span class="grp-fs-line"><span>Silage lasts until</span><b>${bud.runOut ? listDateY(bud.runOut).slice(4) : "—"}</b></span>` : ""}
        <span class="grp-fs-open">Fodder budget and silage${raw(icon("chevron"))}</span></a>` : ""}
    ${gs.length ? html`<div class="grp-list">${gs.map((g) => { const n = count(g); const fg = feedForGroup(data.feedGroups, g, data); const r = fg && rationOn(fg, today); const L = r && rationLines(rowOf.get(fg.id));
        return html`<div class="card grp-card">
          <div class="row"><a class="main" href="#/l/${lid}/herd?f=group:${g.id}"><span class="primary">${g.name}</span><span class="secondary">${plural(n, "head", "head")}${g.class ? ` · ${CLASS_NAMES[g.class]}` : ""}${g.shed && g.shed !== g.name ? ` · ${g.shed}` : ""}${g.spaces ? ` · ${g.spaces} spaces${n > g.spaces ? " — over!" : ""}` : ""}</span></a>${can ? html`<button type="button" class="icon-btn" data-edit="${g.id}" aria-label="Edit ${g.name}">${raw(icon("edit"))}</button>` : ""}</div>
          <button type="button" class="row grp-feed" data-feed="${g.id}" ${canFeed ? "" : "disabled"}><span class="tile neutral">${raw(icon("feed"))}</span><span class="main">
            <span class="primary">${L ? L.group : "Feed not set"}</span>
            <span class="secondary">${L ? `${L.head}${fg.rations.length > 1 ? ` · since ${listDateY(r.from).slice(4)}` : ""}` : canFeed ? "Tap to set what this group eats" : "Nobody has set this group's feed"}</span></span>${canFeed ? html`<span class="chev">${raw(icon("chevron"))}</span>` : ""}</button></div>`; })}</div>`
      : emptyState({ sector: "beef", title: "No groups yet", body: "Groups are how you treat, weigh, feed and move cattle together — e.g. “Shed 2 finishers”." })}
    ${can ? html`<div class="act-grid"><button type="button" class="btn" data-new>Add a group</button><button type="button" class="btn secondary" data-move>Move cattle</button></div>` : ""}
    ${toolLinks(lid, `/l/${lid}/groups`, "Groups", [["fodder", "Fodder budget"], ["meal", "Meal calculator"], ["slurry", "Slurry storage"]])}</div>`);
  node.querySelector("[data-new]")?.addEventListener("click", () => import("./flows/move.js").then((m) => m.groupSheet(snap)));
  node.querySelector("[data-move]")?.addEventListener("click", () => import("./flows/move.js").then((m) => m.default(snap)));
  node.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => import("./flows/move.js").then((m) => m.groupSheet(snap, ix.groups.get(b.dataset.edit)))));
  node.querySelectorAll("[data-feed]").forEach((b) => (b.onclick = () => { if (!canFeed) return; const hg = ix.groups.get(b.dataset.feed);
    import("./feed.js").then((m) => m.groupFeedSheet(snap, feedForGroup(data.feedGroups, hg, data), { herdGroup: hg })); }));
  return node;
}
