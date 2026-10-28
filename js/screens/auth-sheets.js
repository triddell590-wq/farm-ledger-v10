// Create account, Sign in and Forgot password sheets (design/01 §3, §5).
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { openSheet } from "../ui/sheet.js";
import { icon } from "../ui/icons.js";
import { textField, wireForm, guardButton, fieldError, EMAIL_RE } from "../ui/form.js";
import { auth, MIN_PASSWORD } from "../core/auth.js";
import { updateProfile } from "../services/profile.js";
import { session } from "../services/session.js";
import { TERMS_VERSION, PRIVACY_VERSION } from "../config.js";
import { openLegalSheet } from "./legal.js";
import { toast } from "../ui/toast.js";

const DRAFT = "fl10-signup-draft";

export function openSignUp({ onDone, onSignIn } = {}) {
  let draft = {}; try { draft = JSON.parse(sessionStorage.getItem(DRAFT) || "{}"); } catch (e) { /* none */ }
  const body = el(html`<form novalidate>
    <div class="form-group">
      ${textField({ name: "name", label: "Your name", value: draft.name || "", autocomplete: "name", autofocus: true })}
      ${textField({ name: "email", label: "Email", value: draft.email || "", type: "email", inputmode: "email", autocomplete: "email" })}
      ${textField({ name: "password", label: "Password", type: "password", autocomplete: "new-password" })}
    </div>
    <p class="hint">At least 8 characters. A phrase you'll remember is best, like "three wet ewes".</p>
    <div class="err-slot"></div>
    <div class="form-group" style="margin-top:16px"><div class="check-row" data-agree-row>
      <button type="button" role="checkbox" data-check="agree" aria-checked="false" aria-label="I agree to the Terms and have read the Privacy notice" style="width:48px;height:48px;display:grid;place-items:center;margin:-10px"><span class="checkbox">${raw(icon("check"))}</span></button>
      <span class="t-body">I agree to the <a href="#" data-legal="terms">Terms</a> and have read the <a href="#" data-legal="privacy">Privacy notice</a>.</span></div></div>
  </form>`);
  const btn = el(html`<button type="submit" class="btn">Create account</button>`);
  body.addEventListener("click", (e) => {
    const l = e.target.closest("[data-legal]");
    if (l) { e.preventDefault(); e.stopImmediatePropagation(); openLegalSheet(l.dataset.legal); return; }
    if (e.target.closest("[data-agree-row]") && !e.target.closest("[data-check]")) { e.stopImmediatePropagation(); body.querySelector("[data-check=agree]").click(); }
  });
  const f = wireForm(body);
  const missing = () => {
    const v = f.values();
    if (!v.name) return "Add your name to continue";
    if (!v.email) return "Add your email to continue";
    if (!EMAIL_RE.test(v.email)) return "Check your email address";
    if ((v.password || "").length < MIN_PASSWORD) return "Use at least 8 characters";
    if (!v.agree) return "Tick to agree to continue";
    return null;
  };
  const upd = () => { guardButton(btn, "Create account", missing); const v = f.values(); try { sessionStorage.setItem(DRAFT, JSON.stringify({ name: v.name, email: v.email })); } catch (e) { /* blocked */ } };
  f.onChange(upd); upd();
  const sh = openSheet({ title: "Create account", size: "large", body, footer: btn, isDirty: () => false });
  const submit = async (e) => {
    e && e.preventDefault(); if (missing()) return;
    const v = f.values(); const slot = body.querySelector(".err-slot"); slot.replaceChildren();
    if (!navigator.onLine) { slot.replaceChildren(el(fieldError("Creating an account needs a signal. Your details are kept here — try again when you have one bar."))); return; }
    btn.disabled = true; btn.textContent = "Creating your account…";
    try {
      await auth.signUp(v.email, v.password, v.name);
      const now = new Date();
      await updateProfile({ displayName: v.name, email: v.email, region: null, createdAt: now, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, acceptedAt: now });
      await session.load(true);
      try { sessionStorage.removeItem(DRAFT); } catch (er) { /* blocked */ }
      sh.close(true, { force: true });
      onDone && onDone();
    } catch (err) {
      upd();
      if (err.code === "auth/email-already-in-use") {
        const n = el(fieldError("There's already an account with this email. Sign in instead?", html`<button type="button" data-signin>Sign in</button>`));
        n.querySelector("[data-signin]").onclick = () => { sh.close(undefined, { force: true }); (onSignIn || (() => openSignIn({ onDone, email: v.email })))(v.email); };
        slot.replaceChildren(n);
      } else if (err.code === "auth/weak-password") slot.replaceChildren(el(fieldError("Use at least 8 characters.")));
      else if (err.code === "auth/network-request-failed") slot.replaceChildren(el(fieldError("Creating an account needs a signal. Your details are kept here — try again when you have one bar.")));
      else slot.replaceChildren(el(fieldError(err.friendly || "Something went wrong. Try again.")));
    }
  };
  btn.addEventListener("click", submit); body.addEventListener("submit", submit);
  return sh;
}

export function openSignIn({ onDone, email = "" } = {}) {
  const body = el(html`<form novalidate>
    <div class="form-group">
      ${textField({ name: "email", label: "Email", value: email, type: "email", inputmode: "email", autocomplete: "username", autofocus: !email })}
      ${textField({ name: "password", label: "Password", type: "password", autocomplete: "current-password", autofocus: !!email })}
    </div>
    <div class="err-slot"></div>
    <button type="button" class="text-btn" data-forgot style="margin-top:8px">Forgot password?</button>
  </form>`);
  const btn = el(html`<button type="submit" class="btn">Sign in</button>`);
  const f = wireForm(body);
  const missing = () => { const v = f.values(); if (!v.email) return "Add your email to sign in"; if (!v.password) return "Add your password to sign in"; return null; };
  const upd = () => guardButton(btn, "Sign in", missing); f.onChange(upd); upd();
  const sh = openSheet({ title: "Sign in", size: "large", body, footer: btn });
  body.querySelector("[data-forgot]").onclick = () => openReset(f.values().email);
  const submit = async (e) => {
    e && e.preventDefault(); if (missing()) return;
    const v = f.values(); const slot = body.querySelector(".err-slot"); slot.replaceChildren();
    btn.disabled = true; btn.textContent = "Signing in…";
    try {
      await auth.signIn(v.email, v.password);
      await session.load(true);
      sh.close(true, { force: true });
      onDone && onDone();
    } catch (err) {
      upd();
      const wrong = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"].includes(err.code);
      slot.replaceChildren(el(fieldError(wrong ? "That email and password don't match. Check for a typo, or reset your password." : err.code === "auth/network-request-failed" ? "Signing in needs a signal the first time on this phone. Try again when you have one bar." : err.friendly)));
    }
  };
  btn.addEventListener("click", submit); body.addEventListener("submit", submit);
  return sh;
}

export function openReset(email = "") {
  const body = el(html`<div>
    <p class="sheet-title-sm">Reset your password</p>
    <p class="t-callout ink-2" style="margin:0 4px 16px">We'll email you a link to set a new password.</p>
    <div class="form-group">${textField({ name: "email", label: "Email", value: email, type: "email", inputmode: "email", autocomplete: "email" })}</div>
    <div class="err-slot"></div>
    <button type="button" class="btn" style="margin-top:16px" data-send>Send link</button>
  </div>`);
  const f = wireForm(body); const btn = body.querySelector("[data-send]");
  const missing = () => (EMAIL_RE.test(f.values().email || "") ? null : "Add your email to continue");
  const upd = () => guardButton(btn, "Send link", missing); f.onChange(upd); upd();
  const sh = openSheet({ size: "small", body, label: "Reset password", auto: true });
  btn.onclick = async () => {
    const slot = body.querySelector(".err-slot"); slot.replaceChildren();
    if (!navigator.onLine) { slot.replaceChildren(el(fieldError("Sending the link needs a signal. Try again when you have one bar."))); return; }
    try { await auth.resetPassword(f.values().email); sh.close(true, { force: true }); toast("Link sent. Check your email, and your spam folder."); }
    catch (err) { slot.replaceChildren(el(fieldError(err.friendly))); }
  };
}
