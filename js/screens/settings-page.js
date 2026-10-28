// Settings sub-pages (design/01 §11): profile, farm details, appearance, units, tax/VAT,
// reminders, storage on phone, ledgers.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { auth } from "../core/auth.js";
import { session } from "../services/session.js";
import { updateProfile } from "../services/profile.js";
import { renameFarm, updateLedger } from "../services/ledgers.js";
import { syncMyName } from "../services/members.js";
import { getAppearance, setAppearance } from "../services/appearance.js";
import { textField, segmented, radioGroup, checkRow, wireForm, guardButton, fieldError } from "../ui/form.js";
import { canEditLedger, REGIONS, REGION_NAMES, ACTIVE_REGIONS } from "../core/policy.js";
import { toast } from "../ui/toast.js";
import { openReset } from "./auth-sheets.js";
import { openSyncSheet, syncLabel } from "./sync-sheet.js";
import { backendName } from "../core/store.js";
import { META } from "../sectors/meta.js";
import { makeScreen, largeTitle, backLink, groupLabel, farmTabs, sectorTile } from "./common.js";
import { ROLE_DISPLAY } from "./roles.js";

const LS_UNITS = "fl10-units", LS_TAX = "fl10-tax";
const read = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || "{}") }; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* blocked */ } };
export const getUnits = () => ({ ...read(LS_UNITS, { area: "acres" }), ...(session.profile?.prefs?.units ? { area: session.profile.prefs.units === "hectares" ? "ha" : "acres" } : {}) });
export const getTax = () => read(LS_TAX, { yearStart: "apr", vat: "quarterly" });

const TITLES = { profile: "Your details", farm: "Farm details", appearance: "Appearance", units: "Units", tax: "Tax year and VAT", reminders: "Reminders", storage: "Storage on phone", ledgers: "Ledgers" };

export default async function settingsPage({ params }) {
  const page = params.page;
  const body = el(html`<div>${backLink("#/settings", "Settings")}${largeTitle(TITLES[page])}<div data-out></div></div>`);
  const out = body.querySelector("[data-out]");
  await PAGES[page](out);
  return makeScreen({ body, title: TITLES[page], area: "farm", tab: "more", depth: 2, chrome: { tabs: farmTabs(), tab: "more" } });
}

const saveBar = (label = "Save") => el(html`<div class="section"><button type="button" class="btn">${label}</button></div>`);

const PAGES = {
  async profile(out) {
    const u = auth.user;
    out.append(el(html`<div><div class="form-group">${textField({ name: "name", label: "Your name", value: u.displayName || "", autocomplete: "name" })}<div class="field"><span class="label">Email</span><span class="spacer"></span><span class="ink-2">${u.email}</span></div></div>
      <p class="hint">${u.emailVerified ? "Your email is confirmed." : "Your email isn't confirmed yet — check your inbox for our link."}</p></div>`));
    const f = wireForm(out); const bar = saveBar(); out.append(bar); const btn = bar.querySelector(".btn");
    const miss = () => (f.values().name ? null : "Add your name to save");
    f.onChange(() => guardButton(btn, "Save", miss)); guardButton(btn, "Save", miss);
    btn.onclick = async () => {
      const name = f.values().name;
      try { await auth.updateName(name); updateProfile({ displayName: name }).catch(() => {}); syncMyName(session.ledgers.map((l) => l.id), name).catch(() => {}); await session.load(true); toast("Saved"); }
      catch (e) { toast(e.friendly || "Couldn't save"); }
    };
    const pw = el(html`<div class="section"><div class="list"><button type="button" class="row no-lead"><span class="main"><span class="primary">Change password</span><span class="secondary">We'll email you a link</span></span><span class="chev">${raw(icon("chevron"))}</span></button></div></div>`);
    pw.querySelector("button").onclick = () => openReset(u.email); out.append(pw);
  },
  async farm(out) {
    const farm = session.farm(); const space = farm?.space;
    const can = space && canEditLedger(space.role); const s = space?.settings || {};
    out.append(el(html`<div><div class="form-group">${textField({ name: "farmName", label: "Farm name", value: farm?.farmName || "" })}${textField({ name: "keeperName", label: "Your name on records", value: s.keeperName || auth.user.displayName || "" })}${textField({ name: "businessId", label: "Farm business ID", value: s.businessId || "", optional: true, inputmode: "numeric", maxlength: 6 })}${textField({ name: "postcode", label: "Postcode", value: s.postcode || "", optional: true })}</div>
      <h2 class="group-label" style="margin-top:28px">Where is the farm?</h2>${radioGroup("region", REGIONS.map((r) => ({ value: r, label: REGION_NAMES[r], disabled: !ACTIVE_REGIONS.includes(r), extra: ACTIVE_REGIONS.includes(r) ? "" : html`<span class="pill neutral coming">Coming 2027</span>` })), space?.region || "NI")}
      ${can ? "" : html`<p class="hint">Only the farm's owner or a manager can change these.</p>`}</div>`));
    if (!can) { out.querySelectorAll("input,button").forEach((i) => (i.disabled = true)); return; }
    const f = wireForm(out); const bar = saveBar(); out.append(bar); const btn = bar.querySelector(".btn");
    const miss = () => (f.values().farmName ? null : "Add your farm name to save");
    f.onChange(() => guardButton(btn, "Save", miss)); guardButton(btn, "Save", miss);
    btn.onclick = async () => {
      const v = f.values();
      try {
        if (v.farmName !== farm.farmName) await renameFarm(farm.farmId, v.farmName, session.ledgers);
        await updateLedger(space.id, { settings: { ...s, keeperName: v.keeperName, businessId: v.businessId, postcode: v.postcode } });
        await session.load(true); toast("Farm details saved");
      } catch (e) { out.append(el(fieldError(navigator.onLine ? "Couldn't save. Try again." : "Saved on this phone; it will sync when you have a signal."))); }
    };
  },
  async appearance(out) {
    const a = getAppearance();
    out.append(el(html`<div>${segmented("theme", [{ value: "auto", label: "Automatic" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }], a.theme)}
      <p class="hint">Automatic follows your phone. Dark is easier on the eyes at night lambing or calving.</p>
      <div class="form-group" style="margin-top:20px">${checkRow("hiVis", "Bigger text and stronger colours", a.hiVis, "For glare and older eyes.")}${checkRow("reduceMotion", "Reduce motion", a.reduceMotion, "Screens fade instead of sliding.")}</div></div>`));
    const f = wireForm(out); f.onChange(() => { const v = f.values(); setAppearance({ theme: v.theme, hiVis: v.hiVis, reduceMotion: v.reduceMotion }); });
  },
  async units(out) {
    const u = getUnits();
    out.append(el(html`<div><h2 class="group-label">Land</h2>${radioGroup("area", [{ value: "acres", label: "Acres", help: "What most NI farmers say. Official reports still show hectares." }, { value: "ha", label: "Hectares" }], u.area)}
      <p class="hint">Weights are in kg, temperatures in °C, volumes in litres.</p></div>`));
    const f = wireForm(out); f.onChange(() => { const area = f.values().area; write(LS_UNITS, { area }); updateProfile({ prefs: { ...(session.profile?.prefs || {}), units: area === "ha" ? "hectares" : "acres" } }).catch(() => {}); session.setProfileLocal({ prefs: { ...(session.profile?.prefs || {}), units: area === "ha" ? "hectares" : "acres" } }); toast("Saved"); });
  },
  async tax(out) {
    const t = getTax();
    out.append(el(html`<div><h2 class="group-label">Tax year</h2>${radioGroup("yearStart", [{ value: "apr", label: "6 April to 5 April", help: "The usual UK tax year." }, { value: "jan", label: "January to December" }], t.yearStart)}
      <h2 class="group-label" style="margin-top:28px">VAT</h2>${radioGroup("vat", [{ value: "quarterly", label: "Quarterly returns" }, { value: "monthly", label: "Monthly returns" }, { value: "none", label: "Not VAT registered" }], t.vat)}
      <p class="hint">Used for the money reports you send your accountant.</p></div>`));
    const f = wireForm(out); f.onChange(() => { write(LS_TAX, f.values()); toast("Saved"); });
  },
  async reminders(out) {
    out.append(el(html`<div class="info-card">${raw(icon("bell"))}<span>Reminders now live under Notifications: a morning summary, late legal jobs and what to hear about. <a class="text-btn" href="#/settings/notifications">Open Notifications ›</a></span></div>`));
  },
  async storage(out) {
    const s = syncLabel();
    out.append(el(html`<div><div class="list"><div class="row no-lead"><span class="main"><span class="primary">Sync</span></span><span class="ink-2">${s.label}</span></div><div class="row no-lead" data-size><span class="main"><span class="primary">Space used on this phone</span></span><span class="ink-2">Working it out…</span></div></div>
      <p class="hint">${backendName() === "memory" ? "Demo mode: records are kept in this browser only." : "A full copy of your ledgers is kept on this phone so the app works with no signal."}</p>
      <div class="section"><button type="button" class="btn secondary" data-sync>${raw(icon("refresh"))}Sync details</button></div></div>`));
    out.querySelector("[data-sync]").onclick = () => openSyncSheet();
    try { const e = await navigator.storage.estimate(); out.querySelector("[data-size] .ink-2").textContent = `${Math.max(1, Math.round((e.usage || 0) / 1048576))} MB`; } catch (e) { out.querySelector("[data-size] .ink-2").textContent = "Unknown"; }
  },
  async ledgers(out) {
    const farm = session.farm(); const ls = session.sectorLedgers();
    out.append(el(html`<div><div class="list">${ls.map((l) => html`<a class="row" href="#/l/${l.id}/more/settings" data-sector="${l.type}">${sectorTile(l.type)}<span class="main"><span class="primary">${l.name}</span><span class="secondary">${META[l.type].short} · ${ROLE_DISPLAY[l.role]}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div>
      ${farm?.space && canEditLedger(farm.space.role) ? html`<div class="section"><a class="btn secondary" href="#/add-ledger">${raw(icon("plus"))}Add a ledger</a></div>` : ""}</div>`));
  },
};
export { groupLabel };
