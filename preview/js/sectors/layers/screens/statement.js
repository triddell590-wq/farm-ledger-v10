// The packer reconciler for one weekly statement (design/14 §6.2): you collected (Σ daily sheets,
// less withheld days and farm-gate sales) vs packer counted, the difference with the alert at the
// setting (0.5%), and the grade table. Prices, deductions and the payment come from the linked
// finance record and are shown to money roles only. "Send query to packer" shares the difference.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canRead } from "../../../core/policy.js";
import { largeTitle, backLink } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { d2, n0, n1, pounds, table } from "../ui.js";
import { reconcile } from "../model/eggs.js";
import { STATEMENT_GRADES } from "../model/content.js";

export default async function statement(ctx) {
  const id = ctx.match.groups.id;
  return liveScreen(ctx, { title: "Packer statement", tab: "eggs", paint: (snap) => {
    const st = snap.data.packerStatements.find((x) => x.id === id);
    const back = backLink(`#/l/${snap.lid}/eggs/packer`, "Packer");
    if (!st) return html`<div>${back}${largeTitle("Statement not found")}</div>`;
    return html`<div>${back}${largeTitle(`Week ${st.week}`, `${st.packer || "Packer"} statement · w/c ${d2(st.weekStart)}`)}${statementCard(snap, st, { full: true })}</div>`;
  }, after: (node, snap) => node.querySelector("[data-query]")?.addEventListener("click", (e) => import("./eggs.js").then((m) => m.sendQuery(snap, e.currentTarget.dataset.query))) });
}

/** Reconciler card + grade table. Money columns only for roles that read finance. */
export function statementCard(snap, st, { full = false } = {}) {
  const money = canRead(snap.role, "finance");
  const fin = money && st.financeId ? snap.data.finance.find((r) => r.id === st.financeId) : null;
  const r = reconcile(snap.c, st, fin ? { lines: fin.lines || [], deductions: fin.deductions || [], amount: fin.amount } : null);
  const lines = STATEMENT_GRADES.map((g) => ({ grade: g, eggs: st.grades.find((x) => x.grade === g)?.eggs || 0, ...(r.money?.lines.find((x) => x.grade === g) || {}) })).filter((l) => l.eggs);
  const cols = money && r.money ? [["Grade"], ["Eggs", "n"], ["p/doz", "n"], ["£", "n"]] : [["Grade"], ["Eggs", "n"], ["Share", "n"]];
  const rows = lines.map((l) => (money && r.money ? [l.grade, n0(l.eggs), l.ppd ?? "—", n1(l.amount, 2)] : [l.grade, n0(l.eggs), `${n1((l.eggs / (r.counted || 1)) * 100)}%`]));
  if (money && r.money) { rows.push([html`<span>Deductions (levy, transport)</span>`, "", "", `−${n1(r.money.dedTotal, 2)}`]); rows.push([html`<b>Paid</b>`, "", "", html`<b>${n1(r.money.paid, 2)}</b>`]); }
  return html`<div>
    ${full ? "" : html`<p class="ly-cap" style="margin:0 4px 8px">Week ${st.week} · ${st.packer || "packer"} statement</p>`}
    <div class="card" style="padding:0">
      <div class="ly-stat"><span class="k">You collected<small>from your daily sheets</small></span><span class="v">${n0(r.collected)}</span></div>
      <div class="ly-stat"><span class="k">Packer counted</span><span class="v">${n0(r.counted)}</span></div>
      <div class="ly-stat"><span class="k">Difference<small>alert over ${snap.s.packerDiffPct}%</small></span><span class="v ${r.flag ? "due" : "ok"}">${r.diff > 0 ? "+" : r.diff < 0 ? "−" : ""}${n0(Math.abs(r.diff))} (${n1(Math.abs(r.pct ?? 0))}%)${r.flag ? " ⚠" : " ✓"}</span></div></div>
    <div class="section" style="margin-top:12px">${table(cols, rows)}${money && r.money ? html`<p class="ly-cap">Average <b>${n1(r.money.avgPpd)}p</b> a dozen${snap.s.refPrice ? ` · reference ${snap.s.refPrice}p (entered by you)` : ""}.</p>` : money ? html`<p class="ly-cap">No prices on this statement.</p>` : ""}</div>
    ${r.flag ? html`<button type="button" class="btn secondary" style="margin-top:8px" data-query="${st.id}">${raw(icon("share"))}Send a query to the packer</button>` : ""}
  </div>`;
}
export { pounds };
