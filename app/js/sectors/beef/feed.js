// Feed & silage (design/10 §8): fodder budget, silage pits (v9 pit drawing, block by block)
// and bales, meal and feed groups (v9 rations kept), meal today and this winter.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { textField, stepperField, wireForm, segmented } from "../../ui/form.js";
import { toast } from "../../ui/toast.js";
import { canRead, canWrite, canWriteMeta } from "../../core/policy.js";
import { addDays, shortDate } from "../../core/dates.js";
import { listDate, num, moneyText, listDateY } from "../../ui/format.js";
import { addRecord, updateRecord } from "../../services/records.js";
import { backLink, largeTitle, groupLabel, emptyState } from "../../screens/common.js";
import { liveSnap } from "./data.js";
import { entrySheet, cattleRow } from "./flows/common.js";
import { setMeta, softDelete, setMarketPrices } from "./actions.js";
import { pitGeom, silageList, headByClass, fodderBudget, mealToday, feedEaten, silageStock, rationOn, mealFor } from "./model/feed.js";
import { CLASS_NAMES, onFarm } from "./model/animals.js";
import { SOURCES } from "./model/rules.js";
import { costsFor, costSection } from "./feed-cards.js";

export default async function feed(ctx) {
  const body = el(html`<div class="beef-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => { const y = window.scrollY; body.replaceChildren(render(snap)); if (y) window.scrollTo(0, y); });
  await first;
  return { el: body, title: "Feed & silage", depth: 1, tab: "today", destroy: stop };
}

function winterStart(today) { const y = Number(today.slice(0, 4)); const md = today.slice(5); return md >= "09-01" ? `${y}-09-01` : `${y - 1}-09-01`; }

function render(snap) {
  const { data, s, ix, today, lid, meta } = snap; const money = canRead(snap.role, "finance");
  const sil = meta.silage || {}; const pits = silageList(sil); const bud = snap.silage; const heads = headByClass(data, ix, today);
  const firstPit = pitGeom(pits[0] || {}); const blockKg = firstPit ? firstPit.blockKg : 0;
  const meal = mealToday(data.feedGroups, data.feedAdjust, data, today, blockKg); const price = +s.meal.pricePerTonne || 0;
  const winter = feedEaten(data.feedGroups, data.feedAdjust, data, winterStart(today), today, firstPit ? firstPit.blockKg : 0);
  const canSil = canWriteMeta(snap.role, "silage"); const canFeed = canWrite(snap.role, "feedGroups");
  const node = el(html`<div>${backLink(`#/l/${lid}/today`, "Today")}${largeTitle("Feed & silage", `Winter ${winterStart(today).slice(0, 4)}/${String(Number(winterStart(today).slice(0, 4)) + 1).slice(2)}`)}
    ${bud ? html`<div class="card"><div class="card-head">Fodder budget</div><div class="list">
        <div class="row no-lead kv-row"><span class="main"><span class="primary">Silage lasts until</span></span><span class="kv-v" style="font-size:22px">${bud.runOut ? listDateY(bud.runOut).slice(4) : "—"}</span></div>
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
    ${feedTable(snap, meal, winter, "silage", { blockKg, canFeed })}
    ${feedTable(snap, meal, winter, "meal", { price: money ? price : 0, canFeed })}
      ${canFeed ? html`<div class="act-grid"><button type="button" class="btn secondary" data-newfg>Add a feed group</button><a class="btn secondary" href="#/l/${lid}/tools/meal">Meal calculator</a></div>` : ""}
      ${money ? html`<button type="button" class="card pad fc-prices" id="prices" data-price ${canWrite(snap.role, "finance") ? "" : "disabled"}><span class="mc-line"><span>Meal price</span><b>${price ? `£${num(price)} a tonne` : "not set"}</b></span><span class="mc-line"><span>Silage value</span><b>${+s.meal.silagePerTonne ? `£${num(+s.meal.silagePerTonne)} a tonne` : "not set"}</b></span>${canWrite(snap.role, "finance") ? html`<span class="mc-open">Change prices${raw(icon("chevron"))}</span>` : ""}</button>` : ""}
    ${costSection(snap, costsFor(snap), { lid })}
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
/** Silage or meal (Tom, 10 Nov): the same layout for both — today and this winter, then every
 *  group's whole-group amount a day with what each head gets, then the total a day. */
function feedTable(snap, today, winter, kind, { blockKg = 0, price = 0, canFeed }) {
  const isMeal = kind === "meal"; const rows = today.rows.filter((r) => r.ration && (isMeal ? r.meal : r.silage || r.blocks));
  const total = isMeal ? today.kg : today.silage; const season = isMeal ? winter.meal : winter.silage;
  const kg = (v) => (v >= 1000 ? `${num(v / 1000, 2)} t` : `${num(v, v < 10 ? 1 : 0)} kg`);
  const cost = (v) => (price ? moneyText((v / 1000) * price, true) : "");
  return html`<div class="section">${groupLabel(isMeal ? "Meal" : "Silage")}
    <div class="tiles"><div class="num-tile"><span class="label">${isMeal ? "Meal" : "Silage"} a day</span><span class="value">${kg(total)}</span><span class="delta">${isMeal && price ? cost(total) : `${rows.length} group${rows.length === 1 ? "" : "s"}`}</span></div>
    <div class="num-tile"><span class="label">This winter so far</span><span class="value">${num(season / 1000, 1)} t</span><span class="delta">${isMeal && price ? cost(season) : "since 1 Sep"}</span></div></div>
    ${rows.length ? html`<div class="list feed-table" style="margin-top:12px">${rows.map((r) => { const v = isMeal ? r.meal : r.silage; const head = isMeal ? r.perHead : r.silageHead;
        return html`<button type="button" class="row no-lead" data-fg="${r.group.id}" ${canFeed ? "" : "disabled"}><span class="main"><span class="primary">${r.group.name}</span>
          <span class="secondary">${r.heads} head · ${kg(head)} a head${!isMeal && r.blocks ? ` · ${num(r.blocks, 1)} block${r.blocks === 1 ? "" : "s"} a day` : ""}${isMeal && price ? ` · ${cost(head)} a head` : ""}</span></span>
          <span class="ft-v"><b>${!isMeal && r.blocks && !blockKg ? `${num(r.blocks, 1)} blocks` : kg(v)}</b><span>${isMeal && price ? `${cost(v)} a day` : "a day"}</span></span></button>`; })}
      <div class="row no-lead ft-total"><span class="main"><span class="primary">Total a day</span></span><span class="ft-v"><b>${kg(total)}</b>${isMeal && price ? html`<span>${cost(total)}</span>` : ""}</span></div></div>
      ${!isMeal && rows.some((r) => r.blocks) && !blockKg ? html`<p class="hint">Measure the pit to turn blocks into kg.</p>` : ""}`
    : html`<div class="card pad ink-2" style="margin-top:12px">${isMeal ? "No meal set for any group." : "No silage set for any group."} Set each group's feed here or in Herd → Groups.</div>`}</div>`;
}

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
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "p", label: "Meal price (£ a tonne)", value: snap.s.meal.pricePerTonne || "", inputmode: "decimal" })}${textField({ name: "sv", label: "Silage value (£ a tonne)", value: snap.s.meal.silagePerTonne || "", inputmode: "decimal", optional: true })}</div>
    <p class="hint">The silage value is what a tonne of your silage cost to make (contractor, fertiliser, plastic) or would sell for — about £30–45 a tonne fresh. It's only used for each group's feed cost and margin, never added to Money.</p></form>`);
  entrySheet({ title: "Feed prices", body, label: "Save", missing: () => null, save(v, sh) { setMarketPrices(snap.lid, snap, { pricePerTonne: +v.p || null, silagePerTonne: +v.sv || null }); sh.close(true, { force: true }); toast("Saved"); } });
}
/** Feed group (v9 shape): name, animalIds, rations [{ from, meal, silage, blocks, every }]. Linked to a
 *  herd group (groupId) it feeds whoever is in that group — set from Herd → Groups (Tom, 5 Nov). */
export function groupFeedSheet(snap, g = null, { herdGroup = null } = {}) {
  const hg = herdGroup || (g?.groupId ? snap.ix.groups.get(g.groupId) : null);
  const r = g ? rationOn(g, "9999-12-31") || {} : {};
  const groupHeads = hg ? snap.data.animals.filter((a) => onFarm(a) && a.groupId === hg.id).length : 0;
  const price = canRead(snap.role, "finance") ? +snap.s.meal.pricePerTonne || 0 : 0; const money = canRead(snap.role, "finance");
  const blockKg = pitGeom(silageList(snap.meta.silage)[0] || {})?.blockKg || 0;
  const quality = (() => { const d = +(silageList(snap.meta.silage)[0]?.dValue) || 0; return d >= 70 ? "good" : d && d < 65 ? "poor" : "average"; })();
  // the form takes the WHOLE GROUP's amounts (Tom, 10 Nov); older rations were kept per head
  const h0 = groupHeads || (g?.animalIds || []).filter((id) => snap.ix.byId.get(id) && onFarm(snap.ix.byId.get(id))).length;
  const r1 = (v) => (v ? String(Math.round(v * 10) / 10) : "");
  const mealG = r.mealGroup ?? (r.meal != null && h0 ? r1(+r.meal * h0) : ""), silG = r.silageGroup ?? (+r.silage && h0 ? r1(+r.silage * h0) : "");
  const how = +r.blocks ? "blocks" : "kg";
  const body = el(html`<form novalidate class="ration-form"><div class="form-group" data-who>${hg ? "" : textField({ name: "name", label: "Name", value: g?.name || "", placeholder: "e.g. Shed 2 finishers" })}</div>
    ${hg ? html`<p class="hint" style="margin-top:0">Feeds everyone in <b>${hg.name}</b>. Cattle moved in or out are fed from the day they move.</p>` : ""}
    <div class="form-group">${textField({ name: "from", label: "Starting", type: "date", value: snap.today })}</div>
    <h3 class="ration-h">Meal <span>the whole group, each day</span></h3>
    <div class="form-group">${textField({ name: "mealGroup", label: "Meal for the group (kg a day)", value: mealG, inputmode: "decimal", placeholder: "0" })}</div>
    <div class="chips ration-guide" data-guide></div>
    <h3 class="ration-h">Silage <span>the whole group, each day</span></h3>
    <div class="seg-wrap">${segmented("how", [{ value: "kg", label: "Weighed in kg" }, { value: "blocks", label: "Grab blocks" }], how)}</div>
    <div class="form-group" data-kg>${textField({ name: "silageGroup", label: "Silage for the group (kg a day)", value: silG, inputmode: "decimal", placeholder: "0", optional: true })}</div>
    <div class="form-group" data-blocks>${textField({ name: "blocks", label: "Blocks for the group", value: r.blocks || "", inputmode: "decimal", optional: true })}${textField({ name: "every", label: "Every (days)", value: r.every ?? 1, inputmode: "numeric", optional: true })}</div>
    <div class="card pad ration-sum" data-sum aria-live="polite"></div>
    <p class="hint">A change of ration starts from the date you give; earlier days keep the old ration.</p>${g ? html`<button type="button" class="text-btn" data-del>${hg ? "Stop recording feed for this group" : "Remove this feed group"}</button>` : ""}</form>`);
  const who = hg ? null : cattleRow(snap, { label: "Cattle", ids: (g?.animalIds || []).filter((id) => snap.ix.byId.get(id)), onChange: () => paint() });
  if (who) body.querySelector("[data-who]").append(who.node);
  const ids = () => (hg ? snap.data.animals.filter((a) => onFarm(a) && a.groupId === hg.id).map((a) => a.id) : who.ids());
  const heads = () => (hg ? groupHeads : who.ids().filter((id) => onFarm(snap.ix.byId.get(id) || {})).length);
  const form = wireForm(body);
  const kg = (v) => `${num(v, v < 10 ? 2 : 1)} kg`; const cost = (v) => moneyText((v / 1000) * price, true);
  function paint() {
    const v = form.values(); const n = heads(); const blocks = v.how === "blocks";
    body.querySelector("[data-kg]").hidden = blocks; body.querySelector("[data-blocks]").hidden = !blocks;
    body.querySelector("[data-guide]").replaceChildren(...(n ? [0.8, 1, 1.2].map((gain) => { const per = mealFor(quality, gain);
      return el(html`<button type="button" class="chip" data-gain="${per * n}">Guide for ${gain.toFixed(1)} kg/day gain: ${num(per * n, 1)} kg (${per} kg a head)</button>`); }) : []));
    const meal = +v.mealGroup || 0; const every = +v.every > 1 ? +v.every : 1;
    const silage = blocks ? ((+v.blocks || 0) / every) * blockKg : +v.silageGroup || 0;
    const lines = [];
    lines.push(html`<div class="rs-head">${n ? `${n} head in the group` : "No cattle in the group yet"}</div>`);
    if (n && meal) lines.push(html`<div class="rs-line"><span>Meal a head</span><b>${kg(meal / n)} a day</b></div>`);
    if (n && meal && price) lines.push(html`<div class="rs-line"><span>Meal cost a head</span><b>${cost(meal / n)} a day</b></div>`, html`<div class="rs-line"><span>Meal cost for the group</span><b>${cost(meal)} a day · ${cost(meal * 7)} a week</b></div>`);
    else if (n && meal && money) lines.push(html`<div class="rs-line ink-2"><span>Add a meal price on Feed & silage to see the cost</span></div>`);
    if (n && silage) lines.push(html`<div class="rs-line"><span>Silage a head</span><b>${kg(silage / n)} a day</b></div>`, html`<div class="rs-line"><span>Silage for the group</span><b>${kg(silage)} a day</b></div>`);
    if (n && blocks && +v.blocks && !blockKg) lines.push(html`<div class="rs-line ink-2"><span>Measure the pit to turn blocks into kg</span></div>`);
    body.querySelector("[data-sum]").replaceChildren(el(html`<div>${lines}</div>`));
    body.querySelectorAll("[data-gain]").forEach((b) => (b.onclick = () => { const f = body.querySelector("input[name=mealGroup]"); f.value = r1(+b.dataset.gain); f.dispatchEvent(new Event("input", { bubbles: true })); }));
  }
  form.onChange(paint); paint();
  const { sheet } = entrySheet({ title: hg ? `${hg.name}: feed` : g ? "Feed group" : "Add a feed group", body, label: "Save feed",
    missing: (v) => (!hg && !v.name ? "Name the group" : !hg && !who.ids().length ? "Choose the cattle" : !+v.mealGroup && !(v.how === "blocks" ? +v.blocks : +v.silageGroup) ? "Add the meal or silage" : null),
    save(v, sh) {
      const n = heads(); const blocks = v.how === "blocks"; const meal = +v.mealGroup || 0; const sil = blocks ? 0 : +v.silageGroup || 0;
      // whole-group amounts, plus per head at the time for older readers (v9 / Morning Board)
      const ration = { from: v.from || snap.today, mealGroup: meal, silageGroup: blocks ? null : sil, meal: n ? Math.round((meal / n) * 100) / 100 : 0, silage: n && !blocks ? Math.round((sil / n) * 100) / 100 : 0, blocks: blocks ? +v.blocks || 0 : 0, every: blocks ? +v.every || 1 : 1 };
      const rations = [...(g?.rations || []).filter((x) => x.from !== ration.from), ration].sort((a, b) => a.from.localeCompare(b.from));
      const rec = { name: hg ? hg.name : v.name, animalIds: ids(), rations, ...(hg ? { groupId: hg.id } : {}) };
      if (g) updateRecord(snap.lid, "feedGroups", g, rec); else addRecord(snap.lid, "feedGroups", rec);
      sh.close(true, { force: true }); toast(hg ? `${hg.name}: feed saved` : "Feed group saved");
    } });
  body.querySelector("[data-del]")?.addEventListener("click", () => { softDelete(snap.lid, "feedGroups", g.id); sheet.close(true, { force: true }); toast(hg ? "Feed stopped" : "Feed group removed"); });
  void addDays;
}
