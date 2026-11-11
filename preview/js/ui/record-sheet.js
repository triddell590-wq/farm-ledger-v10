// Any saved record, opened (review B #1, A #8, drastic idea 5 "Fix a mistake"): a readable
// summary with Edit and Delete, from timelines, board rows, registers and More → Fix a mistake.
// Edit reopens the sector's own entry form when it has one (module.editRecord), otherwise a
// labelled form built from the record's fields (never raw JSON). Edits keep history
// (services/records.js) and carry to the records saved with it; deletes take the whole entry
// with them and say what that undoes (withdrawals especially). Styles: css/records.css.
import { html, raw } from "../core/html.js";
import { el } from "./dom.js";
import { icon } from "./icons.js";
import { openSheet } from "./sheet.js";
import { toast } from "./toast.js";
import { textField, selectField, checkRow, wireForm, guardButton } from "./form.js";
import { canWrite, canHardDelete } from "../core/policy.js";
import { todayStr, shortDate } from "../core/dates.js";
import { updateRecord, hardDelete } from "../services/records.js";
import { loadAll, linkedFor, deleteEntry, restoreEntry, propagateEdit } from "../services/linked.js";
import { makeLookup, recordTitle, kindWord, recordDay, fieldsOf, deriveEdit, withdrawalWarnings, whoOf, textOf } from "../content/record-kinds.js";

// Records the law (DAERA / APHA / assurance) expects to be kept — deleting says so.
export const LEGAL = new Set(["animals", "sheep", "sows", "medicines", "medStock", "movements", "moves", "purchases", "sales", "deaths", "calvings", "lambings", "tbTests", "vetOps", "feedRecords", "visitors", "alarmTests", "salmSamples", "birdRegisterReturns", "killSheets", "milkWithhold", "inventories", "birdMoves"]);
export const BIN_DAYS = 30;
const J = (v) => JSON.stringify(v === undefined ? null : v);

let cssDone = false;
export function ensureRecordCss() {
  if (cssDone || typeof document === "undefined") return; cssDone = true;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "css/records.css"; document.head.appendChild(l);
}
const asDate = (d) => (d instanceof Date ? d : d?.toDate ? d.toDate() : d ? new Date(d) : null);
const hm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const stamp = (d) => { d = asDate(d); return d && !isNaN(d) ? `${shortDate(d.toISOString().slice(0, 10))} ${hm(d)}` : ""; };
async function memberNames(lid) {
  try { const { listMembers } = await import("../services/members.js"); return new Map((await listMembers(lid)).map((m) => [m.uid, m.displayName || m.email])); } catch (e) { return new Map(); }
}
/** "Treatment" + "117 Rosie · Synulox LC" */
function titleParts(type, coll, r, L) { const t = recordTitle(type, coll, r, L); const k = kindWord(type, coll, r); return { kind: k, rest: t.startsWith(k + " · ") ? t.slice(k.length + 3) : t === k ? "" : t }; }

/**
 * Open a record. ledger: { id, type, role, name }. Pass rec, or coll + id.
 * all: the ledger's records if already loaded (services/linked.js loadAll). Resolves when closed.
 */
export async function openRecord({ ledger, coll, id, rec = null, all = null, onChange = null }) {
  ensureRecordCss();
  all = all || await loadAll(ledger);
  rec = (all[coll] || []).find((r) => r.id === (rec?.id || id)) || rec;
  if (!rec) { toast("That record isn't there any more"); return null; }
  const L = makeLookup(ledger.type, all);
  const names = await memberNames(ledger.id);
  const { items } = linkedFor(all, coll, rec, { deleted: !!rec.deleted });
  const sameEntry = rec.deleted && rec.cascadeId ? items.filter((x) => x.rec.cascadeId === rec.cascadeId) : items.filter((x) => !x.rec.deleted);
  const fields = fieldsOf(ledger.type, coll, rec, L).filter((f) => f.text !== "" && f.text != null);
  const { kind, rest } = titleParts(ledger.type, coll, rec, L);
  const day = recordDay(rec); const legal = LEGAL.has(coll);
  const edits = (rec.history || []).length; const lastBy = rec.updatedBy && edits ? names.get(rec.updatedBy) : null;
  const write = canWrite(ledger.role, coll) && ledger.role !== "viewer";
  const body = el(html`<div class="rec-sheet">
    <h3 class="rec-title">${rest || kind}</h3>
    <p class="rec-when">${[day ? shortDate(day) : "", legal ? "legal record" : ""].filter(Boolean).join(" · ")}</p>
    ${rec.deleted ? html`<div class="info-card warn" style="margin-top:12px">${raw(icon("trash"))}<span>Deleted${rec.deletedAt ? ` ${stamp(rec.deletedAt)}` : ""}${rec.deletedBy && names.get(rec.deletedBy) ? ` by ${names.get(rec.deletedBy)}` : ""}. Bring it back if that was a mistake.</span></div>` : ""}
    ${fields.length ? html`<dl class="kv rec-kv">${fields.map((f) => html`<dt>${f.label}</dt><dd>${f.text}</dd>`)}</dl>` : ""}
    ${sameEntry.length ? html`<p class="form-label rec-sub">Saved with it</p><div class="list rec-linked">${sameEntry.map((x) => html`<div class="row no-lead"><span class="main"><span class="primary">${recordTitle(ledger.type, x.coll, x.rec, L)}</span></span></div>`)}</div>
      <p class="hint" style="margin:6px 4px 0">${rec.deleted ? "Bringing this back brings these back too." : "Changes and deletes here carry to these too."}</p>` : ""}
    <p class="rec-audit">${[rec.createdBy ? `Added by ${names.get(rec.createdBy) || "someone on the farm"}${rec.createdAt ? `, ${stamp(rec.createdAt)}` : ""}` : "", edits ? `changed ${edits === 1 ? "once" : edits + " times"}${lastBy ? `, last by ${lastBy}` : ""}${rec.updatedAt ? ` ${stamp(rec.updatedAt)}` : ""}` : ""].filter(Boolean).join(" · ")}</p>
  </div>`);
  const foot = el(html`<div class="btn-col rec-actions">${write ? (rec.deleted
    ? html`<button type="button" class="btn" data-restore>Bring back</button>${canHardDelete(ledger.role, coll) ? html`<button type="button" class="btn secondary danger-ink" data-purge>Delete for good</button>` : ""}`
    : html`<button type="button" class="btn" data-edit>${raw(icon("edit"))}Edit</button><button type="button" class="btn secondary danger-ink" data-delete>${raw(icon("trash"))}Delete</button>`) : html`<p class="hint" style="text-align:center">You can look at this record but not change it.</p>`}</div>`);
  const sh = openSheet({ title: kind, body, footer: foot, label: `${kind} record`, cancelText: "Close", auto: true });
  const after = (what) => { onChange && onChange(what); };
  foot.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-edit")) { sh.close("edit", { force: true }); const r = await editRecord({ ledger, coll, rec, all, L }); if (r) after("edit"); return; }
    if (b.hasAttribute("data-delete")) { const ok = await confirmDelete({ ledger, coll, rec, all, L }); if (ok) { sh.close("delete", { force: true }); after("delete"); } return; }
    if (b.hasAttribute("data-restore")) { bringBack({ ledger, coll, rec, all, L }); sh.close("restore", { force: true }); setTimeout(() => after("restore"), 60); return; }
    if (b.hasAttribute("data-purge")) {
      const ok = await confirmList({ title: "Delete for good?", lines: [recordTitle(ledger.type, coll, rec, L), ...sameEntry.map((x) => recordTitle(ledger.type, x.coll, x.rec, L))], note: "This can't be undone.", confirm: "Delete for good" });
      if (!ok) return;
      for (const x of [{ coll, rec }, ...sameEntry]) hardDelete(ledger.id, x.coll, x.rec.id);
      toast("Deleted for good"); sh.close("purge", { force: true }); setTimeout(() => after("purge"), 60);
    }
  });
  return sh.done;
}

/** Small sheet: title, a list of what's affected, warnings, buttons. Resolves the chosen value or null. */
function confirmList({ title, lines = [], also = [], warnings = [], note = "", confirm = "Delete", extra = null }) {
  ensureRecordCss();
  const b = el(html`<div class="rec-confirm"><p class="sheet-title-sm">${title}</p>
    ${lines.length ? html`<ul class="rec-lines">${lines.map((l) => html`<li><b>${l}</b></li>`)}</ul>` : ""}
    ${also.length ? html`<p class="rec-also-h">This also deletes what was saved with it:</p><ul class="rec-lines">${also.map((l) => html`<li>${l}</li>`)}</ul>` : ""}
    ${warnings.map((w) => html`<div class="alert late rec-warn" role="alert"><span class="a-icon">${raw(icon("alert"))}</span><div><div class="a-title">${w}</div></div></div>`)}
    ${note ? html`<p class="t-callout ink-2" style="margin:12px 4px 16px">${note}</p>` : ""}
    <div class="btn-col"><button type="button" class="btn danger" data-yes>${confirm}</button>${extra ? html`<button type="button" class="btn secondary" data-extra>${extra}</button>` : ""}<button type="button" class="btn secondary" data-no>Cancel</button></div></div>`);
  const s = openSheet({ size: "small", body: b, label: title, auto: true });
  b.querySelector("[data-yes]").onclick = () => s.close("all", { force: true });
  b.querySelector("[data-no]").onclick = () => s.close(null, { force: true });
  const x = b.querySelector("[data-extra]"); if (x) x.onclick = () => s.close("one", { force: true });
  return s.done.then((r) => r || null);
}

/** What putting the changed records back means, in words ("0105 Peggy goes back on the farm"). */
function effectLines(effects, all, L) {
  const out = [];
  for (const e of effects) {
    const t = (all[e.coll] || []).find((r) => r.id === e.id); if (!t) continue;
    const who = L.animal(e.id) || t.name || "";
    if ("offTo" in (e.set || {}) || "status" in (e.set || {}) || "died" in (e.set || {})) out.push(`${who || "The animal"} goes back on the farm`);
    else if ("groupId" in (e.set || {})) out.push(`${who || "The animal"} goes back to ${L.group(e.before?.groupId) || "its old group"}`);
  }
  return [...new Set(out)];
}

/** Delete with everything saved with it. Resolves true when deleted. */
export async function confirmDelete({ ledger, coll, rec, all, L }) {
  L = L || makeLookup(ledger.type, all);
  const { items, effects } = linkedFor(all, coll, rec);
  const today = todayStr();
  const peers = items.filter((x) => x.coll === coll);
  const warnings = withdrawalWarnings(ledger.type, [{ coll, rec }, ...items], today, L);
  const back = effectLines(effects, all, L);
  const word = kindWord(ledger.type, coll, rec).toLowerCase();
  const choice = await confirmList({
    title: `Delete this ${word}?`, lines: [recordTitle(ledger.type, coll, rec, L) + (recordDay(rec) ? ` · ${shortDate(recordDay(rec))}` : "")],
    also: items.map((x) => recordTitle(ledger.type, x.coll, x.rec, L)), warnings: [...warnings, ...back],
    note: LEGAL.has(coll) ? `This is a legal record — DAERA and assurance inspectors can ask to see it for years. It goes to Recently deleted for ${BIN_DAYS} days first.` : `You can bring it back from Recently deleted for ${BIN_DAYS} days.`,
    confirm: items.length ? `Delete all ${items.length + 1}` : "Delete",
    extra: peers.length && peers.length === items.length ? `Delete just ${whoOf(rec, L) || "this one"}` : null,
  });
  if (!choice) return false;
  let res;
  if (choice === "one") res = deleteEntry(ledger, { [coll]: [rec] }, coll, { ...rec, actionId: undefined, courseId: undefined, actionEffects: undefined });
  else res = deleteEntry(ledger, all, coll, rec);
  toast(res.deleted.length > 1 ? `Deleted ${res.deleted.length} records` : "Deleted", { action: "Undo", duration: 6000, onAction: async () => { const fresh = await loadAll(ledger); const r2 = (fresh[coll] || []).find((x) => x.id === rec.id); if (r2) restoreEntry(ledger, fresh, coll, r2); } });
  return true;
}

/** Bring back a deleted record and what was deleted with it. */
export function bringBack({ ledger, coll, rec, all }) {
  const r = restoreEntry(ledger, all, coll, rec);
  toast(r.restored.length > 1 ? `Brought back ${r.restored.length} records` : "Brought back");
  return r;
}

/** Edit: the sector's own form when it has one, else the labelled generic form. Resolves true when saved. */
export async function editRecord({ ledger, coll, rec, all, L }) {
  try {
    const { sectorModule } = await import("../sectors/ui.js");
    const mod = await sectorModule(ledger.type);
    if (mod.editRecord) { const r = mod.editRecord(ledger, coll, rec, all); if (r) return await r; }
  } catch (e) { console.error(e); }
  return genericEdit({ ledger, coll, rec, all, L: L || makeLookup(ledger.type, all) });
}

/** The generic edit form: every field the farmer can change, with human labels and the right inputs. */
export function genericEdit({ ledger, coll, rec, all, L }) {
  ensureRecordCss();
  const fields = fieldsOf(ledger.type, coll, rec, L);
  const editable = fields.filter((f) => f.input !== "none" && f.input !== "derived");
  const fixed = fields.filter((f) => f.input === "none" && f.text);
  const derived = fields.filter((f) => f.input === "derived" && f.text);
  const animalOpts = L.animalChoices();
  const control = (f) => {
    const name = `f_${f.key}`;
    const val = f.key === "animalIds" || f.key === "femaleIds" || f.key === "calfIds" ? (f.value || [])[0] : f.value;
    switch (f.input) {
      case "date": return textField({ name, label: f.label, type: "date", value: String(val || "").slice(0, 10) });
      case "time": return textField({ name, label: f.label, type: "time", value: val || "" });
      case "datetime": return textField({ name, label: f.label, type: "datetime-local", value: String(val || "").slice(0, 16) });
      case "number": return textField({ name, label: f.label, inputmode: "decimal", value: val ?? "" });
      case "check": return checkRow(name, f.label, !!val);
      case "select": { const o = (f.options || []).map((x) => (Array.isArray(x) ? { value: x[0], label: x[1] } : { value: x, label: x })); if (val != null && val !== "" && !o.some((x) => String(x.value) === String(val))) o.unshift({ value: val, label: String(val) }); return selectField({ name, label: f.label, value: val ?? "", options: [{ value: "", label: "Choose" }, ...o] }); }
      case "ref": { const o = [...animalOpts]; if (val && !o.some((x) => x.value === val)) o.unshift({ value: val, label: f.text || "Current" }); return selectField({ name, label: f.label, value: val || "", options: o }); }
      case "list": return textField({ name, label: `${f.label} (separate with commas)`, value: (f.value || []).join(", ") });
      default: return textField({ name, label: f.label, value: val ?? "" });
    }
  };
  const body = el(html`<form novalidate class="rec-edit">
    <p class="rec-edit-what">${recordTitle(ledger.type, coll, rec, L)}</p>
    ${editable.length ? html`<div class="form-group">${editable.map(control)}</div>` : html`<p class="hint">Nothing on this record can be changed here.</p>`}
    ${derived.length ? html`<p class="form-label rec-sub">Worked out for you when you save</p><dl class="kv rec-kv">${derived.map((f) => html`<dt>${f.label}</dt><dd>${f.text}</dd>`)}</dl>` : ""}
    ${fixed.length ? html`<p class="form-label rec-sub">Can't be changed here</p><dl class="kv rec-kv">${fixed.map((f) => html`<dt>${f.label}</dt><dd>${f.text}</dd>`)}</dl><p class="hint" style="margin:6px 4px 0">To change these, delete this record and enter it again.</p>` : ""}
    <p class="hint" style="margin:12px 4px 0">The old values are kept in the record's history${LEGAL.has(coll) ? " for inspectors" : ""}.</p>
  </form>`);
  const form = wireForm(body);
  const btn = el(html`<button type="button" class="btn">Save changes</button>`);
  const read = () => {
    const v = form.values(); const ch = {};
    for (const f of editable) {
      const raw0 = v[`f_${f.key}`]; let nv;
      if (f.input === "check") nv = !!raw0;
      else if (f.input === "number") nv = raw0 === "" ? null : Number(String(raw0).replace(/[£,\s]/g, ""));
      else if (f.input === "list") nv = String(raw0 || "").split(",").map((x) => x.trim()).filter(Boolean);
      else if (f.input === "ref") nv = ["animalIds", "femaleIds", "calfIds"].includes(f.key) ? [raw0] : raw0;
      else nv = raw0 ?? "";
      if (f.input === "number" && nv != null && Number.isNaN(nv)) return { bad: `${f.label}: type a number` };
      const was = f.value == null ? (f.input === "list" ? [] : f.input === "check" ? false : "") : f.value;
      if (J(nv) !== J(was) && !(nv === "" && (was === null || was === undefined))) ch[f.key] = nv === "" ? null : nv;
    }
    return { ch };
  };
  const missing = () => { const r = read(); if (r.bad) return r.bad; return Object.keys(r.ch).length ? null : "Change something to save"; };
  const refresh = () => guardButton(btn, "Save changes", missing);
  form.onChange(refresh); body.addEventListener("click", () => setTimeout(refresh, 0));
  const sh = openSheet({ title: `Edit ${kindWord(ledger.type, coll, rec).toLowerCase()}`, body, footer: btn, isDirty: () => !missing(), discardTitle: "Discard these changes?" });
  refresh();
  btn.onclick = () => {
    const { ch, bad } = read(); if (bad || !Object.keys(ch).length) return;
    const merged = { ...rec, ...ch };
    const derived = deriveEdit(ledger.type, coll, merged, L);
    for (const [k, v] of Object.entries(derived)) if (J(v) !== J(rec[k]) && (k in rec || v != null)) ch[k] = v;
    updateRecord(ledger.id, coll, rec, ch);
    const n = propagateEdit(ledger, all, coll, rec, ch);
    sh.close(true, { force: true });
    toast(n ? `Saved · ${n} linked record${n === 1 ? "" : "s"} updated too` : "Saved");
  };
  return sh.done.then((r) => r === true);
}

/** Make rows inside `root` that carry data-rec="coll:id" open the record (timelines, boards). */
export function wireRecordTaps(root, getLedger, { onChange } = {}) {
  ensureRecordCss();
  root.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-rec]")) { e.preventDefault(); e.target.click(); } });
  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-rec]"); if (!t || !root.contains(t)) return;
    const inner = e.target.closest("a[href],button,input,select,label"); if (inner && inner !== t && t.contains(inner)) return; // its own buttons keep working
    const [coll, id] = t.dataset.rec.split(":"); if (!coll || !id) return;
    e.preventDefault(); e.stopPropagation();
    openRecord({ ledger: getLedger(), coll, id, onChange });
  });
}
/** Chevron for a row that opens its record. */
export const recChev = () => `<span class="chev">${icon("chevron")}</span>`;
export { textOf };
