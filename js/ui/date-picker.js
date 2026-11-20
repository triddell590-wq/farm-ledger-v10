// Big calendar for every date box (Tom, 10 Nov: the phone's own calendar is too small to use).
// The calendar button beside any date box (or its label) opens this instead: large day
// buttons, month arrows, month and year jumps, Today and Yesterday. Choosing a day fills the box
// exactly as typing would (input + change events), so every form works unchanged. Typing a date
// with the keyboard still works. It sits on its own layer above any sheet, so a form open
// underneath stays open.
import { todayStr, addDays } from "../core/dates.js";

const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HEAD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const longDate = (s) => { const d = new Date(s + "T12:00:00"); return `${DOW_LONG[d.getDay()]} ${d.getDate()} ${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`; };
const valid = (s) => /^\d{4}-\d\d-\d\d$/.test(s || "");

let open = null; // the calendar showing now

/** Open the big calendar for one date input. */
export function pickDate(input) {
  if (open) open.close();
  const today = todayStr(); const min = valid(input.min) ? input.min : null; const max = valid(input.max) ? input.max : null;
  const ok = (s) => (!min || s >= min) && (!max || s <= max);
  const start = valid(input.value) ? input.value : ok(today) ? today : min || max || today;
  let y = +start.slice(0, 4), m = +start.slice(5, 7) - 1;
  const label = (input.labels && input.labels[0] && input.labels[0].textContent.trim()) || input.getAttribute("aria-label") || "Choose a date";
  const back = document.activeElement;

  const root = document.createElement("div"); root.className = "dp-layer";
  root.innerHTML = `<div class="dp-scrim" data-x></div><div class="dp" role="dialog" aria-modal="true" aria-label="${label.replace(/"/g, "&quot;")}">
    <div class="dp-head"><div class="dp-label"></div><div class="dp-chosen" aria-live="polite"></div></div>
    <div class="dp-quick"><button type="button" class="chip" data-q="0">Today</button><button type="button" class="chip" data-q="-1">Yesterday</button></div>
    <div class="dp-nav"><button type="button" class="dp-arrow" data-step="-1" aria-label="Previous month">‹</button>
      <select class="dp-month" aria-label="Month">${MONTH_LONG.map((n, i) => `<option value="${i}">${n}</option>`).join("")}</select>
      <select class="dp-year" aria-label="Year"></select>
      <button type="button" class="dp-arrow" data-step="1" aria-label="Next month">›</button></div>
    <div class="dp-grid" role="grid"></div>
    <div class="dp-foot">${input.required || !input.value ? "" : `<button type="button" class="btn secondary" data-clear>Clear</button>`}<button type="button" class="btn secondary" data-x>Cancel</button></div></div>`;
  root.querySelector(".dp-label").textContent = label.replace(/\s*\(optional\)\s*$/i, "");
  const grid = root.querySelector(".dp-grid"), mSel = root.querySelector(".dp-month"), ySel = root.querySelector(".dp-year");
  const yLo = Math.min(min ? +min.slice(0, 4) : +today.slice(0, 4) - 30, y), yHi = Math.max(max ? +max.slice(0, 4) : +today.slice(0, 4) + 5, y);
  ySel.innerHTML = Array.from({ length: yHi - yLo + 1 }, (_, i) => `<option>${yHi - i}</option>`).join("");
  const chosen = () => root.querySelector(".dp-chosen").textContent = valid(input.value) ? longDate(input.value) : "No date chosen";

  const paint = (focusDay) => {
    mSel.value = String(m); ySel.value = String(y);
    const first = new Date(y, m, 1); const lead = (first.getDay() + 6) % 7; const days = new Date(y, m + 1, 0).getDate();
    let h = HEAD.map((d) => `<span class="dp-dow" aria-hidden="true">${d}</span>`).join("");
    for (let i = 0; i < lead; i++) h += `<span></span>`;
    for (let d = 1; d <= days; d++) {
      const s = iso(y, m, d);
      h += `<button type="button" class="dp-day${s === today ? " today" : ""}${s === input.value ? " on" : ""}" data-d="${s}" ${ok(s) ? "" : "disabled"} aria-label="${longDate(s)}${s === today ? ", today" : ""}" ${s === input.value ? 'aria-pressed="true"' : ""}>${d}</button>`;
    }
    grid.innerHTML = h;
    root.querySelector('[data-step="-1"]').disabled = !!min && iso(y, m, 1) <= min;
    root.querySelector('[data-step="1"]').disabled = !!max && iso(y, m, days) >= max;
    if (focusDay) (grid.querySelector(`[data-d="${focusDay}"]`) || grid.querySelector(".dp-day:not([disabled])"))?.focus();
  };
  const step = (n) => { m += n; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } paint(); };
  const choose = (s) => {
    if (!ok(s)) return;
    input.value = s; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
    close();
  };
  function close() { root.remove(); document.removeEventListener("keydown", keys, true); if (open === api) open = null; try { (back && back !== document.body ? back : input).focus({ preventScroll: true }); } catch (e) { /* gone */ } }
  function keys(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    const cur = document.activeElement?.dataset?.d; if (!cur) return;
    const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!mv) return;
    e.preventDefault(); const n = addDays(cur, mv); y = +n.slice(0, 4); m = +n.slice(5, 7) - 1; paint(n);
  }
  root.addEventListener("click", (e) => {
    const t = e.target.closest("button, [data-x]"); if (!t) return;
    if (t.dataset.d) choose(t.dataset.d);
    else if (t.dataset.step) step(+t.dataset.step);
    else if (t.dataset.q != null) choose(addDays(today, +t.dataset.q));
    else if (t.hasAttribute("data-clear")) { input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); close(); }
    else if (t.hasAttribute("data-x")) close();
  });
  mSel.onchange = () => { m = +mSel.value; paint(); };
  ySel.onchange = () => { y = +ySel.value; paint(); };
  root.querySelectorAll("[data-q]").forEach((b) => (b.disabled = !ok(addDays(today, +b.dataset.q))));
  document.addEventListener("keydown", keys, true);
  document.body.appendChild(root);
  chosen(); paint(valid(input.value) ? input.value : ok(today) ? today : null);
  const api = { close, root }; open = api; return api;
}

// ---- Typing a date in one go (Tom, 10 Nov) ----
// The browser's date box makes you step between day, month and year. Every date box gets a plain
// number box in front of it: type 10112026, 101126 or 10/11/26 and the slashes come by themselves;
// the calendar button beside it opens the big calendar. The real date box stays in the form
// (hidden), so forms read and set it exactly as before.
const VALUE = typeof HTMLInputElement === "undefined" ? null : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
const fmt = (s) => (valid(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
/** "10112026" / "101126" / "10/11/26" / "1/2/2026" → ISO, or null. `done` = the person has finished typing. */
export function parseTyped(text, done = false) {
  const t = String(text || "").trim(); if (!t) return "";
  let d, m, y;
  const parts = t.split(/[^0-9]+/).filter(Boolean);
  if (parts.length === 3) [d, m, y] = parts;
  else { const g = t.replace(/\D/g, ""); if (g.length === 8 || (done && g.length === 6)) { d = g.slice(0, 2); m = g.slice(2, 4); y = g.slice(4); } else return null; }
  if (!y || (y.length !== 4 && !(done && y.length === 2))) return null;
  if (y.length === 2) y = "20" + y;
  const out = iso(+y, +m - 1, +d); const back = new Date(+y, +m - 1, +d);
  return back.getFullYear() === +y && back.getMonth() === +m - 1 && back.getDate() === +d ? out : null;
}
function enhance(inp) {
  if (inp.dataset.dpDone || !inp.parentNode) return; inp.dataset.dpDone = "1";
  const wrap = document.createElement("span"); wrap.className = "dp-wrap";
  const txt = document.createElement("input");
  txt.type = "text"; txt.className = "dp-text"; txt.inputMode = "numeric"; txt.autocomplete = "off"; txt.placeholder = "dd/mm/yyyy"; txt.maxLength = 10;
  const lab = (inp.labels && inp.labels[0] && inp.labels[0].textContent.replace(/\s*\(optional\)\s*$/i, "").trim()) || inp.getAttribute("aria-label") || "Date";
  txt.setAttribute("aria-label", `${lab}, day month year`);
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "dp-btn"; btn.setAttribute("aria-label", `Choose ${lab.toLowerCase()} on a calendar`);
  btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
  inp.parentNode.insertBefore(wrap, inp); wrap.append(txt, btn, inp);
  inp.classList.add("dp-real"); inp.tabIndex = -1; inp.setAttribute("aria-hidden", "true");
  txt.disabled = btn.disabled = inp.disabled; txt.readOnly = inp.readOnly;
  const show = () => { if (document.activeElement !== txt) { txt.value = fmt(VALUE.get.call(inp)); txt.removeAttribute("aria-invalid"); } };
  // a form that sets the date in code updates the box too
  Object.defineProperty(inp, "value", { configurable: true, get() { return VALUE.get.call(this); }, set(v) { VALUE.set.call(this, v); show(); } });
  inp.addEventListener("input", show); inp.addEventListener("change", show);
  const ok = (s) => (!valid(inp.min) || s >= inp.min) && (!valid(inp.max) || s <= inp.max);
  const commit = (done) => {
    const s = parseTyped(txt.value, done);
    if (s === "" && !done) return; // emptied while typing: only cleared once they move on
    if (s === null || (s && !ok(s))) { if (done) txt.setAttribute("aria-invalid", "true"); return; }
    txt.removeAttribute("aria-invalid");
    if (s === VALUE.get.call(inp)) return;
    VALUE.set.call(inp, s); inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true }));
  };
  txt.addEventListener("input", (e) => {
    const deleting = /^delete/.test(e.inputType || "");
    if (!deleting && !/[^0-9/]/.test(txt.value) && !/\/.*\//.test(txt.value.slice(0, -1))) {
      const g = txt.value.replace(/\D/g, "").slice(0, 8);
      txt.value = g.length > 4 ? `${g.slice(0, 2)}/${g.slice(2, 4)}/${g.slice(4)}` : g.length >= 2 ? `${g.slice(0, 2)}/${g.slice(2)}` : g;
    }
    e.stopPropagation(); // the form hears the real date box, not every keystroke
    commit(false);
  });
  txt.addEventListener("change", (e) => e.stopPropagation());
  txt.addEventListener("blur", () => { commit(true); if (!txt.hasAttribute("aria-invalid")) show(); });
  txt.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(true); show(); } });
  btn.addEventListener("click", () => pickDate(inp));
  show();
}
function enhanceIn(node) {
  if (node.nodeType !== 1) return;
  if (node.matches("input[type=date]")) enhance(node);
  else if (node.firstElementChild) node.querySelectorAll("input[type=date]").forEach(enhance);
}

const isDate = (t) => t && t.tagName === "INPUT" && t.type === "date" && !t.disabled && !t.readOnly && !t.closest(".dp-native");
let lastTouch = 0;

/** Every date box in the app: typed in one go, or picked on the big calendar. Call once at start-up. */
export function startDatePicker() {
  if (typeof document === "undefined") return;
  enhanceIn(document.body);
  new MutationObserver((list) => { for (const r of list) r.addedNodes.forEach(enhanceIn); }).observe(document.body, { childList: true, subtree: true });
  // a date box reached any other way (its label tapped): the big calendar, never the phone's small one
  document.addEventListener("touchend", (e) => { if (!isDate(e.target)) return; e.preventDefault(); lastTouch = Date.now(); e.target.blur(); pickDate(e.target); }, { capture: true, passive: false });
  document.addEventListener("mousedown", (e) => { if (isDate(e.target)) e.preventDefault(); }, true);
  document.addEventListener("click", (e) => { if (!isDate(e.target)) return; e.preventDefault(); if (Date.now() - lastTouch < 800) return; pickDate(e.target); }, true);
  document.addEventListener("keydown", (e) => { if (!isDate(e.target)) return; if (e.key === " " || e.key === "Enter" || (e.altKey && e.key === "ArrowDown")) { e.preventDefault(); pickDate(e.target); } }, true);
}
