// Score mite traps (design/14 §7.2): walks trap by trap on the house plan — big 0–4 buttons,
// auto-advance to the next trap, back to fix one. Under a minute for 12 traps.
import { html, raw } from "../../../core/html.js";
import { el, vibrate, reduceMotion } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { toast } from "../../../ui/toast.js";
import { chooseHouse } from "./common.js";
import { saveMite, undoAdd } from "../actions.js";
import { trapIds, miteAvg } from "../model/health.js";
import { MITE_SCORES } from "../model/content.js";
import { trapMap } from "../ui.js";

export async function miteFlow(snap, { houseId = null } = {}) {
  const pick = await chooseHouse(snap, { title: "Mite traps — which house?", houseId, needFlock: false });
  if (!pick) return null;
  const h = pick.h; const grid = trapIds(h); const scores = {}; let i = 0;
  const body = el(html`<div class="ly-mitewalk"><div data-map></div><p class="ly-trapno" data-no></p>
    <div class="ly-scorebtns">${MITE_SCORES.map((w, s) => html`<button type="button" class="ly-score s${s}" data-s="${s}"><b>${s}</b><span>${w}</span></button>`)}</div>
    <div class="ly-acts"><button type="button" class="btn secondary" data-back>${raw(icon("back"))}Back a trap</button><button type="button" class="btn secondary" data-skip>Skip this trap</button></div></div>`);
  const btn = el(html`<button type="button" class="btn">Save scores</button>`);
  const paint = () => {
    body.querySelector("[data-map]").replaceChildren(el(trapMap(grid, scores, { action: snap.s.miteAction, onTap: true })));
    body.querySelector(`[data-trap="${grid.ids[i]}"]`)?.classList.add("cur");
    const done = Object.keys(scores).length; const avg = miteAvg(Object.entries(scores).map(([id, score]) => ({ id, score })));
    body.querySelector("[data-no]").textContent = i < grid.ids.length ? `Trap ${i + 1} of ${grid.ids.length}` : `All ${grid.ids.length} traps scored · average ${avg ?? "—"}`;
    btn.disabled = !done; btn.textContent = done ? `Save ${done} trap${done > 1 ? "s" : ""}${avg != null ? ` · average ${avg}` : ""}` : "Score at least one trap";
  };
  body.addEventListener("click", (e) => {
    const s = e.target.closest("[data-s]"); const t = e.target.closest("[data-trap]");
    if (s && i < grid.ids.length) { scores[grid.ids[i]] = +s.dataset.s; vibrate(8); i = Math.min(grid.ids.length, i + 1); paint(); if (!reduceMotion()) body.querySelector("[data-no]").animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 160 }); }
    else if (t) { i = grid.ids.indexOf(t.dataset.trap); paint(); }
    else if (e.target.closest("[data-back]")) { i = Math.max(0, i - 1); paint(); }
    else if (e.target.closest("[data-skip]")) { i = Math.min(grid.ids.length, i + 1); paint(); }
  });
  paint();
  const sh = openSheet({ title: `Mite traps · ${h.name}`, body, footer: btn, isDirty: () => Object.keys(scores).length > 0, discardTitle: "Discard these trap scores?" });
  btn.onclick = () => {
    const traps = grid.ids.filter((id) => scores[id] != null).map((id) => ({ id, score: scores[id] }));
    const id = saveMite(snap, h.id, traps); const avg = miteAvg(traps);
    sh.close(true, { force: true });
    toast(`${h.name} mite average ${avg}${avg >= +snap.s.miteAction ? ` — over your action level ${snap.s.miteAction}` : ""}`, { action: "Undo", onAction: () => undoAdd(snap.lid, "miteScores", id) });
  };
  return sh.done;
}
