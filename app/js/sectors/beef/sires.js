// Sire report (design/10 §12, Research C tool 8): per sire with 5+ progeny — calving ease,
// birth weight, 200-day weight, daily gain, sale value. Table and bars.
import { html } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { canRead } from "../../core/policy.js";
import { num, moneyText } from "../../ui/format.js";
import { backLink, largeTitle, emptyState } from "../../screens/common.js";
import { loadBeef } from "./data.js";
import { sireReport } from "./model/reports.js";

export default async function sires(ctx) {
  const snap = await loadBeef(ctx.ledger); const money = canRead(snap.role, "finance");
  const rows = sireReport(snap.data, snap.ix);
  const max = Math.max(1, ...rows.map((r) => r.w200 || 0));
  const body = el(html`<div class="beef-page">${backLink(`#/l/${snap.lid}/more`, "More")}${largeTitle("Sire report", "Sires with 5 or more calves")}
    ${rows.length ? html`<div class="card pad"><div class="table-scroll" style="margin:0"><table class="dose-table"><thead><tr><th>Sire</th><th>Calves</th><th>Ease</th><th>Birth kg</th><th>200-day kg</th><th>kg/day</th>${money ? html`<th>Avg sale</th>` : ""}</tr></thead><tbody>
      ${rows.map((r) => html`<tr><td><b>${r.sire}</b></td><td>${r.n}</td><td>${r.ease ?? "—"}</td><td>${r.birth ?? "—"}</td><td>${r.w200 ?? "—"}</td><td>${r.dlwg ?? "—"}</td>${money ? html`<td>${r.sale ? moneyText(r.sale) : "—"}</td>` : ""}</tr>`)}</tbody></table></div></div>
      <div class="section"><p class="form-label">200-day weight by sire</p><div class="card pad bars">${rows.map((r) => html`<div class="bar-row"><span>${r.sire}</span><span class="bar-track"><i style="width:${((r.w200 || 0) / max) * 100}%"></i></span><b>${r.w200 ? num(r.w200) : "—"}</b></div>`)}</div></div>`
      : emptyState({ sector: "beef", title: "Not enough calves yet", body: "A sire shows here once 5 of his calves are recorded with him as sire." })}
  </div>`);
  return { el: body, title: "Sire report", depth: 1, tab: "more" };
}
