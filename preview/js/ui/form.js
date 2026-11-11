// Grouped form building blocks (design/00 §6.6, §6.7, §6.11). Templates are plain html``;
// wireForm(root) adds behaviour and reads values. Required fields have no asterisks: the Save
// button stays disabled and says what is missing ("Add tag number to save").
import { html } from "../core/html.js";
import { icon } from "./icons.js";
import { reduceMotion, vibrate } from "./dom.js";
import { raw } from "../core/html.js";

let uid = 0;
const nid = (n) => `f-${n}-${++uid}`;

export function textField({ name, label, value = "", type = "text", placeholder = "", inputmode, autocomplete, optional, maxlength, autofocus }) {
  const id = nid(name);
  const isPw = type === "password";
  return html`<div class="field">
    <label for="${id}">${label}${optional ? html` <span class="opt">(optional)</span>` : ""}</label>
    <input id="${id}" name="${name}" type="${type}" value="${value ?? ""}" placeholder="${placeholder}" ${raw(inputmode ? `inputmode="${inputmode}"` : "")} ${raw(autocomplete ? `autocomplete="${autocomplete}"` : "")} ${raw(maxlength ? `maxlength="${maxlength}"` : "")} ${raw(autofocus ? "autofocus" : "")} ${raw(isPw ? 'autocapitalize="off" spellcheck="false"' : "")}>
    ${isPw ? html`<button type="button" class="eye" data-eye aria-label="Show password">${raw(icon("eye"))}</button>` : ""}
  </div>`;
}
export function selectField({ name, label, value, options }) {
  const id = nid(name);
  return html`<div class="field"><label for="${id}">${label}</label><select id="${id}" name="${name}">${options.map((o) => html`<option value="${o.value}" ${raw(String(o.value) === String(value) ? "selected" : "")}>${o.label}</option>`)}</select></div>`;
}
/** options: [{value,label,help,disabled,extra(html)}] */
export function radioGroup(name, options, value) {
  return html`<div class="form-group" role="radiogroup" data-radio="${name}">${options.map((o) => html`
    <button type="button" class="radio-row" role="radio" data-value="${o.value}" aria-checked="${String(o.value) === String(value)}" ${raw(o.disabled ? 'aria-disabled="true" disabled' : "")}>
      <span class="radio"></span><span class="main" style="flex:1"><span class="t-body">${o.label}</span>${o.help ? html`<span class="help">${o.help}</span>` : ""}</span>${o.extra || ""}
    </button>`)}</div>`;
}
export function checkRow(name, label, checked = false, help = "") {
  return html`<button type="button" class="check-row" role="checkbox" data-check="${name}" aria-checked="${!!checked}"><span class="checkbox">${raw(icon("check"))}</span><span class="main" style="flex:1"><span class="t-body">${label}</span>${help ? html`<span class="help">${help}</span>` : ""}</span></button>`;
}
/** Chip group. multi=true: values is an array. */
export function chipGroup(name, options, values = [], { multi = true } = {}) {
  const sel = new Set([].concat(values).map(String));
  return html`<div class="chips" data-chips="${name}" data-multi="${multi}" role="${multi ? "group" : "radiogroup"}">${options.map((o) => html`
    <button type="button" class="chip" role="${multi ? "checkbox" : "radio"}" data-value="${o.value}" aria-checked="${sel.has(String(o.value))}" ${raw(o.sector ? `data-sector="${o.sector}"` : "")}>
      <span class="chk">${raw(icon("check", { size: 18 }))}</span>${o.label}</button>`)}</div>`;
}
export function segmented(name, options, value) {
  return html`<div class="segmented" role="radiogroup" data-seg="${name}"><span class="thumb"></span>${options.map((o) => html`<button type="button" role="radio" data-value="${o.value}" aria-checked="${String(o.value) === String(value)}">${o.label}</button>`)}</div>`;
}
export function stepper(name, value = 0, { min = 0, max = 1e9, step = 1, label = "" } = {}) {
  return html`<div class="stepper" data-stepper="${name}" data-min="${min}" data-max="${max}" data-step="${step}">
    <button type="button" class="step-btn" data-dir="-1" aria-label="Less${label ? " " + label : ""}">−</button>
    <input name="${name}" inputmode="numeric" value="${value}" aria-label="${label || name}">
    <button type="button" class="step-btn" data-dir="1" aria-label="More${label ? " " + label : ""}">+</button></div>`;
}
export function stepperField(name, label, value, opts = {}) {
  return html`<div class="field stepper-field"><span class="label">${label}</span><span class="spacer"></span>${stepper(name, value, { ...opts, label })}</div>`;
}
export function fieldError(msg, action) {
  return html`<div class="field-error" role="alert">${raw(icon("alert"))}<span>${msg} ${action || ""}</span></div>`;
}

function placeThumb(seg) {
  const on = seg.querySelector("[aria-checked=true]"); const th = seg.querySelector(".thumb");
  if (!on || !th) return; th.style.width = on.offsetWidth + "px"; th.style.transform = `translateX(${on.offsetLeft - 3}px)`;
}

/** Wire behaviour inside root. Returns { values(), set(name, v), onChange(cb) }. */
export function wireForm(root) {
  const subs = new Set();
  const changed = (name) => subs.forEach((cb) => cb(name));
  root.addEventListener("input", (e) => changed(e.target.name));
  root.addEventListener("change", (e) => changed(e.target.name));
  root.addEventListener("click", (e) => {
    const eye = e.target.closest("[data-eye]");
    if (eye) { const inp = eye.parentElement.querySelector("input"); const show = inp.type === "password"; inp.type = show ? "text" : "password"; eye.innerHTML = icon(show ? "eyeOff" : "eye"); eye.setAttribute("aria-label", show ? "Hide password" : "Show password"); return; }
    const r = e.target.closest("[data-radio] [role=radio]");
    if (r && !r.disabled) { r.parentElement.querySelectorAll("[role=radio]").forEach((x) => x.setAttribute("aria-checked", String(x === r))); changed(r.parentElement.dataset.radio); return; }
    const c = e.target.closest("[data-check]");
    if (c) { c.setAttribute("aria-checked", String(c.getAttribute("aria-checked") !== "true")); changed(c.dataset.check); return; }
    const ch = e.target.closest("[data-chips] .chip");
    if (ch && ch.getAttribute("aria-disabled") !== "true") {
      const g = ch.parentElement;
      if (g.dataset.multi === "true") ch.setAttribute("aria-checked", String(ch.getAttribute("aria-checked") !== "true"));
      else g.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-checked", String(x === ch)));
      changed(g.dataset.chips); return;
    }
    const sb = e.target.closest("[data-seg] [role=radio]");
    if (sb) { const g = sb.parentElement; g.querySelectorAll("[role=radio]").forEach((x) => x.setAttribute("aria-checked", String(x === sb))); placeThumb(g); changed(g.dataset.seg); }
  });
  // segmented thumbs: place once laid out (the form may not be in the page yet)
  root.querySelectorAll("[data-seg]").forEach((g) => {
    if (window.ResizeObserver) new ResizeObserver(() => placeThumb(g)).observe(g);
    else requestAnimationFrame(() => placeThumb(g));
  });
  // steppers: press-and-hold repeat (400ms, then 80ms, 40ms after 1s)
  root.querySelectorAll("[data-stepper]").forEach((st) => {
    const inp = st.querySelector("input"); const min = +st.dataset.min, max = +st.dataset.max, step = +st.dataset.step;
    const bump = (dir) => {
      const v = (parseInt(inp.value, 10) || 0) + dir * step;
      if (v < min || v > max) { if (!reduceMotion()) { st.classList.remove("shake"); void st.offsetWidth; st.classList.add("shake"); } return false; }
      inp.value = v; vibrate(8);
      if (!reduceMotion()) inp.animate([{ transform: `translateY(${dir > 0 ? 6 : -6}px)`, opacity: 0.4 }, { transform: "none", opacity: 1 }], { duration: 120, easing: "cubic-bezier(.34,1.36,.64,1)" });
      changed(inp.name); return true;
    };
    st.querySelectorAll(".step-btn").forEach((b) => {
      let t1 = null, t2 = null, started = 0;
      const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; };
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault(); const dir = +b.dataset.dir; bump(dir); started = Date.now();
        t1 = setTimeout(() => { let every = 80; const tick = () => { if (!bump(dir)) return stop(); if (every === 80 && Date.now() - started > 1000) { every = 40; clearInterval(t2); t2 = setInterval(tick, every); } }; t2 = setInterval(tick, every); }, 400);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, stop));
      b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bump(+b.dataset.dir); } });
    });
  });
  return {
    values() {
      const o = {};
      root.querySelectorAll("input[name],select[name],textarea[name]").forEach((i) => { o[i.name] = i.closest("[data-stepper]") ? (parseInt(i.value, 10) || 0) : i.value.trim(); });
      root.querySelectorAll("[data-radio]").forEach((g) => { o[g.dataset.radio] = g.querySelector("[aria-checked=true]")?.dataset.value ?? null; });
      root.querySelectorAll("[data-check]").forEach((c) => { o[c.dataset.check] = c.getAttribute("aria-checked") === "true"; });
      root.querySelectorAll("[data-chips]").forEach((g) => {
        const on = [...g.querySelectorAll(".chip[aria-checked=true]")].map((c) => c.dataset.value);
        o[g.dataset.chips] = g.dataset.multi === "true" ? on : on[0] ?? null;
      });
      root.querySelectorAll("[data-seg]").forEach((g) => { o[g.dataset.seg] = g.querySelector("[aria-checked=true]")?.dataset.value ?? null; });
      return o;
    },
    onChange(cb) { subs.add(cb); return () => subs.delete(cb); },
  };
}

/** Keep a Save button honest: disabled with a reason, or enabled with its normal label. */
export function guardButton(btn, label, missing) {
  const m = missing();
  btn.disabled = !!m; btn.setAttribute("aria-disabled", String(!!m));
  btn.textContent = m || label;
}
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
