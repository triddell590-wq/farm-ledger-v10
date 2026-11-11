// Tally sheets (design/11 §5.2 raddle, §5.3 scanning, §6.3 lame count, §6.5 BCS): big counters,
// one-thumb buttons, no tag needed.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { vibrate } from "../../../ui/dom.js";
import { toast } from "../../../ui/toast.js";
import { openSheet } from "../../../ui/sheet.js";
import { textField, chipGroup, selectField, wireForm } from "../../../ui/form.js";
import { todayStr } from "../../../core/dates.js";
import { entrySheet, mobPickRow, bigStepper, colourChip, chipsField, opt, num } from "../ui.js";
import { raddleCycles } from "../model/year.js";
import { scanPct, barrenPct } from "../model/lambing.js";
import { feedingGroups, bcsSummary, BCS_SCORES } from "../model/feeding.js";
import { BCS_TARGETS } from "../model/settings.js";
import { lamePct } from "../model/health.js";
import * as A from "../actions.js";

const notRams = (m) => m.class !== "rams" && m.class !== "lambs";

export function raddleSheet(snap, { mob } = {}) {
  const rc = raddleCycles(snap.cy, snap.s, snap.today);
  const colour = (rc.current || rc.cycles[rc.cycles.length - 1] || { colour: "Red" }).colour;
  const body = el(html`<form novalidate><div class="form-group" data-mob></div>
    <p class="form-label">Colour now</p>${chipGroup("colour", rc.cycles.map((c) => ({ value: c.colour, label: c.colour })), colour, { multi: false })}
    <p class="t-title" style="margin:12px 4px 0" data-sw>${colourChip(colour, true)}</p>
    <p class="form-label">Newly marked since last check</p><div data-step></div>
    <div class="form-group">${textField({ name: "eid", label: "EID tags read", optional: true, placeholder: "Scan or type, one per line" })}${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}</div></form>`);
  const mp = mobPickRow(snap, { mob: mob || null, filter: notRams }); body.querySelector("[data-mob]").append(mp.node);
  const st = bigStepper({ label: "Newly marked" }); body.querySelector("[data-step]").append(st.node);
  const eids = (v) => String(v.eid || "").split(/[\s,]+/).filter(Boolean);
  const { refresh } = entrySheet({ title: "Raddle check", body, label: "Save raddle check",
    missing: (v) => (!mp.mob() ? "Choose the mob to save" : !(st.value() || eids(v).length) ? "Count the marked ewes to save" : null),
    save: (v, sh) => { const n = st.value() || eids(v).length; A.raddle(snap.lid, mp.mob(), v.colour, n, v.date, eids(v)); sh.close(true, { force: true }); toast(`Raddle check saved: ${n} marked ${v.colour.toLowerCase()}`); } });
  st.onChange(refresh);
  body.addEventListener("click", () => setTimeout(() => { const c = body.querySelector('[data-chips=colour] [aria-checked=true]')?.dataset.value; if (c) body.querySelector("[data-sw]").innerHTML = el(html`<span>${colourChip(c, true)}</span>`).innerHTML; }, 0));
}

export function scanSheet(snap, { mob } = {}) {
  const K = [["empty", "Empty"], ["single", "Single"], ["twin", "Twin"], ["triplet", "Triplet+"]];
  const c = { empty: 0, single: 0, twin: 0, triplet: 0 }; const hist = [];
  const body = el(html`<div><div class="form-group" data-mob></div>
    <div class="mini-head"><h3 data-of></h3><button type="button" class="text-btn" data-undo>Undo last</button></div>
    <div class="tally" data-tally>${K.map(([k, l]) => html`<button type="button" data-k="${k}"><b data-n="${k}">0</b>${l}</button>`)}</div>
    <p class="tally-sum" data-sum></p><p class="tally-sub" data-sub></p>
    <details class="card pad" style="margin-top:16px"><summary class="t-strong">Spray marks (optional)</summary><div class="form-group" style="margin-top:8px">${K.map(([k, l]) => selectField({ name: `mark_${k}`, label: l, value: "none", options: opt(["none", "blue", "red dot", "green", "blue + red dot"]) }))}</div></details>
    <div class="form-group" style="margin-top:12px">${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}</div></div>`);
  const mp = mobPickRow(snap, { mob: mob || null, filter: notRams, onChange: () => paint() }); body.querySelector("[data-mob]").append(mp.node);
  const f = wireForm(body);
  const btn = el(html`<button type="button" class="btn">Save and make feeding groups</button>`);
  const total = () => c.empty + c.single + c.twin + c.triplet;
  const paint = () => {
    for (const [k] of K) body.querySelector(`[data-n=${k}]`).textContent = c[k];
    const n = mp.mob() ? snap.counts.get(mp.mob().id) || 0 : 0; const t = total();
    body.querySelector("[data-of]").textContent = mp.mob() ? `Scanned ${t} of ${n}${t === n && n ? " ✓" : ""}` : `Scanned ${t}`;
    const lambs = c.single + 2 * c.twin + 3 * c.triplet;
    body.querySelector("[data-sum]").textContent = t ? `Scanning ${scanPct(lambs, t)}% · barren ${barrenPct(c.empty, t)}%` : "Tap a result as the scanner calls it";
    body.querySelector("[data-sub]").textContent = t ? `${lambs} lambs expected` : "";
    btn.disabled = !mp.mob() || !t; btn.textContent = !mp.mob() ? "Choose the mob to save" : !t ? "Tap results to save" : "Save and make feeding groups";
  };
  body.querySelector("[data-tally]").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; c[b.dataset.k]++; hist.push(b.dataset.k); vibrate(10); paint(); });
  body.querySelector("[data-undo]").onclick = () => { const k = hist.pop(); if (k) { c[k]--; paint(); } };
  const sh = openSheet({ title: "Scan results", body, footer: btn, isDirty: () => total() > 0, discardTitle: "Discard these scan results?" });
  btn.onclick = () => {
    const v = f.values(); const m = mp.mob(); const marks = {}; for (const [k] of K) if (v[`mark_${k}`] && v[`mark_${k}`] !== "none") marks[k] = v[`mark_${k}`];
    A.scan(snap.lid, m, { ...c }, { date: v.date, marks, cullEmpties: true });
    sh.close(true, { force: true }); toast(`Scan saved: ${scanPct(c.single + 2 * c.twin + 3 * c.triplet, total())}%`);
    setTimeout(() => groupsSheet(snap, m, c, v.date), 300);
  };
  paint();
}
/** After scanning: split the mob into feeding groups with names the farmer can change. */
function groupsSheet(snap, mob, c, date) {
  const groups = feedingGroups(c);
  if (groups.length < 2) return;
  const body = el(html`<form novalidate><p class="hint" style="margin:0 4px 12px">Each group becomes its own mob so you can feed by litter size. Empties are added to the cull list.</p>
    <div class="form-group">${groups.slice(1).map((g) => textField({ name: g.key, label: `${g.name} (${g.n})`, value: `${mob.name} – ${g.name.toLowerCase()}` }))}</div>
    <p class="hint">${groups[0].name} (${groups[0].n}) stay in ${mob.name}.</p></form>`);
  entrySheet({ title: "Make feeding groups", body, label: `Make ${groups.length - 1} new mob${groups.length > 2 ? "s" : ""}`, missing: () => null, dirty: () => false,
    save: (v, sh) => { for (const g of groups.slice(1)) { const id = A.createMob(snap.lid, { name: v[g.key] || g.name, cls: mob.class, breed: mob.breed, birthYears: mob.birthYears, fieldName: mob.fieldName, count: 0, date }); A.splitMob(snap.lid, mob, g.n, id, date, `scan: ${g.key}`); } sh.close(true, { force: true }); toast("Feeding groups made"); } });
}

export function bcsSheet(snap, { mob } = {}) {
  const st = ["tupping", "lambing", "weaning", "scanning"].includes(snap.stage.stage) ? snap.stage.stage : snap.stage.stage === "grazing" ? "weaning" : "tupping";
  const target = BCS_TARGETS[st][snap.s.flockType] || [3, 3.5];
  const c = Object.fromEntries(BCS_SCORES.map((x) => [x, 0])); const hist = [];
  const body = el(html`<div><div class="form-group" data-mob></div>
    <div class="mini-head"><h3>Tap each ewe's score · target ${target[0] === target[1] ? target[0] : target.join("–")} (${st})</h3><button type="button" class="text-btn" data-undo>Undo</button></div>
    <div class="tally seven" data-tally>${BCS_SCORES.map((s) => html`<button type="button" data-k="${s}"><b data-n="${s}">0</b>${s}</button>`)}</div>
    <div class="hist" data-hist aria-hidden="true"></div><div class="hist-x">${BCS_SCORES.map((s) => html`<span>${s}</span>`)}</div>
    <p class="tally-sum" data-sum></p><p class="tally-sub">Weeks to gain 1 BCS: about 6–8 on good grass.</p>
    <div class="form-group" style="margin-top:12px">${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}</div></div>`);
  const mp = mobPickRow(snap, { mob: mob || null, filter: (m) => m.class !== "lambs" }); body.querySelector("[data-mob]").append(mp.node);
  const f = wireForm(body); const btn = el(html`<button type="button" class="btn">Save BCS</button>`);
  const paint = () => {
    const sm = bcsSummary(c, target); const max = Math.max(1, ...Object.values(c));
    for (const s of BCS_SCORES) body.querySelector(`[data-n="${s}"]`).textContent = c[s];
    body.querySelector("[data-hist]").innerHTML = BCS_SCORES.map((s) => `<i class="${s >= target[0] && s <= target[1] ? "on" : ""}" style="height:${(c[s] / max) * 100}%"></i>`).join("");
    body.querySelector("[data-sum]").textContent = sm.n ? `${sm.onPct}% on target · ${sm.thin} thin · average ${sm.avg}` : "No ewes scored yet";
    btn.disabled = !mp.mob() || !sm.n; btn.textContent = !mp.mob() ? "Choose the mob to save" : !sm.n ? "Score some ewes to save" : `Save BCS for ${sm.n}`;
  };
  body.querySelector("[data-tally]").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; c[b.dataset.k]++; hist.push(b.dataset.k); vibrate(10); paint(); });
  body.querySelector("[data-undo]").onclick = () => { const k = hist.pop(); if (k) { c[k]--; paint(); } };
  const sh = openSheet({ title: "BCS tally", body, footer: btn, isDirty: () => hist.length > 0, discardTitle: "Discard these scores?" });
  btn.onclick = () => {
    const m = mp.mob(); const counts = Object.fromEntries(Object.entries(c).filter(([, v]) => v)); const sm = bcsSummary(c, target);
    A.bcs(snap.lid, m, counts, st, f.values().date); sh.close(true, { force: true }); toast(`BCS saved: ${sm.onPct}% on target`);
    if (sm.thin) setTimeout(() => thinSheet(snap, m, sm.thin, f.values().date), 300);
  };
  paint();
}
function thinSheet(snap, mob, n, date) {
  const body = el(html`<form novalidate><p class="t-callout" style="margin:0 4px 12px">${n} ewes are below target. Put them in their own group to feed them up?</p><div class="form-group">${textField({ name: "name", label: "New mob name", value: `${mob.name} – thin ewes` })}</div></form>`);
  entrySheet({ title: "Make a thin ewes group", body, label: `Move ${n} thin ewes`, missing: (v) => (v.name ? null : "Name the group"), dirty: () => false,
    save: (v, sh) => { const id = A.createMob(snap.lid, { name: v.name, cls: mob.class, breed: mob.breed, birthYears: mob.birthYears, fieldName: mob.fieldName, count: 0, date }); A.splitMob(snap.lid, mob, n, id, date, "thin (BCS)"); sh.close(true, { force: true }); toast("Thin ewes group made"); } });
}

export function lameSheet(snap, { mob } = {}) {
  const inds = [];
  const body = el(html`<form novalidate><div class="form-group" data-mob></div>
    <p class="form-label">Lame today</p><div data-lame></div><p class="form-label">Out of</p><div data-out></div>
    <p class="live-pct" data-pct></p>
    <p class="form-label">Individual ewes <button type="button" class="text-btn" data-add>Add a ewe</button></p><div class="list" data-inds></div>
    <div class="form-group" style="margin-top:12px">${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}</div></form>`);
  const sl = bigStepper({ label: "Lame today", jumps: [] }); const so = bigStepper({ label: "Out of", jumps: [10] });
  const mp = mobPickRow(snap, { mob: mob || null, onChange: (m) => so.set(snap.counts.get(m.id) || 0) });
  body.querySelector("[data-mob]").append(mp.node); body.querySelector("[data-lame]").append(sl.node); body.querySelector("[data-out]").append(so.node);
  if (mob) so.set(snap.counts.get(mob.id) || 0);
  const pct = () => { const p = lamePct(sl.value(), so.value()); const el2 = body.querySelector("[data-pct]"); el2.textContent = `${p}% lame · target under ${snap.s.lameTarget}%`; el2.className = `live-pct ${p > snap.s.lameTarget ? "v-late" : "v-ok"}`; };
  const paintInds = () => { body.querySelector("[data-inds]").innerHTML = inds.length ? inds.map((i, k) => `<div class="row no-lead"><span class="main"><span class="primary">${i.tag.replace(/</g, "")}</span><span class="secondary">${[i.foot, i.cause, i.treatment].filter(Boolean).join(" · ").replace(/</g, "")}</span></span><button type="button" class="icon-btn" data-del="${k}" aria-label="Remove">${icon("close")}</button></div>`).join("") : `<p class="hint" style="padding:12px 16px;margin:0">Optional: tag, foot and cause for each lame ewe. Two treatments in a season adds her to the cull list.</p>`; };
  const { refresh } = entrySheet({ title: "Lame count", body, label: "Save lame count",
    missing: () => (!mp.mob() ? "Choose the mob to save" : !(so.value() > 0) ? "Add how many you checked" : sl.value() > so.value() ? "More lame than checked" : null),
    save: (v, sh) => { const p = lamePct(sl.value(), so.value()); A.lameCheck(snap.lid, mp.mob(), { lame: sl.value(), outOf: so.value(), individuals: inds }, v.date); sh.close(true, { force: true }); toast(`Lame count saved: ${p}%`); } });
  sl.onChange(() => { pct(); refresh(); }); so.onChange(() => { pct(); refresh(); });
  body.querySelector("[data-add]").onclick = () => indSheet((i) => { inds.push(i); if (sl.value() < inds.length) sl.set(inds.length); paintInds(); refresh(); });
  body.querySelector("[data-inds]").addEventListener("click", (e) => { const d = e.target.closest("[data-del]"); if (d) { inds.splice(+d.dataset.del, 1); paintInds(); } });
  pct(); paintInds();
}
function indSheet(done) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "tag", label: "Tag (last 5 digits)", inputmode: "numeric", autofocus: true })}</div>
    ${chipsField("Foot", chipGroup("foot", opt(["Front left", "Front right", "Back left", "Back right"]), [], { multi: false }))}
    ${chipsField("Cause", chipGroup("cause", opt(["Scald", "Footrot", "CODD", "Other"]), [], { multi: false }))}
    <div class="form-group">${textField({ name: "treatment", label: "Treatment", optional: true, placeholder: "e.g. antibiotic spray + injection" })}</div></form>`);
  entrySheet({ title: "Lame ewe", body, label: "Add ewe", missing: (v) => (v.tag ? null : "Add her tag"), save: (v, sh) => { done({ tag: v.tag, foot: v.foot || "", cause: v.cause || "", treatment: v.treatment || "" }); sh.close(true, { force: true }); } });
}
export { num, raw };
