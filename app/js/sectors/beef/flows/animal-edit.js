// Adding and editing cattle: one animal, a herd list import (photo/paste, v9 parser), identity
// edit (tags only change through "Replace a tag", design/10 §4.3), replace a tag (§6.9), BVD
// result, and the card's detail sections (Identity · NIFAIS · Health · Pedigree · Notes).
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { openSheet } from "../../../ui/sheet.js";
import { textField, selectField, checkRow, chipGroup, segmented, fieldError } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr, shortDate, addDays } from "../../../core/dates.js";
import { canWrite } from "../../../core/policy.js";
import { entrySheet, opt } from "./common.js";
import { addAnimal, updateAnimal, recordRetag, softDelete } from "../actions.js";
import { parseTag, normTag, DAERA_BREEDS, DAERA_COLOURS, breedCode, breedName, colourName, colourCode } from "../model/tags.js";
import { parseHerdList } from "../model/docket.js";
import { kvRows, animalLabel } from "../ui.js";
import { readTextSheet } from "./read-text.js";
import { bvdWord } from "../animal.js";
import { nifaisDays } from "../model/duties.js";

const breedOpts = [{ value: "", label: "Choose" }, ...DAERA_BREEDS.map(([c, n]) => ({ value: c, label: `${n} (${c})` }))];
const colourOpts = [{ value: "", label: "Choose" }, ...DAERA_COLOURS.map(([c, n]) => ({ value: c, label: n }))];
const sexOpts = opt([["", "Choose"], ["Cow"], ["Heifer"], ["Steer"], ["Bull"]]);
export const BVD_OPTS = opt([["", "No result yet"], ["BVDN", "Negative (BVDN)"], ["INDNEG", "Indirect negative"], ["BVDU", "Untested"], ["BVDI", "Inconclusive"], ["BVDP", "Positive (BVDP)"]]);

function tagProblem(snap, t, selfId) {
  if (!t) return "Add the tag number to save";
  const p = parseTag(t);
  if (p && p.check != null && !p.valid) return "That tag's check digit doesn't match — check the last number";
  const dup = snap.ix.byTag.get(normTag(p?.formatted || t));
  if (dup && dup.id !== selfId) return `${p?.formatted || t} is already in your herd (${animalLabel(dup)})`;
  return null;
}

/** Add one animal by hand. */
export function addAnimalSheet(snap) {
  const groups = [...snap.ix.groups.values()];
  const body = el(html`<form novalidate data-sector="beef"><div class="form-group">
    ${textField({ name: "tag", label: "Tag number", placeholder: "UK 9 123456 7001 2", autocomplete: "off" })}
    ${textField({ name: "mgmtNo", label: "Herd / management no.", optional: true, placeholder: "e.g. 0412" })}
    ${textField({ name: "name", label: "Name", optional: true })}
    ${selectField({ name: "sex", label: "Sex", value: "", options: sexOpts })}
    ${textField({ name: "dob", label: "Born", type: "date" })}
    ${selectField({ name: "breed", label: "Breed", value: "", options: breedOpts })}
    ${selectField({ name: "colour", label: "Colour", value: "", options: colourOpts })}
    ${textField({ name: "damTag", label: "Dam's tag", optional: true })}
    ${groups.length ? selectField({ name: "groupId", label: "Group", value: "", options: [{ value: "", label: "None" }, ...groups.map((g) => ({ value: g.id, label: g.name }))] }) : ""}
  </div>
  <p class="form-label">Where from</p>
  <div class="form-group">
    <div class="field"><span class="label">Born</span><span style="flex:1"></span>${segmented("origin", opt([["herd", "In this herd"], ["bought", "Bought in"]]), "herd")}</div>
    <div data-bought hidden>${textField({ name: "onDate", label: "Date moved on", type: "date" })}${textField({ name: "fromText", label: "Moved from (name, address)", placeholder: "Mart or farm" })}${textField({ name: "lot", label: "Market lot no.", optional: true })}</div>
    ${selectField({ name: "bvd", label: "BVD", value: "", options: BVD_OPTS })}
  </div><div data-err></div></form>`);
  const missing = (v) => tagProblem(snap, v.tag) || (!v.sex ? "Choose the sex to save" : !v.dob ? "Add date of birth to save" : v.origin === "bought" && !v.onDate ? "Add the date moved on" : null);
  const { form } = entrySheet({
    title: "Add an animal", body, label: "Save animal", missing,
    save(v, sh) {
      const bought = v.origin === "bought";
      const id = addAnimal(snap.lid, { tag: v.tag, mgmtNo: v.mgmtNo || null, name: v.name || null, sex: v.sex, dob: v.dob, breed: v.breed, colour: v.colour, damTag: v.damTag || "", groupId: v.groupId || null,
        bornInHerd: !bought, onDate: bought ? v.onDate : null, fromText: bought ? v.fromText : "", lot: bought ? v.lot : "", bvd: { status: v.bvd || "" }, ...(v.sex === "Cow" ? { classOverride: null } : {}) });
      sh.close(true, { force: true }); toast("Animal added", { action: "Undo", onAction: () => softDelete(snap.lid, "animals", id) });
    },
  });
  form.onChange((n) => { if (n === "origin") body.querySelector("[data-bought]").hidden = form.values().origin !== "bought"; });
}

/** Import a herd list: photo (OCR) or paste; check the rows; save the new ones. */
export async function importHerdSheet(snap) {
  const text = await readTextSheet({ title: "Import a herd list", hint: "Take a photo of your NIFAIS herd list or a mart docket, or paste the text (or a CSV). We'll read the tags and you check them." });
  if (!text) return;
  const rows = parseHerdList(text).map((r) => ({ ...r, tag: parseTag(r.tag)?.formatted || r.tag, have: !!snap.ix.byTag.get(normTag(parseTag(r.tag)?.formatted || r.tag)) }));
  if (!rows.length) { toast("No tags found. Check the photo or type them in one at a time."); return; }
  const fresh = rows.filter((r) => !r.have);
  const body = el(html`<div data-sector="beef"><p class="hint" style="margin-top:0">${rows.length} found · ${fresh.length} new${rows.length - fresh.length ? ` · ${rows.length - fresh.length} already in your herd` : ""}. Untick any that are wrong.</p>
    <div class="form-group">${rows.map((r, i) => checkRow(`r${i}`, `${r.tag}`, !r.have, `${r.sex || "?"} · ${breedName(r.breed) || "breed?"} · born ${r.dob ? shortDate(r.dob) : "?"}${r.have ? " · already in herd" : ""}${parseTag(r.tag) && !parseTag(r.tag).valid ? " · check digit looks wrong" : ""}`))}</div></div>`);
  const btn = el(html`<button type="button" class="btn">Add ${fresh.length} cattle</button>`);
  const sh = openSheet({ title: "Check the cattle", body, footer: btn });
  const count = () => rows.filter((r, i) => body.querySelector(`[data-check=r${i}]`).getAttribute("aria-checked") === "true").length;
  body.addEventListener("click", () => setTimeout(() => { const n = count(); btn.textContent = n ? `Add ${n} cattle` : "Tick at least one"; btn.disabled = !n; }, 0));
  btn.onclick = () => {
    const pick = rows.filter((r, i) => body.querySelector(`[data-check=r${i}]`).getAttribute("aria-checked") === "true" && !r.have);
    pick.forEach((r) => addAnimal(snap.lid, { tag: r.tag, dob: r.dob, sex: r.sex, breed: breedCode(r.breed) || r.breed, colour: "", bornInHerd: null, bvd: { status: "" }, importedOn: todayStr() }));
    sh.close(true, { force: true }); toast(`${pick.length} cattle added. Add colour and dam or moved-on details for the register.`);
  };
}

/** Edit identity. The tag itself changes only through Replace a tag (keeps the old number). */
export function editIdentitySheet(snap, a) {
  const groups = [...snap.ix.groups.values()];
  const body = el(html`<form novalidate data-sector="beef">
    <div class="card pad" style="margin-bottom:12px"><b>${a.tag}</b><p class="hint" style="margin:4px 0 0">To change the tag number use “Replace a tag” — the register must keep the old number.</p><button type="button" class="text-btn" data-retag>Replace a tag</button></div>
    <div class="form-group">
    ${textField({ name: "mgmtNo", label: "Herd / management no.", value: a.mgmtNo || "", optional: true })}
    ${textField({ name: "name", label: "Name", value: a.name || "", optional: true })}
    ${textField({ name: "eid", label: "EID", value: a.eid || "", optional: true })}
    ${selectField({ name: "sex", label: "Sex", value: a.sex || "", options: sexOpts })}
    ${textField({ name: "dob", label: "Born", type: "date", value: a.dob || "" })}
    ${selectField({ name: "breed", label: "Breed", value: breedCode(a.breed), options: breedOpts })}
    ${selectField({ name: "colour", label: "Colour", value: colourCode(a.colour), options: colourOpts })}
    ${textField({ name: "damTag", label: "Dam's tag", value: a.damTag || "", optional: true })}
    ${textField({ name: "sireText", label: "Sire", value: a.sireText || "", optional: true })}
    ${groups.length ? selectField({ name: "groupId", label: "Group", value: a.groupId || "", options: [{ value: "", label: "None" }, ...groups.map((g) => ({ value: g.id, label: g.name }))] }) : ""}
    ${selectField({ name: "classOverride", label: "Treat as", value: a.classOverride || "", options: opt([["", "Work it out from age and sex"], ["cow", "Cow"], ["heifer", "Replacement heifer"], ["store", "Store"], ["finisher", "Finisher"], ["bull", "Stock bull"], ["calf", "Calf"], ["weanling", "Weanling"]]) })}
    </div><p class="form-label">Moved on</p><div class="form-group">
    ${textField({ name: "onDate", label: "Date moved on", type: "date", value: a.onDate || "" })}
    ${textField({ name: "fromText", label: "Moved from", value: a.fromText || "", optional: true })}
    ${textField({ name: "lot", label: "Market lot no.", value: a.lot || "", optional: true })}
    ${textField({ name: "prevMoves", label: "Farm moves before", value: a.prevMoves || "", inputmode: "numeric", optional: true })}
    </div><div class="form-group" style="margin-top:12px">
    ${checkRow("replacement", "Keep as a replacement heifer", !!a.replacement)}${checkRow("temperament", "Handle with care (temperament)", !!a.temperament, "Shows a warning on every list.")}
    </div></form>`);
  const missing = (v) => (!v.sex ? "Choose the sex to save" : null);
  const { sheet } = entrySheet({
    title: "Edit identity", body, label: "Save changes", missing,
    save(v, sh) {
      updateAnimal(snap.lid, a, { mgmtNo: v.mgmtNo || null, name: v.name || null, eid: v.eid || null, sex: v.sex, dob: v.dob, breed: v.breed, colour: v.colour, damTag: v.damTag, sireText: v.sireText, groupId: v.groupId || null, classOverride: v.classOverride || null,
        onDate: v.onDate || null, fromText: v.fromText, lot: v.lot, prevMoves: +v.prevMoves || 0, replacement: !!v.replacement, temperament: !!v.temperament });
      sh.close(true, { force: true }); toast("Changes saved");
    },
  });
  body.querySelector("[data-retag]").onclick = () => { sheet.close(true, { force: true }); setTimeout(() => retagSheet(snap, a), 150); };
}

/** Replace a tag (design/10 §6.9): fitted now, or a job to fit within 28 days. */
export function retagSheet(snap, a) {
  const days = nifaisDays(snap.s).retag;
  const body = el(html`<form novalidate data-sector="beef"><p class="hint" style="margin-top:0">${a.tag}</p><div class="form-group">
    <div class="field"><span class="label">Lost</span><span style="flex:1"></span>${segmented("which", opt([["one", "One tag"], ["both", "Both tags"]]), "one")}</div>
    ${textField({ name: "date", label: "Noticed", type: "date", value: todayStr() })}
    <div class="field"><span class="label">Replacement</span><span style="flex:1"></span>${segmented("fitted", opt([["now", "Fitted now"], ["later", "Ordered"]]), "now")}</div>
    <div data-new hidden>${textField({ name: "newTag", label: "New tag number", placeholder: "Only if the number changed", optional: true })}</div>
  </div><p class="hint" data-h></p></form>`);
  const { form } = entrySheet({
    title: "Replace a tag", body, label: "Save", missing: (v) => (v.newTag && parseTag(v.newTag) && !parseTag(v.newTag).valid ? "Check the new tag's last digit" : null),
    save(v, sh) {
      recordRetag(snap.lid, a, { date: v.date, which: v.which, newTag: v.newTag, fitted: v.fitted === "now" });
      sh.close(true, { force: true }); toast(v.fitted === "now" ? "Replacement tag recorded in the register" : `Fit it by ${shortDate(addDays(v.date, days))} — it's on your Today list`);
    },
  });
  const paint = () => { const v = form.values(); body.querySelector("[data-new]").hidden = v.which !== "both"; body.querySelector("[data-h]").textContent = v.which === "both" ? "Both lost: if DAERA issues a new number the animal gets an IDQ flag. Order replacements now." : `Same number from your tag supplier. Fit within ${days} days and before the animal moves.`; };
  form.onChange(paint); paint();
}

export function bvdSheet(snap, a) {
  const body = el(html`<form novalidate data-sector="beef"><div class="form-group">
    ${selectField({ name: "status", label: "Result", value: a.bvd?.status || "", options: BVD_OPTS })}
    ${textField({ name: "sampleDate", label: "Sample taken", type: "date", value: a.bvd?.sampleDate || "" })}
    ${textField({ name: "resultDate", label: "Result date", type: "date", value: a.bvd?.resultDate || todayStr() })}
  </div><div data-pos></div></form>`);
  const { form } = entrySheet({
    title: "BVD result", body, label: "Save result", missing: (v) => (!v.status ? "Choose the result to save" : null),
    save(v, sh) {
      updateAnimal(snap.lid, a, { bvd: { status: v.status, sampleDate: v.sampleDate || null, resultDate: v.resultDate || null }, reg: a.reg ? { ...a.reg, bvdSample: a.reg.bvdSample || v.sampleDate || v.resultDate } : a.reg });
      sh.close(true, { force: true }); toast(v.status === "BVDP" ? "Positive recorded. Isolate now — the herd is restricted." : "BVD result saved");
    },
  });
  form.onChange(() => { const p = form.values().status === "BVDP"; body.querySelector("[data-pos]").replaceChildren(p ? el(fieldError("Isolate this animal now. Your herd is restricted from today; remove the animal within 28 days.")) : document.createTextNode("")); });
}

/** Detail sections on the card. */
export function sectionSheet(snap, a, sec) {
  const canEdit = canWrite(snap.role, "animals");
  if (sec === "identity") {
    const body = el(html`<div>${kvRows([["Tag", a.tag], a.eid && ["EID", a.eid], a.mgmtNo && ["Management no.", a.mgmtNo], ["Breed", breedName(a.breed) || "—"], ["Colour", colourName(a.colour) || "—"], ["Sex", a.sex || "—"], ["Born", a.dob ? shortDate(a.dob) : "—"],
      ["Dam", a.damTag || "—"], ["Sire", a.sireText || "—"], ["Origin", a.bornInHerd ? "Born in this herd" : a.onDate ? `Bought ${shortDate(a.onDate)}${a.fromText ? ` from ${a.fromText}` : ""}` : "—"],
      ...(a.replacementTags || []).map((r) => ["Replacement tag", `${r.tag} · ${shortDate(r.date)}`])])}
      ${canEdit ? html`<button type="button" class="btn secondary" data-edit style="margin-top:16px">Edit identity</button>` : ""}</div>`);
    const sh = openSheet({ title: "Identity", body, cancelText: "Done" });
    body.querySelector("[data-edit]")?.addEventListener("click", () => { sh.close(true, { force: true }); setTimeout(() => editIdentitySheet(snap, a), 150); });
    return;
  }
  if (sec === "nifais") {
    const flags = ["NNO", "IDQ", "DOBQ", "BT21", "BVD"];
    const body = el(html`<form novalidate>${kvRows([a.reg && ["Birth notified", a.reg.nifais ? shortDate(a.reg.nifais) : "Not yet"], a.onDate && ["Moved on", shortDate(a.onDate)], a.offDate && ["Moved off / died", `${shortDate(a.offDate)} · ${a.offTo || ""}`]])}
      <p class="form-label">Status flags on NIFAIS</p>${chipGroup("flags", flags.map((f) => ({ value: f, label: f })), (a.flags || []).filter((f) => flags.includes(f)))}
      <p class="hint">NNO = birth notified late; IDQ = identity query; DOBQ = date of birth query; BT21 = born to a dam in a TB-restricted herd; BVD = BVD restriction.</p></form>`);
    if (!canEdit) { openSheet({ title: "NIFAIS", body, cancelText: "Done" }); return; }
    entrySheet({ title: "NIFAIS", body, label: "Save flags", missing: () => null, save(v, sh) { updateAnimal(snap.lid, a, { flags: [...new Set([...(a.flags || []).filter((f) => !flags.includes(f)), ...(v.flags || [])])] }); sh.close(true, { force: true }); toast("Flags saved"); } });
    return;
  }
  if (sec === "health") {
    const meds = snap.data.medicines.filter((m) => !m.notUsed && ((m.animalIds || []).includes(a.id) || (m.animalTags || []).some((t) => normTag(t) === normTag(a.tag)))).sort((x, y) => y.date.localeCompare(x.date));
    const body = el(html`<div>${kvRows([["BVD", a.bvd?.status ? `${bvdWord(a.bvd.status)}${a.bvd.resultDate ? ` · ${shortDate(a.bvd.resultDate)}` : ""}` : "No result"], ["TB", a.tb?.lastTest ? `${a.tb.status || "Clear"} · ${shortDate(a.tb.lastTest)}` : "See Paperwork → TB"]])}
      <p class="form-label">Treatments (${meds.length})</p>${kvRows(meds.slice(0, 30).map((m) => [`${shortDate(m.date)} · ${m.productName}`, m.withdrawalEndDateMeat ? `wd ${shortDate(m.withdrawalEndDateMeat)}` : m.reason || ""]))}
      ${canEdit ? html`<button type="button" class="btn secondary" data-bvd style="margin-top:16px">Record a BVD result</button>` : ""}</div>`);
    const sh = openSheet({ title: "Health", body, cancelText: "Done" });
    body.querySelector("[data-bvd]")?.addEventListener("click", () => { sh.close(true, { force: true }); setTimeout(() => bvdSheet(snap, a), 150); });
    return;
  }
  if (sec === "pedigree") return import("./pedigree.js").then((m) => m.pedigreeSheet(snap, a));
  if (sec === "notes") {
    const body = el(html`<form novalidate><div class="form-group"><div class="field stacked"><label for="an-notes">Notes</label><textarea id="an-notes" name="notes" rows="6">${a.notes || ""}</textarea></div></div></form>`);
    if (!canEdit) body.querySelector("textarea").disabled = true;
    entrySheet({ title: "Notes", body, label: "Save notes", missing: () => (canEdit ? null : "View only"), save(v, sh) { updateAnimal(snap.lid, a, { notes: v.notes }); sh.close(true, { force: true }); toast("Notes saved"); } });
  }
}
