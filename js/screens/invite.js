// Accept an invite (design/01 §9.3). #/invite/<code>. Signed out: create account / sign in, then
// the invite is accepted automatically and the person lands in that ledger's home.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { auth } from "../core/auth.js";
import { session } from "../services/session.js";
import { readInvite, acceptInvite } from "../services/invites.js";
import { go } from "../core/router.js";
import { toast } from "../ui/toast.js";
import { sectorName } from "../sectors/registry.js";
import { makeScreen, sectorTile } from "./common.js";
import { logoSvg } from "./welcome.js";
import { joinBlurb, ROLE_DISPLAY } from "./roles.js";
import { openSignUp, openSignIn } from "./auth-sheets.js";
import { homePath } from "../routes.js";

const ANIMALS = { beef: "cattle", sheep: "sheep", dairy: "cow", pigs: "pig", layers: "flock", broilers: "flock" };

export default async function invite({ params }) {
  const code = params.code;
  const body = el(html`<div style="padding-top:calc(40px + var(--safe-t))"><div>${raw(logoSvg(64))}</div><div data-out style="margin-top:24px"></div></div>`);
  const out = body.querySelector("[data-out]");
  const msg = (title, text, extra = "") => out.replaceChildren(el(html`<div><h1 class="t-title">${title}</h1><p class="t-body ink-2" style="margin-top:8px">${text}</p>${extra}<div class="btn-col" style="margin-top:28px"><a class="btn secondary" href="#/">${auth.user ? "Go to my farm" : "Go to the start"}</a></div></div>`));

  if (!navigator.onLine) { msg("You're offline", "Joining needs a signal. Open this link again when you have one bar."); return screen(); }
  let inv;
  try { inv = await readInvite(code); } catch (e) { inv = { state: "missing" }; }
  const by = (inv.createdByName || "The farmer").split(" ")[0];
  if (inv.state === "missing") msg("This invite doesn't work", "The link may have been cancelled or typed wrong. Ask whoever sent it for a new one.");
  else if (inv.state === "expired") msg("This invite has run out", `Ask ${by} to send a new one.`, html`<a class="btn" style="margin-top:20px" href="https://wa.me/" target="_blank" rel="noopener">${raw(icon("whatsapp"))}Open WhatsApp</a>`);
  else if (inv.state === "used") msg("This invite has already been used", `If that wasn't you, tell ${by}.`);
  else if (auth.user && (inv.state === "mine" || session.ledger(inv.ledgerId))) { setTimeout(() => go(`/l/${inv.ledgerId}`, { replace: true })); }
  else {
    out.replaceChildren(el(html`<div data-sector="${inv.type}">${sectorTile(inv.type, "lg")}
      <h1 class="t-title" style="margin-top:20px">${by} invited you to<br>${inv.farmName ? `${inv.farmName} – ` : ""}${inv.ledgerName || sectorName(inv.type)}</h1>
      <p class="t-body ink-2" style="margin-top:12px">${joinBlurb(inv.role, ANIMALS[inv.type])}</p>
      <div class="btn-col" style="margin-top:28px"><button type="button" class="btn" data-join>Join as ${ROLE_DISPLAY[inv.role]}</button><a class="btn secondary" href="#/">Not now</a></div></div>`));
    if (auth.user) out.querySelector("[data-join]").onclick = () => join(code, false);
    else {
      const j = out.querySelector("[data-join]"); j.textContent = "Create an account to join";
      const notNow = out.querySelector("a.btn.secondary"); const have = el(html`<button type="button" class="btn secondary">I have an account</button>`); notNow.replaceWith(have);
      j.onclick = () => openSignUp({ onDone: () => join(code, true) });
      have.onclick = () => openSignIn({ onDone: () => join(code, true) });
    }
  }
  return screen();

  function screen() { return makeScreen({ body, title: "Invite", area: "auth", chrome: { rail: false }, remember: false }); }
}

async function join(code, fresh) {
  try {
    const inv = await readInvite(code);
    if (inv.state !== "ok" && inv.state !== "mine") { go(`/invite/${code}`, { replace: true }); return; }
    const lid = await acceptInvite(code);
    await session.load(true);
    const l = session.ledger(lid);
    if (l) session.setFarm(l.farmId);
    go(`/l/${lid}`, { replace: true });
    toast(`You've joined ${inv.farmName ? inv.farmName + " – " : ""}${inv.ledgerName}`);
  } catch (e) {
    console.error(e);
    toast(navigator.onLine ? "Couldn't join with that invite. Ask for a new one." : "Joining needs a signal.");
    if (fresh) go(homePath(), { replace: true });
  }
}
