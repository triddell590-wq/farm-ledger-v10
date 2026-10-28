// Task rows with the completion motion (design/00 §6.10): circle fills, check draws, text
// strikes, then after 1.2s the row collapses into "Done today (n)". Undo in the toast for 5s.
import { html, raw } from "../core/html.js";
import { el, reduceMotion, vibrate } from "./dom.js";
import { icon } from "./icons.js";
import { toast } from "./toast.js";
import { setDone } from "../services/tasks.js";
import { relDays, timeHM } from "./format.js";
import { todayStr } from "../core/dates.js";
import { META } from "../sectors/meta.js";
import { canWrite } from "../core/policy.js";

function line(t) {
  if (t.done) return `done ${t.doneAt ? timeHM(new Date(t.doneAt)) : ""}${t.doneByName ? " by " + t.doneByName.split(" ")[0] : ""}`;
  if (t.generated && t.due > todayStr()) return `${t.legal ? "legal deadline " : "by "}${relDays(t.due).replace(/^in /, "in ")}${t.sub ? " · " + t.sub : ""}`;
  return (t.due === todayStr() ? "due today" : relDays(t.due)) + (t.sub ? " · " + t.sub : "");
}
function row(t, showTag) {
  const can = canWrite(t.ledger.role, "tasks");
  return html`<div class="task${t.done ? " done" : ""}" data-task="${t.id}" data-lid="${t.ledger.id}">
    <button type="button" class="tick" role="checkbox" aria-checked="${!!t.done}" aria-label="${t.title}" ${raw(can ? "" : "disabled")}><i>${raw(icon("check", { size: 18, stroke: 3 }))}</i></button>
    <div class="t-text">${t.href ? html`<a class="primary task-link" href="${t.href}">${t.title}</a>` : html`<div class="primary">${t.title}</div>`}<div class="secondary">${line(t)}</div></div>
    ${showTag ? html`<span class="sector-tag" data-sector="${t.ledger.type}">${raw(icon(t.ledger.type, { size: 16 }))}${META[t.ledger.type]?.short || ""}</span>` : ""}
  </div>`;
}
/** Render a task list card. tasks carry .ledger. Returns an element; onChange() after a tick. */
export function taskList(tasks, { showTag = false, max = 8, onChange } = {}) {
  const open = tasks.filter((t) => !t.done); const done = tasks.filter((t) => t.done);
  const root = el(html`<div class="list" role="list">
    ${open.slice(0, max).map((t) => row(t, showTag))}
    ${open.length > max ? html`<a class="disclosure" href="#/l/${open[max].ledger.id}">See all ${open.length} ›</a>` : ""}
    ${done.length ? html`<button type="button" class="disclosure" data-done-toggle aria-expanded="false">Done today (${done.length}) ${raw(icon("down", { size: 18 }))}</button><div data-done hidden>${done.map((t) => row(t, showTag))}</div>` : ""}
  </div>`);
  const byId = new Map(tasks.map((t) => [t.id + t.ledger.id, t]));
  root.addEventListener("click", (e) => {
    const dt = e.target.closest("[data-done-toggle]");
    if (dt) { const box = root.querySelector("[data-done]"); box.hidden = !box.hidden; dt.setAttribute("aria-expanded", String(!box.hidden)); return; }
    const tick = e.target.closest(".tick"); if (!tick || tick.disabled) return;
    const r = tick.closest(".task"); const t = byId.get(r.dataset.task + r.dataset.lid); if (!t) return;
    const done = !r.classList.contains("done");
    r.classList.toggle("done", done); tick.setAttribute("aria-checked", String(done)); vibrate(8);
    if (t.tick) t.tick(done); else setDone(t.ledger.id, t, done);
    t.done = done;
    if (done) {
      toast(`Done: ${t.title}`, { action: "Undo", duration: 5000, onAction: () => { if (t.tick) t.tick(false); else setDone(t.ledger.id, { ...t, done: true }, false); t.done = false; onChange && onChange(); } });
      setTimeout(() => {
        if (!r.classList.contains("done")) return;
        if (reduceMotion()) { onChange && onChange(); return; }
        r.style.height = r.offsetHeight + "px"; r.classList.add("collapsing");
        setTimeout(() => onChange && onChange(), 260);
      }, 1200);
    } else onChange && onChange();
  });
  return root;
}
