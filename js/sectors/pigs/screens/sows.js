// Sows tab (design/13 §4.1): sow number big, parity pill, status pill; search by sow number or
// tag; filter chips; this week's service progress (§4.3) on top, as in the mockup.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel, emptyState } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { sowRow, n0, plural } from "../ui.js";
import { cycles, breedingTiles } from "../model/week.js";
import { inFilter, sowMatches, sortByNo, onFarm } from "../model/sows.js";
import { wireFlows } from "./live.js";

const FILTERS = [["all", "All"], ["served", "Served"], ["inpig", "In pig"], ["farrowing", "Farrowing"], ["suckling", "Suckling"], ["empty", "Empty"], ["gilts", "Gilts"], ["cull", "Cull"]];
const state = new Map(); // per ledger: { f, q }

export default async function sows(ctx) {
  const body = el(html`<div class="pg-page"></div>`); let cur = null; let built = false;
  wireFlows(body, () => cur);
  const st = state.get(ctx.ledger.id) || { f: "all", q: "" }; state.set(ctx.ledger.id, st);
  const list = () => {
    const snap = cur; const all = cycles(snap.c).filter((x) => x.sow.type !== "boar");
    const boars = snap.data.sows.filter((s) => s.type === "boar" && onFarm(s));
    const rows = all.filter((x) => inFilter(x.c, x.sow, st.f) && sowMatches(x.sow, st.q)).sort((a, b) => sortByNo(a.sow, b.sow));
    const showBoars = st.f === "all" && boars.length && boars.filter((b) => sowMatches(b, st.q));
    return html`${rows.length ? html`<div class="list">${rows.slice(0, 300).map((x) => sowRow(snap, x.sow, x.c))}</div>` : html`<div class="card pad t-callout ink-2">${st.q ? `No sow matches “${st.q}”.` : "No sows in this group."}</div>`}
      ${showBoars && showBoars.length ? html`<div class="section">${groupLabel("Boars", boars.length)}<div class="list">${showBoars.map((b) => sowRow(snap, b))}</div></div>` : ""}`;
  };
  const paint = (snap) => {
    cur = snap; const lid = snap.lid;
    const herd = snap.data.sows.filter(onFarm);
    const nSows = herd.filter((s) => s.type === "sow" || (s.type === "gilt" && snap.ix.litters.get(s.id)?.length)).length;
    const nGilts = herd.filter((s) => s.type === "gilt" && !snap.ix.litters.get(s.id)?.length).length;
    const nBoars = herd.filter((s) => s.type === "boar").length;
    const can = canWrite(snap.role, "sows");
    if (!herd.length) {
      body.replaceChildren(el(html`<div>${largeTitle("Sows")}${emptyState({ sector: "pigs", title: "No sows yet", body: "Add your sows with their numbers and parity — or import a list.", action: can ? "Import sows" : null, href: `#/l/${lid}/setup/sows` })}
        ${can ? html`<div style="text-align:center"><button type="button" class="text-btn" data-flow="sow">Add a sow</button></div>` : ""}</div>`));
      built = false; return;
    }
    const t = breedingTiles(snap.c); const y = window.scrollY;
    const left = t.stillToServe.slice(0, 6).map((x) => `${x.sow.sowNo} (${x.why === "weaned" ? "weaned" : x.why})`).join(", ");
    const node = el(html`<div>
      ${largeTitle("Sows", `${plural(nSows, "sow")} · ${plural(nGilts, "gilt")} · ${plural(nBoars, "boar")}`)}
      <div class="pg-search">${raw(icon("search"))}<input type="search" inputmode="numeric" placeholder="Sow number or tag" aria-label="Sow number or tag" value="${st.q}" data-q autocomplete="off"></div>
      <div class="chips pg-scroll-chips" role="radiogroup" aria-label="Show" style="margin-top:12px" data-f>${FILTERS.map(([k, l]) => { const n = k === "all" ? null : cycles(snap.c).filter((x) => x.sow.type !== "boar" && inFilter(x.c, x.sow, k)).length; return html`<button type="button" class="chip" role="radio" aria-checked="${st.f === k}" data-k="${k}"><span class="chk">${raw(icon("check", { size: 18 }))}</span>${l}${n != null ? html`<span class="count">${n}</span>` : ""}</button>`; })}</div>
      ${snap.s.breeding && !snap.s.smallHerd ? html`<div class="section"><a class="card pad pg-serve-card" href="#/l/${lid}/service" style="display:block;color:inherit;text-decoration:none">
        <div class="pg-head" style="margin:0"><b>This week's service · target ${t.target}</b><span class="ink-2">${t.served} served</span></div>
        <div class="pg-progress ${t.served >= t.target ? "" : "due"}"><i style="width:${Math.min(100, (t.served / (t.target || 1)) * 100)}%"></i></div>
        <p class="pg-note" style="margin:6px 0 0">${t.served >= t.target ? "Target reached." : left ? `Still to serve: ${left}` : `${t.target - t.served} short — bring in gilts?`}</p></a></div>` : ""}
      <div class="section" data-list></div>
      <div class="section"><div class="list"><a class="row" href="#/l/${lid}/kpis"><span class="tile">${raw(icon("chart"))}</span><span class="main"><span class="primary">Herd performance</span><span class="secondary">Pigs weaned per sow, farrowing rate, parity profile</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div></div>
      ${can ? html`<div class="pg-acts"><button type="button" class="btn secondary" data-flow="sow">${raw(icon("plus"))}Add a sow</button><a class="btn secondary" href="#/l/${lid}/setup/sows">${raw(icon("download"))}Import a list</a></div>` : ""}
    </div>`);
    node.querySelector("[data-list]").replaceChildren(el(html`<div>${list()}</div>`));
    const q = node.querySelector("[data-q]");
    q.addEventListener("input", () => { st.q = q.value.trim(); node.querySelector("[data-list]").replaceChildren(el(html`<div>${list()}</div>`)); });
    node.querySelector("[data-f]").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; st.f = b.dataset.k; node.querySelectorAll("[data-k]").forEach((x) => x.setAttribute("aria-checked", String(x === b))); node.querySelector("[data-list]").replaceChildren(el(html`<div>${list()}</div>`)); });
    const focused = built && document.activeElement?.matches?.("[data-q]");
    body.replaceChildren(node); built = true;
    if (focused) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    if (y) window.scrollTo(0, y);
  };
  const { first, stop } = liveSnap(ctx.ledger, paint);
  await first;
  return { el: body, title: "Sows", destroy: stop };
}
export { n0 };
