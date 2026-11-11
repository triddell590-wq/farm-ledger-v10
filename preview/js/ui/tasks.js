// Task rows with the completion motion (design/00 §6.10): circle fills, check draws, text
// strikes, then after 1.2s the row collapses into "Done today (n)". Undo in the toast for 5s.
// "To do today" holds only jobs due today or late (late first, legal first); everything else
// waits, folded, in "Coming up" with its date (services/today-rules.js). The whole row is the
// link (at least 48 px tall); the circle is its own tick target.
import { html, raw } from "../core/html.js";
import { el, reduceMotion, vibrate } from "./dom.js";
import { icon } from "./icons.js";
import { toast } from "./toast.js";
import { setDone } from "../services/tasks.js";
import { timeHM } from "./format.js";
import { todayStr } from "../core/dates.js";
import { splitTasks, dueLine, nowCount } from "../services/today-rules.js";
import { META } from "../sectors/meta.js";
import { canWrite } from "../core/policy.js";

export { nowCount };

function line(t, today) {
  if (t.done) return `done ${t.doneAt ? timeHM(new Date(t.doneAt)) : ""}${t.doneByName ? " by " + t.doneByName.split(" ")[0] : ""}`;
  return dueLine(t, today);
}
function row(t, showTag, today) {
  const can = t.ledger ? canWrite(t.ledger.role, "tasks") : false;
  const late = !t.done && t.due && t.due < today;
  const text = html`<span class="primary">${t.title}</span><span class="secondary${late ? " late" : ""}">${line(t, today)}</span>`;
  return html`<div class="task${t.done ? " done" : ""}${late ? " is-late" : ""}" data-task="${t.id}" data-lid="${t.ledger?.id || ""}">
    ${t.coming ? html`<span class="tick-space" aria-hidden="true"></span>` : html`<button type="button" class="tick" role="checkbox" aria-checked="${!!t.done}" aria-label="${t.done ? "Done: " : "Mark done: "}${t.title}" ${raw(can ? "" : "disabled")}><i>${raw(icon("check", { size: 18, stroke: 3 }))}</i></button>`}
    ${t.href ? html`<a class="t-text task-link" href="${t.href}">${text}</a>` : html`<div class="t-text">${text}</div>`}
    ${showTag && t.ledger ? html`<span class="sector-tag" data-sector="${t.ledger.type}">${raw(icon(t.ledger.type, { size: 16 }))}${META[t.ledger.type]?.short || ""}</span>` : ""}
  </div>`;
}
/** Render a task list card. tasks carry .ledger. Returns an element; onChange() after a tick.
 *  coming: extra read-only reminders for "Coming up" ({ title, due, href, sub }). */
export function taskList(tasks, { showTag = false, max = 8, onChange, coming = [], today = todayStr(), seeAllHref } = {}) {
  const { now, later, done } = splitTasks(tasks, today);
  const titles = new Set(later.map((t) => String(t.title).toLowerCase()));
  const extra = coming.filter((c) => c.due && c.due > today && !titles.has(String(c.title).toLowerCase())).map((c, i) => ({ id: `coming-${i}`, ...c, coming: true }));
  const up = [...later, ...extra].sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const allHref = seeAllHref || (now[max] && now[max].ledger ? `#/l/${now[max].ledger.id}` : null);
  const root = el(html`<div class="list task-list" role="list">
    ${now.slice(0, max).map((t) => row(t, showTag, today))}
    ${!now.length ? html`<div class="task-none">Nothing due today.</div>` : ""}
    ${now.length > max && allHref ? html`<a class="disclosure" href="${allHref}">See all ${now.length} ›</a>` : ""}
    ${up.length ? html`<button type="button" class="disclosure" data-coming-toggle aria-expanded="false">Coming up (${up.length}) ${raw(icon("down", { size: 18 }))}</button><div data-coming hidden>${up.map((t) => row(t, showTag, today))}</div>` : ""}
    ${done.length ? html`<button type="button" class="disclosure" data-done-toggle aria-expanded="false">Done today (${done.length}) ${raw(icon("down", { size: 18 }))}</button><div data-done hidden>${done.map((t) => row(t, showTag, today))}</div>` : ""}
  </div>`);
  const byId = new Map(tasks.map((t) => [t.id + (t.ledger?.id || ""), t]));
  root.addEventListener("click", (e) => {
    for (const k of ["done", "coming"]) {
      const dt = e.target.closest(`[data-${k}-toggle]`);
      if (dt) { const box = root.querySelector(`[data-${k}]`); box.hidden = !box.hidden; dt.setAttribute("aria-expanded", String(!box.hidden)); return; }
    }
    const tick = e.target.closest(".tick"); if (!tick || tick.disabled) return;
    const r = tick.closest(".task"); const t = byId.get(r.dataset.task + r.dataset.lid); if (!t) return;
    const isDone = !r.classList.contains("done");
    r.classList.toggle("done", isDone); tick.setAttribute("aria-checked", String(isDone)); vibrate(8);
    if (t.tick) t.tick(isDone); else setDone(t.ledger.id, t, isDone);
    t.done = isDone;
    if (isDone) {
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
