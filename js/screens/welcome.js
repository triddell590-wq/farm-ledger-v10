// Welcome (design/01 §2).
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { illustration } from "../ui/illustrations.js";
import { SECTORS } from "../core/policy.js";
import { makeScreen } from "./common.js";
import { openSignUp, openSignIn } from "./auth-sheets.js";
import { go } from "../core/router.js";
import { homePath } from "../routes.js";
import { needsSignal } from "./common.js";

const LOGO = `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#2F5D3A"/><clipPath id="w-hill"><path d="M9 42.5C10.5 31 17 21.5 26 21.5c10.5 0 20 11 29 21z"/></clipPath><g clip-path="url(#w-hill)"><rect width="64" height="64" fill="#ECEFE8"/><path d="M0 29.5h64M0 36.5h64" stroke="#2F5D3A" stroke-width="2.6"/></g><path d="M9 42.5h46M9 48h46" stroke="#E2AE2B" stroke-width="2.6" stroke-linecap="round"/></svg>`;
export const logoSvg = (size = 64) => LOGO.replace(/width="64" height="64"/, `width="${size}" height="${size}"`).replace("w-hill", "w-hill-" + size).replace("url(#w-hill)", `url(#w-hill-${size})`);

export default async function welcome() {
  const strip = SECTORS.map((s) => `<span data-sector="${s}" style="color:var(--ink-2)">${illustration(s, 72).replace(/class="acc"/g, 'class="acc" style="color:var(--accent)"')}</span>`).join("");
  const body = el(html`<div class="welcome">
    <div>${raw(logoSvg(64))}</div>
    <h1>Your farm's records,<br>in your pocket.</h1>
    <p class="lede">Cattle, sheep, dairy, pigs and poultry. Medicines, movements, money and inspections — kept right, even with no signal.</p>
    <div class="strip" aria-hidden="true"><div class="strip-in">${raw(strip + strip)}</div></div>
    <div class="spacer"></div>
    <div class="btn-col">
      <button type="button" class="btn" data-act="signup">Create an account</button>
      <button type="button" class="btn secondary" data-act="signin">I have an account</button>
    </div>
    <div class="offline-note" style="margin-top:12px"></div>
    <p class="foot">Made in Co. Londonderry for Northern Ireland farms.</p>
  </div>`);
  body.querySelector("[data-act=signup]").onclick = () => openSignUp({ onDone: () => go("/verify", { replace: true }) });
  body.querySelector("[data-act=signin]").onclick = () => openSignIn({ onDone: () => go(homePath(), { replace: true }) });
  const note = () => { const n = needsSignal("Signing in"); body.querySelector(".offline-note").innerHTML = n ? `<div class="info-card">You're offline. Sign in needs a signal the first time.</div>` : ""; };
  note(); addEventListener("online", note); addEventListener("offline", note);
  return makeScreen({ body, title: "Welcome", area: "auth", chrome: { rail: false }, destroy: () => { removeEventListener("online", note); removeEventListener("offline", note); } });
}
