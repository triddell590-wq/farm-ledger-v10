// Tank temperature after each milking (design/12 §6.3): a small sheet with three controls.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { textField } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { entrySheet, chipsField } from "./common.js";
import { logTank } from "../actions.js";
import { currentMilking, partWord, datePart, milkingsOn } from "../model/milking.js";
import { latestTank } from "../model/quality.js";

export default function tankSheet(snap) {
  const s = snap.s; const m = currentMilking(s, snap.now); const last = latestTank(snap.data.tankLog);
  const parts = s.robot ? [] : milkingsOn(s, snap.today).map((x) => x.part);
  let t = last ? +last.tempC : 3.5;
  const body = el(html`<form novalidate>
    <p class="hint" style="margin:0 4px 12px">${s.robot ? "Daily check" : `After ${partWord(m?.part || "am")} milking`} · limit ${s.tankLimit} °C (${s.collection === "alternate" ? "alternate-day" : "daily"} collection)</p>
    <div class="form-group"><div class="field stepper-field"><span class="label">Temperature</span><span class="spacer"></span>
      <div class="stepper"><button type="button" class="step-btn" data-d="-1" aria-label="0.1 degree colder">−</button><input name="tempC" inputmode="decimal" value="${t.toFixed(1)}" aria-label="Temperature °C" style="width:72px"><button type="button" class="step-btn" data-d="1" aria-label="0.1 degree warmer">+</button></div></div></div>
    <div data-over hidden class="warn-card" style="margin-top:12px">${raw(icon("alert"))}<span data-over-t></span></div>
    <div class="form-group" data-action hidden>${textField({ name: "action", label: "Action taken", placeholder: "Called the engineer; compressor reset" })}</div>
    ${parts.length > 1 ? html`<div class="form-group">${chipsField("milking", "Milking", parts.map((p) => [p, partWord(p)]), m && datePart(m.at) === snap.today ? m.part : parts[0])}</div>` : ""}
    <div class="form-group">${chipsField("collected", "Tanker collected?", [["yes", "Yes"], ["no", "No"]], "no")}
      <div data-rec hidden>${textField({ name: "receiptTemp", label: "Receipt temperature °C", inputmode: "decimal", optional: true })}${textField({ name: "litres", label: "Litres collected", inputmode: "numeric", optional: true })}</div></div>
  </form>`);
  const inp = body.querySelector("[name=tempC]");
  body.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { t = Math.round(((parseFloat(inp.value) || 0) + +b.dataset.d * 0.1) * 10) / 10; inp.value = t.toFixed(1); inp.dispatchEvent(new Event("input", { bubbles: true })); }));
  const paint = (v) => {
    const over = (parseFloat(v.tempC) || 0) > s.tankLimit;
    body.querySelector("[data-over]").hidden = !over; body.querySelector("[data-action]").hidden = !over;
    if (over) body.querySelector("[data-over-t]").textContent = `${(parseFloat(v.tempC) - s.tankLimit).toFixed(1)} °C above limit — check the cooling and note what you did.`;
    body.querySelector("[data-rec]").hidden = v.collected !== "yes";
  };
  const es = entrySheet({ title: "Tank temperature", body, label: "Save tank temperature",
    missing: (v) => (v.tempC === "" || Number.isNaN(parseFloat(v.tempC)) ? "Add the temperature" : parseFloat(v.tempC) > s.tankLimit && !v.action ? "Note the action taken to save" : null),
    save(v, sh) {
      logTank(snap.lid, { date: snap.today, milking: s.robot ? "day" : v.milking || m?.part || "am", tempC: parseFloat(v.tempC), collected: v.collected === "yes", receiptTemp: v.receiptTemp, litres: v.litres, action: v.action });
      sh.close(true, { force: true }); toast(parseFloat(v.tempC) <= s.tankLimit ? "Tank temperature saved" : `Saved. Over ${s.tankLimit} °C — action noted.`);
    } });
  es.form.onChange(() => paint(es.form.values())); paint(es.form.values());
  return es.sheet.done;
}
