// Finishing planner (design/10 §7): every animal with an age deadline, sorted by days left to
// the nearest one; BCRS and processor-spec dates, estimated carcase, ready-by, flags, value.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { textField } from "../../ui/form.js";
import { toast } from "../../ui/toast.js";
import { canRead, canWrite, canWriteMeta } from "../../core/policy.js";
import { daysBetween } from "../../core/dates.js";
import { listDate, num, moneyText } from "../../ui/format.js";
import { backLink, largeTitle, emptyState } from "../../screens/common.js";
import { liveSnap } from "./data.js";
import { entrySheet } from "./flows/common.js";
import { setMeta, setMarketPrices, updateAnimal } from "./actions.js";
import { tagParts } from "./model/tags.js";
import { pill, tagHtml } from "./ui.js";
import { deadlineAnimals, finishingFacts } from "./model/finishing.js";
import { ageText, classOf } from "./model/animals.js";
import { BCRS_PAYMENT } from "./model/rules.js";

export default async function finishing(ctx) {
  const body = el(html`<div class="beef-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => { const y = window.scrollY; body.replaceChildren(render(snap)); if (y) window.scrollTo(0, y); });
  await first;
  return { el: body, title: "Finishing", depth: 1, tab: "herd", destroy: stop };
}

function render(snap) {
  const { data, s, ix, today, lid } = snap; const money = canRead(snap.role, "finance");
  const list = deadlineAnimals(data, ix, today).map((a) => ({ a, f: finishingFacts(data, s, ix, a, today) }))
    .sort((x, y) => (x.f.nearest && x.f.nearest.left >= 0 ? x.f.nearest.left : 99999) - (y.f.nearest && y.f.nearest.left >= 0 ? y.f.nearest.left : 99999));
  const total = list.reduce((t, x) => t + (x.f.estCarcase || 0), 0) * (+s.price.perKgDead || 0);
  const priceAge = s.price.enteredOn ? daysBetween(s.price.enteredOn, today) : null;
  const can = canWrite(snap.role, "animals"); const load = list.filter(({ a }) => a.loadBooked);
  const factory = snap.contacts.find((c) => /factory|processor|abattoir/i.test(`${c.kind || ""} ${c.role || ""}`));
  const node = el(html`<div>${backLink(`#/l/${lid}/herd`, "Herd")}${largeTitle("Finishing", `${list.length} head · sorted by days left to the nearest deadline`)}
    ${load.length ? html`<div class="card pad load-card"><b>Load: ${load.length} booked in</b>${factory?.phone ? html` · <a href="tel:${factory.phone}">Phone ${factory.name}</a>` : ""}<div class="act-grid" style="margin-top:10px"><button type="button" class="btn" data-load-sell>Make the kill sheet</button><button type="button" class="btn secondary" data-load-clear>Clear the load</button></div></div>` : ""}
    ${list.length ? html`<div class="list">${list.map(({ a, f }) => { const n = f.nearest; const lvl = n && n.left >= 0 ? (n.left <= 14 ? "late" : n.left <= 30 ? "due" : "neutral") : "neutral";
      return html`<div class="row finish-row"><a class="main" href="#/l/${lid}/animal/${a.id}"><span class="primary">${tagHtml(a.tag)}</span>
        <span class="secondary">${ageText(a, today)}${f.lw ? ` · ${num(Math.round(f.estNow))} kg est.` : " · not weighed"}${f.gain ? ` · ${f.gain.toFixed(2)}/day` : ""}${classOf(ix, a, today) !== "finisher" ? ` · ${classOf(ix, a, today)}` : ""}</span>
        <span class="secondary">${f.bcrs ? `BCRS ${listDate(f.bcrs.date).slice(4)}` : "No BCRS (not NI-born)"} · Spec ${listDate(f.spec).slice(4)}${f.estCarcase ? ` · est. ${Math.round(f.estCarcase)} kg` : ""}${f.readyBy ? ` · ready ${f.readyBy <= today ? "now" : listDate(f.readyBy).slice(4)}` : ""}</span>
        ${f.flags.filter((x) => x.level === "due").map((x) => html`<span class="secondary due-ink">${x.text}</span>`)}</a>
        ${can ? html`<button type="button" class="text-btn book-in" data-book="${a.id}">${a.loadBooked ? "On the load ✓" : "Book in"}</button>` : ""}
        ${n ? pill(lvl, n.left >= 0 ? `${n.left} d` : "Passed") : ""}</div>`; })}</div>`
      : emptyState({ sector: "beef", title: "No finishing cattle", body: "Put cattle in a Finishing group to see their deadlines and ready dates.", action: "Choose cattle", href: `#/l/${lid}/groups` })}
    ${money && list.length ? html`<button type="button" class="card pad value-line" data-price>${s.price.perKgDead ? html`<span>Value today (at £${s.price.perKgDead}/kg dead, entered ${listDate(s.price.enteredOn).slice(4)}): <b>${moneyText(total)}</b></span>${priceAge > 14 ? html`<span class="due-ink"> Price is ${Math.round(priceAge / 7)} weeks old — update</span>` : ""}` : html`<span>Add today's price per kg dead to see what they're worth ›</span>`}</button>` : ""}
    ${money ? html`<p class="hint">BCRS pays £${BCRS_PAYMENT} for each clean NI-born animal killed within the age limit (${s.bcrsMonths || "yearly"} months) after 60 of the last 100 days with you.</p>` : ""}
    <div class="act-grid"><a class="btn secondary" href="#/l/${lid}/paperwork/finishing-list">${raw(icon("print"))}Finishing list</a><a class="btn secondary" href="#/l/${lid}/targets">Processor spec</a></div>
  </div>`);
  node.querySelector("[data-price]")?.addEventListener("click", () => priceSheet(snap));
  // Book in (design/10 §7): adds the animal to a load; the load becomes the factory kill sheet.
  node.querySelectorAll("[data-book]").forEach((b) => (b.onclick = () => {
    const a = snap.ix.byId.get(b.dataset.book); const on = !a.loadBooked;
    updateAnimal(lid, a, { loadBooked: on ? today : null });
    toast(on ? `${tagParts(a.tag).tail} booked in${factory ? ` — ring ${factory.name} to give them the date` : ""}` : "Taken off the load");
  }));
  node.querySelector("[data-load-sell]")?.addEventListener("click", () => import("./flows/sale.js").then((m) => m.default(snap, { animalIds: load.map(({ a }) => a.id), kind: "factory" })));
  node.querySelector("[data-load-clear]")?.addEventListener("click", () => load.forEach(({ a }) => updateAnimal(lid, a, { loadBooked: null })));
  return node;
}
function priceSheet(snap) {
  if (!canWrite(snap.role, "finance")) { toast("Only the owner, a manager or the accountant can change the price."); return; }
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "p", label: "Price per kg dead (£)", value: snap.s.price.perKgDead || "", inputmode: "decimal" })}</div><p class="hint">Type the price your factory quoted. We don't fetch prices.</p></form>`);
  entrySheet({ title: "Today's price", body, label: "Save price", missing: (v) => (!(+v.p > 0) ? "Add the price" : null), save(v, sh) { setMarketPrices(snap.lid, snap, { perKgDead: +v.p, enteredOn: snap.today }); sh.close(true, { force: true }); toast("Price saved"); } });
}
