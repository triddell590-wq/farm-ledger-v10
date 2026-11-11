// Check your email (design/01 §4). Verification doesn't block setup; it gates invites and export.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { openSheet } from "../ui/sheet.js";
import { textField, wireForm, guardButton, fieldError, EMAIL_RE } from "../ui/form.js";
import { auth } from "../core/auth.js";
import { go } from "../core/router.js";
import { toast } from "../ui/toast.js";
import { RESEND_WAIT_S } from "../config.js";
import { makeScreen } from "./common.js";

let lastSent = Date.now();
export function resendWaitLeft() { return Math.max(0, RESEND_WAIT_S - Math.floor((Date.now() - lastSent) / 1000)); }
export async function resendVerification() { await auth.sendVerification(); lastSent = Date.now(); }

export default async function verify() {
  const u = auth.user;
  const body = el(html`<div style="padding-top:calc(48px + var(--safe-t))">
    <span class="tile lg info">${raw(icon("mail", { size: 40, stroke: 1.75 }))}</span>
    <h1 class="t-title" style="margin-top:20px">Check your email</h1>
    <p class="t-body" style="margin-top:8px">We've sent a link to <b class="em"></b>. Tap it to confirm it's you.</p>
    <p class="t-body ink-2" style="margin-top:12px">You can start setting up your farm now — we'll remind you to confirm.</p>
    <div class="btn-col" style="margin-top:32px">
      <a class="btn" href="#/onboard/1" data-act="setup">Set up my farm</a>
      <button type="button" class="btn secondary" data-act="resend">Send the email again</button>
      <button type="button" class="text-btn" data-act="change" style="align-self:center">Wrong email? Change it</button>
    </div>
  </div>`);
  body.querySelector(".em").textContent = u ? u.email : "";
  const resend = body.querySelector("[data-act=resend]");
  const tick = () => { const left = resendWaitLeft(); resend.disabled = left > 0; resend.textContent = left > 0 ? `Send again in 0:${String(left).padStart(2, "0")}` : "Send the email again"; };
  tick(); const timer = setInterval(tick, 1000);
  resend.onclick = async () => {
    if (!navigator.onLine) { toast("Sending needs a signal. Try again when you have one bar."); return; }
    try { await resendVerification(); toast("Sent. Check your spam folder too."); } catch (e) { toast(e.friendly || "Couldn't send. Try again."); } tick();
  };
  body.querySelector("[data-act=change]").onclick = () => {
    const b = el(html`<div><p class="sheet-title-sm">Change your email</p><div class="form-group">${textField({ name: "email", label: "New email", type: "email", inputmode: "email", autofocus: true })}</div><div class="err"></div><button type="button" class="btn" style="margin-top:16px">Change email</button></div>`);
    const f = wireForm(b); const btn = b.querySelector(".btn");
    const miss = () => (EMAIL_RE.test(f.values().email || "") ? null : "Add the right email to continue");
    const upd = () => guardButton(btn, "Change email", miss); f.onChange(upd); upd();
    const sh = openSheet({ size: "small", body: b, label: "Change email", auto: true });
    btn.onclick = async () => {
      try { await auth.changeEmail(f.values().email); lastSent = Date.now(); body.querySelector(".em").textContent = f.values().email; sh.close(true, { force: true }); toast("Sent a link to your new email."); }
      catch (e) { b.querySelector(".err").replaceChildren(el(fieldError(e.friendly))); }
    };
  };
  return makeScreen({ body, title: "Check your email", area: "auth", chrome: { rail: false }, destroy: () => clearInterval(timer) });
}
