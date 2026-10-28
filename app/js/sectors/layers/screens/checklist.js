// British Lion Code checklist, optional RSPCA Assured list (design/14 §9.2) and "Inspector is
// here" (§9.1, §19). The header states the standard version exactly and never implies
// endorsement. Items the ledger evidences tick themselves from the records; the owner or a manager
// can mark any item met / not met with a note (meta/lion). Audit dates: internal every 6 months,
// independent at least every 18 months. Inspector is here: pick who is at the door, the registers
// they ask for (Egg Marketing Inspector: the production register first) and print the pack.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { textField, wireForm } from "../../../ui/form.js";
import { evidenceStrip } from "../../../ui/photo-strip.js";
import { toast } from "../../../ui/toast.js";
import { canWriteMeta } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, remember } from "./live.js";
import { d2, d3, n0, pill, kvRows, printDoc } from "../ui.js";
import { chipsField, dateField } from "../flows/common.js";
import { LION_ITEMS, RSPCA_ITEMS, evaluate, audits } from "../model/lion.js";
import { LION_HEADER, RSPCA_HEADER } from "../model/content.js";
import { REGISTERS, buildRegister, INSPECTORS, inspectorPack } from "../model/registers.js";
import { sortedHouses, flockIn, aliveAt } from "../model/flock.js";
import { salmonella } from "../model/health.js";
import { saveLionItem, saveAudit } from "../actions.js";

export default async function checklist(ctx) {
  const page = ctx.match.groups.page;
  const title = page === "lion" ? "Lion checklist" : page === "rspca" ? "RSPCA Assured" : "Inspector is here";
  return liveScreen(ctx, { title, tab: "more", paint: (snap) => {
    const back = backLink(`#/l/${snap.lid}/layers-paperwork`, "Paperwork");
    return page === "inspect" ? inspect(snap, back) : list(snap, back, page);
  }, after: (node, snap, repaint) => {
    node.querySelectorAll("[data-item]").forEach((b) => (b.onclick = () => itemSheet(snap, b.dataset.item, page)));
    node.querySelectorAll("[data-audit]").forEach((b) => (b.onclick = () => auditSheet(snap, b.dataset.audit)));
    node.querySelectorAll("[data-who]").forEach((b) => (b.onclick = () => { remember(snap.lid, "inspector", b.dataset.who); repaint(); }));
    const p = node.querySelector("[data-pack]"); if (p) p.onclick = () => printDoc(inspectorPack(snap.c, p.dataset.pack));
  } });
}

function list(snap, back, page) {
  const items = page === "rspca" ? RSPCA_ITEMS : LION_ITEMS;
  const rows = evaluate(snap.c, items, snap.meta.lion || {}); const done = rows.filter((r) => r.ok).length;
  const can = canWriteMeta(snap.role, "lion"); const au = audits(snap.meta.lion || {}, snap.today); const m = snap.meta.lion || {};
  return html`<div>${back}${largeTitle(page === "rspca" ? "RSPCA Assured" : "British Lion Code", `${done} of ${rows.length} met`)}
    <p class="ly-note ly-header-note">${page === "rspca" ? RSPCA_HEADER : LION_HEADER}</p>
    ${page === "lion" ? html`<div class="section">${groupLabel("Audits")}<div class="list">
      ${auditRow("internal", "Internal audit", m.internalAudit, au.internalDue, au.internalLate, "Every 6 months", can)}
      ${auditRow("independent", "Independent audit", m.independentAudit, au.independentDue, au.independentLate, "At least every 18 months", can)}</div></div>` : ""}
    <div class="section">${groupLabel("Requirements", can ? "Tap to mark" : "")}<div class="list">
      ${rows.map((r) => html`<button type="button" class="row no-lead ly-check" data-item="${r.id}" ${raw(can ? "" : "disabled")}><span class="main"><span class="primary">${r.text}</span><span class="secondary">${r.note || (r.auto ? "" : "Not evidenced in the app — mark it when it's in place")}${r.by ? ` · marked by ${r.by} ${d2(r.at)}` : r.auto ? " · from your records" : ""}</span></span>${r.ok === true ? pill("ok", "Met") : r.ok === false ? pill("due", "Not yet") : pill("info", "Mark")}</button>`)}</div></div>
    <p class="ly-cap">Ticks from your records update by themselves. A mark you set overrides the app until you clear it.</p></div>`;
}

function auditRow(key, label, last, due, late, sub, can) {
  return html`<button type="button" class="row no-lead" data-audit="${key}" ${raw(can ? "" : "disabled")}><span class="main"><span class="primary">${label}</span><span class="secondary">${last ? `Last ${d3(last)}` : "No date recorded"} · ${sub}</span></span>${due ? pill(late ? "late" : "info", `${late ? "Overdue" : "Next"} ${d2(due)}`) : pill("due", "Record")}</button>`;
}

function itemSheet(snap, id, page) {
  if (!canWriteMeta(snap.role, "lion")) return;
  const items = page === "rspca" ? RSPCA_ITEMS : LION_ITEMS; const it = items.find((x) => x.id === id); const cur = snap.meta.lion?.items?.[id] || {};
  const body = el(html`<form novalidate><p class="ly-sub">${it.text}</p>
    ${chipsField("state", "Status", [["met", "Met"], ["not", "Not yet"], ...(it.auto ? [["auto", "Use my records"]] : [["clear", "Clear"]])], cur.ok === true ? "met" : cur.ok === false ? "not" : it.auto ? "auto" : null)}
    <div class="form-group" style="margin-top:12px">${textField({ name: "note", label: "Note", value: cur.note || "", optional: true, placeholder: "Where the evidence is kept" })}</div></form>`);
  const strip = evidenceStrip(body, { lid: snap.lid, role: snap.role, list: page === "rspca" ? "rspca" : "lion", itemId: id, label: `${page === "rspca" ? "RSPCA" : "Lion"} · ${it.text}` });
  const f = wireForm(body); const btn = el(html`<button type="button" class="btn">Save</button>`);
  const sh = openSheet({ title: "Requirement", body, footer: btn, size: "small" });
  sh.done.then(() => strip.destroy());
  btn.onclick = () => { const v = f.values(); const ok = v.state === "met" ? true : v.state === "not" ? false : null; saveLionItem(snap, id, ok, v.note); sh.close(true, { force: true }); toast(ok == null ? "Back to your records" : ok ? "Marked as met" : "Marked as not yet"); };
}

function auditSheet(snap, which) {
  if (!canWriteMeta(snap.role, "lion")) return;
  const k = which === "internal" ? "internalAudit" : "independentAudit";
  const body = el(html`<form novalidate><div class="form-group">${dateField("date", which === "internal" ? "Internal audit done on" : "Independent audit done on", snap.meta.lion?.[k] || snap.today)}</div></form>`);
  const f = wireForm(body); const btn = el(html`<button type="button" class="btn">Save</button>`);
  const sh = openSheet({ title: which === "internal" ? "Internal audit" : "Independent audit", body, footer: btn, size: "small" });
  btn.onclick = () => { const v = f.values(); if (!v.date) return; saveAudit(snap, { [k]: v.date }); sh.close(true, { force: true }); toast("Audit date saved"); };
}

function inspect(snap, back) {
  const c = snap.c; const who = remember(snap.lid, "inspector") || "emi"; const I = INSPECTORS[who];
  const live = sortedHouses(c).map((h) => ({ h, f: flockIn(c, h.id) })).filter((x) => x.f);
  const hens = live.reduce((t, { f }) => t + aliveAt(c, f, snap.today), 0);
  const sheets = live.filter(({ h }) => snap.data.days.some((d) => d.houseId === h.id && d.date === snap.today && !d.partial)).length;
  const sal = live.map(({ h, f }) => ({ h, s: salmonella(c, f) })).filter((x) => !x.s.exempt);
  return html`<div>${back}${largeTitle("Inspector is here", "Everything they ask for, in one place")}
    <div class="ly-segs" role="radiogroup" aria-label="Who is here">${Object.entries(INSPECTORS).map(([k, x]) => html`<button type="button" class="chip" role="radio" aria-checked="${k === who}" data-who="${k}">${x.label}</button>`)}</div>
    <p class="ly-cap" style="margin:8px 4px 0">${I.sub}${who === "emi" ? " — the production register comes first." : ""}</p>
    <div class="section">${kvRows([
      ["Producer code", snap.s.producerCode || "—", snap.s.producerCode ? "" : "due"],
      ["Hens today", n0(hens), null, null, `${live.length} house${live.length === 1 ? "" : "s"} with a flock`],
      ["Daily sheets today", `${sheets} of ${live.length}`, sheets === live.length ? "ok" : "due"],
      ...sal.map(({ h, s }) => [`${h.name} Salmonella`, s.classB ? "Class B" : s.level === "ok" ? "On time" : s.level === "late" ? "Overdue" : "Due", s.classB || s.level === "late" ? "late" : s.level === "due" ? "due" : "ok", null, s.last ? `Last ${d2(s.last.date)} · ${s.last.result}` : "No sample yet"]),
    ])}</div>
    <div class="section">${groupLabel("Their registers", I.keys.length)}<div class="list">${I.keys.map((k) => { const r = REGISTERS.find((x) => x[0] === k); const n = buildRegister(c, k).rows.length;
      return html`<a class="row no-lead" href="#/l/${snap.lid}/reg/${k}"><span class="main"><span class="primary">${r[1]}</span><span class="secondary">${n} row${n === 1 ? "" : "s"} in 12 months · ${r[2]}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`; })}</div></div>
    <button type="button" class="btn" data-pack="${who}">${raw(icon("print"))}Print the pack (PDF)</button>
    <p class="ly-cap">Works with no signal: Print → Save as PDF, then share it. The ${I.label.toLowerCase()} doesn't need an account.</p></div>`;
}
