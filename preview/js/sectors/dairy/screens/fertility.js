// Dairy → Fertility (design/12 §5.1): the daily action list with a one-tap action on every row.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { segmented, wireForm } from "../../../ui/form.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, emptyState } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { cowRow, sectionOf, cowLabel, dm } from "../ui.js";
import { actionLists, breedingFemales, fertilityOf, rates21 } from "../model/fertility.js";
import { sortByNo } from "../model/cows.js";
import { setVetList } from "../actions.js";

const flow = (name, fn = "default") => async (snap, extra) => (await import(`../flows/${name}.js`))[fn](snap, extra);
const seg = new Map();
const GROUPS = [["heats", "Heats due"], ["serve", "To serve"], ["notSeen", "Not seen bulling"], ["pd", "PD due"], ["dryOff", "Dry off"], ["calving", "Calving"], ["doNotBreed", "Do not breed"]];

export default async function fertility(ctx) {
  const body = el(html`<div class="dairy-page"></div>`);
  if (!seg.has(ctx.ledger.id)) seg.set(ctx.ledger.id, "0");
  const { first, stop } = liveSnap(ctx.ledger, (snap) => paint(body, snap));
  await first;
  return { el: body, title: "Fertility", destroy: stop };
}

function statusOf(snap, a) {
  const f = fertilityOf(snap.s, snap.ix, a, snap.today);
  if (f.doNotBreed) return "Do not breed";
  if (f.pregnant) return `In calf · due ${dm(f.due)}`;
  if (f.lastServe) return `Served ${dm(f.lastServe.date)}${f.pd?.result === "-" ? " · PD−" : ""}`;
  if (f.lastHeat) return `Last heat ${dm(f.lastHeat.date)}`;
  return f.heifer ? "Heifer, not served" : f.dim != null ? `${f.dim} DIM · nothing seen` : "—";
}

function paint(body, snap) {
  const lid = snap.lid; const w = canWrite(snap.role, "services"); const h = seg.get(lid);
  const s = snap.s; const g = actionLists(s, snap.ix, snap.data, snap.today, h === "1" ? 7 : 0);
  const r = rates21(s, snap.ix, snap.data, snap.today, 1)[0];
  const btn = (act, label, id) => (w ? html`<button type="button" class="btn secondary" data-act="${act}" data-id="${id}">${label}</button>` : "");
  const actions = {
    heats: (x) => btn("heat", "Seen bulling", x.a.id), serve: (x) => btn("serve", "Served", x.a.id),
    notSeen: (x) => (x.a.vetCheck ? html`<span class="pill info">On vet list</span>` : btn("vet", "Vet check", x.a.id)),
    pd: (x) => (w ? html`<span class="acts"><button type="button" class="btn secondary" data-act="pd+" data-id="${x.a.id}">PD+</button><button type="button" class="btn secondary" data-act="pd-" data-id="${x.a.id}">PD−</button></span>` : ""),
    dryOff: (x) => btn("dry", "Dry off", x.a.id), calving: (x) => btn("calved", "Calved", x.a.id), doNotBreed: () => "",
  };
  const extra = (k, x) => html`<span class="secondary">${x.why || (k === "dryOff" ? `dry off ${dm(x.date)} · due ${dm(x.f.due)}` : "")}</span>`;
  const all = h === "2";
  const females = breedingFemales(s, snap.ix, snap.data, snap.today).sort(sortByNo);
  const total = GROUPS.reduce((t, [k]) => t + g[k].length, 0);
  const node = el(html`<div>${largeTitle("Fertility", `${s.calvingPattern} calving · waiting period ${s.vwp} days`)}
    <div class="seg-wrap">${segmented("seg", [{ value: "0", label: "Today" }, { value: "1", label: "This week" }, { value: "2", label: "All cows" }], h)}</div>
    ${r && r.eligible ? html`<p class="hint" style="margin:8px 4px">Last complete 21 days: pregnancy rate ${r.prRate != null ? Math.round(r.prRate * 100) + "%" : "—"} · submission ${r.subRate != null ? Math.round(r.subRate * 100) + "%" : "—"} (${r.eligible} eligible). <a href="#/l/${lid}/fertility/kpis">All KPIs ›</a></p>` : ""}
    ${all ? sectionOf("All cows in the breeding loop", females.length ? html`<div class="list">${females.map((a) => cowRow(snap, a, { extra: html`<span class="secondary">${statusOf(snap, a)}</span>` }))}</div>` : html`<p class="hint">No cows or heifers yet.</p>`, females.length)
      : total ? GROUPS.filter(([k]) => g[k].length).map(([k, label]) => sectionOf(label, html`<div class="list">${g[k].map((x) => cowRow(snap, x.a, { extra: extra(k, x), action: actions[k](x) }))}</div>`, g[k].length))
      : emptyState({ sector: "dairy", title: snap.data.services.length ? "Nothing to do today" : "No services recorded", body: snap.data.services.length ? "No heats, serves, PDs, dry-offs or calvings due." : "Record heats and serves and your daily fertility list builds itself.", action: w && !snap.data.services.length ? "Record a serve" : null, actAttr: "data-first" })}
    <div class="section"><div class="list">
      <a class="row" href="#/l/${lid}/fertility/vet"><span class="tile">${raw(icon("people"))}</span><span class="main"><span class="primary">Vet visit list</span><span class="secondary">${snap.data.animals.filter((a) => a.vetCheck && !a.offDate).length} cows · PDs, non-cyclers, checks</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
      <a class="row" href="#/l/${lid}/fertility/sires"><span class="tile">${raw(icon("dairy"))}</span><span class="main"><span class="primary">Sire plan and straws</span><span class="secondary">Sexed, conventional or beef sire</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
      <a class="row" href="#/l/${lid}/fertility/kpis"><span class="tile">${raw(icon("scale"))}</span><span class="main"><span class="primary">Fertility KPIs</span><span class="secondary">21-day pregnancy rate, submission, calving interval</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div></div>
  </div>`);
  body.replaceChildren(node);
  wireForm(node).onChange(() => { seg.set(lid, node.querySelector("[data-seg] [aria-checked=true]").dataset.value); setTimeout(() => paint(body, snap), 180); });
  const first = node.querySelector("[data-first]"); if (first) first.onclick = () => flow("breeding", "serveSheet")(snap);
  node.querySelectorAll("[data-act]").forEach((b) => (b.onclick = (e) => {
    e.preventDefault(); const id = b.dataset.id; const a = snap.ix.byId.get(id);
    ({ heat: () => flow("breeding", "heatSheet")(snap, { animalIds: [id] }), serve: () => flow("breeding", "serveSheet")(snap, { animalId: id }), "pd+": () => flow("breeding", "pdSheet")(snap, { animalId: id, result: "+" }), "pd-": () => flow("breeding", "pdSheet")(snap, { animalId: id, result: "-" }), dry: () => flow("dryoff")(snap, { animalId: id }), calved: () => flow("calving")(snap, { animalId: id }),
      vet: () => { setVetList(lid, a, "Not seen bulling"); toast(`${cowLabel(a)} added to the vet list`); } })[b.dataset.act]();
  }));
}
