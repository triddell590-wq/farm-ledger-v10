// Account and settings → Notifications (design/01 §11 "Reminders": daily summary time, push).
// Per phone: turn on (permission is only asked on the button tap), what to hear about, which
// ledgers, the summary time and quiet hours. Explains plainly when the phone can't do push
// (iPhone not on the Home Screen, blocked, or push not set up yet).
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { session } from "../services/session.js";
import { checkRow, chipGroup, selectField, wireForm } from "../ui/form.js";
import { toast } from "../ui/toast.js";
import { META } from "../sectors/meta.js";
import { makeScreen, largeTitle, backLink, groupLabel, farmTabs } from "./common.js";
import { support, localState, turnOn, turnOff, savePrefs, pushConfigured, timeZone } from "../services/notify.js";
import { KINDS, KIND_LABELS, normPrefs } from "../services/notify-core.js";

const half = (from, to) => { const o = []; for (let m = from * 60; m <= to * 60; m += 30) o.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`); return o; };
const SUMMARY_TIMES = [...half(5, 10), "12:00", "17:00", "18:00", "19:00", "20:00", "21:00"];
const ALL_TIMES = half(0, 23.5);
const timeLabel = (hm) => { const [h, m] = hm.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const opts = (list, cur) => [...new Set([...list, cur])].sort().map((t) => ({ value: t, label: timeLabel(t) }));

export function notifyRowValue() {
  const st = localState(); if (!st.on) return "Off";
  return st.prefs.summary ? `On, ${st.prefs.summaryTime}` : "On";
}

function stateCard(sup, st) {
  const card = (ic, body, tone = "") => html`<div class="info-card${tone}" data-notify-state>${raw(icon(ic))}<span>${body}</span></div>`;
  if (sup.state === "ios-install") return card("info", html`<b>On iPhone, notifications only work from the Home Screen app.</b><br>1. In Safari, tap the Share button (the square with an arrow pointing up).<br>2. Tap <b>Add to Home Screen</b>, then <b>Add</b>.<br>3. Open Farm Ledger from the new icon, come back here and tap <b>Turn on</b>. Then tap <b>Allow</b>.<br><span class="ink-2">Needs iOS 16.4 or newer. Until then, everything due still shows on the bell and the Today screen.</span>`);
  if (sup.state === "unsupported") return card("info", "This browser can't show notifications. Everything due still shows on the bell and the Today screen each time you open the app.");
  if (sup.state === "denied") return card("alert", html`<b>Notifications are blocked for Farm Ledger on this phone.</b> To allow them, open your phone's Settings → Notifications → Farm Ledger${sup.ios ? "" : " (or the browser's site settings for this page)"}, switch them on, then come back here.`, " warn");
  if (!st.on) return card("bell", "Get a short summary each morning and a note the moment a legal job goes late — even when the app is closed. You choose what and when.");
  return "";
}

export default async function notifySettings() {
  const body = el(html`<div>${backLink("#/settings", "Settings")}${largeTitle("Notifications", "This phone")}<div data-out></div></div>`);
  const out = body.querySelector("[data-out]");
  const paint = () => {
    const sup = support(); const st = localState(); const p = st.prefs;
    const ledgers = session.ledgers.filter((l) => l.type !== "farm");
    const chosen = p.ledgers === "all" ? ledgers.map((l) => l.id) : p.ledgers;
    const can = sup.state === "default" || sup.state === "granted";
    out.replaceChildren(el(html`<div>
      ${stateCard(sup, st)}
      ${st.on && !pushConfigured() ? html`<div class="info-card" data-push-missing style="margin-top:12px">${raw(icon("info"))}<span><b>Push to phones isn't set up yet</b> for Farm Ledger, so nothing arrives when the app is closed. When you open the app, late legal jobs still pop up, and the bell and Today screen show everything due.</span></div>` : ""}
      ${st.on ? html`<div class="list" style="margin-top:16px"><div class="row no-lead"><span class="main"><span class="primary">On for this phone</span><span class="secondary">${pushConfigured() ? "Notifications arrive even when the app is closed." : "Shown when you open the app."}</span></span><span class="pill ok">${raw(icon("check"))}On</span></div></div>` : ""}
      <div class="section" data-main>${st.on
        ? html`<button type="button" class="btn secondary" data-test>${raw(icon("bell"))}Send a test notification</button><button type="button" class="btn secondary" data-off style="margin-top:12px">Turn off on this phone</button>`
        : can ? html`<button type="button" class="btn" data-on>${raw(icon("bell"))}Turn on notifications</button><p class="hint">Your phone will ask “Allow notifications?” — tap <b>Allow</b>.</p>` : ""}</div>
      ${st.on ? html`<div data-prefs>
        <div class="section">${groupLabel("Morning summary")}<div class="form-group">${checkRow("summary", "Send me a summary each day", p.summary, "What's late and due across your ledgers, in one notification.")}${selectField({ name: "summaryTime", label: "At", value: p.summaryTime, options: opts(SUMMARY_TIMES, p.summaryTime) })}</div></div>
        <div class="section">${groupLabel("Straight away")}<div class="form-group">${checkRow("late", "When a legal job goes late", p.late, "Once per job. For example: NIFAIS not notified in time, an alarm test overdue.")}</div></div>
        <div class="section">${groupLabel("What to tell me about")}<div class="form-group">${KINDS.map((k) => checkRow(`kind_${k}`, KIND_LABELS[k], p.kinds[k]))}</div></div>
        ${ledgers.length > 1 ? html`<div class="section">${groupLabel("Which ledgers")}${chipGroup("ledgers", ledgers.map((l) => ({ value: l.id, label: l.name || META[l.type]?.short || l.type, sector: l.type })), chosen)}</div>` : ""}
        <div class="section">${groupLabel("Quiet hours")}<div class="form-group">${checkRow("quiet", "No notifications at night", p.quiet.on, "Late-job notes wait until quiet hours end. Your morning summary still comes at the time you chose.")}${selectField({ name: "quietStart", label: "From", value: p.quiet.start, options: opts(ALL_TIMES, p.quiet.start) })}${selectField({ name: "quietEnd", label: "Until", value: p.quiet.end, options: opts(ALL_TIMES, p.quiet.end) })}</div></div>
        <p class="hint">Times are for ${timeZone().replace("_", " ")}. Workers and Vet / Advisers never see money amounts in notifications. Each phone has its own settings.</p>
      </div>` : ""}
    </div>`));
    const on = out.querySelector("[data-on]");
    if (on) on.onclick = async () => {
      on.disabled = true;
      try {
        const r = await turnOn();
        if (r.ok) toast(r.push ? "Notifications are on for this phone" : "Notifications are on. Push to phones isn't set up yet.");
        else if (r.state === "denied") toast("Notifications weren't allowed");
      } catch (e) { toast(navigator.onLine ? "Couldn't turn them on. Try again." : "Turning notifications on needs a signal."); }
      paint();
    };
    const off = out.querySelector("[data-off]");
    if (off) off.onclick = async () => { off.disabled = true; await turnOff().catch(() => {}); toast("Notifications are off for this phone"); paint(); };
    const t = out.querySelector("[data-test]");
    if (t) t.onclick = async () => {
      try {
        const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
        const o = { body: "This is how Farm Ledger notifications look on this phone.", tag: "fl-test", data: { url: "#/notifications" }, icon: "icons/icon-192.png" };
        if (reg) await reg.showNotification("Farm Ledger test", o); else new Notification("Farm Ledger test", o);
        toast("Test sent");
      } catch (e) { toast("This phone didn't show it. Check its notification settings."); }
    };
    const prefs = out.querySelector("[data-prefs]");
    if (prefs) {
      const f = wireForm(prefs); let timer = null;
      f.onChange(() => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const v = f.values(); const kinds = {}; KINDS.forEach((k) => (kinds[k] = v[`kind_${k}`]));
          const ls = v.ledgers === undefined ? "all" : v.ledgers.length === ledgers.length ? "all" : v.ledgers;
          await savePrefs(normPrefs({ summary: v.summary, summaryTime: v.summaryTime, late: v.late, kinds, ledgers: ls, quiet: { on: v.quiet, start: v.quietStart, end: v.quietEnd } })).catch(() => {});
          toast("Saved");
        }, 350);
      });
    }
  };
  paint();
  return makeScreen({ body, title: "Notifications", area: "farm", tab: "more", depth: 2, chrome: { tabs: farmTabs(), tab: "more" } });
}
