// Small Dairy record books (design/12 §8, §10): milking machine (ISO 6690 test, service, liner
// changes — 12-month reminders), training and induction, antibiotic failures (DP.4 / DP.6), TB
// tests (one test per herd number across Beef and Dairy), foot trimming and the handover log.
// Route: <kind> = parlour-machine | training | ab-failures | tb | foot | people-log.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { textField } from "../../../ui/form.js";
import { canWrite } from "../../../core/policy.js";
import { daysBetween } from "../../../core/dates.js";
import { largeTitle, backLink } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { add, update, me } from "../actions.js";
import { sectionOf, pill, cowRow, dm, printDoc } from "../ui.js";
import { entrySheet, chipsField } from "../flows/common.js";
import { yearlyDue } from "../model/tools.js";
import { failures } from "../model/mastitis.js";
import { quartersText } from "../model/milking.js";
import { tbNext } from "../model/duties.js";
import { onFarm, groupOf, GROUP_NAMES, sortByNo, cowLabel } from "../model/cows.js";

const TITLES = { "parlour-machine": "Milking machine", training: "Training and induction", "ab-failures": "Antibiotic failures", tb: "TB tests", foot: "Foot trimming", "people-log": "Handover notes" };
const BACK = { "ab-failures": ["paperwork", "Paperwork"], tb: ["paperwork", "Paperwork"], foot: ["scores", "Mobility and BCS"] };

export default async function logs(ctx) {
  const kind = ctx.match.groups.kind; const body = el(html`<div class="dairy-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => { const [h, l] = BACK[kind] || ["more", "More"]; body.replaceChildren(el(html`<div>${backLink(`#/l/${snap.lid}/${h}`, l)}</div>`), PAGES[kind](snap)); });
  await first;
  return { el: body, title: TITLES[kind] || "Records", tab: "more", destroy: stop };
}
const fmt = (iso) => (iso ? `${dm(iso)} ${iso.slice(0, 4)}` : "—");
const sorted = (l) => l.filter((x) => !x.deleted).sort((a, b) => String(b.date).localeCompare(String(a.date)));
const bind = (node, sel, fn) => { const x = node.querySelector(sel); if (x) x.onclick = fn; };

export const MACHINE_TYPES = [["ISO 6690 static test", "ISO 6690 machine test", "MP.16"], ["Liner change", "Liner change", "MP.15"], ["Service", "Machine service", "MP.8"]];

const PAGES = {
  "parlour-machine"(snap) {
    const recs = sorted(snap.data.parlourService); const can = canWrite(snap.role, "parlourService");
    const due = MACHINE_TYPES.map(([type, label, std]) => { const last = recs.find((r) => r.type === type)?.date || null; const y = yearlyDue(last, snap.today); return { type, label, std, last, ...y }; });
    const node = el(html`<div>${largeTitle("Milking machine", snap.s.robot ? "Robot service and tests" : "Parlour tests, service and liners")}
      <div class="list">${due.map((d) => html`<div class="row no-lead"><span class="main"><span class="primary">${d.label}</span><span class="secondary">${d.last ? `Last ${fmt(d.last)} · next by ${fmt(d.due)}` : "Not recorded yet"} · Red Tractor ${d.std}</span></span>${!d.last ? pill("due", "Add it") : d.left < 0 ? pill("late", "Overdue") : d.left <= 30 ? pill("due", `${d.left} d`) : pill("ok", "OK")}</div>`)}</div>
      ${can ? html`<div class="section"><button type="button" class="btn" data-add>${raw(icon("plus"))}Add a test, service or liner change</button></div>` : ""}
      ${sectionOf("History", recs.length ? html`<div class="list">${recs.map((r) => html`<div class="row no-lead"><span class="main"><span class="primary">${r.type} · ${fmt(r.date)}</span><span class="secondary">${[r.technician, r.faults ? `Faults: ${r.faults}` : "No faults", r.rectified ? `Put right: ${r.rectified}` : null].filter(Boolean).join(" · ")}</span></span></div>`)}</div>` : html`<p class="hint">Add the last machine test and liner change so the 12-month reminders work.</p>`)}</div>`);
    bind(node, "[data-add]", () => machineSheet(snap));
    return node;
  },
  training(snap) {
    const recs = sorted(snap.data.training); const can = canWrite(snap.role, "training");
    const node = el(html`<div>${largeTitle("Training and induction", "Relief milkers, medicines course, induction")}
      <div class="info-card">${raw(icon("info"))}<span>Keep records 2 years after a person leaves (Red Tractor PL.1, PL.2). Whoever gives medicines needs a course within 5 years (AM.3.1).</span></div>
      ${can ? html`<div class="section"><button type="button" class="btn" data-add>${raw(icon("plus"))}Add a training record</button></div>` : ""}
      ${sectionOf("Records", recs.length ? html`<div class="list">${recs.map((r) => html`<button type="button" class="row no-lead" data-id="${r.id}"><span class="main"><span class="primary">${r.name} · ${r.training}</span><span class="secondary">${[fmt(r.date), r.provider, r.leftOn ? `left ${fmt(r.leftOn)}` : null].filter(Boolean).join(" · ")}</span></span>${r.leftOn ? pill("neutral", "Left") : ""}</button>`)}</div>` : html`<p class="hint">No training records yet.</p>`, recs.length || "")}</div>`);
    bind(node, "[data-add]", () => trainingSheet(snap));
    if (can) node.querySelectorAll("[data-id]").forEach((b) => (b.onclick = () => trainingSheet(snap, recs.find((r) => r.id === b.dataset.id))));
    return node;
  },
  "ab-failures"(snap) {
    const f = failures(snap.data, snap.today); const forms = sorted(snap.data.abFailures); const can = canWrite(snap.role, "mastitis");
    const need = f.length >= 2 && !(forms.length && forms[0].date >= f[f.length - 1].date);
    const node = el(html`<div>${largeTitle("Antibiotic failures", `${f.length} in the last 12 months`)}
      <div class="info-card">${raw(icon("info"))}<span>A failure is a second treatment of the same quarter within 21 days. Tell your vet within 1 week (Red Tractor DP.4); after 2 failures in 12 months, fill in the investigation form with your vet (DP.6).</span></div>
      ${need ? html`<div class="warn-card" style="margin-top:12px">${raw(icon("alert"))}<span>${f.length} failures in 12 months — the investigation form is needed.</span></div>` : ""}
      ${sectionOf("Failures", f.length ? html`<div class="list">${f.map((m) => { const a = snap.ix.byId.get(m.animalId); const late = !m.vetToldAt && daysBetween(m.date, snap.today) > 7;
        return html`<div class="row no-lead" data-m="${m.id}"><span class="cow-no">${a ? cowLabel(a) : "—"}</span><span class="main"><span class="primary">${quartersText(m.quarters)} · ${fmt(m.date)}</span><span class="secondary">${m.productName || "treatment"} · ${m.vetToldAt ? `vet told ${fmt(m.vetToldAt)}` : "vet not told yet"}</span></span>${m.vetToldAt ? pill("ok", "Told") : can ? html`<button type="button" class="btn small ${late ? "" : "secondary"}" data-told>Vet told</button>` : pill(late ? "late" : "due", "Tell vet")}</div>`; })}</div>` : html`<p class="hint">No treatment failures in the last 12 months.</p>`)}
      ${sectionOf("Investigation forms (DP.6)", html`${forms.length ? html`<div class="list">${forms.map((x) => html`<div class="row no-lead"><span class="main"><span class="primary">${fmt(x.date)}${x.vet ? " · " + x.vet : ""}</span><span class="secondary">${x.summary || ""}${x.actions ? " · Actions: " + x.actions : ""}</span></span></div>`)}</div>` : ""}
        ${can ? html`<button type="button" class="btn ${need ? "" : "secondary"}" data-form style="margin-top:8px">Fill in the investigation form</button>` : ""}`)}</div>`);
    node.querySelectorAll("[data-told]").forEach((b) => (b.onclick = () => { const m = snap.data.mastitis.find((x) => x.id === b.closest("[data-m]").dataset.m); update(snap.lid, "mastitis", m, { vetToldAt: snap.today }); toast("Marked: vet told"); }));
    bind(node, "[data-form]", () => abFormSheet(snap, f));
    return node;
  },
  tb(snap) {
    const recs = sorted(snap.data.tbTests); const next = tbNext(snap.c); const left = next ? daysBetween(snap.today, next) : null; const can = canWrite(snap.role, "tbTests");
    const node = el(html`<div>${largeTitle("TB tests", next ? `Next herd test ${fmt(next)} (${left < 0 ? `${-left} days overdue` : `in ${left} days`})` : "Add your last test to see the next one")}
      <div class="info-card">${raw(icon("info"))}<span>One TB test covers the whole herd number — if this farm has a Beef ledger with the same herd number, the test is the same day. Reminders at 30, 14 and 3 days.</span></div>
      ${can ? html`<div class="act-grid" style="margin-top:12px"><button type="button" class="btn" data-add>${raw(icon("plus"))}Record a TB test</button><button type="button" class="btn secondary" data-print>${raw(icon("print"))}Test list for the vet</button></div>` : ""}
      ${sectionOf("Tests", recs.length ? html`<div class="list">${recs.map((r) => html`<div class="row no-lead"><span class="main"><span class="primary">${r.type || "Herd test"} · ${fmt(r.date)}</span><span class="secondary">${[r.count ? `${r.count} tested` : null, r.result, r.vet].filter(Boolean).join(" · ")}</span></span>${r.result && /reactor|inconclusive/i.test(r.result) ? pill("late", r.result) : pill("ok", r.result || "Clear")}</div>`)}</div>` : html`<p class="hint">No TB tests recorded.</p>`)}</div>`);
    bind(node, "[data-add]", () => tbSheet(snap));
    bind(node, "[data-print]", () => printDoc(tbList(snap)));
    return node;
  },
  foot(snap) {
    const recs = sorted(snap.data.footTrims);
    const node = el(html`<div>${largeTitle("Foot trimming", `${recs.length} record${recs.length === 1 ? "" : "s"}`)}
      ${canWrite(snap.role, "footTrims") ? html`<div class="section"><button type="button" class="btn" data-add>${raw(icon("plus"))}Add a foot trim</button></div>` : ""}
      ${recs.length ? html`<div class="list">${recs.map((t) => { const a = snap.ix.byId.get(t.animalId); return a ? cowRow(snap, a, { extra: html`<span class="secondary">${fmt(t.date)} · ${t.foot} · ${t.lesion || "trim"}${t.treatment ? " · " + t.treatment : ""}${t.block ? " · block" : ""}</span>` }) : ""; })}</div>` : html`<p class="hint">No foot trims recorded.</p>`}</div>`);
    bind(node, "[data-add]", async () => (await import("../flows/scores.js")).footTrimSheet(snap));
    return node;
  },
  "people-log"(snap) {
    const recs = snap.data.handover.filter((h) => !h.deleted).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return el(html`<div>${largeTitle("Handover notes", "Every note between milkers, newest first")}
      ${recs.length ? html`<div class="list">${recs.slice(0, 100).map((h) => html`<div class="row no-lead"><span class="main"><span class="primary">${h.text}</span><span class="secondary">${h.byName || ""} · ${String(h.at).slice(0, 10)} ${String(h.at).slice(11, 16)}${h.auto ? " · from a treatment" : ""}</span>${(h.replies || []).map((r) => html`<span class="secondary">↳ ${r.text} — ${r.byName || ""}, ${String(r.at).slice(11, 16)}</span>`)}</span></div>`)}</div>` : html`<p class="hint">No handover notes yet.</p>`}</div>`);
  },
};

function machineSheet(snap) {
  const body = el(html`<form novalidate><div class="form-group">${chipsField("type", "What was done", [...MACHINE_TYPES.map(([t, l]) => [t, l]), ["Dynamic test", "Dynamic (milking-time) test"]], "ISO 6690 static test")}
    ${textField({ name: "date", label: "Date", type: "date", value: snap.today })}${textField({ name: "technician", label: "Technician / company", optional: true })}${textField({ name: "faults", label: "Faults found", optional: true })}${textField({ name: "rectified", label: "How they were put right", optional: true })}</div></form>`);
  return entrySheet({ title: "Milking machine", body, label: "Save", missing: (v) => (!v.type ? "Pick what was done" : !v.date ? "Add the date" : null),
    save(v, sh) { add(snap.lid, "parlourService", { type: v.type, date: v.date, technician: v.technician, faults: v.faults, rectified: v.rectified }); sh.close(true, { force: true }); toast(`${v.type} saved — next due in 12 months`); } }).sheet.done;
}
function trainingSheet(snap, r = null) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "name", label: "Name", value: r?.name || "" })}${chipsField("training", "Training", ["Induction", "Medicines course", "Milking routine", "Parlour hygiene", "Calf rearing", "Other"], r?.training || "Induction")}
    ${textField({ name: "date", label: "Date", type: "date", value: r?.date || snap.today })}${textField({ name: "provider", label: "Given by", value: r?.provider || me(), optional: true })}${textField({ name: "leftOn", label: "Left the farm on", type: "date", value: r?.leftOn || "", optional: true })}</div></form>`);
  return entrySheet({ title: r ? "Training record" : "Add training", body, label: "Save", missing: (v) => (!v.name ? "Add the name" : !v.training ? "Pick the training" : null),
    save(v, sh) { const d = { name: v.name, training: v.training, date: v.date, provider: v.provider, leftOn: v.leftOn || null }; if (r) update(snap.lid, "training", r, d); else add(snap.lid, "training", d); sh.close(true, { force: true }); toast("Training record saved"); } }).sheet.done;
}
function abFormSheet(snap, f) {
  const body = el(html`<form novalidate><p class="hint" style="margin:0 4px 8px">${f.length} failure${f.length === 1 ? "" : "s"} in 12 months: ${f.map((m) => `${cowLabel(snap.ix.byId.get(m.animalId) || {})} ${quartersText(m.quarters)} (${dm(m.date)})`).join(", ")}</p>
    <div class="form-group">${textField({ name: "date", label: "Date", type: "date", value: snap.today })}${textField({ name: "vet", label: "Vet", optional: true })}${textField({ name: "summary", label: "What you found (product, organism, dose, routine)" })}${textField({ name: "actions", label: "What changes", optional: true })}</div></form>`);
  return entrySheet({ title: "Investigation form (DP.6)", body, label: "Save form", missing: (v) => (!v.summary ? "Add what you found" : null),
    save(v, sh) { add(snap.lid, "abFailures", { date: v.date, vet: v.vet, summary: v.summary, actions: v.actions, failureIds: f.map((m) => m.id) }); sh.close(true, { force: true }); toast("Investigation form saved"); } }).sheet.done;
}
function tbSheet(snap) {
  const n = snap.data.animals.filter(onFarm).length;
  const body = el(html`<form novalidate><div class="form-group">${chipsField("type", "Test", ["Herd test", "Check test", "Pre-movement", "Contiguous"], "Herd test")}${textField({ name: "date", label: "Read on (day 3)", type: "date", value: snap.today })}
    ${textField({ name: "count", label: "Animals tested", value: String(n), inputmode: "numeric" })}${chipsField("result", "Result", ["Clear", "Inconclusive", "Reactor(s)"], "Clear")}${textField({ name: "vet", label: "Vet", optional: true })}</div></form>`);
  return entrySheet({ title: "TB test", body, label: "Save TB test", missing: (v) => (!v.date ? "Add the date" : null),
    save(v, sh) { add(snap.lid, "tbTests", { type: v.type, date: v.date, count: +v.count || null, result: v.result, vet: v.vet }); sh.close(true, { force: true }); toast(v.result === "Clear" ? "TB test saved — next one reminded" : "TB test saved — your herd will be restricted; follow DAERA's letter"); } }).sheet.done;
}
/** Printable list for the vet: every animal on the farm in crush order by group, blank day-1/day-3 columns. */
export function tbList(snap) {
  const order = ["milking", "dry", "heifer", "calf", "bull", "other"];
  const rows = snap.data.animals.filter(onFarm).map((a) => ({ a, g: groupOf(snap.ix, a, snap.today) })).sort((x, y) => order.indexOf(x.g) - order.indexOf(y.g) || sortByNo(x.a, y.a))
    .map(({ a, g }) => [GROUP_NAMES[g] || g, cowLabel(a), a.tag || "", a.dob || "", "", "", "", ""]);
  return { title: "TB test list", top: [["Herd", snap.s.herdNo || ""], ["Animals", String(rows.length)]], headers: ["Group", "Cow no.", "Tag", "Born", "Avian day 1", "Bovine day 1", "Avian day 3", "Bovine day 3"], rows, note: "Grouped by milking group, cow number order." };
}
