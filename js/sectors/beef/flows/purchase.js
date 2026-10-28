// Purchase — cattle arriving (design/10 §6.5). Read a mart docket (photo on the phone, or paste
// the text) or type each animal. Saves the animals (moved on, from, lot), the purchase, a
// movement on (NIFAIS job), the money out, and starts the 28-day isolation checklist.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { textField, selectField, checkRow, stepperField } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { openSheet } from "../../../ui/sheet.js";
import { todayStr } from "../../../core/dates.js";
import { canRead } from "../../../core/policy.js";
import { entrySheet, opt } from "./common.js";
import { recordPurchase } from "../actions.js";
import { parseDocket } from "../model/docket.js";
import { parseTag, normTag, DAERA_BREEDS, breedCode } from "../model/tags.js";
import { moneyText } from "../../../ui/format.js";
import { readTextSheet } from "./read-text.js";
import { photoStrip } from "../../../ui/photo-strip.js";

export default function purchaseSheet(snap) {
  const money = canRead(snap.role, "finance");
  let rows = [{}];
  const body = el(html`<form novalidate data-sector="beef">
    <button type="button" class="btn secondary" data-read>${raw(icon("camera"))}Read a mart docket</button>
    <div class="form-group" style="margin-top:12px">
      ${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}
      ${textField({ name: "fromName", label: "Bought from", placeholder: "Mart or farm" })}
      ${textField({ name: "fromAddress", label: "Address", optional: true })}
      ${textField({ name: "herdNo", label: "Their herd no.", inputmode: "numeric", optional: true })}
      ${textField({ name: "statementNo", label: "Statement no.", optional: true })}
      ${stepperField("prevMoves", "Farm moves before this", 0, { min: 0, max: 9 })}
    </div><p class="hint due-ink" data-moves-warn hidden></p>
    <p class="form-label"><span>Cattle</span><button type="button" class="text-btn" data-add>+ Add another</button></p>
    <div data-rows></div>
    ${money ? html`<div class="form-group" style="margin-top:12px">${textField({ name: "total", label: "Total paid (£)", inputmode: "decimal", optional: true, placeholder: "sum of prices" })}</div>
      <p class="hint"><a href="#/l/${snap.lid}/tools/max-bid">Work out max bid ›</a></p>` : ""}
    <div class="form-group" style="margin-top:12px">${checkRow("notified", "Move notified on NIFAIS already", false, "Marts usually notify for you. Otherwise you have 7 days.")}</div>
    <p class="hint">Keeps them apart for 28 days, dose on arrival and BVD test within 30 days if untested — these go on your Today list.</p>
  </form>`);
  const breedOpts = [{ value: "", label: "Breed" }, ...DAERA_BREEDS.map(([c, n]) => ({ value: c, label: n }))];
  const paintRows = () => {
    body.querySelector("[data-rows]").replaceChildren(el(html`<div>${rows.map((r, i) => html`<div class="form-group" data-row="${i}" style="margin-top:${i ? 12 : 0}px">
      ${textField({ name: `tag${i}`, label: `Tag${rows.length > 1 ? " " + (i + 1) : ""}`, value: r.tag || "", placeholder: "UK 9 123456 7001 2" })}
      ${textField({ name: `dob${i}`, label: "Born", type: "date", value: r.dob || "" })}
      ${selectField({ name: `sex${i}`, label: "Sex", value: r.sex || "", options: opt([["", "Choose"], ["Steer"], ["Heifer"], ["Bull"], ["Cow"]]) })}
      ${selectField({ name: `breed${i}`, label: "Breed", value: breedCode(r.breed) || "", options: breedOpts })}
      ${textField({ name: `kg${i}`, label: "Weight (kg)", value: r.weight || "", inputmode: "decimal", optional: true })}
      ${money ? textField({ name: `price${i}`, label: "Price (£)", value: r.price || "", inputmode: "decimal", optional: true }) : ""}
      ${selectField({ name: `bvd${i}`, label: "BVD", value: r.bvd || "", options: opt([["", "Not known (untested)"], ["BVDN", "Negative"], ["INDNEG", "Indirect negative"]]) })}
      ${r.checkMismatch || r.dobFlag ? html`<p class="hint late-ink" style="padding:0 16px 8px">${r.checkMismatch ? "Check digit looked wrong on the docket — check the tag. " : ""}${r.dobFlag || ""}</p>` : ""}
    </div>`)}</div>`));
  };
  const read = () => {
    const v = F.values(); return rows.map((_, i) => ({ tag: v[`tag${i}`], dob: v[`dob${i}`], sex: v[`sex${i}`], breed: v[`breed${i}`], kg: v[`kg${i}`], price: v[`price${i}`], bvd: v[`bvd${i}`], lot: rows[i].lot || "" }));
  };
  const missing = (v) => {
    // processor spec (design/10 §6.5): "4th move — out of spec" once this move reaches the limit
    const w = body.querySelector("[data-moves-warn]"); const nth = (+v.prevMoves || 0) + 1;
    if (w) { w.hidden = nth < snap.s.processor.maxMoves; w.textContent = `${nth}${nth === 1 ? "st" : nth === 2 ? "nd" : nth === 3 ? "rd" : "th"} move — out of spec for ${snap.s.processor.name} (max ${snap.s.processor.maxMoves} farm moves).`; }
    if (!v.fromName) return "Add who you bought from to save";
    const list = read(); if (!list.some((x) => x.tag)) return "Add at least one tag to save";
    for (const x of list) { if (!x.tag) continue; const p = parseTag(x.tag); if (p && p.check != null && !p.valid) return `Check the tag ${x.tag}`; if (snap.ix.byTag.get(normTag(p?.formatted || x.tag))) return `${x.tag} is already in your herd`; if (!x.sex) return "Choose each animal's sex"; }
    return null;
  };
  let F = null;
  // Docket photos are kept on the purchase (the movement paperwork an inspector or vet asks for).
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "purchases", label: "Purchase" }, title: "Docket photos", hint: "Mart docket, passports" });
  body.appendChild(strip.node);
  const { form, refresh } = entrySheet({
    title: "Purchase", body, label: "Save purchase", missing,
    async save(v, sh) {
      const list = read().filter((x) => x.tag);
      const r = recordPurchase(snap.lid, snap, { date: v.date, fromName: v.fromName, fromAddress: v.fromAddress, herdNo: v.herdNo, statementNo: v.statementNo, animals: list, prevMoves: v.prevMoves, notified: v.notified, total: v.total || null });
      strip.commit(r.purchaseId, `Purchase · ${v.fromName}`);
      sh.close(true, { force: true });
      toast(`${list.length} cattle added${money && (v.total || list.some((x) => x.price)) ? ` · ${moneyText(v.total || list.reduce((s, x) => s + (+x.price || 0), 0))}` : ""}`);
      return r;
    },
  });
  F = form;
  paintRows();
  body.querySelector("[data-add]").onclick = () => { const cur = read(); rows = cur.map((x, i) => ({ ...rows[i], ...x, weight: x.kg })); rows.push({}); paintRows(); refresh(); };
  body.querySelector("[data-read]").onclick = async () => {
    const text = await readTextSheet({ title: "Read a mart docket", hint: "Take a photo of the docket, or paste its text. We'll read the tags and you check them.", onPhoto: (f) => strip.addFiles([f]) });
    if (!text) return;
    const d = parseDocket(text);
    if (!d.animals.length) { toast("No tags found on that docket. Type them in instead."); return; }
    const set = (n, val) => { const i = body.querySelector(`[name=${n}]`); if (i && val) i.value = val; };
    if (d.date) set("date", d.date); if (d.mart) { set("fromName", d.mart.name); set("fromAddress", d.mart.address); } set("herdNo", d.herdNo); set("statementNo", d.statementNo); if (money) set("total", d.total);
    rows = d.animals; paintRows(); refresh();
    toast(`${d.animals.length} cattle read from the docket — check them before saving`);
  };
}
