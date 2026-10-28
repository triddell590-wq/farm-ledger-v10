// Farrowing room and the crate card (design/13 §5.4, §7.1) — the most-used entry in a breeding
// unit. FAB → Farrowing → room (pre-selected when only one is farrowing) → crate grid (due sows
// highlighted) → crate card → Save. Counts with gloves on: 64px steppers, chips, no typing.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { toast } from "../../../ui/toast.js";
import { stepper, checkRow } from "../../../ui/form.js";
import { daysBetween } from "../model/dates.js";
import { entrySheet, chipsField, nowHM, sowPickRow, warn, lawNote } from "./common.js";
import { saveLitter, moveToFarrowing, undoAdd } from "../actions.js";
import { cycleOf, sowLabel, onFarm, crateEntryCheck } from "../model/sows.js";
import { aliveNow, lactationDay, DEATH_CAUSES, procedureCheck, preWeanMortality } from "../model/litters.js";
import { batchName } from "../model/batches.js";
import { dm, d2, n0 } from "../ui.js";

/** Crates in a farrowing room: [{ no, sow, cy, litter, state: free|due|today|suckling, issue }] */
export function crateMap(snap, room) {
  const n = +room.crates || Math.max(0, ...snap.data.litters.filter((l) => l.roomId === room.id).map((l) => +l.crate || 0), ...snap.data.sows.filter((s) => s.location?.roomId === room.id).map((s) => +s.location.crate || 0));
  const out = [];
  for (let i = 1; i <= n; i++) {
    const litter = snap.data.litters.find((l) => l.roomId === room.id && +l.crate === i && !l.weaned) || null;
    const sow = litter ? snap.ix.byId.get(litter.sowId) : snap.data.sows.find((s) => onFarm(s) && s.location?.roomId === room.id && +s.location.crate === i) || null;
    const cy = sow ? cycleOf(snap.s, snap.ix, sow, snap.today) : null;
    const state = litter ? (litter.farrowedAt.slice(0, 10) === snap.today ? "today" : "suckling") : sow ? "due" : "free";
    const issue = litter ? (litter.deaths || []).some((d) => daysBetween(d.date, snap.today) <= 1) || (aliveNow(litter) && litter.bornAlive && (litter.bornAlive - aliveNow(litter) - (litter.fosterOff || []).reduce((t, f) => t + f.n, 0) + (litter.fosterOn || []).reduce((t, f) => t + f.n, 0)) / litter.bornAlive > 0.2) : false;
    out.push({ no: i, sow, cy, litter, state, issue });
  }
  return out;
}
export function crateGridHtml(snap, room, { pick = false } = {}) {
  return html`<div class="pg-crates">${crateMap(snap, room).map((c) => html`<button type="button" class="pg-crate ${c.state === "due" ? "due" : c.state === "today" ? "today" : c.state === "free" ? "free" : ""} ${c.issue ? "issue" : ""}" data-crate="${c.no}" aria-label="Crate ${c.no}${c.sow ? ", sow " + sowLabel(c.sow) : ", empty"}">
    <span class="cn">C${c.no}</span><span class="cs">${c.sow ? sowLabel(c.sow) : ""}</span>
    <span class="cl">${c.litter ? html`${aliveNow(c.litter)}<small> · d${lactationDay(c.litter, snap.today)}</small>` : c.sow ? (c.cy?.dates ? `Due ${dm(c.cy.dates.due).slice(0, 3)}` : "In crate") : pick ? "Empty" : "—"}</span></button>`)}</div>`;
}

/** FAB → Farrowing. */
export async function farrowingFlow(snap, { roomId } = {}) {
  const rooms = snap.data.rooms.filter((r) => r.kind === "farrowing" && !r.deleted);
  if (!rooms.length) { toast("Add a farrowing room first (More → Rooms, bins and semen)."); return; }
  const withDue = rooms.filter((r) => crateMap(snap, r).some((c) => c.state === "due"));
  let rid = roomId || (withDue.length === 1 ? withDue[0].id : rooms.length === 1 ? rooms[0].id : null);
  if (!rid) {
    const body = el(html`<div class="list">${rooms.map((r) => { const m = crateMap(snap, r); const due = m.filter((c) => c.state === "due").length; const suck = m.filter((c) => c.litter).length; return html`<button type="button" class="row" data-r="${r.id}"><span class="tile">${raw(icon("house"))}</span><span class="main"><span class="primary">${r.name}</span><span class="secondary">${due ? `${due} due to farrow` : ""}${due && suck ? " · " : ""}${suck ? `${suck} suckling` : ""}${!due && !suck ? "Empty" : ""}</span></span>${due ? html`<span class="pill due">${due} due</span>` : ""}</button>`; })}</div>`);
    const sh = openSheet({ title: "Which room?", body, size: "small" });
    body.onclick = (e) => { const b = e.target.closest("[data-r]"); if (b) sh.close(b.dataset.r, { force: true }); };
    rid = await sh.done; if (typeof rid !== "string") return;
  }
  const room = snap.ix.rooms.get(rid);
  const body = el(html`<div><p class="hint" style="margin:0 4px 12px">Due sows are outlined. Tap a crate to count the litter.</p>${crateGridHtml(snap, room, { pick: true })}</div>`);
  const sh = openSheet({ title: room.name, body });
  body.onclick = (e) => { const b = e.target.closest("[data-crate]"); if (!b) return; sh.close(+b.dataset.crate, { force: true }); };
  const no = await sh.done; if (typeof no !== "number") return;
  return crateSheet(snap, { roomId: rid, crate: no });
}

/** The crate card. Empty crate → move a sow in; sow without a litter → new litter; litter → edit. */
export function crateSheet(snap, { roomId, crate }) {
  const room = snap.ix.rooms.get(roomId); const c = crateMap(snap, room).find((x) => x.no === +crate) || { no: +crate };
  if (!c.sow) return moveInSheet(snap, room, +crate);
  const sow = c.sow; const cy = c.cy; const old = c.litter;
  const fromDate = old ? old.farrowedAt.slice(0, 10) : snap.today; const fromTime = old ? old.farrowedAt.slice(11, 16) : nowHM();
  const gest = cy?.first ? daysBetween(cy.first.date, fromDate) : null;
  const deaths = [...(old?.deaths || [])]; const newDeaths = [];
  const sumN = (a) => (a || []).reduce((t, x) => t + (+x.n || 0), 0);
  const others = snap.data.litters.filter((l) => !l.weaned && l.id !== old?.id && snap.ix.rooms.get(l.roomId)?.kind === "farrowing");
  const otherOpts = others.map((l) => [l.id, `${snap.ix.rooms.get(l.roomId)?.name === room.name ? "" : (snap.ix.rooms.get(l.roomId)?.name || "") + " "}C${l.crate} · ${sowLabel(snap.ix.byId.get(l.sowId) || {})}`]);
  const st = (name, label, value, sub = "") => html`<div class="field stepper-field pg-big"><span class="label">${label}${sub ? html`<br><small class="ink-2" style="font-weight:500">${sub}</small>` : ""}</span><span class="spacer"></span>${stepper(name, value, { min: 0, max: 40, label })}</div>`;
  const t = old?.tasks || {};
  const body = el(html`<form novalidate>
    <p class="hint" style="margin:0 4px 12px;color:var(--ink)">Sow <b>${sowLabel(sow)}</b> · P${cy?.parity ?? "?"}${cy?.batchId || old?.batchId ? " · " + batchName(snap.ix.batches.get(old?.batchId || cy.batchId)) : ""}<br><span class="ink-2">${old ? `Farrowed ${dm(fromDate)} ${fromTime}` : cy?.dates ? `Due ${dm(cy.dates.due)} (range ${d2(cy.dates.dueFrom)}–${d2(cy.dates.dueTo)})` : ""}${gest ? ` · ${gest} days` : ""}</span></p>
    <div class="form-group"><div class="field"><label>Farrowed</label><input type="date" name="date" value="${fromDate}"></div><div class="field"><label>Time</label><input type="time" name="time" value="${fromTime}"></div></div>
    <div class="form-group">${st("bornAlive", "Born alive", old?.bornAlive ?? 0)}${st("stillborn", "Stillborn", old?.stillborn ?? 0)}${st("mummified", "Mummified", old?.mummified ?? 0)}</div>
    <div class="form-group">${st("fosterOn", "Fostered on", sumN(old?.fosterOn), "from other sows")}
      ${otherOpts.length ? html`<div data-onfrom hidden>${chipsField("onFrom", "From", otherOpts, null)}</div>` : ""}
      ${st("fosterOff", "Fostered off", sumN(old?.fosterOff), "to other sows")}
      ${otherOpts.length ? html`<div data-offto hidden>${chipsField("offTo", "To", otherOpts, null)}</div>` : ""}
      <div class="field" data-fosters hidden><span class="label ink-2" data-fosters-t style="font-weight:500"></span></div></div>
    <div class="form-group"><div class="field chips-field"><span class="label">Piglet died — why?</span><div class="chips" data-causes>${DEATH_CAUSES.map((x) => html`<button type="button" class="chip" data-cause="${x}">${x}</button>`)}</div></div>
      <div class="field"><span class="label">Deaths recorded</span><span class="pick-val" data-died style="flex:1;text-align:right;font-weight:600"></span></div><div class="pg-died" data-newdied></div></div>
    <div class="pg-alive"><span><span class="t">Alive now</span><span class="f">born alive − died + on − off</span></span><b data-alive>0</b></div>
    <div class="form-group">${chipsField("tasks", "Tasks done", [["iron", "Iron"], ["teeth", "Teeth (only if injuries seen)"], ["tail", "Tail — vet after day 7"]], ["iron", "teeth", "tail"].filter((k) => k === "iron" ? t.iron : t[k]?.done), { multi: true })}
      <div data-ev hidden>${checkRow("evidence", "Injuries seen", !!(t.teeth?.evidence || t.tail?.evidence), "Bitten teats, or bitten ears and tails on other piglets")}</div>
      <div data-vet hidden>${checkRow("vet", "Done by a vet", !!t.tail?.vet, "With anaesthetic and pain relief")}</div>
      ${checkRow("nesting", "Nesting material given 24 h before farrowing", old ? !!old.nesting : true, "Red Tractor HF.9.5.c")}</div>
    ${lawNote("Teeth and tail are never routine: teeth only where there's evidence of injury, within 7 days; tail docking after 7 days only by a vet. The app records — it does not advise docking.")}
    <div data-warn></div>
  </form>`);
  const age = () => daysBetween(body.querySelector("[name=date]").value || snap.today, snap.today);
  const es = entrySheet({ title: `Crate ${c.no}`, body, label: `Save crate ${c.no}`,
    missing: (v) => {
      if (!v.date) return "Add the farrowing date";
      if (!(+v.bornAlive) && !(+v.stillborn) && !(+v.mummified)) return "Count the litter to save";
      for (const k of ["teeth", "tail"]) if ((v.tasks || []).includes(k)) { const r = procedureCheck(k, age(), { evidence: v.evidence, vet: v.vet }); if (!r.ok) return k === "teeth" ? "Tick injuries seen for teeth" : age() > 7 && !v.vet ? "Tail after 7 days: vet only" : "Tick injuries seen for tail"; }
      if (+v.fosterOff > sumN(old?.fosterOff) && otherOpts.length && !v.offTo) return "Choose the crate they went to";
      return null;
    },
    save(v, sh) {
      const fosterOff = [...(old?.fosterOff || [])]; const fosterOn = [...(old?.fosterOn || [])];
      const dOff = +v.fosterOff - sumN(fosterOff); const dOn = +v.fosterOn - sumN(fosterOn);
      if (dOff > 0) fosterOff.push({ n: dOff, toLitterId: v.offTo || null, date: snap.today }); else if (dOff < 0) trim(fosterOff, -dOff);
      if (dOn > 0) fosterOn.push({ n: dOn, fromLitterId: v.onFrom || null, date: snap.today }); else if (dOn < 0) trim(fosterOn, -dOn);
      const tasks = { iron: (v.tasks || []).includes("iron") ? (t.iron || snap.today) : null, teeth: (v.tasks || []).includes("teeth") ? { done: t.teeth?.done || snap.today, evidence: true } : null, tail: (v.tasks || []).includes("tail") ? { done: t.tail?.done || snap.today, evidence: true, vet: !!v.vet } : null };
      const id = saveLitter(snap, { sowId: sow.id, roomId, crate: c.no, farrowedAt: `${v.date}T${v.time || "00:00"}`, bornAlive: v.bornAlive, stillborn: v.stillborn, mummified: v.mummified, fosterOn, fosterOff, deaths: [...deaths, ...newDeaths], tasks, nesting: v.nesting }, old);
      const alive = Math.max(0, +v.bornAlive - sumN(deaths) - sumN(newDeaths) + +v.fosterOn - +v.fosterOff);
      sh.close(true, { force: true });
      toast(`Crate ${c.no} saved · ${alive} alive`, old ? {} : { action: "Undo", onAction: () => undoAdd(snap.lid, "litters", id) });
    } });
  function trim(list, n) { while (n > 0 && list.length) { const last = list[list.length - 1]; if (last.n > n) { last.n -= n; n = 0; } else { n -= last.n; list.pop(); } } }
  const paint = () => {
    const v = es.form.values();
    const died = sumN(deaths) + sumN(newDeaths);
    const alive = Math.max(0, +v.bornAlive - died + +v.fosterOn - +v.fosterOff);
    const a = body.querySelector("[data-alive]"); if (a.textContent !== String(alive)) a.textContent = alive;
    const dayOf = (d) => daysBetween(v.date || snap.today, d.date) + 1;
    body.querySelector("[data-died]").textContent = deaths.length ? deaths.map((d) => `${d.n} · ${d.cause.toLowerCase()} · day ${dayOf(d)}`).join(", ") : newDeaths.length ? `${sumN(newDeaths)} new` : "None";
    body.querySelector("[data-newdied]").replaceChildren(...newDeaths.map((d, i) => el(html`<button type="button" class="chip" aria-checked="true" data-undeath="${i}" aria-label="Remove ${d.cause}">${d.n} · ${d.cause.toLowerCase()} · day ${dayOf(d)} ✕</button>`)));
    const ln = (a, key) => (a || []).filter((f) => f[key]).map((f) => { const o = snap.data.litters.find((l) => l.id === f[key]); return o ? `C${o.crate} (${f.n})` : null; }).filter(Boolean);
    const offs = ln(old?.fosterOff, "toLitterId"), ons = ln(old?.fosterOn, "fromLitterId");
    const ft = [offs.length ? `→ to ${offs.join(", ")}` : "", ons.length ? `← from ${ons.join(", ")}` : ""].filter(Boolean).join(" · ");
    body.querySelector("[data-fosters]").hidden = !ft; body.querySelector("[data-fosters-t]").textContent = ft;
    const tk = v.tasks || [];
    body.querySelector("[data-ev]").hidden = !tk.includes("teeth") && !tk.includes("tail");
    body.querySelector("[data-vet]").hidden = !(tk.includes("tail") && age() > 7);
    const of = body.querySelector("[data-onfrom]"); if (of) of.hidden = !(+v.fosterOn > sumN(old?.fosterOn));
    const ot = body.querySelector("[data-offto]"); if (ot) ot.hidden = !(+v.fosterOff > sumN(old?.fosterOff));
    const w = []; if (gest && (gest < 110 || gest > 120)) w.push(`${gest} days from first service — check the service date.`);
    if (sow.location?.since && !old) { const ch = crateEntryCheck(sow.location.since, v.date || snap.today); if (!ch.ok) w.push(`Sow ${sowLabel(sow)} ${ch.text}.`); }
    body.querySelector("[data-warn]").replaceChildren(...w.map((x) => el(warn(x))));
  };
  body.querySelector("[data-causes]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cause]"); if (!b) return; e.stopPropagation();
    newDeaths.push({ date: snap.today, n: 1, cause: b.dataset.cause });
    b.animate?.([{ transform: "scale(.94)" }, { transform: "none" }], { duration: 160 }); paint(); es.refresh();
  });
  body.querySelector("[data-newdied]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-undeath]"); if (!b) return; e.stopPropagation();
    newDeaths.splice(+b.dataset.undeath, 1); paint(); es.refresh();
  });
  es.form.onChange(paint); paint();
  return es.sheet.done;
}

/** Empty crate: move a sow in (date = today). */
function moveInSheet(snap, room, crate) {
  const pr = sowPickRow(snap, { label: "Sow", title: `Into crate ${crate}`, filter: (s, c) => ["served", "inpig"].includes(c.status) && s.type !== "boar" });
  const body = el(html`<form novalidate><p class="hint" style="margin:0 4px 12px">Crate ${crate} is empty. Move a sow in — no more than 7 days before she's due.</p><div class="form-group" data-pr></div><div class="form-group"><div class="field"><label>Date</label><input type="date" name="date" value="${snap.today}"></div></div><div data-w></div></form>`);
  body.querySelector("[data-pr]").append(pr.node);
  const es = entrySheet({ title: `${room.name} · crate ${crate}`, body, label: "Move her in",
    missing: () => (pr.id() ? null : "Choose the sow"),
    save(v, sh) { moveToFarrowing(snap, [{ sowId: pr.id(), roomId: room.id, crate }], v.date || snap.today); sh.close(true, { force: true }); toast(`Sow ${sowLabel(snap.ix.byId.get(pr.id()))} in crate ${crate}`); } });
  const chk = () => { const s = pr.id() && snap.ix.byId.get(pr.id()); const cy = s && cycleOf(snap.s, snap.ix, s, snap.today); const r = cy?.dates ? crateEntryCheck(es.form.values().date || snap.today, cy.dates.due) : { ok: true }; body.querySelector("[data-w]").replaceChildren(...(r.ok ? [] : [el(warn(`She ${r.text}.`))])); es.refresh(); };
  body.addEventListener("click", () => setTimeout(chk, 300)); es.form.onChange(chk);
  return es.sheet.done;
}
export { n0, preWeanMortality };

/** Small herd "Litter born" (§2.2): crate card without rooms when the farm has no farrowing rooms. */
export function litterFlow(snap, extra = {}) {
  if (snap.data.rooms.some((r) => r.kind === "farrowing" && !r.deleted)) return farrowingFlow(snap, extra);
  const pr = sowPickRow(snap, { label: "Sow", title: "Which sow farrowed?", filter: (s, c) => s.type !== "boar" && !["suckling"].includes(c.status) });
  const st = (name, label) => html`<div class="field stepper-field pg-big"><span class="label">${label}</span><span class="spacer"></span>${stepper(name, 0, { min: 0, max: 40, label })}</div>`;
  const body = el(html`<form novalidate><div class="form-group" data-pr></div>
    <div class="form-group"><div class="field"><label>Farrowed</label><input type="date" name="date" value="${snap.today}"></div><div class="field"><label>Time</label><input type="time" name="time" value="${nowHM()}"></div></div>
    <div class="form-group">${st("bornAlive", "Born alive")}${st("stillborn", "Stillborn")}${st("mummified", "Mummified")}</div>
    <div class="form-group">${chipsField("tasks", "Done", [["iron", "Iron"]], [], { multi: true })}${checkRow("nesting", "Straw / nesting material given before farrowing", true)}</div>
    ${lawNote("Teeth and tail are never routine. Record any later piglet deaths from the sow's card.")}</form>`);
  body.querySelector("[data-pr]").append(pr.node);
  const es = entrySheet({ title: "Litter born", body, label: "Save litter",
    missing: (v) => (!pr.id() ? "Choose the sow" : !(+v.bornAlive) && !(+v.stillborn) ? "Count the litter to save" : null),
    save(v, sh) { const id = saveLitter(snap, { sowId: pr.id(), roomId: null, crate: null, farrowedAt: `${v.date}T${v.time || "00:00"}`, bornAlive: v.bornAlive, stillborn: v.stillborn, mummified: v.mummified, tasks: { iron: (v.tasks || []).includes("iron") ? snap.today : null }, nesting: v.nesting }); sh.close(true, { force: true }); const s = snap.ix.byId.get(pr.id()); toast(`${s.name || sowLabel(s)}: ${v.bornAlive} born alive`, { action: "Undo", onAction: () => undoAdd(snap.lid, "litters", id) }); } });
  return es.sheet.done;
}
