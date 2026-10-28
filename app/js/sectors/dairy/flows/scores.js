// Mobility / BCS walk-past sessions and foot trimming (design/12 §6.5). A session is a tally per
// cow: type the cow number, tap the score, next cow. Mobility 0–3 (AHDB), BCS 1–5 in halves.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet, confirmSheet } from "../../../ui/sheet.js";
import { textField, checkRow } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr } from "../../../core/dates.js";
import { add, me } from "../actions.js";
import { cowLabel } from "../ui.js";
import { onFarm } from "../model/cows.js";
import { sessionSummary } from "../model/scores.js";
import { entrySheet, cowPickRow, chipsField } from "./common.js";

export const SCALES = {
  mobility: { title: "Mobility session", scores: ["0", "1", "2", "3"], help: "0 good · 1 imperfect · 2 impaired (lame) · 3 severely impaired (AHDB)" },
  bcs: { title: "BCS session", scores: ["1.5", "2", "2.5", "3", "3.5", "4", "4.5"], help: "Body condition 1–5. Target about 3 at calving, 2.5 at service." },
};

/** Walk-past tally. method: "mobility" | "bcs". Resolves true when saved. */
export function scoreSession(snap, { method = "mobility" } = {}) {
  const S = SCALES[method]; const rows = []; // { animalId, cowNo, score }
  const find = (no) => { const q = String(no).trim(); if (!q) return null; return snap.ix.byNo.get(q) || snap.data.animals.find((a) => onFarm(a) && (a.tag || "").replace(/\s/g, "").endsWith(q)) || null; };
  const body = el(html`<div class="score-session">
    <p class="hint" style="margin:0 4px 8px">${S.help}</p>
    <div class="field"><label>Cow number</label><input name="cowNo" inputmode="numeric" autocomplete="off" data-no placeholder="214"></div>
    <p class="hint" data-who style="margin:6px 4px;min-height:20px"></p>
    <div class="score-keys" role="group" aria-label="Score">${S.scores.map((x) => html`<button type="button" class="score-key" data-s="${x}">${x}</button>`)}</div>
    <div class="section"><h2 class="group-label"><span>Scored</span><span data-n>0</span></h2><div class="list" data-list></div></div>
    <div class="form-group">${textField({ name: "scorer", label: "Scored by", value: me() })}${textField({ name: "actions", label: "Actions (foot trimmer booked…)", optional: true })}</div></div>`);
  const no = body.querySelector("[data-no]");
  const paint = () => {
    const a = find(no.value); body.querySelector("[data-who]").textContent = no.value ? (a ? `${cowLabel(a)}${a.name ? " " + a.name : ""}` : "Not in the herd — the score is kept with the number") : "";
    body.querySelector("[data-n]").textContent = String(rows.length);
    const sm = sessionSummary(method, rows.map((r) => r.score));
    body.querySelector("[data-list]").replaceChildren(el(html`<div style="display:contents">${rows.length ? html`<div class="row no-lead"><span class="main"><span class="primary">${sm.line}</span></span></div>` : ""}${[...rows].reverse().slice(0, 30).map((r) => html`<div class="row no-lead"><span class="cow-no">${r.cowNo}</span><span class="main"><span class="secondary">${method === "bcs" ? "BCS" : "Mobility"} ${r.score}</span></span>${method === "mobility" && +r.score >= 2 ? html`<span class="pill due">Lame</span>` : ""}</div>`)}</div>`));
    btn.disabled = !rows.length; btn.textContent = rows.length ? `Save ${rows.length} score${rows.length > 1 ? "s" : ""}` : "Score at least one cow";
  };
  no.addEventListener("input", paint);
  body.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => {
    const v = no.value.trim(); if (!v) { toast("Type the cow number first"); no.focus(); return; }
    const a = find(v); const i = rows.findIndex((r) => r.cowNo === (a ? cowLabel(a) : v)); const row = { animalId: a?.id || null, cowNo: a ? cowLabel(a) : v, score: +b.dataset.s };
    if (i >= 0) rows[i] = row; else rows.push(row);
    no.value = ""; no.focus(); paint();
  }));
  const btn = el(html`<button type="button" class="btn">Score at least one cow</button>`);
  const sh = openSheet({ title: S.title, body, footer: btn, size: "full", isDirty: () => rows.length > 0, discardTitle: "Discard these scores?" });
  btn.onclick = () => {
    const scorer = body.querySelector("[name=scorer]").value.trim(); const actions = body.querySelector("[name=actions]").value.trim();
    add(snap.lid, "scoreSessions", { date: todayStr(), method, scorer, scores: rows, actions, byName: me() });
    const sm = sessionSummary(method, rows.map((r) => r.score));
    sh.close(true, { force: true }); toast(`Saved — ${sm.line}`);
  };
  paint(); setTimeout(() => no.focus(), 300);
  return sh.done;
}

export const LESIONS = ["Digital dermatitis", "Sole ulcer", "White line", "Sole bruise", "Foul in the foot", "Other"];
export function footTrimSheet(snap, { animalId = null } = {}) {
  const row = cowPickRow(snap, { label: "Cow", ids: animalId ? [animalId] : [] });
  const body = el(html`<form novalidate><div class="form-group" data-cow></div>
    <div class="form-group">${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}${chipsField("foot", "Foot", [["LF", "Left fore"], ["RF", "Right fore"], ["LH", "Left hind"], ["RH", "Right hind"]], null, { multi: true })}
      ${chipsField("lesion", "Lesion", LESIONS, null)}${textField({ name: "treatment", label: "Treatment", optional: true, placeholder: "Trimmed, spray, bandage…" })}${checkRow("block", "Block applied")}${textField({ name: "trimmer", label: "Trimmer", optional: true })}</div></form>`);
  body.querySelector("[data-cow]").appendChild(row.node);
  return entrySheet({ title: "Foot trim", body, label: "Save foot trim", missing: (v) => (!row.ids().length ? "Choose the cow" : !v.foot?.length ? "Pick the foot" : null),
    save(v, sh) { add(snap.lid, "footTrims", { animalId: row.ids()[0], date: v.date, foot: v.foot.join(" "), lesion: v.lesion || "", treatment: v.treatment || "", block: !!v.block, trimmer: v.trimmer || "" }); sh.close(true, { force: true }); toast("Foot trim saved"); } }).sheet.done;
}
export { confirmSheet, raw, icon };
