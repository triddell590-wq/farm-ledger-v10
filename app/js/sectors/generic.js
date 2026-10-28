// Placeholder ledger used until a sector's own design (design/1x-*.md) is built. It is honest
// about that, and still useful: tasks, notes and money for the ledger. Each real sector module
// replaces it entirely (no copy-paste layouts — see BRIEF.md).
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { openSheet } from "../ui/sheet.js";
import { textField, wireForm, guardButton } from "../ui/form.js";
import { toast } from "../ui/toast.js";
import { taskList } from "../ui/tasks.js";
import { openMoneySheet } from "../ui/money-sheet.js";
import { todaysTasks, addTask } from "../services/tasks.js";
import { addRecord, watchRecords } from "../services/records.js";
import { moneyFor, periodRange } from "../services/money.js";
import { canWrite, canRead } from "../core/policy.js";
import { todayStr } from "../core/dates.js";
import { META, SETUP_FIELDS } from "./meta.js";
import { sectorName } from "./registry.js";
import { money, moneyText, recordDate, num, longDate } from "../ui/format.js";
import { largeTitle, groupLabel, emptyState } from "../screens/common.js";

export function genericFor(type) {
  const M = {
    type,
    tabs: [
      { id: "today", label: "Today", icon: "today", roles: ["owner", "manager", "worker", "viewer", "accountant"] },
      { id: "records", label: "Records", icon: "records", roles: ["owner", "manager", "worker", "viewer"] },
      { id: "money", label: "Money", icon: "money", roles: ["owner", "manager", "accountant"] },
      { id: "more", label: "More", icon: "more" },
    ],
    async screen(tab, ctx) { return tab === "records" ? records(ctx) : tab === "money" ? moneyTab(ctx) : today(ctx); },
    fab: (ctx) => quickAdd(ctx),
    async headline(ledger) {
      const s = ledger.settings || {};
      const n = s.headCount ?? s.ewes ?? s.cowsInMilk ?? s.sows ?? (s.houses && s.birdsPerHouse ? s.houses * +s.birdsPerHouse : null) ?? s.birdsPerCrop ?? null;
      return { value: n ? num(+n) : "", unit: n ? META[type].unit : "", line: "Set up: the full " + sectorName(type) + " ledger is on its way" };
    },
    async alerts() { return []; },
    contextLine(ledger) { return contextLine(ledger); },
  };
  return M;
}

function contextLine(l) {
  const s = l.settings || {};
  const no = s.herdNo || s.flockNo || s.herdMark || s.registerNo;
  const label = { beef: "Herd", dairy: "Herd", sheep: "Flock", pigs: "Herd mark", layers: "Register", broilers: "Register" }[l.type];
  return [l.name, no ? `${label} ${no}` : null].filter(Boolean).join(" · ");
}

async function today(ctx) {
  const { ledger } = ctx;
  const body = el(html`<div>${largeTitle("Today", contextLine(ledger))}
    <div class="info-card" style="margin-top:8px">${raw(icon("info"))}<span>The full ${sectorName(ledger.type)} ledger — built for ${META[ledger.type].desc.toLowerCase()} — is being made from its own design. Until then you can keep tasks, notes and money here; they'll stay when it arrives.</span></div>
    <div class="section" data-tasks></div>
    <div class="section" data-setup></div>
  </div>`);
  const paint = async () => {
    const tasks = await todaysTasks([ledger]);
    const box = body.querySelector("[data-tasks]");
    box.replaceChildren(el(html`<div>${groupLabel("To do today", tasks.filter((t) => !t.done).length || "")}</div>`));
    if (tasks.length) box.appendChild(taskList(tasks, { onChange: paint }));
    else box.appendChild(el(emptyState({ sector: ledger.type, title: "Nothing to do today", body: "Add a job and it shows here and on your farm's Today list.", action: canWrite(ledger.role, "tasks") ? "Add a job" : null, actAttr: "data-add-task" })));
    const b = box.querySelector("[data-add-task]"); if (b) b.onclick = () => taskSheet(ledger, paint);
  };
  await paint();
  const s = ledger.settings || {}; const fields = SETUP_FIELDS[ledger.type].filter((f) => s[f.key] != null && s[f.key] !== "" && s[f.key] !== 0 && !(Array.isArray(s[f.key]) && !s[f.key].length));
  if (fields.length) body.querySelector("[data-setup]").appendChild(el(html`<div>${groupLabel("From your setup")}<div class="list">${fields.map((f) => html`<div class="row no-lead"><span class="main"><span class="primary">${f.label}</span></span><span class="t-strong">${Array.isArray(s[f.key]) ? s[f.key].join(", ") : f.kind === "month" ? new Date(2000, +s[f.key] - 1, 1).toLocaleString("en-GB", { month: "long" }) : s[f.key]}</span></div>`)}</div></div>`));
  return { el: body, title: "Today" };
}

async function records(ctx) {
  const { ledger } = ctx;
  const body = el(html`<div>${largeTitle("Records", contextLine(ledger))}<div data-list></div></div>`);
  const unsub = watchRecords(ledger.id, "notes", { orderBy: [["date", "desc"]] }, (list) => {
    const box = body.querySelector("[data-list]");
    if (!list.length) { box.replaceChildren(el(emptyState({ sector: ledger.type, title: "No notes yet", body: "Write down anything you need to remember — it's kept with who wrote it and when.", action: canWrite(ledger.role, "notes") ? "Add a note" : null, actAttr: "data-add" }))); const b = box.querySelector("[data-add]"); if (b) b.onclick = () => noteSheet(ledger); return; }
    box.replaceChildren(el(html`<div>${groupLabel("Notes", list.length)}<div class="list">${list.map((n) => html`<div class="row no-lead"><span class="main"><span class="primary">${n.text}</span><span class="secondary">${recordDate(n.date)}${n.byName ? " · " + n.byName : ""}</span></span></div>`)}</div></div>`));
  }, () => {});
  return { el: body, title: "Records", destroy: unsub, fab: canWrite(ledger.role, "notes") ? () => noteSheet(ledger) : null };
}

async function moneyTab(ctx) {
  const { ledger } = ctx;
  const body = el(html`<div>${largeTitle("Money", contextLine(ledger))}<div data-m></div></div>`);
  const paint = async () => {
    const m = await moneyFor([ledger], periodRange("ytd"));
    const box = body.querySelector("[data-m]");
    box.replaceChildren(el(html`<div>
      <div class="card pad"><div class="money-sum"><span class="ink-2">Money in</span><span class="v">${money(m.totalIn)}</span><span class="ink-2">Money out</span><span class="v">${money(m.totalOut)}</span><span class="ink-2">Left over</span><span class="v">${money(m.totalIn - m.totalOut)}</span></div><p class="hint" style="margin:8px 0 0">This tax year (from 6 April)</p></div>
      <div class="section">${groupLabel("Entries", m.rows.length || "")}
      ${m.rows.length ? html`<div class="list">${m.rows.map((r) => html`<button type="button" class="row no-lead" data-id="${r.id}"><span class="main"><span class="primary">${r.category}</span><span class="secondary">${recordDate(r.date)}${r.note ? " · " + r.note : ""}</span></span><span class="value">${r.kind === "revenue" ? "" : "−"}${moneyText(r.amount, true)}</span></button>`)}</div>`
        : emptyState({ iconName: "money", title: "No money entries yet", body: "Add what you spend and sell, and see what's left over.", action: "Add money", actAttr: "data-add" })}</div>
    </div>`));
    box.querySelectorAll("[data-id]").forEach((b) => (b.onclick = () => openMoneySheet(ledger, m.rows.find((r) => r.id === b.dataset.id), { onSaved: () => setTimeout(paint, 50) })));
    const a = box.querySelector("[data-add]"); if (a) a.onclick = () => openMoneySheet(ledger, null, { onSaved: () => setTimeout(paint, 50) });
  };
  await paint();
  return { el: body, title: "Money", fab: () => openMoneySheet(ledger, null, { onSaved: () => setTimeout(paint, 50) }) };
}

function quickAdd(ctx) {
  const { ledger } = ctx;
  const items = [
    canWrite(ledger.role, "tasks") && { id: "task", label: "Job to do", icon: "today", run: () => taskSheet(ledger) },
    canWrite(ledger.role, "notes") && { id: "note", label: "Note", icon: "edit", run: () => noteSheet(ledger) },
    canWrite(ledger.role, "finance") && { id: "money", label: "Money", icon: "money", run: () => openMoneySheet(ledger) },
  ].filter(Boolean);
  return quickAddSheet(ledger, items);
}
/** Which quick-add entries matter where the + was tapped. `map` is { routePrefix: [ids] };
 *  the longest matching prefix of `where` (e.g. "paperwork/medicine" → "paperwork") wins. */
export function focusFor(map, where) {
  const parts = String(where || "").split("/").filter(Boolean);
  for (let n = parts.length; n > 0; n--) { const k = parts.slice(0, n).join("/"); if (map[k]) return map[k]; }
  return map[""] || null;
}

/** The + sheet. With `focus` (ids, in order) only the entries for this screen are shown; when a
 *  screen has exactly one thing to add, the + opens it straight away. "Something else" opens the
 *  rest, so nothing is ever out of reach. */
export function quickAddSheet(ledger, items, { focus = null } = {}) {
  let shown = items;
  if (focus && focus.length) {
    const pick = focus.map((id) => items.find((i) => i.id === id)).filter(Boolean);
    if (pick.length) shown = pick;
  }
  if (focus && shown.length === 1 && shown !== items) { shown[0].run(); return Promise.resolve(); }
  const rest = items.filter((i) => !shown.includes(i));
  const tiles = (list) => list.map((i) => html`<button type="button" class="share-tile" data-q="${i.id}">${raw(icon(i.icon))}${i.label}</button>`);
  const body = el(html`<div data-sector="${ledger.type}"><p class="sheet-title-sm">Add to ${ledger.name}</p><div class="share-grid" data-grid>${tiles(shown)}</div>
    ${rest.length ? html`<button type="button" class="btn secondary" style="margin-top:12px" data-more>Something else…</button>` : ""}</div>`);
  const sh = openSheet({ size: "small", body, label: "Quick add", auto: true });
  body.addEventListener("click", (e) => {
    if (e.target.closest("[data-more]")) { const g = body.querySelector("[data-grid]"); for (const t of tiles(rest)) g.append(el(t)); e.target.closest("[data-more]").remove(); return; }
    const b = e.target.closest("[data-q]"); if (!b) return; const it = items.find((i) => i.id === b.dataset.q); sh.close(undefined, { force: true }); setTimeout(() => it.run(), 120);
  });
  return sh.done;
}

export function taskSheet(ledger, after) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "title", label: "Job", placeholder: "Weigh pen 4 bullocks", autofocus: true })}${textField({ name: "due", label: "Due", type: "date", value: todayStr() })}</div>${canRead(ledger.role, "finance") ? html`<p class="hint">Shows on ${ledger.name} and on your farm's Today list.</p>` : ""}</form>`);
  const btn = el(html`<button type="button" class="btn">Save job</button>`);
  const f = wireForm(body); const miss = () => (f.values().title ? null : "Add the job to save");
  f.onChange(() => guardButton(btn, "Save job", miss)); guardButton(btn, "Save job", miss);
  const sh = openSheet({ title: "Add a job", body, footer: btn, isDirty: () => !!f.values().title, discardTitle: "Discard this job?" });
  btn.onclick = () => { if (miss()) return; const v = f.values(); addTask(ledger.id, { title: v.title, due: v.due || todayStr(), money: ledger.role === "accountant" }); sh.close(true, { force: true }); toast("Job saved"); after && setTimeout(after, 50); };
}
function noteSheet(ledger) {
  const body = el(html`<form novalidate><div class="form-group"><div class="field stacked"><label for="note-t">Note</label><textarea id="note-t" name="text" autofocus></textarea></div></div></form>`);
  const btn = el(html`<button type="button" class="btn">Save note</button>`);
  const f = wireForm(body); const miss = () => (f.values().text ? null : "Write the note to save");
  f.onChange(() => guardButton(btn, "Save note", miss)); guardButton(btn, "Save note", miss);
  const sh = openSheet({ title: "Add a note", body, footer: btn, isDirty: () => !!f.values().text, discardTitle: "Discard this note?" });
  btn.onclick = async () => { if (miss()) return; const { auth } = await import("../core/auth.js"); addRecord(ledger.id, "notes", { text: f.values().text, date: todayStr(), byName: auth.user.displayName || auth.user.email }); sh.close(true, { force: true }); toast("Note saved"); };
}
export { longDate };
