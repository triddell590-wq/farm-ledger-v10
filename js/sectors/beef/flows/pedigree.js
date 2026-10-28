// Pedigree layer (design/10 §12): herd book, society registration, 3-generation pedigree, DNA,
// EBVs (each with its run date), docility, bull fertility test. Only shown when the ledger's
// "Pedigree herd" setting is on.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { openSheet } from "../../../ui/sheet.js";
import { textField, selectField } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { shortDate, daysBetween } from "../../../core/dates.js";
import { canWrite } from "../../../core/policy.js";
import { entrySheet, opt } from "./common.js";
import { updateAnimal } from "../actions.js";
import { normTag, tagParts } from "../model/tags.js";
import { adj200 } from "../model/finishing.js";
import { kvRows } from "../ui.js";

const nameOf = (a, fallback) => (a ? [a.pedigree?.regName || a.name, a.mgmtNo].filter(Boolean).join(" ") || tagParts(a.tag).tail : fallback || "—");
/** Parents of an animal as { dam, sire } records or names. */
export function parents(ix, a) {
  const dam = a.damId ? ix.byId.get(a.damId) : a.damTag ? ix.byTag.get(normTag(a.damTag)) : null;
  const sire = a.sireId ? ix.byId.get(a.sireId) : null;
  return { dam, damName: dam ? null : a.damTag || "", sire, sireName: sire ? null : a.sireText || "" };
}
/** 3 generations: [[self],[sire,dam],[ss,sd,ds,dd]] as labels. */
export function tree(ix, a) {
  const g1 = parents(ix, a);
  const up = (x) => (x ? parents(ix, x) : { dam: null, damName: "", sire: null, sireName: "" });
  const s = up(g1.sire), d = up(g1.dam);
  return [[nameOf(a)], [nameOf(g1.sire, g1.sireName), nameOf(g1.dam, g1.damName)], [nameOf(s.sire, s.sireName), nameOf(s.dam, s.damName), nameOf(d.sire, d.sireName), nameOf(d.dam, d.damName)]];
}
/** Weights at about 200 and 400 days, adjusted. */
export function stageWeights(ix, a) {
  const w = ix.weights.get(a.id) || []; if (!a.dob) return {};
  const near = (target) => w.filter((x) => Math.abs(daysBetween(a.dob, x.date) - target) <= 60).sort((x, y) => Math.abs(daysBetween(a.dob, x.date) - target) - Math.abs(daysBetween(a.dob, y.date) - target))[0];
  const w2 = near(200), w4 = near(400);
  return { birth: +a.birthKg || null, d200: w2 ? Math.round(adj200({ weanKg: w2.kg, birthKg: +a.birthKg || 40, ageDays: daysBetween(a.dob, w2.date) }).adj200) : null, d400: w4 ? Math.round(((w4.kg - (+a.birthKg || 40)) / daysBetween(a.dob, w4.date)) * 400 + (+a.birthKg || 40)) : null };
}

export function pedigreeSheet(snap, a) {
  const p = a.pedigree || {}; const t = tree(snap.ix, a); const sw = stageWeights(snap.ix, a);
  const body = el(html`<div data-sector="beef">
    <div class="ped-tree" aria-label="Three generation pedigree">${t.map((col, i) => html`<div class="ped-col g${i}">${col.map((n) => html`<span>${n}</span>`)}</div>`)}</div>
    ${kvRows([["Herd book no.", p.herdBookNo || "—"], ["Registered name", p.regName || "—"], ["Society", p.society || snap.s.society || "—"], ["Registered", p.regStatus ? `${p.regStatus}${p.regDate ? ` · ${shortDate(p.regDate)}` : ""}` : "Not yet"],
      ["Docility", p.docility ? `${p.docility} of 5` : "—"], ["Weights", `birth ${sw.birth || "—"} · 200-day ${sw.d200 || "—"} · 400-day ${sw.d400 || "—"} kg`],
      ...(p.dna ? Object.entries(p.dna).filter(([, v]) => v).map(([k, v]) => [`DNA: ${k}`, v]) : []),
      ...(p.ebvs || []).map((e) => [`EBV ${e.name}`, `${e.value}${e.acc ? ` (acc ${e.acc}%)` : ""}${e.runDate ? ` · ${shortDate(e.runDate)}` : ""}`]),
      p.fertilityTest?.date && ["Fertility test", `${shortDate(p.fertilityTest.date)} · ${p.fertilityTest.result || ""}${p.fertilityTest.vet ? ` · ${p.fertilityTest.vet}` : ""}`]])}
    <div class="act-grid">${canWrite(snap.role, "animals") ? html`<button type="button" class="btn secondary" data-edit>Edit pedigree</button>` : ""}<a class="btn secondary" href="#/l/${snap.lid}/animal/${a.id}/sale-sheet">Sale sheet</a></div></div>`);
  const sh = openSheet({ title: "Pedigree", body, cancelText: "Done" });
  body.querySelector("[data-edit]")?.addEventListener("click", () => { sh.close(true, { force: true }); setTimeout(() => editPedigree(snap, a), 150); });
  body.querySelector("a.btn").addEventListener("click", () => sh.close(true, { force: true }));
}

function editPedigree(snap, a) {
  const p = a.pedigree || {}; const e = p.ebvs || [];
  const ebvText = e.map((x) => `${x.name} ${x.value}${x.acc ? ` ${x.acc}` : ""}`).join("\n");
  const body = el(html`<form novalidate data-sector="beef"><div class="form-group">
    ${textField({ name: "herdBookNo", label: "Herd book no.", value: p.herdBookNo || "" })}
    ${textField({ name: "regName", label: "Registered name", value: p.regName || "" })}
    ${textField({ name: "society", label: "Society", value: p.society || snap.s.society || "" })}
    ${selectField({ name: "regStatus", label: "Registration", value: p.regStatus || "", options: opt([["", "Not registered"], ["Applied"], ["Registered"], ["Upgraded"]]) })}
    ${textField({ name: "regDate", label: "Registered on", type: "date", value: p.regDate || "" })}
    ${selectField({ name: "docility", label: "Docility (1–5)", value: p.docility || "", options: opt([["", "—"], ["1"], ["2"], ["3"], ["4"], ["5"]]) })}
  </div><p class="form-label">DNA</p><div class="form-group">
    ${textField({ name: "parentage", label: "Parentage", value: p.dna?.parentage || "", optional: true, placeholder: "e.g. Verified sire and dam" })}
    ${textField({ name: "myostatin", label: "Myostatin", value: p.dna?.myostatin || "", optional: true, placeholder: "e.g. F94L 1 copy" })}
    ${textField({ name: "polled", label: "Polled", value: p.dna?.polled || "", optional: true })}
  </div><p class="form-label">EBVs</p><div class="form-group"><div class="field stacked"><label for="ped-ebv">One per line: name value accuracy</label><textarea id="ped-ebv" name="ebvs" rows="5" placeholder="Calving ease 2.1 65&#10;400 day weight +32 71">${ebvText}</textarea></div>
    ${textField({ name: "ebvDate", label: "EBV run date", type: "date", value: e[0]?.runDate || "" })}</div>
  <p class="form-label">Bull fertility test</p><div class="form-group">
    ${textField({ name: "ftDate", label: "Date", type: "date", value: p.fertilityTest?.date || "" })}${selectField({ name: "ftResult", label: "Result", value: p.fertilityTest?.result || "", options: opt([["", "—"], ["Passed"], ["Failed"], ["Retest"]]) })}${textField({ name: "ftVet", label: "Vet", value: p.fertilityTest?.vet || "", optional: true })}
  </div></form>`);
  entrySheet({
    title: "Edit pedigree", body, label: "Save pedigree", missing: () => null,
    save(v, sh) {
      const ebvs = v.ebvs.split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)\s+([+-]?\d+(?:\.\d+)?)(?:\s+(\d+))?$/); return m ? { name: m[1], value: m[2], acc: m[3] || null, runDate: v.ebvDate || null } : { name: l, value: "", runDate: v.ebvDate || null }; });
      updateAnimal(snap.lid, a, { pedigree: { ...p, herdBookNo: v.herdBookNo, regName: v.regName, society: v.society, regStatus: v.regStatus, regDate: v.regDate || null, docility: v.docility || null, dna: { parentage: v.parentage, myostatin: v.myostatin, polled: v.polled }, ebvs, fertilityTest: v.ftDate ? { date: v.ftDate, result: v.ftResult, vet: v.ftVet } : p.fertilityTest || null } });
      sh.close(true, { force: true }); toast("Pedigree saved");
    },
  });
}
export { raw };
