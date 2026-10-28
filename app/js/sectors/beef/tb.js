// TB (design/10 §6.8): herd TB card (status, next due, history), plan a test, test day mode
// (the crush list: big rows, one tap = presented, works offline), and the reading.
// Shared with Dairy by design; Dairy reuses this screen's model (tbTests) for its own herd.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { textField, selectField, segmented, wireForm } from "../../ui/form.js";
import { toast } from "../../ui/toast.js";
import { confirmSheet } from "../../ui/sheet.js";
import { canWrite, canWriteMeta } from "../../core/policy.js";
import { addDays, daysBetween, shortDate } from "../../core/dates.js";
import { listDate, num } from "../../ui/format.js";
import { backLink, largeTitle, groupLabel, emptyState } from "../../screens/common.js";
import { liveSnap } from "./data.js";
import { entrySheet, opt } from "./flows/common.js";
import { createTbTest, updateTbTest, updateAnimal, setMeta } from "./actions.js";
import { tagHtml, animalLabel, kvRows, printDoc } from "./ui.js";
import { tbVetList } from "./model/reports.js";
import { onFarm, shortName, describe } from "./model/animals.js";
import { tagParts } from "./model/tags.js";
import { tbNext } from "./model/duties.js";

export default async function tbScreen(ctx) {
  const id = ctx.match?.groups?.id; const mode = ctx.match?.groups?.mode;
  const body = el(html`<div class="beef-page"></div>`); const st = { missing: false, results: null };
  const { first, stop } = liveSnap(ctx.ledger, (snap) => {
    const t = id ? snap.data.tbTests.find((x) => x.id === id) : null;
    const y = window.scrollY;
    body.replaceChildren(!id ? card(snap) : !t ? el(html`<div>${backLink(`#/l/${snap.lid}/paperwork/tb`, "TB")}<p>Test not found.</p></div>`) : mode === "day" ? day(snap, t, st) : mode === "read" ? reading(snap, t, st) : detail(snap, t));
    if (y) window.scrollTo(0, y);
  });
  await first;
  return { el: body, title: mode === "day" ? "TB test day" : mode === "read" ? "TB reading" : "TB", depth: id ? 2 : 1, tab: "paperwork", destroy: stop };
}

function card(snap) {
  const tests = snap.data.tbTests.filter((t) => t.date).sort((a, b) => b.date.localeCompare(a.date)); const last = tests.find((t) => t.stage === "read" || !t.stage) || tests[0];
  const next = tbNext(snap.c); const left = next ? daysBetween(snap.today, next) : null; const can = canWrite(snap.role, "tbTests");
  const open = tests.find((t) => t.stage === "planned" || t.stage === "presented");
  const vet = snap.contacts.find((c) => c.kind === "Vet");
  const node = el(html`<div>${backLink(`#/l/${snap.lid}/paperwork`, "Paperwork")}${largeTitle("TB", snap.meta.settings?.tbStatus === "restricted" ? "Herd restricted" : last?.herdStatus || (last ? "OTF" : "No tests recorded"))}
    ${next ? html`<div class="num-tile hero"><span class="label">Next herd test</span><span class="value ${left < 0 ? "late" : left <= 14 ? "due" : ""}">${left < 0 ? `${-left} d overdue` : `in ${left} d`}</span><span class="sub">${listDate(next)} ${next.slice(0, 4)} · reminders 30, 14 and 3 days before</span>
      ${vet?.phone ? html`<a class="btn secondary" style="margin-top:12px" href="tel:${vet.phone}">${raw(icon("message"))}Book the vet: ${vet.name}</a>` : ""}</div>` : ""}
    ${open ? html`<div class="section"><a class="btn" href="#/l/${snap.lid}/tb/${open.id}/${open.stage === "planned" ? "day" : "read"}">${open.stage === "planned" ? `Start test day (${listDate(open.date)})` : `Record the reading (${listDate(open.readingDate)})`}</a></div>` : ""}
    ${!tests.length ? emptyState({ sector: "beef", title: "No TB tests recorded", body: "Add your last test date and we'll remind you 30, 14 and 3 days before the next.", action: can ? "Add last TB test" : null, actAttr: "data-last" })
      : html`<div class="section">${groupLabel("Tests", tests.length)}<div class="list">${tests.map((t) => { const r = Object.values(t.results || {}); return html`<a class="row no-lead" href="#/l/${snap.lid}/tb/${t.id}"><span class="main"><span class="primary">${shortDate(t.date)} · ${t.testType || "Herd test"}</span><span class="secondary">${t.stage === "planned" ? "Planned" : t.stage === "presented" ? `Presented ${Object.values(t.presented || {}).filter(Boolean).length} · reading ${listDate(t.readingDate)}` : `${t.herdStatus || "OTF"} · ${r.filter((x) => x === "reactor").length} reactors · ${r.filter((x) => x === "IR").length} inconclusive`}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`; })}</div></div>`}
    ${can ? html`<div class="act-grid">${tests.length ? html`<button type="button" class="btn secondary" data-last>Add a past test</button>` : ""}<button type="button" class="btn secondary" data-plan>Plan a test</button></div>` : ""}
    ${canWriteMeta(snap.role, "settings") ? html`<p class="hint">Vet set a different date? <button type="button" class="text-btn" data-due>Change the next due date</button></p>` : ""}
  </div>`);
  node.querySelector("[data-last]")?.addEventListener("click", () => pastSheet(snap));
  node.querySelector("[data-plan]")?.addEventListener("click", () => planSheet(snap));
  node.querySelector("[data-due]")?.addEventListener("click", () => dueSheet(snap, next));
  return node;
}
function pastSheet(snap) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "date", label: "Test date", type: "date" })}${selectField({ name: "herdStatus", label: "Result", value: "OTF", options: opt([["OTF", "Clear (OTF)"], ["OTS", "Suspended (OTS)"], ["OTW", "Withdrawn (OTW)"]]) })}${selectField({ name: "testType", label: "Type", value: "Herd test", options: opt([["Herd test"], ["Check test"], ["Pre-movement"], ["Retest"]]) })}${textField({ name: "vet", label: "Vet", optional: true })}</div></form>`);
  entrySheet({ title: "Add a TB test", body, label: "Save test", missing: (v) => (!v.date ? "Add the test date" : null), save(v, sh) { createTbTest(snap.lid, { date: v.date, readingDate: addDays(v.date, 3), stage: "read", herdStatus: v.herdStatus, testType: v.testType, vet: v.vet, nextDue: addDays(v.date, 365) }); sh.close(true, { force: true }); toast(`Next test due about ${shortDate(addDays(v.date, 365))}`); } });
}
function planSheet(snap) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "date", label: "Test day", type: "date", value: tbNext(snap.c) || snap.today })}${selectField({ name: "testType", label: "Type", value: "Herd test", options: opt([["Herd test"], ["Check test"], ["Pre-movement"], ["Retest"]]) })}${textField({ name: "vet", label: "Vet", optional: true })}</div><p class="hint">On the day, open it for the crush list. Reading is 72 hours later.</p></form>`);
  entrySheet({ title: "Plan a TB test", body, label: "Save", missing: (v) => (!v.date ? "Add the date" : null), save(v, sh) { const id = createTbTest(snap.lid, { date: v.date, testType: v.testType, vet: v.vet, headCount: snap.data.animals.filter(onFarm).length }); sh.close(true, { force: true }); location.hash = `#/l/${snap.lid}/tb/${id}`; } });
}
function dueSheet(snap, next) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "d", label: "Next test due", type: "date", value: next || "" })}</div><p class="hint">Leave empty to work it out from the last test (+12 months).</p></form>`);
  entrySheet({ title: "Next TB test", body, label: "Save", missing: () => null, save(v, sh) { setMeta(snap.lid, "settings", { tbNextDue: v.d || "" }); sh.close(true, { force: true }); toast("Saved"); } });
}

function detail(snap, t) {
  const r = t.results || {}; const ids = Object.keys(r);
  const node = el(html`<div>${backLink(`#/l/${snap.lid}/paperwork/tb`, "TB")}${largeTitle(`TB test ${shortDate(t.date)}`, t.testType || "Herd test")}
    ${kvRows([["Stage", { planned: "Planned", presented: "Presented, waiting for reading", read: "Read" }[t.stage] || "Read"], ["Vet", t.vet || "—"], t.stage === "planned" ? ["Head to test", num(t.headCount || snap.data.animals.filter(onFarm).length)] : ["Presented", num(Object.values(t.presented || {}).filter(Boolean).length || t.headCount || 0)], t.readingDate && ["Reading", shortDate(t.readingDate)], t.herdStatus && ["Herd status after", t.herdStatus], t.nextDue && ["Next due", shortDate(t.nextDue)],
      ...ids.filter((i) => r[i] !== "clear").map((i) => [snap.ix.byId.get(i)?.tag || i, r[i] === "reactor" ? "Reactor" : "Inconclusive", "late"])])}
    ${canWrite(snap.role, "tbTests") && t.stage !== "read" ? html`<div class="section"><a class="btn" href="#/l/${snap.lid}/tb/${t.id}/${t.stage === "presented" ? "read" : "day"}">${t.stage === "presented" ? "Record the reading" : "Start test day"}</a></div>` : ""}
    <div class="section"><button type="button" class="btn secondary" data-vetlist>${raw(icon("print"))}Print the list for the vet</button><p class="hint">Tags in crush order by group, with blank reading columns.</p></div></div>`);
  node.querySelector("[data-vetlist]").onclick = () => printDoc(tbVetList(snap.c, t));
  return node;
}

function day(snap, t, st) {
  const live = snap.data.animals.filter(onFarm); const pres = t.presented || {}; const can = canWrite(snap.role, "tbTests");
  const n = live.filter((a) => pres[a.id]).length; const groups = new Map();
  for (const a of live.filter((x) => !st.missing || !pres[x.id]).sort((x, y) => String(x.tag).localeCompare(String(y.tag)))) { const g = snap.ix.groups.get(a.groupId)?.name || "No group"; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(a); }
  const node = el(html`<div class="tb-day">${backLink(`#/l/${snap.lid}/tb/${t.id}`, "Test")}
    <div class="tb-head"><h1>Presented ${n} of ${live.length}</h1><p>${live.length - n} to find · ${shortDate(t.date)}</p>
      <div class="chips"><button type="button" class="chip" data-missing aria-pressed="${st.missing}">${st.missing ? "Showing missing only" : "Show missing only"}</button></div></div>
    ${[...groups].map(([g, list]) => html`${groupLabel(g, `${list.filter((a) => pres[a.id]).length}/${list.length}`)}<div class="list">${list.map((a) => html`<button type="button" class="row tb-row" role="checkbox" aria-checked="${!!pres[a.id]}" data-aid="${a.id}" ${raw(can ? "" : "disabled")}><span class="checkbox">${raw(icon("check"))}</span><span class="main"><span class="primary">${tagHtml(a.tag)}</span><span class="secondary">${[shortName(a), describe(snap.ix, a, snap.today)].filter(Boolean).join(" · ")}</span></span></button>`)}</div>`)}
    ${can ? html`<div class="sticky-foot"><button type="button" class="btn" data-finish>Finish day 1 · reading ${listDate(addDays(t.date, 3))}</button></div>` : ""}</div>`);
  node.querySelector("[data-missing]").onclick = () => { st.missing = !st.missing; node.replaceWith(day(snap, t, st)); };
  node.querySelectorAll("[data-aid]").forEach((b) => (b.onclick = () => { const on = b.getAttribute("aria-checked") !== "true"; b.setAttribute("aria-checked", String(on)); t.presented = { ...(t.presented || {}), [b.dataset.aid]: on }; updateTbTest(snap.lid, t, { presented: t.presented }); node.querySelector(".tb-head h1").textContent = `Presented ${live.filter((a) => t.presented[a.id]).length} of ${live.length}`; }));
  node.querySelector("[data-finish]")?.addEventListener("click", async () => {
    const left = live.length - live.filter((a) => t.presented?.[a.id]).length;
    if (left && !(await confirmSheet({ title: `${left} not presented`, body: "Finish anyway? The vet will need a reason for each one missing.", confirm: "Finish day 1" }))) return;
    updateTbTest(snap.lid, t, { stage: "presented", readingDate: addDays(t.date, 3) }); toast(`Reading on ${listDate(addDays(t.date, 3))} — it's on your Today list`); location.hash = `#/l/${snap.lid}/paperwork/tb`;
  });
  return node;
}

function reading(snap, t, st) {
  const pres = Object.keys(t.presented || {}).filter((k) => t.presented[k]); const list = pres.map((id) => snap.ix.byId.get(id)).filter(Boolean);
  st.results = st.results || { ...(t.results || {}) };
  const node = el(html`<form novalidate>${backLink(`#/l/${snap.lid}/tb/${t.id}`, "Test")}${largeTitle("TB reading", `${list.length} presented · everyone clear unless you change them`)}
    <div class="list">${list.map((a) => html`<div class="row no-lead tb-read"><span class="main"><span class="primary">${tagHtml(a.tag)}</span><span class="secondary">${[shortName(a), describe(snap.ix, a, snap.today)].filter(Boolean).join(" · ")}</span></span>${segmented(`r_${a.id}`, opt([["clear", "Clear"], ["reactor", "Reactor"], ["IR", "Inconcl."]]), st.results[a.id] || "clear")}</div>`)}</div>
    <div class="form-group" style="margin-top:16px">${selectField({ name: "herdStatus", label: "Herd status after", value: t.herdStatus || "OTF", options: opt([["OTF", "Clear (OTF)"], ["OTS", "Suspended (OTS)"], ["OTW", "Withdrawn (OTW)"]]) })}${textField({ name: "nextDue", label: "Next test due", type: "date", value: t.nextDue || addDays(t.date, 365) })}${textField({ name: "vet", label: "Vet", value: t.vet || "", optional: true })}</div>
    <div class="sticky-foot"><button type="button" class="btn" data-save>Save reading</button></div></form>`);
  const f = wireForm(node);
  f.onChange((name) => { const v = f.values(); if (name?.startsWith("r_")) { st.results[name.slice(2)] = v[name]; if (v[name] !== "clear") { node.querySelector("[name=herdStatus]").value = v[name] === "reactor" ? "OTW" : "OTS"; node.querySelector("[name=nextDue]").value = addDays(t.date, 60); } } });
  node.querySelector("[data-save]").onclick = () => {
    const v = f.values(); const results = {}; list.forEach((a) => (results[a.id] = v[`r_${a.id}`] || "clear"));
    updateTbTest(snap.lid, t, { stage: "read", results, herdStatus: v.herdStatus, nextDue: v.nextDue, vet: v.vet });
    list.forEach((a) => { if (results[a.id] !== "clear" || a.tb) updateAnimal(snap.lid, a, { tb: { status: results[a.id], lastTest: t.date } }); });
    if (canWriteMeta(snap.role, "settings")) setMeta(snap.lid, "settings", { tbStatus: v.herdStatus === "OTF" ? "" : "restricted", tbNextDue: "" });
    const bad = Object.values(results).filter((x) => x !== "clear").length;
    toast(bad ? `${bad} not clear. Your herd is restricted: cattle can only go direct to slaughter.` : "All clear. Next test reminder set."); location.hash = `#/l/${snap.lid}/paperwork/tb`;
  };
  void tagParts;
  return node;
}
