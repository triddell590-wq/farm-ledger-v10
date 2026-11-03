// A sale's page, and the "Add the kill sheet" entry for a factory sale saved before the kill sheet
// came (review A #3). The job "Add the kill sheet for 0112 Holly" and Money's "awaiting kill
// sheet" rows both open here.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { canRead, canWrite } from "../../core/policy.js";
import { backLink, largeTitle, groupLabel } from "../../screens/common.js";
import { listDate, moneyText } from "../../ui/format.js";
import { loadBeef } from "./data.js";
import { kvRows, animalLabel } from "./ui.js";
import { tagParts } from "./model/tags.js";
import { entrySheet } from "./flows/common.js";
import { readTextSheet } from "./flows/read-text.js";
import { parseKillSheet } from "./model/docket.js";
import { checkSaleLine } from "../../core/sanity.js";
import { shortName } from "./model/animals.js";
import { addKillSheet } from "./actions.js";

const KIND = { mart: "Mart", factory: "Factory", private: "Private sale", export: "Export" };

export default async function salePage(ctx) {
  const snap = await loadBeef(ctx.ledger); const lid = snap.lid;
  const body = el(html`<div class="beef-page"></div>`);
  const paint = async () => {
    const s2 = await loadBeef(ctx.ledger);
    const sale = s2.data.sales.find((x) => x.id === ctx.match.groups.id);
    if (!sale) { body.replaceChildren(el(html`<div>${backLink(`#/l/${lid}/today`, "Today")}<p>That sale isn't here any more.</p></div>`)); return; }
    const money = canRead(s2.role, "finance"); const fin = money && sale.financeId ? s2.data.finance.find((f) => f.id === sale.financeId) : null;
    const name = (l) => { const a = s2.ix.byId.get(l.animalId); return a ? animalLabel(a) : l.tag; };
    const price = (l) => fin?.lines?.find((x) => x.animalId === l.animalId)?.price;
    const node = el(html`<div>${backLink(`#/l/${lid}/today`, "Today")}${largeTitle(`${KIND[sale.kind] || "Sale"} · ${listDate(sale.date)}`, sale.buyer || "")}
      ${sale.awaitingKillSheet ? html`<div class="alert due" style="margin-top:12px"><span class="a-icon">${raw(icon("clock"))}</span><div style="flex:1"><div class="a-title">Awaiting the kill sheet</div><div class="a-body">Add the dead weights, grades${money ? " and price" : ""} when the factory sends them. Until then this sale shows in Money as "awaiting kill sheet".</div></div></div>` : ""}
      <div class="section">${groupLabel("Cattle", (sale.lines || []).length)}${kvRows((sale.lines || []).map((l) => [name(l), [l.deadKg ? `${l.deadKg} kg dead` : l.liveKg ? `${l.liveKg} kg live` : "", l.grade, money && price(l) ? moneyText(price(l)) : ""].filter(Boolean).join(" · ") || "—"]))}</div>
      ${sale.kind === "factory" && canWrite(s2.role, "sales") ? html`<button type="button" class="btn" style="width:100%;margin-top:16px" data-kill>${raw(icon("edit"))}${sale.awaitingKillSheet ? "Add the kill sheet" : "Change the kill sheet"}</button>` : ""}
    </div>`);
    node.querySelector("[data-kill]")?.addEventListener("click", async () => { if (await killSheetSheet(s2, sale)) setTimeout(paint, 60); });
    body.replaceChildren(node);
  };
  await paint();
  return { el: body, title: "Sale", depth: 2, tab: "today" };
}

/** The kill sheet for one sale: dead kg, grade and £/kg per animal. Resolves true when saved. */
export function killSheetSheet(snap, sale) {
  const money = canRead(snap.role, "finance");
  const fin = money && sale.financeId ? snap.data.finance.find((f) => f.id === sale.financeId) : null;
  const vals = {};
  for (const l of sale.lines || []) { const m = fin?.lines?.find((x) => x.animalId === l.animalId) || {}; vals[l.animalId] = { deadKg: l.deadKg || "", grade: l.grade || "", pricePerKg: m.pricePerKg || "" }; }
  const cols = [["deadKg", "Dead kg"], ["grade", "Grade"], ...(money ? [["pricePerKg", "£/kg"]] : [])];
  const tail = (l) => { const a = snap.ix.byId.get(l.animalId); return a ? shortName(a) || tagParts(a.tag).tail : tagParts(l.tag).tail; };
  const body = el(html`<form novalidate data-sector="beef">
    <button type="button" class="btn secondary" data-read style="width:100%">${raw(icon("camera"))}Kill sheet: photo or type it in</button>
    <div class="card pad" style="margin-top:12px"><table class="dose-table"><thead><tr><th>Animal</th>${cols.map(([, t]) => html`<th>${t}</th>`)}</tr></thead><tbody>
      ${(sale.lines || []).map((l) => html`<tr><td>${tail(l)}</td>${cols.map(([k]) => html`<td><input data-l="${l.animalId}" data-k="${k}" value="${vals[l.animalId][k]}" ${raw(k === "grade" ? "" : 'inputmode="decimal"')} aria-label="${k} for ${tail(l)}"></td>`)}</tr>`)}
    </tbody></table></div></form>`);
  const sync = () => body.querySelectorAll("[data-l]").forEach((i) => { vals[i.dataset.l][i.dataset.k] = i.value.trim(); });
  body.addEventListener("input", sync);
  const { sheet } = entrySheet({
    title: "Kill sheet", body, label: "Save kill sheet",
    missing: () => { sync(); return Object.values(vals).some((v) => +v.deadKg > 0) ? null : "Add at least one dead weight"; },
    checks: () => (sale.lines || []).flatMap((l) => checkSaleLine(vals[l.animalId], tail(l))),
    dirty: () => true,
    save(v, sh) {
      const r = addKillSheet(snap.lid, snap, sale, Object.entries(vals).map(([animalId, x]) => ({ animalId, ...x })));
      sh.close(true, { force: true });
      toast(`Kill sheet saved${money && r.total ? ` · ${moneyText(r.total)}` : ""}${r.still ? " · some cattle still to add" : ""}`);
    },
  });
  body.querySelector("[data-read]").onclick = async () => {
    const text = await readTextSheet({ title: "Kill sheet", hint: "Take a photo of the kill sheet or paste its text. We match each line to your cattle by the last 5 digits of the tag." });
    if (!text) return;
    const rows = (sale.lines || []).map((l) => snap.ix.byId.get(l.animalId)).filter(Boolean);
    const got = parseKillSheet(text, rows);
    for (const [id, r] of Object.entries(got)) for (const [k, x] of Object.entries(r)) if (vals[id] && k in vals[id] && x != null) { vals[id][k] = x; const i = body.querySelector(`[data-l="${id}"][data-k="${k}"]`); if (i) i.value = x; }
    toast(Object.keys(got).length ? `Read ${Object.keys(got).length} of ${rows.length} — check every line` : "Couldn't match any cattle. Type the weights in.");
  };
  return sheet.done.then((r) => r === true);
}
