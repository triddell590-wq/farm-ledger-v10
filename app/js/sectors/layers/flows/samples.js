// Samples (design/14 §5.5): body weight & uniformity and egg weight with a keypad and "Next"
// (50–100 birds or eggs off a hook scale), and the monthly feather score tally (0 · 1 · 2).
import { html, raw } from "../../../core/html.js";
import { el, vibrate } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { toast } from "../../../ui/toast.js";
import { chooseHouse } from "./common.js";
import { saveSample } from "../actions.js";
import { uniformity, eggMix } from "../model/health.js";
import { weekOfAge } from "../model/flock.js";
import { standardFor, band } from "../model/standards.js";
import { n0, n1 } from "../ui.js";

export async function weighFlow(snap, { houseId = null, kind = "weights" } = {}) {
  const pick = await chooseHouse(snap, { title: kind === "eggs" ? "Egg weights — which house?" : "Weigh hens — which house?", houseId });
  if (!pick) return null;
  const { h, f } = pick; const wk = weekOfAge(f, snap.today); const std = standardFor(f.breedStdId);
  const target = kind === "eggs" ? band(std, "eggWt", wk) : band(std, "bw", wk);
  const vals = []; let cur = "";
  const unit = "g"; const goal = kind === "eggs" ? 30 : snap.s.weighCount || 100;
  const body = el(html`<div class="ly-keypad">
    <p class="ly-sub">${h.name} · week ${wk} · ${kind === "eggs" ? "weigh single eggs" : "weigh single hens on the hook scale"}${target ? ` · breed ${n0(target[0])}–${n0(target[1])} g` : ""}</p>
    <div class="ly-kp-show"><b data-cur>—</b><span>${unit}</span></div>
    <div class="ly-kp-stats" data-stats></div>
    <div class="ly-kp-grid">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => html`<button type="button" data-d="${d}">${d}</button>`)}<button type="button" data-del aria-label="Delete">${raw(icon("back"))}</button><button type="button" data-d="0">0</button><button type="button" class="next" data-next>Next</button></div>
    <div class="ly-kp-list" data-list></div></div>`);
  const btn = el(html`<button type="button" class="btn">Save</button>`);
  const paint = () => {
    body.querySelector("[data-cur]").textContent = cur || "—";
    const s = kind === "eggs" ? eggMix(vals) : uniformity(vals);
    body.querySelector("[data-stats]").replaceChildren(el(html`<div>${vals.length} of ${goal}${s.n ? html` · mean <b>${n0(s.mean)} g</b>${kind === "eggs" ? html` · S ${s.mix.S}% M ${s.mix.M}% L ${s.mix.L}% XL ${s.mix.XL}%` : html` · CV ${n1(s.cv)}% · uniformity <b class="${s.uniformity < snap.s.uniformityTarget ? "warn" : ""}">${n1(s.uniformity)}%</b>`}` : ""}</div>`));
    body.querySelector("[data-list]").textContent = vals.slice(-12).join(" · ");
    btn.disabled = vals.length < 1; btn.textContent = vals.length ? `Save ${vals.length} ${kind === "eggs" ? "eggs" : "hens"}` : "Weigh at least one";
  };
  body.addEventListener("click", (e) => {
    const d = e.target.closest("[data-d]");
    if (d && cur.length < 5) { cur += d.dataset.d; vibrate(5); }
    else if (e.target.closest("[data-del]")) cur = cur.slice(0, -1);
    else if (e.target.closest("[data-next]") && +cur > 0) { vals.push(+cur); cur = ""; vibrate(10); }
    paint();
  });
  paint();
  const sh = openSheet({ title: kind === "eggs" ? "Egg weights" : "Body weight", body, footer: btn, isDirty: () => vals.length > 0, discardTitle: "Discard these weights?" });
  btn.onclick = () => {
    if (+cur > 0) vals.push(+cur);
    saveSample(snap, f, kind, { values: vals }); sh.close(true, { force: true });
    const s = kind === "eggs" ? eggMix(vals) : uniformity(vals);
    toast(kind === "eggs" ? `${vals.length} eggs · mean ${s.mean} g` : `${vals.length} hens · mean ${s.mean} g · uniformity ${s.uniformity}%`);
  };
  return sh.done;
}

export async function featherFlow(snap, { houseId = null } = {}) {
  const pick = await chooseHouse(snap, { title: "Feather score — which house?", houseId });
  if (!pick) return null;
  const t = { 0: 0, 1: 0, 2: 0 }; const hist = [];
  const body = el(html`<div class="ly-feather"><p class="ly-sub">${pick.h.name} · score 50 hens as you walk · 0 good feather, 1 some loss, 2 bare patches</p>
    <div class="ly-tally">${[0, 1, 2].map((s) => html`<button type="button" data-t="${s}" class="t${s}"><b data-n="${s}">0</b><span>${["Good", "Some loss", "Bare patches"][s]}</span></button>`)}</div>
    <p class="ly-note" data-sum></p><button type="button" class="text-btn" data-undo>Undo last tap</button>
    <div class="form-group" style="margin-top:12px"><div class="field stacked"><label>Enrichment changed since last time <span class="opt">(optional)</span></label><input name="enrichment" placeholder="e.g. pecking blocks added, bales in"></div></div></div>`);
  const btn = el(html`<button type="button" class="btn">Save</button>`);
  const paint = () => { [0, 1, 2].forEach((s) => (body.querySelector(`[data-n="${s}"]`).textContent = t[s])); const n = t[0] + t[1] + t[2]; body.querySelector("[data-sum]").textContent = n ? `${n} of 50 · ${Math.round((t[0] / n) * 100)}% good feather` : "Tap a score for each hen."; btn.disabled = !n; btn.textContent = n ? `Save ${n} hens` : "Score at least one hen"; };
  body.addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) { t[b.dataset.t]++; hist.push(b.dataset.t); vibrate(6); paint(); } if (e.target.closest("[data-undo]") && hist.length) { t[hist.pop()]--; paint(); } });
  paint();
  const sh = openSheet({ title: "Feather score", body, footer: btn, isDirty: () => hist.length > 0, discardTitle: "Discard these scores?" });
  btn.onclick = () => { saveSample(snap, pick.f, "feather", { tally: { ...t }, enrichment: body.querySelector("[name=enrichment]").value.trim() || undefined }); sh.close(true, { force: true }); toast(`Feather score saved · ${Math.round((t[0] / (t[0] + t[1] + t[2])) * 100)}% good`); };
  return sh.done;
}
