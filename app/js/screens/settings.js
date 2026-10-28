// Account and settings (design/01 §11).
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { auth } from "../core/auth.js";
import { session } from "../services/session.js";
import { getAppearance } from "../services/appearance.js";
import { confirmSheet } from "../ui/sheet.js";
import { backendName } from "../core/store.js";
import { go } from "../core/router.js";
import { avatar } from "../ui/format.js";
import { VERSION, BUILD } from "../config.js";
import { makeScreen, largeTitle, groupLabel, farmTabs } from "./common.js";
import { syncLabel } from "./sync-sheet.js";
import { getUnits, getTax } from "./settings-page.js";
import { notifyRowValue } from "./notify-settings.js";
import { beforeSignOut } from "../services/notify.js";

const row = (href, label, value = "", danger = false) => html`<a class="row no-lead${danger ? " destructive" : ""}" href="${href}"><span class="main"><span class="primary">${label}</span></span>${value ? html`<span class="ink-2 t-callout">${value}</span>` : ""}<span class="chev">${raw(icon("chevron"))}</span></a>`;

export default async function settings() {
  const u = auth.user; const farm = session.farm(); const ap = getAppearance();
  const units = getUnits(); const tax = getTax();
  const body = el(html`<div>${largeTitle("Account and settings")}
    <div class="list"><a class="row" href="#/settings/profile">${avatar(u.displayName || u.email)}<span class="main"><span class="primary">${u.displayName || "Your name"}</span><span class="secondary">${u.email} · ${u.emailVerified ? "Confirmed" : "Not confirmed yet"}</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div>
    <div class="section">${groupLabel("Farm")}<div class="list">
      ${row("#/settings/farm", "Farm details", farm?.farmName || "")}
      ${row("#/settings/ledgers", "Ledgers", String(session.sectorLedgers().length))}
      ${row("#/settings/units", "Units", `${units.area === "ha" ? "Hectares" : "Acres"}, kg, °C`)}
      ${row("#/settings/tax", "Tax year and VAT", `${tax.yearStart === "jan" ? "Jan–Dec" : "Apr–Apr"} · ${tax.vat === "none" ? "Not VAT registered" : tax.vat === "monthly" ? "Monthly" : "Quarterly"}`)}
    </div></div>
    <div class="section">${groupLabel("This phone")}<div class="list">
      ${row("#/settings/appearance", "Appearance", { auto: "Automatic", light: "Light", dark: "Dark" }[ap.theme])}
      ${row("#/settings/notifications", "Notifications", notifyRowValue())}
      ${row("#/settings/storage", "Storage on phone", syncLabel().label)}
    </div></div>
    <div class="section">${groupLabel("Your data")}<div class="list">
      ${row("#/settings/data", "Download my data")}
      ${row("#/legal/privacy", "Privacy notice")}
      ${row("#/legal/terms", "Terms of use")}
      ${row("#/settings/delete", "Delete account", "", true)}
    </div></div>
    <div class="section"><button type="button" class="btn secondary" data-out>Sign out</button></div>
    <p class="version">Farm Ledger ${VERSION} · build ${BUILD}${backendName() === "memory" ? " · demo mode" : ""}</p>
  </div>`);
  body.querySelector("[data-out]").onclick = async () => {
    const s = syncLabel();
    const unsynced = s.state === "offline" || s.state === "syncing" || s.state === "waiting";
    const ok = await confirmSheet({ title: "Sign out of Farm Ledger on this phone?", body: unsynced ? "Some of your entries haven't synced yet. If you sign out now they may be lost. Wait until you have a signal." : "Your records stay safe online. You'll need your email and password to get back in.", confirm: "Sign out", danger: unsynced });
    if (!ok) return;
    await beforeSignOut().catch(() => {}); // this phone stops getting their notifications
    await auth.signOut(); session.reset(); go("/welcome", { replace: true });
  };
  return makeScreen({ body, title: "Account and settings", area: "farm", tab: "more", depth: 1, chrome: { tabs: farmTabs(), tab: "more" } });
}
