// Feed & silage (design/10 §8): fodder budget, silage pits (v9 pit drawing, block by block)
// and bales, meal and feed groups (v9 rations kept), meal today and this winter.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { textField, stepperField, wireForm } from "../../ui/form.js";
import { toast } from "../../ui/toast.js";
import { canRead, canWrite, canWriteMeta } from "../../core/policy.js";
import { addDays, shortDate } from "../../core/dates.js";
import { listDate, num, moneyText } from "../../ui/format.js";
import { addRecord, updateRecord } from "../../services/records.js";
import { backLink, largeTitle, groupLabel, emptyState } from "../../screens/common.js";
import { liveSnap } from "./data.js";
import { entrySheet, cattleRow } from "./flows/common.js";
import { setMeta, softDelete, setMarketPrices } from "./actions.js";
import { pitGeom, silageList, headByClass, fodderBudget, mealToday, feedEaten, silageStock } from "./model/feed.js";
import { CLASS_NAMES } from "./model/animals.js";
import { SOURCES } from "./model/rules.js";

export default async function feed(ctx) {
  const body = el(html`<div class="beef-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => { const y = window.scrollY; body.replaceChildren(render(snap)); if (y) window.scrollTo(0, y); });
  await first;
  return { el: body, title: "Feed & silage", depth: 1, tab: "more", destroy: stop };
}

function winterStart(today) { const y = Number(today.slice(0, 4)); const md = today.slice(5); return md >= "09-01" ? `${y}-09-01` : `${y - 1}-09-01`; }

function render(snap) {
  const { data, s, ix, today, lid, meta } = snap; const money = canRead(snap.role, "finance");
  const sil = meta.silage || {}; const pits = silageList(sil); const bud = snap.silage; const heads = headByClass(data, ix, today);
  const meal = mealToday(data.feedGroups, data.feedAdjust, data, today); const price = +s.meal.pricePerTonne || 0;
  const firstPit = pitGeom(pits[0] || {});
  const winter = feedEaten(data.feedGroups, data.feedAdjust, data, winterStart(today), today, firstPit ? firstPit.blockKg : 0);
  const canSil = canWriteMeta(snap.role, "silage"); const canFeed = canWrite(snap.role, "feedGroups");
  const node = el(html`<div>${backLink(`#/l/${lid}/more`, "More")}${largeTitle("Feed & silage", `Winter ${winterStart(today).slice(0, 4)}/${String(Number(winterStart(today).slice(0, 4)) + 1).slice(2)}`)}
    ${bud ? html`<div class="card"><div class="card-head">Fodder budget</div><div class="list">
        <div class="row no-lead kv-row"><span class="main"><span class="primary">Silage lasts until</span></span><span class="kv-v" style="font-size:22px">${bud.runOut ? listDate(bud.runOut).slice(4) + " " + bud.runOut.slice(0, 4) : "—"}</span></div>
        <div class="row no-lead kv-row"><span class="main"><span class="primary">Turnout planned</span></span><button type="button" class="text-btn" data-turnout>${sil.turnout ? listDate(sil.turnout).slice(4) : "Add a date"}</button></div>
        ${bud.short != null ? html`<div class="row no-lead kv-row"><span class="main"><span class="primary">${bud.short > 0 ? "Short by" : "Spare"}</span></span><span class="kv-v ${bud.short > 0 ? "late" : "ok"}">${bud.short > 0 ? `${bud.short} days · ${num(bud.shortT)} t` : `${-bud.short} days`}</span></div>` : ""}
        <div class="row no-lead kv-row"><span class="main"><span class="primary">In stock</span><span class="secondary">${num(bud.leftT)} t fresh${pits[0]?.dm ? ` · ${num((bud.leftT * pits[0].dm) / 100)} t dry matter` : ""} · eating ${num(bud.perDay, 1)} t a day</span></span></div></div>
      <p class="form-label" style="padding:0 16px">Who's eating <span class="ink-3">t/month</span></p>
      <div class="list">${Object.entries(heads).map(([k, h]) => html`<div class="row no-lead kv-row"><span class="main"><span class="primary">${CLASS_NAMES[k]}</span></span><span class="kv-v">${h} × ${s.fodderRates[k] ?? 1} = ${num(h * (s.fodderRates[k] ?? 1), 1)}</span></div>`)}</div>
      <p class="source" style="padding:0 16px 8px">${SOURCES.fodder}</p>
      <div class="act-grid" style="padding:0 16px 12px;margin:0"><a class="btn secondary" href="#/l/${lid}/targets#fodder">Change rates</a><button type="button" class="btn secondary" data-whatif>What if I sell some?</button></div></div>`
      : emptyState({ sector: "beef", title: "No silage recorded", body: "Measure your pit or count your bales to see how long it'll last.", action: canSil ? "Add a pit" : null, actAttr: "data-addpit" })}
    ${pits.length ? html`<div class="section">${groupLabel("Silage pits")}${pits.map((p, i) => pitCard(p, i, bud && i === 0 ? silageStock(sil, { feedGroups: data.feedGroups, adjust: data.feedAdjust, data, today }) : null, canSil))}</div>` : ""}
    ${(sil.bales || []).length ? html`<div class="section">${groupLabel("Bales")}<div class="list">${sil.bales.map((b) => html`<div class="row no-lead kv-row"><span class="main"><span class="primary">${b.name || "Bales"}</span></span><span class="kv-v">${b.count} × ${b.kg} kg = ${num((b.count * b.kg) / 1000, 1)} t</span></div>`)}</div></div>` : ""}
    ${canSil ? html`<div class="act-grid">${pits.length ? html`<button type="button" class="btn secondary" data-addpit>Add a pit</button>` : ""}<button type="button" class="btn secondary" data-bales>${(sil.bales || []).length ? "Change bales" : "Add bales"}</button></div>` : ""}
    <div class="section">${groupLabel("Meal")}
      <div class="tiles"><div class="num-tile"><span class="label">Meal today</span><span class="value">${num(meal.kg)} kg</span><span class="delta">${money && price ? moneyText((meal.kg / 1000) * price) : `${meal.rows.length} group${meal.rows.length === 1 ? "" : "s"}`}</span></div>
      <div class="num-tile"><span class="label">This winter so far</span><span class="value">${num(winter.meal / 1000, 1)} t</span><span class="delta">${money && price ? moneyText((winter.meal / 1000) * price) : "since 1 Sep"}</span></div></div>
      ${meal.rows.length ? html`<div class="list" style="margin-top:12px">${meal.rows.map((r) => html`<button type="button" class="row no-lead" data-fg="${r.group.id}"><span class="main"><span class="primary">${r.group.name}</span><span class="secondary">${r.heads} head · ${r.perHead} kg/head meal${rationSil(r.group, today)}</span></span><span class="kv-v">${num(r.meal)} kg</span></button>`)}</div>` : html`<div class="card pad ink-2" style="margin-top:12px">No feed groups yet. A feed group is who gets the same meal — e.g. “Shed 2 finishers, 5 kg”.</div>`}
      ${canFeed ? html`<div class="act-grid"><button type="button" class="btn secondary" data-newfg>Add a feed group</button><a class="btn secondary" href="#/l/${lid}/tools/meal">Meal calculator</a></div>` : ""}
      ${money && canWrite(snap.role, "finance") ? html`<p class="hint">Meal price: ${price ? `£${price}/t` : "not set"} · <button type="button" class="text-btn" data-price>Change</button></p>` : ""}</div>
    ${money ? html`<div class="section">${groupLabel("Feed bought")}<a class="row card no-lead" href="#/l/${lid}/paperwork/feedrecords"><span class="main"><span class="primary">Feed records (3 years)</span><span class="secondary">From Money, category Feed. Keep the receipts.</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div>` : ""}
  </div>`);
  node.querySelector("[data-turnout]")?.addEventListener("click", () => canSil && dateSheet(snap, "Turnout planned", sil.turnout, (d) => setMeta(lid, "silage", { turnout: d })));
  node.querySelectorAll("[data-addpit]").forEach((b) => (b.onclick = () => pitSheet(snap, null, pits.length)));
  node.querySelectorAll("[data-pit]").forEach((b) => (b.onclick = () => pitSheet(snap, pits[+b.dataset.pit], +b.dataset.pit)));
  node.querySelectorAll("[data-used]").forEach((b) => (b.onclick = () => usedSheet(snap, +b.dataset.used)));
  node.querySelector("[data-bales]")?.addEventListener("click", () => balesSheet(snap));
  node.querySelector("[data-whatif]")?.addEventListener("click", () => whatIf(snap, heads));
  node.querySelector("[data-newfg]")?.addEventListener("click", () => groupFeedSheet(snap));
  node.querySelectorAll("[data-fg]").forEach((b) => (b.onclick = () => canFeed && groupFeedSheet(snap, data.feedGroups.find((g) => g.id === b.dataset.fg))));
  node.querySelector("[data-price]")?.addEventListener("click", () => priceSheet(snap));
  return node;
}
function rationSil(g, today) { const r = (g.rations || []).filter((x) => x.from <= today).sort((a, b) => b.from.localeCompare(a.from))[0]; if (!r) return ""; return +r.blocks ? ` · ${r.blocks} block${+r.blocks > 1 ? "s" : ""}${+r.every > 1 ? ` every ${r.every} days` : " a day"}` : +r.silage ? ` · ${r.silage} kg silage` : ""; }

function pitCard(p, i, stock, can) {
  const g = pitGeom(p); if (!g) return html`<div class="card pad">${p.name || "Pit"}: ${num(+p.pitTonnes || 0)} t ${can ? html`<button type="button" class="text-btn" data-pit="${i}">Measure it</button>` : ""}</div>`;
  const eatenBlocks = Math.min(g.blocks, Math.round((+p.usedBlocks || 0) + (stock ? (stock.rationT * 1000) / g.blockKg : 0)));
  const usedCols = Math.floor(eatenBlocks / (g.across * g.high)); const partial = eatenBlocks % (g.across * g.high);
  const cols = Math.min(g.deep, 40); const scale = g.deep / cols;
  const cells = []; for (let r = 0; r < g.across; r++) for (let c = 0; c < cols; c++) { const realC = Math.floor(c * scale); cells.push(realC < usedCols || (realC === usedCols && r < Math.round((partial / (g.across * g.high)) * g.across)) ? 1 : 0); }
  return html`<div class="card pad pit-card"><div class="card-head" style="padding:0">${p.name || `Pit ${i + 1}`}${can ? html`<button type="button" class="text-btn" data-pit="${i}">Edit</button>` : ""}</div>
    <p class="hint" style="margin:4px 0">${num(g.L)} × ${num(g.W)} × ${num(g.H)} ft · ${num(g.tonnes)} t fresh · ${num(g.blocks)} blocks of ${num(g.blockKg)} kg${p.openedOn ? ` · opened ${shortDate(p.openedOn)}` : ""}</p>
    <div class="pit" style="grid-template-columns:repeat(${cols},1fr)" role="img" aria-label="${eatenBlocks} of ${g.blocks} blocks used, open face on the left">${cells.map((u) => html`<i class="${u ? "used" : ""}"></i>`)}</div>
    <p class="hint" style="margin:8px 0 0">${num(eatenBlocks)} of ${num(g.blocks)} blocks used · open face on the left${p.dm ? ` · DM ${p.dm}%` : ""}${p.me ? ` · ME ${p.me}` : ""}${p.dValue ? ` · D-value ${p.dValue}` : ""}</p>
    ${can ? html`<button type="button" class="btn secondary" data-used="${i}" style="margin-top:12px">Used today</button>` : ""}</div>`;
}
function savePits(snap, pits) { setMeta(snap.lid, "silage", { pits }); }
function pitSheet(snap, p, i) {
  p = p || {}; const pits = [...silageList(snap.meta.silage)];
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "name", label: "Name", value: p.name || `Pit ${i + 1}` })}
    ${textField({ name: "lenFt", label: "Length (ft)", value: p.lenFt ?? p.lengthFt ?? "", inputmode: "decimal" })}${textField({ name: "widFt", label: "Width (ft)", value: p.widFt ?? p.widthFt ?? "", inputmode: "decimal" })}${textField({ name: "htFt", label: "Settled height (ft)", value: p.htFt ?? p.heightFt ?? "", inputmode: "decimal" })}</div>
    <p class="form-label">Your grab's block</p><div class="form-group">${textField({ name: "grabFt", label: "Grab width (ft)", value: p.grabFt ?? 4, inputmode: "decimal" })}${textField({ name: "biteFt", label: "Bite depth (ft)", value: p.biteFt ?? 2.5, inputmode: "decimal" })}${textField({ name: "blockHtFt", label: "Block height (ft)", value: p.blockHtFt ?? 2.5, inputmode: "decimal" })}${textField({ name: "blockKg", label: "A weighed block (kg)", value: p.blockKg ?? "", inputmode: "decimal", optional: true })}${textField({ name: "density", label: "Density (kg/m³)", value: p.density ?? 700, inputmode: "decimal" })}</div>
    <p class="form-label">Analysis</p><div class="form-group">${textField({ name: "dm", label: "Dry matter %", value: p.dm ?? "", inputmode: "decimal", optional: true })}${textField({ name: "me", label: "ME (MJ/kg DM)", value: p.me ?? "", inputmode: "decimal", optional: true })}${textField({ name: "cp", label: "Crude protein %", value: p.cp ?? "", inputmode: "decimal", optional: true })}${textField({ name: "dValue", label: "D-value", value: p.dValue ?? "", inputmode: "decimal", optional: true })}</div>
    <div class="form-group" style="margin-top:12px">${textField({ name: "openedOn", label: "Pit opened", type: "date", value: p.openedOn || "" })}</div>
    <p class="hint">Silage eaten is worked out from the feed groups' rations since the pit opened (as before), plus any blocks you tick off with “Used today”.</p></form>`);
  entrySheet({ title: p.name ? `Edit ${p.name}` : "Add a pit", body, label: "Save pit", missing: (v) => (!(+v.lenFt > 0 && +v.widFt > 0 && +v.htFt > 0) ? "Add length, width and height" : null),
    save(v, sh) { const np = { ...p, ...v }; for (const k of ["lenFt", "widFt", "htFt", "grabFt", "biteFt", "blockHtFt", "blockKg", "density", "dm", "me", "cp", "dValue"]) np[k] = v[k] === "" ? null : +v[k]; pits[i] = np; savePits(snap, pits); sh.close(true, { force: true }); toast("Pit saved"); } });
}
function usedSheet(snap, i) {
  const pits = [...silageList(snap.meta.silage)]; const p = pits[i];
  const body = el(html`<form novalidate><div class="form-group">${stepperField("n", "Blocks used today", 2, { min: 1, max: 60 })}</div></form>`);
  entrySheet({ title: "Used today", body, label: "Save", missing: () => null, save(v, sh) { pits[i] = { ...p, usedBlocks: (+p.usedBlocks || 0) + (+v.n || 0), openedOn: p.openedOn || snap.today }; savePits(snap, pits); sh.close(true, { force: true }); toast(`${v.n} blocks ticked off`, { action: "Undo", onAction: () => savePits(snap, silageList(snap.meta.silage).map((x, j) => (j === i ? p : x))) }); } });
}
function balesSheet(snap) {
  const b = (snap.meta.silage?.bales || [])[0] || {};
  const body = el(html`<form novalidate><div class="form-group">${stepperField("count", "Bales", +b.count || 0, { min: 0, max: 5000, step: 5 })}${textField({ name: "kg", label: "Average weight (kg)", value: b.kg || 650, inputmode: "decimal" })}</div></form>`);
  entrySheet({ title: "Bales", body, label: "Save bales", missing: () => null, save(v, sh) { setMeta(snap.lid, "silage", { bales: +v.count ? [{ name: "Bales", count: +v.count, kg: +v.kg || 650 }] : [] }); sh.close(true, { force: true }); toast("Bales saved"); } });
}
function dateSheet(snap, label, value, done) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "d", label, type: "date", value: value || "" })}</div></form>`);
  entrySheet({ title: label, body, label: "Save", missing: () => null, save(v, sh) { done(v.d || null); sh.close(true, { force: true }); toast("Saved"); } });
}
function whatIf(snap, heads) {
  const body = el(html`<form novalidate><p class="hint" style="margin-top:0">Change the numbers to see the run-out date move.</p><div class="form-group">${Object.entries(heads).map(([k, h]) => stepperField(k, CLASS_NAMES[k], h, { min: 0, max: 2000 }))}</div><div class="card pad" data-out style="margin-top:12px"></div></form>`);
  const f = wireForm(body);
  const paint = () => { const v = f.values(); const hh = {}; Object.keys(heads).forEach((k) => (hh[k] = +v[k] || 0)); const b = fodderBudget({ leftT: snap.silage.leftT, heads: hh, rates: snap.s.fodderRates, today: snap.today, turnout: snap.meta.silage?.turnout || null });
    body.querySelector("[data-out]").replaceChildren(el(html`<div><div class="t-title">Lasts until ${b.runOut ? listDate(b.runOut) : "—"}</div>${b.short != null ? html`<div class="${b.short > 0 ? "late-ink" : "ok-ink"}">${b.short > 0 ? `${b.short} days short of turnout` : `${-b.short} days spare`}</div>` : ""}</div>`)); };
  f.onChange(paint); paint();
  openSheet({ title: "What if?", body, cancelText: "Done" });
}
function priceSheet(snap) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "p", label: "Meal price (£ per tonne)", value: snap.s.meal.pricePerTonne || "", inputmode: "decimal" })}</div></form>`);
  entrySheet({ title: "Meal price", body, label: "Save", missing: () => null, save(v, sh) { setMarketPrices(snap.lid, snap, { pricePerTonne: +v.p || null }); sh.close(true, { force: true }); toast("Saved"); } });
}
/** Feed group (v9 shape): name, animalIds, rations [{ from, meal, silage, blocks, every }]. */
function groupFeedSheet(snap, g = null) {
  const r = g ? (g.rations || []).slice().sort((a, b) => b.from.localeCompare(a.from))[0] || {} : {};
  const body = el(html`<form novalidate><div class="form-group" data-who>${textField({ name: "name", label: "Name", value: g?.name || "", placeholder: "e.g. Shed 2 finishers" })}</div>
    <p class="form-label">Ration per head per day</p><div class="form-group">${textField({ name: "from", label: "From", type: "date", value: snap.today })}${textField({ name: "meal", label: "Meal (kg)", value: r.meal ?? "", inputmode: "decimal" })}${textField({ name: "silage", label: "Silage (kg)", value: r.silage ?? "", inputmode: "decimal", optional: true })}${textField({ name: "blocks", label: "Or silage blocks for the group", value: r.blocks ?? "", inputmode: "decimal", optional: true })}${textField({ name: "every", label: "…every (days)", value: r.every ?? 1, inputmode: "numeric", optional: true })}</div>
    <p class="hint">A change of ration starts from the date you give; earlier days keep the old ration.</p>${g ? html`<button type="button" class="text-btn" data-del>Remove this feed group</button>` : ""}</form>`);
  const who = cattleRow(snap, { label: "Cattle", ids: (g?.animalIds || []).filter((id) => snap.ix.byId.get(id)) });
  body.querySelector("[data-who]").append(who.node);
  const { sheet } = entrySheet({ title: g ? "Feed group" : "Add a feed group", body, label: "Save feed group", missing: (v) => (!v.name ? "Name the group" : !who.ids().length ? "Choose the cattle" : null),
    save(v, sh) {
      const ration = { from: v.from, meal: v.meal === "" ? 0 : +v.meal, silage: v.blocks ? 0 : +v.silage || 0, blocks: +v.blocks || 0, every: +v.every || 1 };
      const rations = [...(g?.rations || []).filter((x) => x.from !== v.from), ration].sort((a, b) => a.from.localeCompare(b.from));
      if (g) updateRecord(snap.lid, "feedGroups", g, { name: v.name, animalIds: who.ids(), rations }); else addRecord(snap.lid, "feedGroups", { name: v.name, animalIds: who.ids(), rations });
      sh.close(true, { force: true }); toast("Feed group saved");
    } });
  body.querySelector("[data-del]")?.addEventListener("click", () => { softDelete(snap.lid, "feedGroups", g.id); sheet.close(true, { force: true }); toast("Feed group removed"); });
  void addDays;
}
