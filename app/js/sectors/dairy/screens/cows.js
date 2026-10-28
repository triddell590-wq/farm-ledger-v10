// Dairy → Cows (design/12 §4.1): herd list by group, cow number leads, one urgent pill per cow.
import { viewPills } from "../../../ui/view-pills.js";
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { num } from "../../../ui/format.js";
import { largeTitle, emptyState } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { cowRow } from "../ui.js";
import { onFarm, groupOf, cowMatches, sortByNo } from "../model/cows.js";

const GROUPS = [["milking", "Milking"], ["dry", "Dry"], ["heifer", "Heifers"], ["calf", "Calves"], ["cull", "To cull"], ["all", "All"]];
const state = new Map(); // per ledger: { g, q }

export default async function cows(ctx) {
  const body = el(html`<div class="dairy-page"></div>`);
  const st = state.get(ctx.ledger.id) || { g: "milking", q: "" }; state.set(ctx.ledger.id, st);
  let last = null;
  const { first, stop } = liveSnap(ctx.ledger, (snap) => { last = snap; paint(body, snap, st); });
  await first; void last;
  return { el: body, title: "Cows", destroy: stop };
}

function paint(body, snap, st) {
  const herd = snap.data.animals.filter(onFarm);
  const inG = (a, g) => (g === "all" ? true : g === "cull" ? !!(a.cull?.on || a.doNotBreed) : groupOf(snap.ix, a, snap.today) === g);
  const counts = Object.fromEntries(GROUPS.map(([g]) => [g, herd.filter((a) => inG(a, g)).length]));
  const sub = ["milking", "dry", "heifer", "calf"].map((g) => `${num(counts[g])} ${g === "milking" ? "in milk" : g === "dry" ? "dry" : g === "heifer" ? "heifers" : "calves"}`).join(" · ");
  const node = el(html`<div>${largeTitle("Cows", sub)}${viewPills(snap.lid, [["cows", "All cows"], ["calves", "Calves"], ["scores", "Mobility & BCS"]], "cows", "Cow views")}
    <div class="filter-bar"><div class="field search-field">${raw(icon("search"))}<input type="search" placeholder="Cow number, name or tag" aria-label="Search cows" data-q value="${st.q}" autocomplete="off"></div>
      <div class="chips scroll-chips" role="radiogroup" aria-label="Group">${GROUPS.map(([g, label]) => html`<button type="button" class="chip" role="radio" aria-checked="${st.g === g}" data-g="${g}"><span class="chk">${raw(icon("check", { size: 18 }))}</span>${label}<span class="count">${counts[g]}</span></button>`)}</div></div>
    <div data-list></div></div>`);
  const list = node.querySelector("[data-list]");
  const draw = () => {
    const rows = herd.filter((a) => (st.q ? cowMatches(a, st.q) : inG(a, st.g))).sort(sortByNo);
    if (!herd.length) {
      list.replaceChildren(el(emptyState({ sector: "dairy", title: "No cows yet", body: "Import your herd from a milk-recording or NIFAIS list, or add cows one at a time.", action: canWrite(snap.role, "animals") ? "Import herd" : null, href: `#/l/${snap.lid}/imports` })));
      if (canWrite(snap.role, "animals")) { const b = el(html`<button type="button" class="btn secondary" style="margin-top:8px">Add a cow</button>`); b.onclick = async () => (await import("../flows/cow-edit.js")).addCowSheet(snap); list.append(b); }
      return;
    }
    list.replaceChildren(rows.length ? el(html`<div class="list">${rows.map((a) => cowRow(snap, a))}</div>`) : el(html`<p class="hint" style="padding:16px">${st.q ? `No cows match “${st.q}”.` : "None in this group."}</p>`));
  };
  draw();
  body.replaceChildren(node);
  node.querySelector("[data-q]").addEventListener("input", (e) => { st.q = e.target.value; draw(); });
  node.querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => { st.g = b.dataset.g; st.q = ""; node.querySelector("[data-q]").value = ""; node.querySelectorAll("[data-g]").forEach((x) => x.setAttribute("aria-checked", String(x === b))); draw(); }));
}
