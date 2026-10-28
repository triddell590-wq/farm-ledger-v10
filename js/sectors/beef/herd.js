// Beef → Herd (design/10 §4.1): every animal, search by tag / last 5 / name, class chips,
// filter chips, sort, multi-select with an action bar (Treat · Weigh · Move · Sell).
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { radioGroup, wireForm } from "../../ui/form.js";
import { canWrite } from "../../core/policy.js";
import { daysBetween } from "../../core/dates.js";
import { num } from "../../ui/format.js";
import { largeTitle, groupLabel, emptyState } from "../../screens/common.js";
import { liveSnap } from "./data.js";
import { animalRow, urgentPill } from "./ui.js";
import { onFarm, classOf, CLASS_NAMES, withdrawal, lastWeight, dlwg, ageDays } from "./model/animals.js";
import { tagMatches } from "./model/tags.js";
import { birthsToRegister, dueInfo } from "./model/breeding.js";
import { finishingFacts } from "./model/finishing.js";

const CLASSES = ["cow", "calf", "weanling", "store", "finisher", "heifer", "bull"];
const SORTS = [["tag", "Tag"], ["age", "Age"], ["due", "Due date"], ["left", "Days left"], ["dlwg", "Last daily gain"]];
const LS = "fl10-beef-herd-sort";

export default async function herd(ctx) {
  const { ledger } = ctx;
  const q = ctx.params?.query || {};
  const st = { q: "", cls: CLASSES.includes(q.f) ? q.f : q.f === "finishing" ? "finisher" : "all", filter: ["withdrawal", "register", "unweighed", "gone"].includes(q.f) ? q.f : q.f?.startsWith("group:") ? q.f : "", select: false, sel: new Set(), sort: readSort() };
  const body = el(html`<div class="beef-page herd-page"></div>`);
  let snap = null;
  const { first, stop } = liveSnap(ledger, (s) => { snap = s; paint(); });
  function paint() {
    const keepQ = body.querySelector("[data-q]"); const focused = keepQ && document.activeElement === keepQ; const caret = keepQ ? keepQ.selectionStart : 0;
    body.replaceChildren(render(snap, st, paint));
    if (focused) { const i = body.querySelector("[data-q]"); i.focus(); try { i.setSelectionRange(caret, caret); } catch (e) { /* type=search */ } }
  }
  await first;
  return { el: body, title: "Herd", destroy: () => { stop(); document.querySelector(".select-bar")?.remove(); } };
}
function readSort() { try { return localStorage.getItem(LS) || "tag"; } catch (e) { return "tag"; } }

function counts(snap) {
  const live = snap.data.animals.filter(onFarm); const by = {};
  for (const a of live) { const c = classOf(snap.ix, a, snap.today); by[c] = (by[c] || 0) + 1; }
  return { live, by };
}
function filtered(snap, st) {
  const { ix, today } = snap;
  let list = st.filter === "gone" ? snap.data.animals.filter((a) => !onFarm(a)) : snap.data.animals.filter(onFarm);
  if (st.cls !== "all") list = list.filter((a) => classOf(ix, a, today) === st.cls);
  if (st.filter === "withdrawal") list = list.filter((a) => withdrawal(ix, a, today));
  if (st.filter === "register") { const ids = new Set(birthsToRegister(snap.data, snap.s, today).map((b) => b.animal.id)); list = list.filter((a) => ids.has(a.id)); }
  if (st.filter === "unweighed") list = list.filter((a) => ["finisher", "store", "weanling"].includes(classOf(ix, a, today)) && (!lastWeight(ix, a) || daysBetween(lastWeight(ix, a).date, today) > snap.s.weighEveryDays));
  if (st.filter.startsWith("group:")) list = list.filter((a) => a.groupId === st.filter.slice(6));
  if (st.q) list = list.filter((a) => tagMatches(a, st.q));
  return sortList(snap, list, st.sort);
}
function sortList(snap, list, by) {
  const { ix, today } = snap; const big = "9999-12-31";
  const key = {
    tag: (a) => String(a.mgmtNo || "").padStart(8, "0") + String(a.tag || ""),
    age: (a) => a.dob || big,
    due: (a) => { const d = classOf(ix, a, today) === "cow" ? dueInfo(snap.data, snap.s, ix, a) : {}; return d.date || d.from || big; },
    left: (a) => { const f = !["cow", "bull"].includes(classOf(ix, a, today)) && a.dob && ageDays(a, today) > 300 ? finishingFacts(snap.data, snap.s, ix, a, today).nearest : null; return f && f.left >= 0 ? String(f.left).padStart(6, "0") : "z"; },
    dlwg: (a) => { const g = dlwg(ix, a); return g ? String(Math.round(10000 - g.value * 1000)).padStart(6, "0") : "z"; },
  }[by] || ((a) => a.tag);
  return [...list].sort((x, y) => String(key(x)).localeCompare(String(key(y))) || String(x.tag).localeCompare(String(y.tag)));
}

function render(snap, st, repaint) {
  const { by, live } = counts(snap); const { ix, today, lid } = snap;
  const young = (by.calf || 0) + (by.weanling || 0) + (by.store || 0) + (by.finisher || 0) + (by.heifer || 0);
  const context = live.length ? [`${num(live.length)} cattle`, by.cow && `${num(by.cow)} cows`, by.bull && `${num(by.bull)} bull${by.bull > 1 ? "s" : ""}`, young && `${num(young)} young`].filter(Boolean).join(" · ") : "No cattle on the farm";
  const wdN = live.filter((a) => withdrawal(ix, a, today)).length;
  const regN = birthsToRegister(snap.data, snap.s, today).length;
  const unwN = live.filter((a) => ["finisher", "store", "weanling"].includes(classOf(ix, a, today)) && (!lastWeight(ix, a) || daysBetween(lastWeight(ix, a).date, today) > snap.s.weighEveryDays)).length;
  const goneN = snap.data.animals.length - live.length;
  const groups = [...ix.groups.values()];
  const list = filtered(snap, st);
  const canEdit = canWrite(snap.role, "animals");
  const chip = (attr, val, label, n, on) => html`<button type="button" class="chip" ${raw(`${attr}="${val}"`)} aria-pressed="${on}">${on ? raw(icon("check", { size: 18 })) : ""}${label}${n != null ? html` <span class="count">${num(n)}</span>` : ""}</button>`;
  const gName = st.filter.startsWith("group:") ? ix.groups.get(st.filter.slice(6))?.name : null;
  const node = el(html`<div>
    <div class="title-row">${largeTitle("Herd", context)}${live.length && canEdit ? html`<button type="button" class="text-btn" data-select>${st.select ? "Cancel" : "Select"}</button>` : ""}</div>
    ${snap.data.animals.length ? html`<div class="filter-bar">
      <div class="search-field">${raw(icon("search"))}<input type="search" placeholder="Search tag, name or last 5 digits" aria-label="Search the herd" data-q value="${st.q}" autocomplete="off"></div>
      <div class="chips scroll-chips" role="group" aria-label="Kind of animal">${chip("data-cls", "all", "All", live.length, st.cls === "all")}${CLASSES.filter((c) => by[c]).map((c) => chip("data-cls", c, CLASS_NAMES[c], by[c], st.cls === c))}</div>
      <div class="chips scroll-chips" role="group" aria-label="Filters">
        ${groups.length ? html`<button type="button" class="chip" data-groups aria-pressed="${!!gName}">${gName || "Groups"} ${raw(icon("down", { size: 16 }))}</button>` : ""}
        ${wdN || st.filter === "withdrawal" ? chip("data-f", "withdrawal", "In withdrawal", wdN, st.filter === "withdrawal") : ""}
        ${regN || st.filter === "register" ? chip("data-f", "register", "To register", regN, st.filter === "register") : ""}
        ${unwN || st.filter === "unweighed" ? chip("data-f", "unweighed", `Not weighed ${snap.s.weighEveryDays}d+`, unwN, st.filter === "unweighed") : ""}
        ${goneN ? chip("data-f", "gone", "Sold or died", goneN, st.filter === "gone") : ""}
        <button type="button" class="chip" data-sort>Sort: ${SORTS.find(([k]) => k === st.sort)[1]}</button>
      </div></div>` : ""}
    <div data-list></div>
  </div>`);
  const box = node.querySelector("[data-list]");
  if (!snap.data.animals.length) {
    box.append(el(emptyState({ sector: "beef", title: "No cattle yet", body: "Add your herd once and every register, reminder and list fills itself.", action: canEdit ? "Import a herd list" : null, actAttr: "data-import" })));
    if (canEdit) box.append(el(html`<div style="text-align:center;margin-top:8px"><button type="button" class="btn secondary" style="width:auto;padding:0 20px" data-add>Add one animal</button></div>`));
  } else if (!list.length) {
    box.append(el(html`<div class="card pad ink-2">${st.q ? `No cattle match “${st.q}”.` : "No cattle in this list."}</div>`));
  } else {
    const sections = sectionsFor(snap, list, st.sort);
    box.append(el(html`<div>${sections.map(([label, rows]) => html`${label ? groupLabel(label, num(rows.length)) : ""}<div class="list herd-list">${rows.map((a) => animalRow(snap, a, { selectable: st.select, selected: st.sel.has(a.id) }))}</div>`)}</div>`));
  }
  // events
  const qi = node.querySelector("[data-q]"); if (qi) qi.addEventListener("input", () => { st.q = qi.value; repaint(); });
  node.querySelectorAll("[data-cls]").forEach((b) => (b.onclick = () => { st.cls = b.dataset.cls; if (st.filter === "gone" && st.cls !== "all") st.filter = ""; repaint(); }));
  node.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { st.filter = st.filter === b.dataset.f ? "" : b.dataset.f; repaint(); }));
  const gb = node.querySelector("[data-groups]"); if (gb) gb.onclick = () => groupSheet(groups, st, repaint);
  node.querySelector("[data-sort]")?.addEventListener("click", () => sortSheet(st, repaint));
  const sb = node.querySelector("[data-select]"); if (sb) sb.onclick = () => { st.select = !st.select; st.sel.clear(); repaint(); };
  node.querySelector("[data-import]")?.addEventListener("click", () => import("./flows/animal-edit.js").then((m) => m.importHerdSheet(snap)));
  node.querySelector("[data-add]")?.addEventListener("click", () => import("./flows/animal-edit.js").then((m) => m.addAnimalSheet(snap)));
  if (st.select) {
    box.addEventListener("click", (e) => { const r = e.target.closest("[data-aid]"); if (!r) return; const id = r.dataset.aid; st.sel.has(id) ? st.sel.delete(id) : st.sel.add(id); r.setAttribute("aria-checked", String(st.sel.has(id))); paintBar(snap, st, repaint); });
  }
  paintBar(snap, st, repaint);
  return node;
}
function sectionsFor(snap, list, sort) {
  if (list.length <= 15) return [[null, list]];
  if (sort === "tag" || sort === "age") {
    const by = new Map(); for (const a of list) { const c = onFarm(a) ? classOf(snap.ix, a, snap.today) : "gone"; if (!by.has(c)) by.set(c, []); by.get(c).push(a); }
    return [...CLASSES, "gone"].filter((c) => by.has(c)).map((c) => [c === "gone" ? "Sold or died" : CLASS_NAMES[c], by.get(c)]);
  }
  const urgent = list.filter((a) => urgentPill(snap, a)); const rest = list.filter((a) => !urgentPill(snap, a));
  return [["Needs attention", urgent], ["Later", rest]].filter(([, l]) => l.length);
}
function paintBar(snap, st, repaint) {
  document.querySelector(".select-bar")?.remove();
  if (!st.select) return;
  const n = st.sel.size;
  const bar = el(html`<div class="select-bar" data-sector="beef" role="toolbar" aria-label="With the selected cattle">
    <span class="sel-n">${n ? `${n} selected` : "Tap cattle to select"}</span>
    ${["Treat", "Weigh", "Move", "Sell"].map((l) => html`<button type="button" class="btn secondary" data-act="${l}" ${raw(n ? "" : "disabled")}>${l}</button>`)}</div>`);
  document.body.append(bar);
  bar.onclick = async (e) => {
    const b = e.target.closest("[data-act]"); if (!b || !n) return;
    const ids = [...st.sel]; const act = b.dataset.act;
    st.select = false; st.sel.clear(); repaint();
    if (act === "Treat") (await import("./flows/treatment.js")).default(snap, { animalIds: ids });
    if (act === "Weigh") (await import("./flows/weigh.js")).default(snap, { animalIds: ids });
    if (act === "Move") (await import("./flows/move.js")).default(snap, { animalIds: ids });
    if (act === "Sell") (await import("./flows/sale.js")).default(snap, { animalIds: ids });
  };
}
function groupSheet(groups, st, repaint) {
  const cur = st.filter.startsWith("group:") ? st.filter.slice(6) : "";
  const body = el(html`<div><p class="sheet-title-sm">Show a group</p>${radioGroup("g", [{ value: "", label: "All groups" }, ...groups.map((g) => ({ value: g.id, label: g.name, help: g.shed || "" }))], cur)}</div>`);
  const f = wireForm(body); const sh = openSheet({ size: "small", body, label: "Groups", auto: true });
  f.onChange(() => { const v = f.values().g; st.filter = v ? `group:${v}` : ""; sh.close(true, { force: true }); repaint(); });
}
function sortSheet(st, repaint) {
  const body = el(html`<div><p class="sheet-title-sm">Sort the herd by</p>${radioGroup("s", SORTS.map(([value, label]) => ({ value, label })), st.sort)}</div>`);
  const f = wireForm(body); const sh = openSheet({ size: "small", body, label: "Sort", auto: true });
  f.onChange(() => { st.sort = f.values().s; try { localStorage.setItem(LS, st.sort); } catch (e) { /* blocked */ } sh.close(true, { force: true }); repaint(); });
}
