// "Inspection ready?" in every sector (review A #14). The score counts only what the app can
// check from the records; things only the farmer can know are a plain checklist (one checkbox
// each) shown apart from it; the % stays hidden until the ledger has records to check.
// Rows (normalised by each sector):
//   { id, text, sec?, auto, state: "ok"|"gap"|"due"|"open"|"na", note?, link?, key?, done? }
import { html, raw } from "../core/html.js";
import { icon } from "./icons.js";

/** Pure: { pct|null, ok, n, gaps, due, selfDone, selfN, hasData } */
export function readyScore(rows, hasData) {
  const auto = rows.filter((r) => r.auto && r.state !== "na");
  const self = rows.filter((r) => !r.auto && r.state !== "na");
  const ok = auto.filter((r) => r.state === "ok").length;
  return {
    hasData: !!hasData, ok, n: auto.length,
    pct: hasData && auto.length ? Math.round((ok / auto.length) * 100) : null,
    gaps: auto.filter((r) => r.state === "gap"), due: auto.filter((r) => r.state === "due"),
    selfDone: self.filter((r) => r.done).length, selfN: self.length,
  };
}

/** One line for a paperwork hero: "82%" or "—" and a sentence under it. */
export function readyLine(sc) {
  if (!sc.hasData) return { value: "—", sub: "The score starts when you've added records — the app checks them for you." };
  return { value: sc.pct == null ? "—" : `${sc.pct}%`, sub: `${sc.ok} of ${sc.n} checked from your records${sc.gaps.length ? ` · ${sc.gaps.length} gap${sc.gaps.length > 1 ? "s" : ""}` : ""} · your own checks ${sc.selfDone} of ${sc.selfN} ticked` };
}

const PILL = { ok: ["ok", "check", "In place"], gap: ["late", "alert", "Gap"], due: ["due", "clock", "Check"], open: ["neutral", "clock", "Nothing yet"], na: ["neutral", "close", "n/a"] };

/** Hero tile for the checklist screen. */
export function readyHero(sc, { label = "Checked from your records", source = "", footer = "" } = {}) {
  const l = readyLine(sc);
  return html`<div class="num-tile hero" data-ready-hero><span class="label">${label}</span><span class="value">${l.value}</span><span class="sub">${sc.hasData ? `${sc.ok} of ${sc.n} in place${sc.gaps.length ? ` · ${sc.gaps.length} gap${sc.gaps.length > 1 ? "s" : ""}` : ""}` : l.sub}</span>${footer ? html`<span class="sub">${footer}</span>` : ""}${source ? html`<span class="source">${source}</span>` : ""}</div>`;
}

/**
 * The two lists. can: may tick; actions(row) -> extra html for a row (Show me, Note/photo…).
 * Self rows carry data-selftick="<id>"; the screen wires the click to its own save.
 */
function ensureCss() {
  if (typeof document === "undefined" || document.getElementById("ready-check-css")) return;
  const st = document.createElement("style"); st.id = "ready-check-css";
  st.textContent = ".ready-self button.checkbox[aria-checked=true]{background:var(--grass)!important;border-color:var(--grass)}.ready-self button.checkbox[aria-checked=true] svg{opacity:1}.ready-self button.checkbox:disabled{opacity:.6;cursor:default}.ready-self{align-items:flex-start}.ready-self button.checkbox{margin-top:2px}";
  document.head.appendChild(st);
}
export function readyLists(rows, { can = false, actions = () => "", autoTitle = "Checked from your records", selfTitle = "Your own checks" } = {}) {
  ensureCss();
  const auto = rows.filter((r) => r.auto); const self = rows.filter((r) => !r.auto);
  const secs = [...new Set(self.map((r) => r.sec || ""))];
  const autoRow = (r) => { const [lvl, ic, word] = PILL[r.state] || PILL.open;
    return html`<div class="row no-lead ready-auto" data-id="${r.id}"><span class="main"><span class="primary">${r.key ? html`<b class="key-tag">Key</b> ` : ""}${r.text}</span>${r.note ? html`<span class="secondary">${r.note}</span>` : ""}<span class="row-actions">${r.link ? html`<a class="text-btn" href="${r.link}">Show me</a>` : ""}${actions(r)}</span></span><span class="pill ${lvl}">${raw(icon(ic))}${word}</span></div>`; };
  const selfRow = (r) => html`<div class="row no-lead ready-self" data-id="${r.id}"><button type="button" class="checkbox" role="checkbox" aria-checked="${!!r.done}" aria-label="${r.text}" data-selftick="${r.id}" ${raw(can ? "" : "disabled")} style="flex:none;margin-right:12px;background:none;padding:0;cursor:pointer">${raw(icon("check"))}</button>
    <span class="main"><span class="primary">${r.key ? html`<b class="key-tag">Key</b> ` : ""}${r.text}</span>${r.note ? html`<span class="secondary">${r.note}</span>` : ""}<span class="row-actions">${actions(r)}</span></span>${r.state === "na" ? html`<span class="pill neutral">n/a</span>` : ""}</div>`;
  const okA = auto.filter((r) => r.state === "ok").length, nA = auto.filter((r) => r.state !== "na").length;
  const doneS = self.filter((r) => r.done).length, nS = self.filter((r) => r.state !== "na").length;
  return html`${auto.length ? html`<div class="section" data-ready-auto><h2 class="group-label"><span>${autoTitle}</span><span>${okA}/${nA}</span></h2><div class="list">${auto.map(autoRow)}</div></div>` : ""}
    ${self.length ? html`<div class="section" data-ready-self><h2 class="group-label"><span>${selfTitle}</span><span>${doneS}/${nS} ticked</span></h2><p class="hint" style="margin:0 4px 8px">Things only you can know. Tick each one when it's in place — they don't change the score.</p>
      ${secs.map((s) => html`${s && secs.length > 1 ? html`<p class="form-label" style="margin:12px 4px 4px">${s}</p>` : ""}<div class="list">${self.filter((r) => (r.sec || "") === s).map(selfRow)}</div>`)}</div>` : ""}`;
}

/** Wire the self checkboxes: onToggle(id, on). */
export function wireReady(root, onToggle) {
  root.querySelectorAll("[data-selftick]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); if (b.disabled) return; const on = b.getAttribute("aria-checked") !== "true"; b.setAttribute("aria-checked", String(on)); onToggle(b.dataset.selftick, on); }));
}
