// Dairy milk money (design/12 §7.1 Cheques, §9): milk statements → actual pence per litre,
// milk solids, cheque vs the processor-profile estimate, "what if" base price slider and MOPF.
// Statements are finance records (category "Milk" + a `cheque` block): only Owner, Manager and
// Accountant can read them (rules hide `finance` from workers and Vet/Adviser) — so no £ value
// is ever stored anywhere else in a dairy ledger.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { textField, checkRow } from "../../../ui/form.js";
import { confirmSheet } from "../../../ui/sheet.js";
import { canRead, canWrite } from "../../../core/policy.js";
import { addRecord, updateRecord, softDelete } from "../../../services/records.js";
import { openMoneySheet } from "../../../ui/money-sheet.js";
import { moneyText, num } from "../../../ui/format.js";
import { largeTitle, backLink, emptyState } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { sectionOf, kvRows, barChart } from "../ui.js";
import { entrySheet } from "../flows/common.js";
import { chequeCheck, whatIf, mopf } from "../model/money.js";
import { onFarm, groupOf } from "../model/cows.js";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (ym) => (ym ? `${MON[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}` : "");
const p2 = (x) => (x == null || Number.isNaN(x) ? "—" : `${x.toFixed(2)}p`);
const n = (v) => (v === "" || v == null ? null : +String(v).replace(/[£,\s]/g, ""));

export const chequesOf = (snap) => snap.data.finance.filter((r) => !r.deleted && r.kind === "revenue" && r.category === "Milk" && r.cheque).sort((a, b) => String(b.cheque.month || b.date).localeCompare(String(a.cheque.month || a.date)));
const inMilk = (snap) => snap.data.animals.filter((a) => onFarm(a) && groupOf(snap.ix, a, snap.today) === "milking").length;

export default async function moneyScreen(ctx) {
  const isTab = ctx.tabId === "money";
  const body = el(html`<div class="dairy-page"></div>`);
  const st = { delta: 0, month: null };
  const { first, stop } = liveSnap(ctx.ledger, (snap) => body.replaceChildren(moneyBody(snap, st, { header: true, isTab })));
  const snap = await first;
  return { el: body, title: "Milk money", depth: isTab ? 0 : 1, tab: isTab ? "money" : "more", destroy: stop, fab: canWrite(snap.role, "finance") ? () => chequeSheet(snap) : null };
}

/** The money body (used by the Money screen and the Milk tab's Cheques segment). */
export function moneyBody(snap, st = { delta: 0 }, { header = false, isTab = false } = {}) {
  const { lid, s } = snap; const w = canWrite(snap.role, "finance");
  if (!canRead(snap.role, "finance")) return el(html`<div class="card pad t-callout ink-2" style="margin-top:12px">Milk cheques and prices are for the owner, managers and the accountant.</div>`);
  const ch = chequesOf(snap); const prof = s.price;
  const rows = ch.map((r) => ({ r, c: r.cheque, f: chequeCheck(prof, { ...r.cheque, total: r.amount }) }));
  const last = rows[0];
  const wi = whatIf(ch, st.delta, snap.today);
  const months = [...new Set([...snap.data.finance.filter((r) => !r.deleted && (r.category === "Milk" || r.category === "Feed")).map((r) => (r.cheque?.month || String(r.date).slice(0, 7)))])].sort().reverse().slice(0, 12);
  const month = st.month && months.includes(st.month) ? st.month : months[0];
  const mCheque = ch.find((r) => (r.cheque.month || r.date.slice(0, 7)) === month);
  const mp = month ? mopf(snap.data.finance.map((r) => (r.cheque?.month ? { ...r, date: `${r.cheque.month}-15` } : r)), month, mCheque?.cheque?.cows || inMilk(snap)) : null;
  const trend = rows.slice(0, 12).reverse();
  const node = el(html`<div>
    ${header ? html`${isTab ? "" : backLink(`#/l/${lid}/more`, "More")}${largeTitle("Milk money", [s.processor || "Processor not set", s.collection === "alternate" ? "alternate-day collection" : "daily collection"].join(" · "))}` : ""}
    ${!rows.length ? emptyState({ sector: "dairy", title: "No milk statements yet", body: "Add a statement to see what you were really paid per litre.", action: w ? "Add a statement" : null, actAttr: "data-add" }) : html`
      <div class="tiles" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
        <div class="num-tile hero" style="grid-column:span 2"><span class="label">Actually paid · ${monthName(last.c.month)}</span><span class="value">${p2(last.f.ppl)}<small style="font-size:17px"> per litre</small></span>
          <span class="delta">${moneyText(last.f.total, true)} for ${num(last.c.litres)} L${last.f.estPpl != null ? ` · profile estimate ${p2(last.f.estPpl)} (${last.f.diff >= 0 ? "+" : "−"}${moneyText(Math.abs(last.f.diff), true)})` : " · set your price profile to check it"}</span></div>
        <div class="num-tile"><span class="label">Milk solids</span><span class="value">${num(Math.round(last.f.solidsKg))}<small style="font-size:15px"> kg</small></span><span class="delta">${last.f.perKgSolids ? `£${last.f.perKgSolids.toFixed(2)} per kg` : "add fat and protein"}</span></div>
        <div class="num-tile"><span class="label">Constituents</span><span class="value" style="font-size:24px">${last.c.fat ?? "—"}% · ${last.c.protein ?? "—"}%</span><span class="delta">fat · protein</span></div></div>
      ${trend.length > 1 ? sectionOf("Pence per litre by month", html`<div class="card pad">${barChart(trend.map((x) => x.f.ppl), { labels: trend.map((x) => MON[+String(x.c.month).slice(5, 7) - 1] || "") })}</div>`) : ""}
      ${sectionOf("Statements", html`<div class="list">${rows.map(({ r, c, f }) => html`<button type="button" class="row no-lead" data-id="${r.id}"><span class="main"><span class="primary">${monthName(c.month)}</span><span class="secondary">${num(c.litres)} L · ${p2(f.ppl)}/L${c.scc ? ` · SCC ${c.scc}k` : ""}${c.tbc ? ` · TBC ${c.tbc}k` : ""}${f.estPpl != null ? ` · ${Math.abs(f.diff) < 1 ? "matches the estimate" : `${f.diff > 0 ? "above" : "below"} estimate by ${moneyText(Math.abs(f.diff), true)}`}` : ""}</span></span><span class="kv-v">${moneyText(f.total, true)}</span></button>`)}</div>
        ${w ? html`<button type="button" class="btn secondary" data-add style="margin-top:8px">Add a statement</button>` : ""}`, rows.length)}
      ${sectionOf("What if the base price moves?", html`<div class="card pad"><p class="t-callout" style="margin:0">Base price ${st.delta > 0 ? "+" : st.delta < 0 ? "−" : "±"}${Math.abs(st.delta).toFixed(1)}p per litre → <b data-wi>${wi.effect >= 0 ? "+" : "−"}${moneyText(Math.abs(wi.effect))}</b> a year</p>
        <input class="slider" type="range" min="-5" max="5" step="0.5" value="${st.delta}" data-slider aria-label="Change in base price, pence per litre">
        <p class="formula">${num(wi.litres)} litres a year${wi.months < 12 ? ` (from ${wi.months} month${wi.months === 1 ? "" : "s"} of statements, scaled to 12)` : ""} × change in pence ÷ 100.</p></div>`)}`}
    ${months.length ? sectionOf("Margin over purchased feed (MOPF)", html`<div class="chips scroll-chips" role="radiogroup" aria-label="Month">${months.map((m) => html`<button type="button" class="chip" role="radio" aria-checked="${m === month}" data-month="${m}">${monthName(m)}</button>`)}</div>
      <div class="card pad" style="margin-top:8px">${kvRows([
        ["Milk income", moneyText(mp.milkGBP, true)], ["Purchased feed", `−${moneyText(mp.feedGBP, true)}`], ["Margin over purchased feed", moneyText(mp.margin, true), mp.margin < 0 ? "late" : "ok"],
        ["Per cow per day", mp.perCowDay != null ? `£${mp.perCowDay.toFixed(2)}` : "—"], ["Per litre", mp.ppl != null ? p2(mp.ppl) : "—"],
        ["Concentrate per litre", mp.concPerLitre != null ? `${mp.concPerLitre.toFixed(2)} kg/L` : "add kg to feed deliveries"]])}
        <p class="formula">(Milk £ − purchased feed £) ÷ cow-days (${num(mp.cowDays)}: ${mCheque?.cheque?.cows || inMilk(snap)} cows in milk × days) and ÷ litres. Feed = this ledger's money-out entries in "Feed" for the month.</p></div>
      ${w ? html`<button type="button" class="btn secondary" data-feed style="margin-top:8px">Add a feed delivery</button>` : ""}`) : ""}
  </div>`);
  const sl = node.querySelector("[data-slider]");
  if (sl) sl.oninput = () => { st.delta = +sl.value; const x = whatIf(ch, st.delta, snap.today); node.querySelector("[data-wi]").textContent = `${x.effect >= 0 ? "+" : "−"}${moneyText(Math.abs(x.effect))}`; sl.previousElementSibling.firstChild.textContent = `Base price ${st.delta > 0 ? "+" : st.delta < 0 ? "−" : "±"}${Math.abs(st.delta).toFixed(1)}p per litre → `; };
  node.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => chequeSheet(snap)));
  node.querySelectorAll("[data-id]").forEach((b) => (b.onclick = () => w && chequeSheet(snap, ch.find((r) => r.id === b.dataset.id))));
  node.querySelectorAll("[data-month]").forEach((b) => (b.onclick = () => { st.month = b.dataset.month; node.replaceWith(moneyBody(snap, st, { header, isTab })); }));
  const fb = node.querySelector("[data-feed]"); if (fb) fb.onclick = () => feedSheet(snap);
  return node;
}

/** Add / edit a milk statement. */
export function chequeSheet(snap, existing = null) {
  const c = existing?.cheque || {}; const adj = (k) => (c.adjustments || []).find((x) => x.label === k)?.amount ?? "";
  const prev = new Date(snap.today.slice(0, 7) + "-15"); prev.setMonth(prev.getMonth() - 1);
  const body = el(html`<form novalidate>
    <div class="form-group">${textField({ name: "month", label: "Milk month", type: "month", value: c.month || prev.toISOString().slice(0, 7) })}${textField({ name: "date", label: "Paid on", type: "date", value: existing?.date || snap.today })}
      ${textField({ name: "litres", label: "Litres", value: c.litres ?? "", inputmode: "numeric", placeholder: "98,400" })}${textField({ name: "cows", label: "Cows in milk (average)", value: c.cows ?? inMilk(snap) ?? "", inputmode: "numeric", optional: true })}</div>
    <p class="form-label">Quality on the statement</p>
    <div class="form-group">${textField({ name: "fat", label: "Butterfat %", value: c.fat ?? "", inputmode: "decimal", optional: true })}${textField({ name: "protein", label: "Protein %", value: c.protein ?? "", inputmode: "decimal", optional: true })}
      ${textField({ name: "scc", label: "SCC (thousands)", value: c.scc ?? "", inputmode: "numeric", optional: true })}${textField({ name: "tbc", label: "TBC / Bactoscan (thousands)", value: c.tbc ?? "", inputmode: "numeric", optional: true })}</div>
    <p class="form-label">Money</p>
    <div class="form-group">${textField({ name: "basePpl", label: "Base price (p per litre)", value: c.basePpl ?? snap.s.price.basePpl ?? "", inputmode: "decimal" })}
      ${textField({ name: "constituents", label: "Constituent adjustment (£, − if docked)", value: adj("Constituents"), inputmode: "decimal", optional: true })}${textField({ name: "bonus", label: "Bonuses / penalties (£)", value: adj("Bonuses / penalties"), inputmode: "decimal", optional: true })}
      ${textField({ name: "deductions", label: "Deductions (£: levies, haulage…)", value: (c.deductions || [])[0]?.amount ?? "", inputmode: "decimal", optional: true })}${textField({ name: "total", label: "Payment received (£)", value: existing?.amount ?? "", inputmode: "decimal", optional: true })}</div>
    <p class="hint" data-calc></p>
    ${existing ? html`<button type="button" class="text-btn danger" data-del style="margin-top:8px">Remove this statement</button>` : ""}</form>`);
  const build = (v) => {
    const cheque = { month: v.month, litres: n(v.litres), cows: n(v.cows), fat: n(v.fat), protein: n(v.protein), scc: n(v.scc), tbc: n(v.tbc), basePpl: n(v.basePpl), processor: snap.s.processor || "",
      adjustments: [{ label: "Constituents", amount: n(v.constituents) }, { label: "Bonuses / penalties", amount: n(v.bonus) }].filter((x) => x.amount != null), deductions: n(v.deductions) != null ? [{ label: "Deductions", amount: n(v.deductions) }] : [] };
    const f = chequeCheck(snap.s.price, { ...cheque, total: n(v.total) });
    return { cheque, f };
  };
  const es = entrySheet({ title: existing ? "Milk statement" : "Add a milk statement", body, label: "Save statement",
    missing: (v) => (!v.month ? "Add the month" : !(n(v.litres) > 0) ? "Add the litres" : n(v.basePpl) == null && n(v.total) == null ? "Add the base price or the payment" : null),
    save(v, sh) {
      const { cheque, f } = build(v);
      const data = { kind: "revenue", category: "Milk", amount: Math.round(f.total * 100) / 100, date: v.date || snap.today, note: `Milk statement ${monthName(v.month)}`, cheque };
      if (existing) updateRecord(snap.lid, "finance", existing, data); else addRecord(snap.lid, "finance", data);
      sh.close(true, { force: true }); toast(`Statement saved — ${f.ppl != null ? f.ppl.toFixed(2) + "p per litre" : ""}`);
    } });
  const calc = () => { const v = es.form.values(); if (!(n(v.litres) > 0)) { body.querySelector("[data-calc]").textContent = ""; return; } const { f } = build(v); body.querySelector("[data-calc]").textContent = `${f.ppl != null ? f.ppl.toFixed(2) + "p per litre actually paid" : ""}${f.estPpl != null ? ` · your profile estimates ${f.estPpl.toFixed(2)}p` : ""}${n(v.total) == null ? ` · worked out: ${moneyText(f.total, true)}` : ""}`; };
  es.form.onChange(calc); calc();
  const del = body.querySelector("[data-del]");
  if (del) del.onclick = async () => { if (await confirmSheet({ title: "Remove this statement?", confirm: "Remove", danger: true })) { softDelete(snap.lid, "finance", existing.id); es.sheet.close(true, { force: true }); toast("Statement removed"); } };
  return es.sheet.done;
}

/** Feed delivery (money out, Feed) with kg for concentrate per litre and the FW.8 sample tick. */
export function feedSheet(snap) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "product", label: "Feed", placeholder: "18% dairy nut" })}${textField({ name: "kg", label: "Kilograms", inputmode: "numeric", optional: true })}
    ${textField({ name: "amount", label: "Cost (£)", inputmode: "decimal" })}${textField({ name: "date", label: "Delivered", type: "date", value: snap.today })}${textField({ name: "supplier", label: "Supplier", optional: true })}${textField({ name: "batch", label: "Batch / ticket no.", optional: true })}</div>
    <div class="form-group">${checkRow("sampleKept", "Sample kept (4 weeks after last use)", true, "Red Tractor FW.8")}</div></form>`);
  return entrySheet({ title: "Feed delivery", body, label: "Save delivery", missing: (v) => (!v.product ? "Add the feed" : !(n(v.amount) > 0) ? "Add the cost" : null),
    save(v, sh) { addRecord(snap.lid, "finance", { kind: "expense", category: "Feed", amount: n(v.amount), date: v.date, note: v.product, product: v.product, kg: n(v.kg), supplier: v.supplier || "", batch: v.batch || "", sampleKept: !!v.sampleKept }); sh.close(true, { force: true }); toast("Feed delivery saved"); } }).sheet.done;
}
export { openMoneySheet, raw, icon };
