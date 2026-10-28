// Money & margins (design/10 §11): this ledger's money by category, margins for the herd
// year (cost per cow, per calf weaned, per kg gained, margin per head sold), scheme payments.
// Accountants see the money list only (no animals); workers and vets never get here.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { segmented, wireForm } from "../../ui/form.js";
import { openMoneySheet } from "../../ui/money-sheet.js";
import { canRead, canWrite } from "../../core/policy.js";
import { listRecords } from "../../services/records.js";
import { money as moneyHtml, moneyText, num, recordDate } from "../../ui/format.js";
import { backLink, largeTitle, groupLabel, emptyState } from "../../screens/common.js";
import { loadBeef } from "./data.js";
import { margins, marginDoc } from "./model/reports.js";
import { printDoc } from "./ui.js";
import { SOURCES } from "./model/rules.js";

export default async function moneyScreen(ctx) {
  const { ledger } = ctx; const isTab = ctx.tabId === "money";
  const st = { year: Number(new Date().toISOString().slice(0, 4)) };
  const body = el(html`<div class="beef-page"></div>`);
  const paint = async () => {
    const ops = canRead(ledger.role, "animals");
    const snap = ops ? await loadBeef(ledger) : null;
    const fin = (snap ? snap.data.finance : await listRecords(ledger.id, "finance").catch(() => [])).filter((e) => !e.deleted && String(e.date || "").startsWith(String(st.year)));
    const by = {}; for (const e of fin) { const k = `${e.kind === "revenue" ? "in" : "out"}|${e.category || "Other"}`; by[k] = (by[k] || 0) + (+e.amount || 0); }
    const tIn = fin.filter((e) => e.kind === "revenue").reduce((t, e) => t + (+e.amount || 0), 0), tOut = fin.filter((e) => e.kind !== "revenue").reduce((t, e) => t + (+e.amount || 0), 0);
    const m = snap ? margins(snap.c, st.year) : null;
    const maxM = m ? Math.max(1, ...m.perHead.map((x) => Math.abs(x.margin))) : 1;
    const node = el(html`<div>${isTab ? "" : backLink(`#/l/${ledger.id}/more`, "More")}${largeTitle("Money & margins", `${ledger.name} · ${st.year}`)}
      <div class="seg-wrap">${segmented("year", [st.year, st.year - 1].map((y) => ({ value: String(y), label: y === Number(new Date().toISOString().slice(0, 4)) ? "This year" : "Last year" })), String(st.year))}</div>
      <div class="card pad" style="margin-top:16px"><div class="money-sum"><span class="ink-2">Money in</span><span class="v">${moneyHtml(tIn)}</span><span class="ink-2">Money out</span><span class="v">${moneyHtml(tOut)}</span><span class="ink-2">Left over</span><span class="v">${moneyHtml(tIn - tOut)}</span></div></div>
      ${m ? html`<div class="section">${groupLabel("Margins", "herd year")}<div class="tiles">
        <div class="num-tile"><span class="label">Cost per cow</span><span class="value">${m.costPerCow != null ? moneyText(m.costPerCow) : "—"}</span><span class="delta">${m.cows} cows on average</span></div>
        <div class="num-tile"><span class="label">Cost per calf weaned</span><span class="value">${m.costPerCalf != null ? moneyText(m.costPerCalf) : "—"}</span><span class="delta">${m.weaned} weaned</span></div>
        <div class="num-tile"><span class="label">Cost per kg gained</span><span class="value">${m.costPerKg != null ? `£${m.costPerKg.toFixed(2)}` : "—"}</span><span class="delta">${num(m.kgGained)} kg from weighings</span></div>
        <div class="num-tile"><span class="label">Margin per head sold</span><span class="value ${m.avgMargin != null ? (m.avgMargin >= 0 ? "ok" : "late") : ""}">${m.avgMargin != null ? moneyText(m.avgMargin) : "—"}</span><span class="delta">${m.perHead.length} sold</span></div></div>
        <p class="source">Costs not tagged to a group are split by livestock-unit days (cow 1.0, finisher 0.8, store 0.6, calf 0.4 — ${SOURCES.lu}). Sale value − purchase price − share of costs while on the farm.</p>
        ${m.perHead.length ? html`<div class="card pad bars" style="margin-top:12px">${m.perHead.slice(0, 20).map((x) => html`<div class="bar-row"><span>${x.tag ? x.tag.slice(-7) : "?"}</span><span class="bar-track"><i class="${x.margin < 0 ? "neg" : ""}" style="width:${(Math.abs(x.margin) / maxM) * 100}%"></i></span><b>${moneyText(x.margin)}</b></div>`)}</div>` : ""}
        <div class="card pad" style="margin-top:12px"><b>Scheme money</b><p style="margin:4px 0 0">Suckler Cow Scheme ${moneyText(m.sc)} · BCRS ${moneyText(m.bcrs)}</p><p class="hint" style="margin:4px 0 0">Estimates from your records until DAERA pays.</p></div>
        <button type="button" class="btn secondary" style="margin-top:12px;width:100%" data-mprint>${raw(icon("print"))}Print the margin report</button></div>` : ""}
      <div class="section">${groupLabel("By category")}<div class="list">${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => html`<div class="row no-lead kv-row"><span class="main"><span class="primary">${k.split("|")[1]}</span><span class="secondary">${k.startsWith("in") ? "Money in" : "Money out"}</span></span><span class="kv-v">${k.startsWith("in") ? "" : "−"}${moneyText(v)}</span></div>`)}</div>
        ${!fin.length ? emptyState({ iconName: "money", title: "No money entries this year", body: "Sales and purchases you record land here, with anything you add." }) : ""}</div>
      ${fin.length ? html`<div class="section">${groupLabel("Entries", fin.length)}<div class="list">${fin.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60).map((e) => html`<button type="button" class="row no-lead" data-id="${e.id}"><span class="main"><span class="primary">${e.category}</span><span class="secondary">${recordDate(e.date)}${e.note ? " · " + e.note : ""}</span>${(e.lines || []).length ? html`<span class="secondary">${e.lines.map((l) => `${l.tag || ""}${l.grade ? " " + l.grade : ""}${l.deadKg ? ` ${l.deadKg} kg` : ""}${l.price ? ` £${l.price}` : ""}`).join("; ")}</span>` : ""}</span><span class="value">${e.kind === "revenue" ? "" : "−"}${moneyText(e.amount, true)}</span></button>`)}</div></div>` : ""}
    </div>`);
    node.querySelector("[data-mprint]")?.addEventListener("click", () => printDoc(marginDoc(snap.c, m)));
    const f = wireForm(node); f.onChange(() => { st.year = Number(f.values().year); paint(); });
    node.querySelectorAll("[data-id]").forEach((b) => (b.onclick = () => openMoneySheet(ledger, fin.find((e) => e.id === b.dataset.id), { onSaved: () => setTimeout(paint, 50) })));
    body.replaceChildren(node);
  };
  await paint();
  return { el: body, title: "Money", depth: isTab ? 0 : 1, tab: isTab ? "money" : "more", fab: canWrite(ledger.role, "finance") ? () => openMoneySheet(ledger, null, { onSaved: () => setTimeout(paint, 50) }) : null };
}
export { raw, icon };
