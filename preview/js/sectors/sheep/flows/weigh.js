// Weigh lambs and draft (design/11 §6.6): counting, not per animal — each weight drops into
// Sell now / 1–2 weeks / Keep. With "Lamb age" it is the 8-week growth check (g/day vs 280).
import { html, raw } from "../../../core/html.js";
import { el, vibrate } from "../../../ui/dom.js";
import { openSheet } from "../../../ui/sheet.js";
import { toast } from "../../../ui/toast.js";
import { textField, segmented, wireForm } from "../../../ui/form.js";
import { todayStr } from "../../../core/dates.js";
import { canRead } from "../../../core/policy.js";
import { mobPickRow, num } from "../ui.js";
import { bucket, draftSummary, growth, carcase, BUCKETS } from "../model/selling.js";
import * as A from "../actions.js";

export function weighSheet(snap, { mob = null, purpose = "draft" } = {}) {
  const weights = []; let typed = "";
  const body = el(html`<div><div class="form-group" data-mob></div>
    ${segmented("purpose", [{ value: "draft", label: "Draft for sale" }, { value: "growth", label: "Growth check" }], purpose)}
    <div class="form-group" data-age style="margin-top:12px">${textField({ name: "ageWeeks", label: "Lamb age (weeks)", inputmode: "numeric", value: "8" })}${textField({ name: "birthKg", label: "Birth weight (kg)", inputmode: "decimal", value: "4.5" })}</div>
    <div class="buckets" data-b></div><p class="foot-note" data-live></p>
    <div class="weigh-v" aria-live="polite"><span data-v>0</span><small>kg</small></div>
    <div class="keypad" style="margin-top:12px">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => html`<button type="button" data-k="${k}">${k}</button>`)}<button type="button" data-k=".">.</button><button type="button" data-k="0">0</button><button type="button" data-k="del" aria-label="Delete">⌫</button></div>
    <button type="button" class="btn" data-next style="margin-top:8px;min-height:64px">Next lamb</button>
    <div class="form-group" style="margin-top:12px">${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}</div></div>`);
  const mp = mobPickRow(snap, { mob }); body.querySelector("[data-mob]").append(mp.node);
  const f = wireForm(body); const s = snap.s;
  const btn = el(html`<button type="button" class="btn secondary">Save weights</button>`);
  const paint = () => {
    const v = f.values(); body.querySelector("[data-age]").hidden = v.purpose !== "growth";
    body.querySelector("[data-v]").textContent = typed || "0";
    const sm = draftSummary(weights.map((kg) => ({ kg })), s);
    body.querySelector("[data-b]").innerHTML = ["now", "soon", "keep"].map((k) => `<div class="${k}"><b>${sm[k]}</b><span>${BUCKETS[k]}</span></div>`).join("");
    const g = v.purpose === "growth" && sm.n ? growth(sm.avg, (+v.ageWeeks || 8) * 7, +v.birthKg || 4.5) : null;
    body.querySelector("[data-live]").innerHTML = sm.n ? `${sm.n} weighed · average <b>${sm.avg} kg</b> · est. carcase ${sm.avgCarcase} kg at ${s.koPct}%${sm.overMax ? ` · <b class="v-late">${sm.overMax} over ${s.maxCarcase} kg carcase — over-weight risk</b>` : ""}${g != null ? `<br>Growth <b>${g} g/day</b> · target ${s.growthTarget}${g < s.growthWeanBelow ? ` · <b class="v-late">Consider weaning these lambs</b>` : ""}` : ""}` : `Target ${s.draftKg} kg liveweight. Type each weight and tap Next lamb.`;
    btn.disabled = !mp.mob() || !weights.length; btn.textContent = !mp.mob() ? "Choose the mob to save" : !weights.length ? "Weigh some lambs to save" : `Save ${weights.length} weights`;
  };
  body.querySelector(".keypad").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; const k = b.dataset.k; vibrate(6); if (k === "del") typed = typed.slice(0, -1); else if (!(k === "." && typed.includes(".")) && typed.length < 5) typed += k; paint(); });
  body.querySelector("[data-next]").onclick = () => { const kg = parseFloat(typed); if (kg > 0 && kg < 200) { weights.push(kg); typed = ""; vibrate(12); toast(`${kg} kg → ${BUCKETS[bucket(kg, s)]}`, { duration: 1500 }); } paint(); };
  f.onChange(paint);
  const sh = openSheet({ title: "Weigh lambs", body, footer: btn, isDirty: () => weights.length > 0, discardTitle: "Discard these weights?" });
  btn.onclick = async () => {
    const v = f.values(); A.weighSession(snap.lid, mp.mob(), weights, { date: v.date, ageDays: v.purpose === "growth" ? (+v.ageWeeks || 8) * 7 : undefined, purpose: v.purpose });
    const sm = draftSummary(weights.map((kg) => ({ kg })), s); sh.close(true, { force: true });
    toast(`${weights.length} weights saved · ${sm.now} ready to sell`);
    if (v.purpose === "draft" && sm.now) setTimeout(async () => (await import("./move.js")).sellSheet(snap, { mob: mp.mob(), count: sm.now, avgKg: sm.avg }), 350);
  };
  paint();
}
export { num, raw, carcase, canRead };
