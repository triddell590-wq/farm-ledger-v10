// Weigh session — crush mode (design/10 §6.3). Step through the chosen cattle, type the
// weight on a big keypad, Next saves and moves on. Gain since last shows live. Summary at the
// end: average weight and gain, and the ones to check (bottom 10% or under 0.6 kg/day).
import { html, raw } from "../../../core/html.js";
import { el, vibrate } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { toast } from "../../../ui/toast.js";
import { todayStr, daysBetween } from "../../../core/dates.js";
import { pickAnimals, tagHtml, animalLabel } from "../ui.js";
import { recordWeights } from "../actions.js";
import { lastWeight, describe, classOf } from "../model/animals.js";
import { listDate } from "../../../ui/format.js";
import { store } from "../../../core/store.js";

export default async function weighSession(snap, { animalIds, title } = {}) {
  let ids = animalIds;
  if (!ids || !ids.length) ids = await pickAnimals(snap, { title: "Who are you weighing?", confirm: (n) => `Weigh ${n}` });
  if (!ids || !ids.length) return;
  const list = ids.map((id) => snap.ix.byId.get(id)).filter(Boolean);
  const target = (a) => snap.s.dlwgTarget[classOf(snap.ix, a, snap.today)] ?? snap.s.dlwgTarget.finisher;
  const got = new Map(); let i = 0; let val = "";
  const sessionId = store.newId(); const date = todayStr();
  const body = el(html`<div class="weigh" data-sector="beef">
    <div class="card pad" data-who></div>
    <div class="wv" aria-live="polite"><span data-v>—</span><small>kg</small></div>
    <div class="gain" data-gain></div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => html`<button type="button" data-k="${n}">${n}</button>`)}<button type="button" data-k="back" aria-label="Delete">⌫</button><button type="button" data-k="0">0</button><button type="button" class="next" data-k="next">Next ${raw(icon("chevron"))}</button></div>
    <div style="display:flex;justify-content:space-between"><button type="button" class="text-btn" data-prev>‹ Back one</button><button type="button" class="text-btn" data-skip>Skip this one</button></div>
  </div>`);
  const sh = openSheet({ title: title || "Weigh", body, cancelText: "Done", isDirty: () => false });
  const head = sh.el.querySelector(".sheet-head h2");
  const paint = () => {
    const a = list[i]; const lw = lastWeight(snap.ix, a);
    head.textContent = `Weigh · ${i + 1} of ${list.length}`;
    body.querySelector("[data-who]").replaceChildren(el(html`<div><div class="t-title" style="font-size:22px">${tagHtml(a.tag)}</div><div class="ink-2">${describe(snap.ix, a, snap.today)}</div><div class="ink-2">${lw ? `Last: ${lw.kg} kg on ${listDate(lw.date)} (${daysBetween(lw.date, date)} d ago)` : "Not weighed before"}</div></div>`));
    body.querySelector("[data-v]").textContent = val || "—";
    const g = body.querySelector("[data-gain]");
    if (val && lw && daysBetween(lw.date, date) > 0) { const gain = (+val - lw.kg) / daysBetween(lw.date, date); const t = target(a); g.innerHTML = ""; g.append(el(html`<span class="${gain >= t ? "ok-ink" : "late-ink"}">Gain since last: ${gain.toFixed(2)} kg/day ${gain >= t ? "▲" : "▼"} target ${t}</span>`)); }
    else g.textContent = "";
  };
  const next = (save = true) => {
    if (save && +val > 0) got.set(list[i].id, +val);
    val = ""; vibrate(10);
    if (i < list.length - 1) { i++; const prev = got.get(list[i].id); val = prev ? String(prev) : ""; paint(); } else finish();
  };
  body.addEventListener("click", (e) => {
    const k = e.target.closest("[data-k]"); if (k) { const x = k.dataset.k; if (x === "next") return next(); if (x === "back") val = val.slice(0, -1); else if (val.length < 4) val += x; paint(); return; }
    if (e.target.closest("[data-skip]")) next(false);
    if (e.target.closest("[data-prev]") && i > 0) { if (+val > 0) got.set(list[i].id, +val); i--; val = got.get(list[i].id) ? String(got.get(list[i].id)) : ""; paint(); }
  });
  const onKey = (e) => { if (/^\d$/.test(e.key) && val.length < 4) { val += e.key; paint(); } else if (e.key === "Backspace") { val = val.slice(0, -1); paint(); } else if (e.key === "Enter") next(); };
  document.addEventListener("keydown", onKey); sh.done.then(() => { document.removeEventListener("keydown", onKey); if (got.size && !finished) finish(true); });
  let finished = false;
  function finish(silent) {
    if (finished) return; finished = true;
    const entries = [...got.entries()].map(([animalId, kg]) => ({ animalId, kg }));
    recordWeights(snap.lid, entries, { date, sessionId });
    if (silent) { toast(`${entries.length} weight${entries.length === 1 ? "" : "s"} saved`); return; }
    sh.close(true, { force: true });
    const rows = entries.map((e) => { const a = snap.ix.byId.get(e.animalId); const lw = lastWeight(snap.ix, a); const d = lw ? daysBetween(lw.date, date) : 0; return { a, kg: e.kg, gain: lw && d >= 14 ? (e.kg - lw.kg) / d : null }; });
    const gains = rows.filter((r) => r.gain != null).map((r) => r.gain).sort((x, y) => x - y);
    const avgW = rows.reduce((s, r) => s + r.kg, 0) / Math.max(1, rows.length); const avgG = gains.length ? gains.reduce((s, x) => s + x, 0) / gains.length : null;
    const cut = gains.length ? gains[Math.floor(gains.length * 0.1)] : null;
    const check = rows.filter((r) => r.gain != null && (r.gain < 0.6 || (gains.length >= 3 && r.gain <= cut)));
    const sb = el(html`<div data-sector="beef"><p class="sheet-title-sm">Weighed ${rows.length} · skipped ${list.length - rows.length}</p>
      <div class="tiles"><div class="num-tile"><span class="label">Average weight</span><span class="value">${Math.round(avgW)} kg</span></div><div class="num-tile"><span class="label">Average gain</span><span class="value">${avgG != null ? avgG.toFixed(2) : "—"}</span><span class="delta">kg/day</span></div></div>
      ${check.length ? html`<p class="form-label">Check these ${check.length} — under 0.6 kg/day or bottom 10%</p><div class="list">${check.map((r) => html`<div class="row no-lead"><span class="main"><span class="primary">${animalLabel(r.a)}</span></span><span class="value late-ink">${r.gain.toFixed(2)}</span></div>`)}</div>` : html`<p class="hint">Nobody under 0.6 kg/day. Gains over less than 14 days are left out of averages.</p>`}
      <button type="button" class="btn" data-ok style="margin-top:16px">Done</button></div>`);
    const s2 = openSheet({ size: "small", body: sb, label: "Weigh summary", auto: true });
    sb.querySelector("[data-ok]").onclick = () => s2.close(true, { force: true });
  }
  paint();
}
