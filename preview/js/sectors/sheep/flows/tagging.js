// Tagging lambs (design/11 §6.10): pick a mob of lambs, tag type, tag range or scan, date.
// Writes the register birth lines (count and numbers) and clears the tag-by countdown.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { toast } from "../../../ui/toast.js";
import { textField, chipGroup } from "../../../ui/form.js";
import { todayStr } from "../../../core/dates.js";
import { entrySheet, mobPickRow, chipsField, opt, bigStepper, short } from "../ui.js";
import { cropTagging } from "../model/paperwork.js";
import { regionRule } from "../model/region.js";
import * as A from "../actions.js";

export function tagSheet(snap) {
  const tg = cropTagging(snap.data, snap.cy, snap.s);
  const slaughter = regionRule("sheepTagging")?.slaughterTag;
  const body = el(html`<form novalidate><p class="t-callout ink-2" style="margin:0 4px 8px">${tg.untagged ? `${tg.untagged} lambs from the ${tg.crop} crop still to tag${tg.tagBy ? ` · tag by ${short(tg.tagBy)}` : ""}.` : "No lambs are waiting for tags. Record any tags you put in here."}</p>
    <div class="form-group" data-mob></div><p class="form-label">How many tagged</p><div data-st></div>
    ${chipsField("Tag type", chipGroup("tagType", opt(slaughter ? [["eid", "EID set"], ["slaughter", "Single slaughter tag"]] : [["eid", "EID set (2 tags)"], ["short", "Short-term set"]]), "eid", { multi: false }))}
    <div class="form-group">${textField({ name: "tagFrom", label: "First tag number", placeholder: "XI 0654321 00101" })}${textField({ name: "tagTo", label: "Last tag number", optional: true })}${textField({ name: "date", label: "Date tagged", type: "date", value: todayStr() })}</div>
    <p class="hint">The flock register gets a "born and tagged" line for these lambs. Tags: XI for lambs born from 30 June 2025.</p></form>`);
  const st = bigStepper({ value: Math.min(tg.untagged, 50), label: "How many tagged", jumps: [10, 50] }); body.querySelector("[data-st]").append(st.node);
  const mp = mobPickRow(snap, { label: "Into mob", filter: (m) => ["lambs", "eweLambs", "ewesWithLambs"].includes(m.class) }); body.querySelector("[data-mob]").append(mp.node);
  const { refresh } = entrySheet({ title: "Tag lambs", body, label: "Save tagging", missing: (v) => (!mp.mob() ? "Choose the lamb mob" : !st.value() ? "Add how many" : !v.tagFrom ? "Add the first tag number" : null),
    save: (v, sh) => { A.tagLambs(snap.lid, tg.crop, tg.doc, { date: v.date, mobId: mp.mob().id, count: st.value(), tagFrom: v.tagFrom, tagTo: v.tagTo, tagType: v.tagType }); sh.close(true, { force: true }); toast(`${st.value()} lambs tagged and in the register`); } });
  st.onChange(refresh);
}
