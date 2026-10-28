// Onboarding (design/01 §6): 1 Your farm · 2 What do you farm (type picker) · 3 A few numbers,
// then "Building your ledgers…" and the Overview. The type picker doubles as "Add a ledger".
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { illustration } from "../ui/illustrations.js";
import { textField, radioGroup, chipGroup, stepperField, selectField, wireForm, guardButton } from "../ui/form.js";
import { SECTORS, REGIONS, REGION_NAMES, ACTIVE_REGIONS, canEditLedger } from "../core/policy.js";
import { sectorName } from "../sectors/registry.js";
import { META, SETUP_FIELDS } from "../sectors/meta.js";
import { createFarm, createLedger, updateLedger } from "../services/ledgers.js";
import { updateProfile } from "../services/profile.js";
import { session } from "../services/session.js";
import { auth } from "../core/auth.js";
import { go } from "../core/router.js";
import { toast } from "../ui/toast.js";
import { makeScreen } from "./common.js";

const KEY = "fl10-onboard";
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
const save = (d) => { try { sessionStorage.setItem(KEY, JSON.stringify({ ...load(), ...d })); } catch (e) { /* blocked */ } };
export const clearOnboarding = () => { try { sessionStorage.removeItem(KEY); } catch (e) { /* blocked */ } };

function dots(n) { return html`<div class="dots" aria-label="Step ${n} of 3">${[1, 2, 3].map((i) => html`<i class="${i === n ? "on" : ""}"></i>`)}</div>`; }
function head(n, backHref) {
  return html`<div class="ob-head">${backHref ? html`<a class="back-link" href="${backHref}">${raw(icon("back"))}Back</a>` : html`<span></span>`}${n ? dots(n) : ""}<span style="width:64px"></span></div>`;
}

/** The farm the person can add ledgers to (owner/manager of its farm space), or null. */
function ownFarm() {
  const f = session.farm();
  if (f && f.space && canEditLedger(f.space.role)) return f;
  return session.farms().find((x) => x.space && canEditLedger(x.space.role)) || null;
}

export default async function onboard({ params, path }) {
  const add = path.startsWith("/add-ledger");
  const step = add ? (params.step === "numbers" ? 3 : 2) : +params.step;
  if (add && !ownFarm()) { setTimeout(() => go("/onboard/1", { replace: true })); }
  if (step === 1) return stepFarm();
  if (step === 2) return stepTypes(add);
  return stepNumbers(add);
}

// ---------- 1. About your farm ----------
function stepFarm() {
  const d = load(); const u = auth.user || {};
  const regionOpts = REGIONS.map((r) => ({ value: r, label: REGION_NAMES[r], disabled: !ACTIVE_REGIONS.includes(r), extra: ACTIVE_REGIONS.includes(r) ? "" : html`<span class="pill neutral coming">Coming 2027</span>` }));
  const body = el(html`<div>
    ${head(1, null)}
    <h1 class="t-display">About your farm</h1>
    <p class="ob-lede">This is how your farm shows on records and printouts.</p>
    <form novalidate style="margin-top:24px">
      <div class="form-group">
        ${textField({ name: "farmName", label: "Farm name", value: d.farmName || "", placeholder: "Drumlin Farm", autofocus: true, autocomplete: "organization" })}
        ${textField({ name: "keeperName", label: "Your name on records", value: d.keeperName ?? (u.displayName || ""), autocomplete: "name" })}
      </div>
      <h2 class="group-label" style="margin-top:28px">Where is the farm?</h2>
      ${radioGroup("region", regionOpts, d.region || "NI")}
      <div class="form-group" style="margin-top:16px">
        ${textField({ name: "businessId", label: "Farm business ID", value: d.businessId || "", optional: true, inputmode: "numeric", maxlength: 6 })}
        ${textField({ name: "postcode", label: "Postcode", value: d.postcode || "", optional: true, autocomplete: "postal-code" })}
      </div>
      <p class="hint">You can find your Farm Business ID on DAERA Online Services or your SFP letters.</p>
    </form>
    <div style="margin-top:28px"><button type="button" class="btn" data-next>Continue</button></div>
  </div>`);
  const f = wireForm(body); const btn = body.querySelector("[data-next]");
  const missing = () => (!f.values().farmName ? "Add your farm name to continue" : null);
  const upd = () => { guardButton(btn, "Continue", missing); save(f.values()); };
  f.onChange(upd); upd();
  btn.onclick = () => { if (missing()) return; save(f.values()); go("/onboard/2"); };
  return makeScreen({ body, title: "About your farm", area: "auth", tab: "ob", depth: 1, chrome: { rail: false }, transition: "push", remember: false });
}

// ---------- 2. What do you farm? ----------
function stepTypes(add) {
  const d = load();
  const farm = add ? ownFarm() : null;
  const have = new Set(farm ? farm.ledgers.map((l) => l.type) : []);
  const picked = new Set((d.types || []).filter((t) => SECTORS.includes(t)));
  const body = el(html`<div>
    ${add ? html`<div class="ob-head"><a class="back-link" href="#/farm/more">${raw(icon("back"))}Back</a></div>` : head(2, "#/onboard/1")}
    <h1 class="t-display">${add ? "Add a ledger" : "What do you farm?"}</h1>
    <p class="ob-lede">Pick each one. Each gets its own ledger, built for that kind of farming.</p>
    <div class="type-grid" role="group" aria-label="Farming types" style="margin-top:24px">
      ${SECTORS.map((s) => html`<button type="button" class="type-tile${have.has(s) ? " have" : ""}" role="checkbox" data-sector="${s}" data-type="${s}" aria-checked="${picked.has(s)}"
          aria-label="${sectorName(s)}, ${META[s].desc}${have.has(s) ? ", you have this" : ""}">
        ${raw(illustration(s, 72))}
        <span class="name">${sectorName(s)}</span><span class="desc">${META[s].desc}</span>
        ${have.has(s) ? html`<span class="have-note">You have this · tap to add another</span>` : ""}
        <span class="badge">${raw(icon("check"))}</span></button>`)}
    </div>
    <div style="margin-top:28px"><button type="button" class="btn" data-next></button></div>
  </div>`);
  const btn = body.querySelector("[data-next]");
  const upd = () => {
    const n = picked.size;
    guardButton(btn, add ? `Add ${n} ${n === 1 ? "ledger" : "ledgers"}` : `Continue with ${n} ${n === 1 ? "ledger" : "ledgers"}`, () => (n ? null : "Pick at least one"));
    body.querySelectorAll(".type-tile").forEach((t) => {
      const on = picked.has(t.dataset.type);
      t.setAttribute("aria-checked", String(on));
      t.setAttribute("aria-label", `${sectorName(t.dataset.type)}, ${META[t.dataset.type].desc}${have.has(t.dataset.type) ? ", you have this" : ""}, ${on ? "selected" : "not selected"}`);
    });
    save({ types: [...picked] });
  };
  body.querySelector(".type-grid").addEventListener("click", (e) => {
    const t = e.target.closest(".type-tile"); if (!t) return;
    const s = t.dataset.type; if (picked.has(s)) picked.delete(s); else picked.add(s);
    if (!document.documentElement.classList.contains("reduce-motion")) t.animate([{ transform: "scale(.97)" }, { transform: "none" }], { duration: 240, easing: "cubic-bezier(.34,1.36,.64,1)" });
    upd();
  });
  upd();
  btn.onclick = () => { if (!picked.size) return; go(add ? "/add-ledger/numbers" : "/onboard/3"); };
  return makeScreen({ body, title: add ? "Add a ledger" : "What do you farm?", area: add ? "farm" : "auth", tab: "ob", depth: add ? 1 : 2, chrome: { rail: false }, transition: add ? undefined : "push", remember: false });
}

// ---------- 3. A few numbers ----------
function fieldFor(s, f, val) {
  const name = `${s}.${f.key}`;
  const v = val ?? f.value;
  if (f.kind === "stepper") return stepperField(name, f.label, v ?? 0, { min: f.min ?? 0, step: f.step || 1 });
  if (f.kind === "chips" || f.kind === "chip") return html`<div class="field" style="flex-wrap:wrap;padding-top:10px;padding-bottom:10px"><span class="label">${f.label}</span>${chipGroup(name, f.options.map((o) => ({ value: o, label: o, sector: s })), v || [], { multi: f.kind === "chips" })}</div>`;
  if (f.kind === "month") return selectField({ name, label: f.label, value: v, options: f.options });
  return textField({ name, label: f.label, value: v ?? "", inputmode: f.inputmode, optional: true });
}
function stepNumbers(add) {
  const d = load();
  const types = (d.types || []).filter((t) => SECTORS.includes(t));
  if (!types.length) { setTimeout(() => go(add ? "/add-ledger" : "/onboard/2", { replace: true })); }
  const nums = d.numbers || {};
  const body = el(html`<div>
    ${add ? html`<div class="ob-head"><a class="back-link" href="#/add-ledger">${raw(icon("back"))}Back</a></div>` : head(3, "#/onboard/2")}
    <h1 class="t-display">A few numbers</h1>
    <p class="ob-lede">Rough is fine. They set up your home screens and reminders.</p>
    <form novalidate>
    ${types.map((s) => html`<div data-sector="${s}">
      <h2 class="sector-head"><span class="tile">${raw(icon(s))}</span>${sectorName(s)}</h2>
      <div class="form-group">${SETUP_FIELDS[s].map((f) => fieldFor(s, f, nums[s]?.[f.key]))}</div>
    </div>`)}
    </form>
    <div class="btn-col" style="margin-top:28px">
      <button type="button" class="btn" data-finish>${add ? "Add ledgers" : "Finish setup"}</button>
      ${add ? "" : html`<button type="button" class="text-btn" data-skip style="align-self:center">Skip for now</button>`}
    </div>
  </div>`);
  const f = wireForm(body);
  const collect = () => {
    const v = f.values(); const out = {};
    for (const [k, x] of Object.entries(v)) { const [s, key] = k.split("."); if (!key) continue; (out[s] = out[s] || {})[key] = x; }
    return out;
  };
  f.onChange(() => save({ numbers: collect() }));
  const finish = async (skip) => {
    const numbers = skip ? {} : collect();
    body.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try { await build(types, numbers, add); }
    catch (e) { console.error(e); toast(e.code === "permission-denied" ? "You can't add ledgers to this farm." : "Couldn't set up your ledgers. Try again."); body.querySelectorAll("button").forEach((b) => (b.disabled = false)); }
  };
  body.querySelector("[data-finish]").onclick = () => finish(false);
  const sk = body.querySelector("[data-skip]"); if (sk) sk.onclick = () => finish(true);
  return makeScreen({ body, title: "A few numbers", area: add ? "farm" : "auth", tab: "ob", depth: add ? 2 : 3, chrome: { rail: false }, transition: add ? undefined : "push", remember: false });
}

const clean = (o) => { const r = {}; for (const [k, v] of Object.entries(o || {})) if (v !== "" && v != null && !(Array.isArray(v) && !v.length)) r[k] = v; return r; };

/** Create the farm space (first time) and one ledger per type. Shows the brief "Building" moment. */
async function build(types, numbers, add) {
  const d = load();
  const stage = document.getElementById("stage");
  const moment = el(html`<div class="building screen no-chrome" style="position:fixed;inset:0;z-index:50"><div class="ticks">${types.map((s, i) => html`<span class="tile lg" data-sector="${s}" style="animation-delay:${i * 160}ms">${raw(icon(s, { size: 40, stroke: 1.75 }))}</span>`)}</div><p class="t-headline">Building your ledgers…</p></div>`);
  stage.appendChild(moment);
  const t0 = Date.now();
  let farmId, farmName, region;
  if (add) { const f = ownFarm(); farmId = f.farmId; farmName = f.farmName; region = f.space?.region || "NI"; }
  else {
    farmName = d.farmName; region = d.region || "NI";
    const existing = ownFarm();
    if (existing && existing.farmName === farmName) farmId = existing.farmId;
    else {
      farmId = await createFarm({ farmName, region });
      await updateLedger(farmId, { settings: clean({ businessId: d.businessId, postcode: d.postcode, keeperName: d.keeperName }) });
    }
    await updateProfile({ region, displayName: d.keeperName || auth.user.displayName || "" });
  }
  const sameType = (s) => session.ledgers.filter((l) => l.farmId === farmId && l.type === s).length;
  let firstId = null;
  for (const s of types) {
    const n = sameType(s);
    const id = await createLedger({ type: s, farmId, farmName, region, name: n ? `${sectorName(s)} ${n + 1}` : sectorName(s), settings: clean(numbers[s]) });
    firstId = firstId || id;
  }
  await session.load(true);
  session.setFarm(farmId);
  clearOnboarding();
  const wait = Math.max(0, Math.min(800, types.length * 160 + 300) - (Date.now() - t0));
  await new Promise((r) => setTimeout(r, wait));
  moment.remove();
  if (add && types.length === 1) go(`/l/${firstId}`, { replace: true });
  else go(add ? "/farm/today" : "/farm/today?welcome=1", { replace: true });
}
