// Breeding records (design/10 §5): bull in/out or AI, scan results, seen bulling.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField, selectField, segmented, stepperField } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr, addDays, shortDate } from "../../../core/dates.js";
import { cattleRow, entrySheet, opt } from "./common.js";
import { recordService, recordScan, recordHeat, softDelete } from "../actions.js";
import { updateRecord } from "../../../services/records.js";
import { onFarm, classOf } from "../model/animals.js";
import { isFemale, DAERA_BREEDS } from "../model/tags.js";
import { gestationDays } from "../model/rules.js";

const breedOpts = [{ value: "", label: "Not sure" }, ...DAERA_BREEDS.map(([c, n]) => ({ value: c, label: n }))];
const females = (snap) => (a) => onFarm(a) && isFemale(a) && ["cow", "heifer"].includes(classOf(snap.ix, a, snap.today));

/** Bull in / out, or AI. An open bull period can be closed (bull out). */
export function serviceSheet(snap, { femaleIds = [] } = {}) {
  const bulls = snap.data.animals.filter((a) => onFarm(a) && classOf(snap.ix, a, snap.today) === "bull");
  const open = snap.data.services.filter((s) => s.kind !== "AI" && s.bullIn && !s.bullOut);
  const body = el(html`<form novalidate data-sector="beef">
    ${segmented("kind", opt([["natural", "Bull in"], ["AI", "AI"], ...(open.length ? [["out", "Bull out"]] : [])]), "natural")}
    <div class="form-group" style="margin-top:12px" data-main>
      ${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}
      ${bulls.length ? selectField({ name: "bullId", label: "Bull", value: bulls[0].id, options: [...bulls.map((b) => ({ value: b.id, label: [b.name, b.mgmtNo].filter(Boolean).join(" ") || b.tag })), { value: "", label: "Hired / other bull" }] }) : ""}
      ${textField({ name: "sireText", label: "Sire name or AI code", optional: true })}
      ${selectField({ name: "sireBreed", label: "Sire breed", value: "CH", options: breedOpts })}
      <div data-ai hidden>${textField({ name: "technician", label: "AI technician", optional: true })}</div>
      <div data-nat>${stepperField("weeks", "Bull in for (weeks)", 9, { min: 1, max: 26 })}</div>
    </div>
    <div class="form-group" data-out hidden style="margin-top:12px">
      ${selectField({ name: "periodId", label: "Bull period", value: open[0]?.id || "", options: open.map((s) => ({ value: s.id, label: `${s.sireText || "Bull"} in ${shortDate(s.bullIn)} · ${(s.femaleIds || []).length} cows` })) })}
      ${textField({ name: "outDate", label: "Bull out", type: "date", value: todayStr() })}
    </div>
    <p class="hint" data-h></p></form>`);
  const who = cattleRow(snap, { label: "Cows and heifers", ids: femaleIds, filter: females(snap), onChange: () => refresh() });
  body.querySelector("[data-main]").prepend(who.node);
  const missing = (v) => v.kind === "out" ? (!v.periodId ? "Choose the bull period" : null) : !who.ids().length ? "Choose the cows to save" : null;
  const { form, refresh } = entrySheet({
    title: "Bull in or AI", body, label: "Save", missing, dirty: () => !!who.ids().length,
    save(v, sh) {
      if (v.kind === "out") { const p = open.find((s) => s.id === v.periodId); updateRecord(snap.lid, "services", p, { bullOut: v.outDate }); sh.close(true, { force: true }); toast(`Bull out ${shortDate(v.outDate)} · scan from ${shortDate(addDays(v.outDate, 30))}`); return; }
      const bull = bulls.find((b) => b.id === v.bullId);
      const sireText = v.sireText || (bull ? [bull.name, bull.mgmtNo].filter(Boolean).join(" ") || bull.tag : "");
      const rec = v.kind === "AI" ? { kind: "AI", date: v.date, femaleIds: who.ids(), sireText, sireBreed: v.sireBreed, sireId: bull?.id || null, technician: v.technician } : { kind: "natural", bullIn: v.date, plannedOut: addDays(v.date, (+v.weeks || 9) * 7), femaleIds: who.ids(), sireText, sireBreed: v.sireBreed || bull?.breed || "", sireId: bull?.id || null };
      const id = recordService(snap.lid, rec);
      sh.close(true, { force: true });
      toast(v.kind === "AI" ? `${who.ids().length} served · due about ${shortDate(addDays(v.date, gestationDays(snap.s, v.sireBreed)))}` : `Bull in with ${who.ids().length}`, { action: "Undo", onAction: () => softDelete(snap.lid, "services", id) });
    },
  });
  const paint = () => {
    const v = form.values(); const out = v.kind === "out";
    body.querySelector("[data-main]").hidden = out; body.querySelector("[data-out]").hidden = !out;
    body.querySelector("[data-ai]").hidden = v.kind !== "AI"; body.querySelector("[data-nat]").hidden = v.kind !== "natural";
    body.querySelector("[data-h]").textContent = v.kind === "AI" ? "Watch for repeats 18–24 days after service." : v.kind === "natural" ? "Due dates show as a window until a scan narrows it." : "";
  };
  form.onChange(() => { paint(); refresh(); }); paint();
}

/** Scan result: in calf (with foetal age or due date) / twins / empty. */
export function scanSheet(snap, { femaleId } = {}) {
  const body = el(html`<form novalidate data-sector="beef"><div class="form-group" data-main>
    ${textField({ name: "date", label: "Scanned", type: "date", value: todayStr() })}
    <div class="field"><span class="label">Result</span><span style="flex:1"></span>${segmented("result", opt([["inCalf", "In calf"], ["twins", "Twins"], ["empty", "Empty"]]), "inCalf")}</div>
    <div data-age>${textField({ name: "foetalAgeDays", label: "Foetal age (days)", inputmode: "numeric", optional: true })}${textField({ name: "dueDate", label: "Or due date", type: "date", optional: true })}</div>
    ${textField({ name: "scanner", label: "Scanned by", optional: true })}
  </div></form>`);
  const who = cattleRow(snap, { label: "Cow or heifer", multi: false, ids: femaleId ? [femaleId] : [], filter: females(snap), onChange: () => refresh() });
  body.querySelector("[data-main]").prepend(who.node);
  const { form, refresh } = entrySheet({
    title: "Scan result", body, label: "Save scan", missing: () => (!who.ids().length ? "Choose the cow to save" : null), dirty: () => !!who.ids().length,
    save(v, sh) {
      recordScan(snap.lid, { femaleId: who.ids()[0], date: v.date, result: v.result, foetalAgeDays: +v.foetalAgeDays || null, dueDate: v.dueDate || null, scanner: v.scanner });
      sh.close(true, { force: true }); toast(v.result === "empty" ? "Scanned empty — she's on the board's Empty list" : "Scan saved");
      if (!femaleId) setTimeout(() => scanSheet(snap), 400); // scanning day: straight on to the next cow
    },
  });
  form.onChange(() => { body.querySelector("[data-age]").hidden = form.values().result === "empty"; });
}

export function heatSheet(snap, { femaleId } = {}) {
  const body = el(html`<form novalidate data-sector="beef"><div class="form-group" data-main>${textField({ name: "date", label: "Seen bulling", type: "date", value: todayStr() })}</div><p class="hint">Next heat about ${shortDate(addDays(todayStr(), 21))}.</p></form>`);
  const who = cattleRow(snap, { label: "Cow or heifer", multi: false, ids: femaleId ? [femaleId] : [], filter: females(snap), onChange: () => refresh() });
  body.querySelector("[data-main]").prepend(who.node);
  const { refresh } = entrySheet({ title: "Seen bulling", body, label: "Save", missing: () => (!who.ids().length ? "Choose the cow to save" : null), save(v, sh) { recordHeat(snap.lid, { femaleId: who.ids()[0], date: v.date }); sh.close(true, { force: true }); toast("Heat recorded"); } });
}
