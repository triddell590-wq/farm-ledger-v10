// Egg entries (design/14 §6): packer collection, the weekly packer statement (reconciler), egg
// store temperature, farm-gate stock and sales. £ only for money roles, only into finance.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { textField } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { addDays } from "../../../core/dates.js";
import { entrySheet, chipsField, numField, dateField, lawNote, liveHouses, warn } from "./common.js";
import { saveCollection, saveStatement, saveStoreTemp, saveFarmGate, undoAdd } from "../actions.js";
import { reconcile, weekStart, isoWeek, lineAmount } from "../model/eggs.js";
import { parseStatement } from "../model/statement.js";
import { STATEMENT_GRADES, RULES } from "../model/content.js";
import { classB } from "../model/health.js";
import { d2, n0, n1, pounds } from "../ui.js";
import { photoStrip } from "../../../ui/photo-strip.js";

export function collectionSheet(snap, { date = null } = {}) {
  const hs = liveHouses(snap).filter((x) => x.f).map((x) => x.h);
  const locked = liveHouses(snap).filter((x) => x.f && classB(snap.data.salmSamples.filter((s) => s.flockId === x.f.id), x.f, snap.today).on).map((x) => x.h.name);
  const store = snap.data.storeTemps.find((x) => x.date === snap.today);
  const body = el(html`<form novalidate>
    ${locked.length ? warn(`${locked.join(" and ")}: Salmonella positive — eggs from ${locked.length > 1 ? "these houses" : "this house"} go as Class B.`) : ""}
    <div class="form-group">${dateField("date", "Collected", date || snap.today)}
      ${textField({ name: "packer", label: "Packer", value: snap.s.packer || "", placeholder: "Packer name" })}
      ${numField("trays", "Trays (30 eggs)", "", { step: 1 })}
      ${numField("eggs", "or eggs", "", { step: 1, optional: true })}
      ${textField({ name: "docketNo", label: "Docket no.", optional: true })}
      ${numField("storeTemp", "Store temperature at collection", store?.max ?? "", { unit: "°C", optional: true })}
      ${dateField("bestBefore", "Best before", addDays(snap.today, 28))}</div>
    ${hs.length > 1 ? html`<div class="form-group">${chipsField("houseIds", "From", hs.map((h) => [h.id, h.name]), hs.map((h) => h.id), { multi: true })}</div>` : ""}
    <h2 class="group-label"><span>By grade (if the docket gives it)</span></h2>
    <div class="form-group">${["XL", "L", "M", "S"].map((g) => numField(`g${g}`, g, "", { step: 1, optional: true }))}</div>
    ${lawNote("Lion: eggs collected at least twice a week. Best before defaults to 28 days after lay.")}
  </form>`);
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "eggDeliveries", label: "Egg collection" }, title: "Docket photo" });
  body.querySelector(".ly-law").before(strip.node);
  entrySheet({ title: "Egg collection", body, label: "Save collection", missing: (v) => (!+v.trays && !+v.eggs ? "Add trays or eggs" : null),
    save(v, sh) {
      const id = saveCollection(snap, { ...v, eggs: +v.eggs || undefined, grades: ["XL", "L", "M", "S"].map((g) => ({ grade: g, eggs: +v[`g${g}`] || 0 })), houseIds: v.houseIds });
      strip.commit(id, `Egg collection · ${v.packer || ""} ${v.date || ""}`.trim());
      sh.close(true, { force: true }); toast(`${n0(+v.eggs || +v.trays * 30)} eggs collected`, { action: "Undo", onAction: () => undoAdd(snap.lid, "eggDeliveries", id) });
    } });
}

/** Weekly packer statement → the reconciler (§6.2). */
export function statementSheet(snap, { weekStart: ws = null } = {}) {
  const money = canWrite(snap.role, "finance");
  const weeks = Array.from({ length: 6 }, (_, i) => weekStart(addDays(snap.today, -7 * (i + 1))));
  const done = new Set(snap.data.packerStatements.map((x) => x.weekStart));
  const def = ws || weeks.find((w) => !done.has(w)) || weeks[0];
  const body = el(html`<form novalidate>
    <button type="button" class="btn secondary" data-read style="margin:0 0 12px">${raw(icon("camera"))}Read the statement</button>
    ${chipsField("weekStart", "Week", weeks.map((w) => [w, `Wk ${isoWeek(w)} · ${d2(w)}`]), def)}
    <div class="form-group" style="margin-top:12px">${textField({ name: "packer", label: "Packer", value: snap.s.packer || "" })}</div>
    <h2 class="group-label"><span>Packer counted</span>${money ? html`<span>p a dozen</span>` : ""}</h2>
    <div class="form-group">${STATEMENT_GRADES.map((g) => html`<div class="field ly-grade"><label>${g}</label><input name="e:${g}" inputmode="numeric" type="number" placeholder="eggs" aria-label="${g} eggs">${money ? html`<input name="p:${g}" inputmode="decimal" type="number" step="any" placeholder="${snap.s.prices?.[g] ?? "p/doz"}" value="${snap.s.prices?.[g] ?? ""}" aria-label="${g} pence per dozen">` : ""}</div>`)}</div>
    ${money ? html`<div class="form-group">${numField("deduct", "Deductions (levy, transport)", snap.s.deductions ?? "", { unit: "£", optional: true })}${numField("paid", "Paid", "", { unit: "£", optional: true })}</div>` : html`<p class="ly-note">Prices and the payment are kept by the owner, manager or accountant.</p>`}
    <div class="ly-recon" data-recon></div>
  </form>`);
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "packerStatements", label: "Packer statement" }, title: "Statement photos" });
  body.querySelector("[data-recon]").before(strip.node);
  const es = entrySheet({ title: "Packer statement", body, label: "Save statement", missing: (v) => (!STATEMENT_GRADES.some((g) => +v[`e:${g}`]) ? "Add the eggs the packer counted" : null),
    save(v, sh) {
      const lines = STATEMENT_GRADES.map((g) => ({ grade: g, eggs: +v[`e:${g}`] || 0, ppd: +v[`p:${g}`] || 0 }));
      const id = saveStatement(snap, { weekStart: v.weekStart, packer: v.packer, lines, deductions: +v.deduct ? [{ label: "Levy and transport", amount: +v.deduct }] : [], paid: v.paid });
      strip.commit(id, `Packer statement · week ${isoWeek(v.weekStart)}`);
      sh.close(true, { force: true }); toast(`Week ${isoWeek(v.weekStart)} statement saved`, { action: "Undo", onAction: () => undoAdd(snap.lid, "packerStatements", id) });
    } });
  const paint = () => {
    const v = es.form.values(); const grades = STATEMENT_GRADES.map((g) => ({ grade: g, eggs: +v[`e:${g}`] || 0 }));
    if (!grades.some((g) => g.eggs)) { body.querySelector("[data-recon]").replaceChildren(); return; }
    const m = money ? { lines: STATEMENT_GRADES.map((g) => ({ grade: g, eggs: +v[`e:${g}`] || 0, ppd: +v[`p:${g}`] || 0 })), deductions: +v.deduct ? [{ label: "Deductions", amount: +v.deduct }] : [], amount: v.paid ? +v.paid : null } : null;
    const r = reconcile(snap.c, { weekStart: v.weekStart, grades }, m);
    body.querySelector("[data-recon]").replaceChildren(el(html`<div class="ly-sumbar">You collected <b>${n0(r.collected)}</b> · packer counted <b>${n0(r.counted)}</b><br>Difference ${r.diff > 0 ? "+" : r.diff < 0 ? "−" : ""}${n0(Math.abs(r.diff))} (${n1(Math.abs(r.pct ?? 0))}%) ${r.flag ? html`<span class="warn">⚠ over ${snap.s.packerDiffPct}%</span>` : "✓"}${r.money ? html`<br>Paid ${pounds(r.money.paid, 2)} · ${r.money.avgPpd ?? "—"}p a dozen` : ""}</div>`));
  };
  es.form.onChange(paint); paint();
  body.querySelector("[data-read]").onclick = async () => {
    const { readTextSheet } = await import("../../beef/flows/read-text.js");
    const text = await readTextSheet({ title: "Packer statement", hint: "Take a photo of the statement (or paste the text). Check what it read before you save.", onPhoto: (f) => strip.addFiles([f]) });
    if (!text) return;
    const p = parseStatement(text); let n = 0;
    const set = (name, val) => { const i = body.querySelector(`[name="${name}"]`); if (i && val != null) { i.value = val; n++; } };
    for (const l of p.lines) { set(`e:${l.grade}`, l.eggs); if (money) set(`p:${l.grade}`, l.ppd); }
    if (money) { if (p.deductions.length) set("deduct", p.deductions.reduce((t, d) => t + d.amount, 0)); set("paid", p.paid); }
    body.querySelector("input")?.dispatchEvent(new Event("input", { bubbles: true })); es.refresh(); paint();
    toast(n ? `Read ${n} figure${n > 1 ? "s" : ""} off the statement — check them` : "Couldn't read the statement — type the figures");
  };
  return es.sheet.done;
}

export function storeSheet(snap) {
  const t = snap.data.storeTemps.find((x) => x.date === snap.today);
  const body = el(html`<form novalidate><div class="form-group">${dateField("date", "Date", snap.today)}${numField("min", "Lowest", t?.min ?? "", { unit: "°C" })}${numField("max", "Highest", t?.max ?? "", { unit: "°C" })}</div>
    ${lawNote(`Lion: eggs stored below ${snap.s.storeMax} °C at a constant temperature. Read the min/max thermometer, then reset it.`)}</form>`);
  entrySheet({ title: "Egg store temperature", body, label: "Save", missing: (v) => (v.max === "" ? "Add the highest temperature" : null),
    save(v, sh) { saveStoreTemp(snap, v); sh.close(true, { force: true }); toast(+v.max >= +snap.s.storeMax ? `Egg store ${v.max} °C — over ${snap.s.storeMax} °C` : "Egg store temperature saved"); } });
}

export function farmGateSheet(snap, { kind = "sale" } = {}) {
  const money = canWrite(snap.role, "finance");
  const body = el(html`<form novalidate>${chipsField("kind", "What", [["stock", "Eggs into farm-gate stock"], ["sale", "Eggs sold"]], kind)}
    <div class="form-group" style="margin-top:12px">${dateField("date", "Date", snap.today)}${dateField("layDate", "Laid on", snap.today)}${numField("eggs", "Eggs", "", { step: 1 })}${money ? numField("amount", "Takings", "", { unit: "£", optional: true }) : ""}</div>
    ${lawNote(RULES.ungraded.NI.text)}</form>`);
  entrySheet({ title: "Farm gate", body, label: "Save", missing: (v) => (!+v.eggs ? "Add the number of eggs" : null),
    save(v, sh) { saveFarmGate(snap, v); sh.close(true, { force: true }); toast(v.kind === "sale" ? `${v.eggs} eggs sold` : `${v.eggs} eggs into farm-gate stock`); } });
}
export { lineAmount };
