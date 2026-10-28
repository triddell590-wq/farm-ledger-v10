// Record a calving (design/10 §6.1): dam, date, ease; one group per calf (+ Twin); tagged and
// sampled now? Creates the calf, the calving, the register line and the births-to-register card.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { textField, selectField, chipGroup, segmented, checkRow, fieldError } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { confirmSheet } from "../../../ui/sheet.js";
import { todayStr } from "../../../core/dates.js";
import { cattleRow, entrySheet, nowHM, opt } from "./common.js";
import { recordCalving, softDelete } from "../actions.js";
import { parseTag, normTag, DAERA_BREEDS, DAERA_COLOURS, breedCode, nextTag, isFemale } from "../model/tags.js";
import { onFarm, classOf } from "../model/animals.js";
import { breedingSince, lastCalving } from "../model/breeding.js";
import { animalLabel } from "../ui.js";

export default function calvingSheet(snap, { damId } = {}) {
  const females = (a) => onFarm(a) && isFemale(a) && ["cow", "heifer"].includes(classOf(snap.ix, a, snap.today));
  let calves = 1;
  const dam = cattleRow(snap, { label: "Cow", multi: false, filter: females, ids: damId ? [damId] : [], title: "Which cow calved?", onChange: () => { fillSire(); refresh(); } });
  const lastBreed = snap.data.animals.filter((a) => a.bornInHerd && a.breed).sort((a, b) => String(b.dob).localeCompare(String(a.dob)))[0]?.breed || "CH";
  const breedOpts = [{ value: "", label: "Choose" }, ...DAERA_BREEDS.map(([c, n]) => ({ value: c, label: `${n} (${c})` }))];
  const colourOpts = [{ value: "", label: "Choose" }, ...DAERA_COLOURS.map(([c, n]) => ({ value: c, label: n }))];
  const calfGroup = (i) => {
    const tagGuess = i === 0 ? snap.s.nextTag || "" : snap.s.nextTag ? nextTag(snap.s.nextTag) : "";
    return html`<div class="calf-group" data-calf="${i}"><p class="form-label"><span>Calf${i ? " " + (i + 1) : ""}</span>${i ? html`<button type="button" class="text-btn" data-rm-calf>Remove</button>` : ""}</p>
    <div class="form-group">
      <div class="field"><span class="label">Born</span><span style="flex:1"></span>${segmented(`alive${i}`, opt([["yes", "Alive"], ["no", "Stillborn"]]), "yes")}</div>
      <div class="field chips-field"><span class="label">Sex</span>${chipGroup(`sex${i}`, opt([["Bull"], ["Heifer"]]), [], { multi: false })}</div>
      ${textField({ name: `tag${i}`, label: "Tag number", value: tagGuess, placeholder: "UK 9 123456 7001 2", autocomplete: "off" })}
      <div data-tagerr="${i}"></div>
      ${selectField({ name: `breed${i}`, label: "Breed", value: breedCode(lastBreed), options: breedOpts })}
      ${selectField({ name: `colour${i}`, label: "Colour", value: "", options: colourOpts })}
      ${textField({ name: `sire${i}`, label: "Sire", placeholder: "Bull's name or AI code", optional: true })}
      ${textField({ name: `kg${i}`, label: "Birth weight (kg)", inputmode: "decimal", optional: true })}
      <div class="field chips-field"><span class="label">Colostrum</span>${chipGroup(`col${i}`, opt([["2h", "Within 2 h"], ["6h", "2–6 h"], ["none", "Not seen"]]), [], { multi: false })}</div>
    </div>
    <p class="hint" data-still="${i}" hidden>Stillborn calves still need a BVD tag and sample.</p></div>`;
  };
  const body = el(html`<form novalidate data-sector="beef">
    <p class="form-label">Dam</p>
    <div class="form-group" data-dam>
      ${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}
      ${textField({ name: "time", label: "Time", type: "time", value: nowHM() })}
      <div class="field chips-field ease-chips"><span class="label">Calving ease</span>${chipGroup("ease", opt([["1", "1 Easy"], ["2", "2 Help"], ["3", "3 Hard"], ["4", "4 Vet"], ["5", "5 Caesar"]]), ["1"], { multi: false })}</div>
    </div>
    <div data-calves>${calfGroup(0)}</div>
    <button type="button" class="btn secondary" data-twin style="margin-top:12px">${raw(icon("plus"))}Add a twin</button>
    <p class="form-label">Tagged and sampled now?</p>
    <div class="form-group">${checkRow("tagged", "Tagged today (both tags, BVD tag)", false)}${checkRow("bvd", "BVD sample posted", false)}</div>
  </form>`);
  body.querySelector("[data-dam]").prepend(dam.node);
  const fillSire = () => {
    const d = snap.ix.byId.get(dam.ids()[0]); if (!d) return;
    const { svc } = breedingSince(snap.data, d, lastCalving(snap.ix, d)?.date);
    const s = svc[svc.length - 1];
    body.querySelectorAll("[name^=sire]").forEach((i) => { if (!i.value && s && s.sireText) i.value = s.sireText; });
    if (s && s.sireBreed) body.querySelectorAll("[name^=breed]").forEach((i) => { i.value = breedCode(s.sireBreed); });
  };
  fillSire();
  const tagIssue = (v, i, values) => {
    const t = v[`tag${i}`]; if (!t) return null;
    const p = parseTag(t);
    if (!p) return "That doesn't look like a full tag — UK 9 or XI, then the herd and animal numbers";
    if (p.check == null) return "Add the last (check) digit";
    if (!p.valid) return "That tag's check digit doesn't match — check the last number";
    const dup = snap.ix.byTag.get(normTag(p.formatted));
    if (dup) return `${p.formatted} is already in your herd (${animalLabel(dup)}). Use a different tag.`;
    for (let j = 0; j < i; j++) if (values[`tag${j}`] && normTag(parseTag(values[`tag${j}`])?.formatted) === normTag(p.formatted)) return "Both calves have the same tag";
    return null;
  };
  const missing = (v) => {
    if (!dam.ids().length) return "Choose the cow to save";
    for (let i = 0; i < calves; i++) {
      if (!v[`sex${i}`]) return `Choose calf${calves > 1 ? " " + (i + 1) : ""}'s sex to save`;
      if (tagIssue(v, i, v)) return "Check the tag number";
    }
    return null;
  };
  const paintErrors = (v) => { for (let i = 0; i < calves; i++) { const box = body.querySelector(`[data-tagerr="${i}"]`); const m = tagIssue(v, i, v); box.replaceChildren(m ? el(fieldError(m)) : document.createTextNode("")); const st = body.querySelector(`[data-still="${i}"]`); if (st) st.hidden = v[`alive${i}`] !== "no"; } };
  const { form, refresh } = entrySheet({
    title: "Record a calving", body, label: "Save calving", missing,
    dirty: () => !!dam.ids().length,
    async save(v, sh) {
      const list = []; for (let i = 0; i < calves; i++) list.push({ alive: v[`alive${i}`] !== "no", sex: v[`sex${i}`], tag: v[`tag${i}`], breed: v[`breed${i}`], colour: v[`colour${i}`], sireText: v[`sire${i}`], birthKg: v[`kg${i}`], colostrum: v[`col${i}`], tagged: v.tagged, bvdSample: v.bvd });
      const r = recordCalving(snap.lid, snap, { damId: dam.ids()[0], date: v.date, time: v.time, ease: +v.ease || 1, sireText: v.sire0 || "", calves: list });
      sh.close(true, { force: true });
      toast("Calving saved", { action: "Undo", onAction: () => { softDelete(snap.lid, "calvings", r.calvingId); r.calfIds.forEach((id) => softDelete(snap.lid, "animals", id)); toast("Calving removed"); } });
      if (snap.s.navelPrompt && list.some((c) => c.alive)) setTimeout(async () => { if (await confirmSheet({ title: "Treat the calf?", body: "Navel spray now, while you're there.", confirm: "Navel spray", cancel: "Not now" })) (await import("./treatment.js")).default(snap, { animalIds: r.calfIds, reason: "Navel" }); }, 400);
    },
  });
  form.onChange(() => paintErrors(form.values()));
  body.querySelector("[data-twin]").onclick = () => { if (calves >= 3) return; const g = el(calfGroup(calves)); body.querySelector("[data-calves]").append(g); calves++; g.querySelector("[data-seg] [aria-checked=true]")?.click(); fillSire(); wireNew(); refresh(); if (calves >= 3) body.querySelector("[data-twin]").hidden = true; };
  const wireNew = () => body.querySelectorAll("[data-rm-calf]").forEach((b) => (b.onclick = () => { const all = body.querySelectorAll(".calf-group"); all[all.length - 1].remove(); calves--; body.querySelector("[data-twin]").hidden = false; refresh(); }));
  paintErrors(form.values());
}
