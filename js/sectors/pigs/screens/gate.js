// Gate visitor log (design/13 §8.2 — signature, Research B BI.2):
//   gate       — today's visitors, warnings for recent pig contact, the log, Print gate sign
//   gate/sign  — the A4 sign: farm name, "Pig unit — sign in before you enter", QR, ASF line
//   gate/form  — the visitor's own form (big, plain, offline; queues until signal)
// GAP (asked of Coordinator): a sign-in-free visitor form needs a public, create-only Firestore
// path and a platform route outside sign-in. Until then the QR opens this form on any phone
// signed in to the ledger (e.g. a phone or tablet kept at the gate).
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { wireForm, guardButton } from "../../../ui/form.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { loadPigs } from "../data.js";
import { d2, dm, pill } from "../ui.js";
import { qrSvg } from "../model/qr.js";
import { visitorFields, visitorMissing, CONTACT_WORD } from "../flows/visitor.js";
import { addVisitor } from "../actions.js";
import { nowHM } from "../flows/common.js";

export const gateUrl = (lid) => `${location.origin}${location.pathname}#/l/${lid}/gate/form`;
const ASF = "No pork products on this farm. No kitchen waste may be fed to pigs.";

export default async function gate(ctx) {
  const mode = ctx.match.groups.mode;
  if (mode === "form") return formScreen(ctx);
  if (mode === "sign") return signScreen(ctx);
  return liveScreen(ctx, { title: "Visitors", tab: "paperwork", paint: (snap) => {
    const lid = snap.lid; const list = snap.data.visitors.slice().sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));
    const today = list.filter((v) => v.date === snap.today); const near = today.filter((v) => v.lastPigContact === "today" || v.lastPigContact === "1-2");
    const byDay = new Map(); for (const v of list.slice(0, 80)) byDay.set(v.date, [...(byDay.get(v.date) || []), v]);
    const can = canWrite(snap.role, "visitors");
    return html`<div>${backLink(`#/l/${lid}/${snap.s.breeding && !snap.s.smallHerd ? "pigs-paperwork" : "paperwork"}`, "Paperwork")}${largeTitle("Visitors", `Gate log · ${today.length} today`)}
      ${near.map((v) => html`<div class="warn-card" style="margin-bottom:8px">${raw(icon("alert"))}<span>${v.name}${v.company ? ` (${v.company})` : ""} was with other pigs ${v.lastPigContact === "today" ? "today" : "in the last 2 days"}. Your rule: ${snap.s.downtimeH} h pig-free before entering.</span></div>`)}
      <div class="pg-acts"><a class="btn secondary" href="#/l/${lid}/gate/sign">${raw(icon("print"))}Print gate sign</a>${can ? html`<button type="button" class="btn secondary" data-flow="visitor">${raw(icon("plus"))}Add a visitor</button>` : ""}</div>
      ${can ? html`<a class="btn" style="margin-top:4px" href="#/l/${lid}/gate/form">Open the visitor form on this phone</a>` : ""}
      ${!list.length ? emptyState({ sector: "pigs", title: "No visitors signed in", body: "Print the gate sign so visitors can sign in on their own phone.", action: "Print gate sign", href: `#/l/${lid}/gate/sign` }) : ""}
      ${[...byDay].map(([d, vs]) => html`<div class="section">${groupLabel(d === snap.today ? "Today" : dm(d), vs.length)}<div class="list">${vs.map((v) => html`<div class="row no-lead"><span class="main"><span class="primary">${v.time ? v.time + " · " : ""}${v.name}${v.company ? ` · ${v.company}` : ""}</span><span class="secondary">${[v.reason, `last with pigs: ${CONTACT_WORD[v.lastPigContact] || "—"}`, v.vehicle, v.source === "qr" ? "signed in at the gate" : null].filter(Boolean).join(" · ")}</span></span>${v.lastPigContact === "today" || v.lastPigContact === "1-2" ? pill("due", "Pig contact") : ""}</div>`)}</div></div>`)}
      <a class="btn secondary" style="margin-top:12px" href="#/l/${lid}/reg/visitors">Visitor register — print or CSV</a></div>`;
  } });
}

async function signScreen(ctx) {
  const snap = await loadPigs(ctx.ledger); const url = gateUrl(snap.lid);
  const body = el(html`<div class="pg-page push">${backLink(`#/l/${snap.lid}/gate`, "Visitors")}${largeTitle("Gate sign", "Print it A4 and put it at the farm entrance")}
    <div class="pg-sign" data-sign><p style="font-weight:700;margin:0">${snap.ledger.farmName || snap.ledger.name}</p><h2>Pig unit — sign in before you enter</h2>
      ${raw(qrSvg(url, { cls: "qr" }))}<p>Scan with your phone camera and fill in the form. Takes a minute.</p><p style="font-weight:700">${ASF}</p><p style="font-size:14px">Visitor records are kept for the farm's assurance scheme and covered by the farm's privacy notice.</p></div>
    <button type="button" class="btn" style="margin-top:16px" data-print>${raw(icon("print"))}Print or PDF</button>
    <p class="hint">The code opens the visitor form for this pig unit. Until sign-in-free forms are switched on, it works on phones signed in to this ledger — keep a phone or tablet at the gate.</p></div>`);
  body.querySelector("[data-print]").onclick = () => { const w = document.createElement("div"); w.className = "print-view print-float"; w.append(body.querySelector("[data-sign]").cloneNode(true)); document.body.append(w); document.body.classList.add("printing"); const done = () => { w.remove(); document.body.classList.remove("printing"); }; addEventListener("afterprint", done, { once: true }); setTimeout(() => { try { print(); } catch (e) { done(); } setTimeout(() => { if (w.isConnected && !matchMedia("print").matches) done(); }, 1500); }, 50); };
  return { el: body, title: "Gate sign", depth: 2, tab: "paperwork" };
}

async function formScreen(ctx) {
  const snap = await loadPigs(ctx.ledger);
  const body = el(html`<div class="pg-page push pg-gate"></div>`);
  const draw = () => {
    const form = el(html`<form novalidate><div class="pg-gate-head"><span class="tile" data-sector="pigs">${raw(icon("gate"))}</span><div><p>${snap.ledger.farmName || snap.ledger.name}</p><h1>Pig unit — sign in before you enter</h1></div></div>
      ${visitorFields()}<p class="pg-note">${ASF}</p><button type="button" class="btn" data-go>Sign in</button>
      <p class="pg-note" style="font-size:12px">Your details are kept by the farm for its assurance records and covered by the farm's privacy notice.</p></form>`);
    const f = wireForm(form); const btn = form.querySelector("[data-go]");
    const refresh = () => guardButton(btn, "Sign in", () => visitorMissing(f.values())); f.onChange(refresh); form.addEventListener("click", () => setTimeout(refresh, 0)); refresh();
    btn.onclick = () => { const v = f.values(); if (visitorMissing(v)) return; const t = nowHM(); addVisitor(snap, { ...v, date: snap.today, time: t }, "qr");
      body.replaceChildren(el(html`<div class="done"><span class="tile ok lg">${raw(icon("check", { size: 40 }))}</span><b>Thanks, ${v.name.split(" ")[0]}.</b><p>You're signed in at ${t}.</p>${navigator.onLine ? "" : html`<p class="pg-note">No signal — it's saved on this phone and sends when there's a bar.</p>`}<button type="button" class="btn secondary" data-next style="margin-top:20px">Next visitor</button></div>`));
      body.querySelector("[data-next]").onclick = draw; };
    body.replaceChildren(form);
  };
  draw();
  return { el: body, title: "Visitor sign-in", depth: 2, tab: "paperwork" };
}
export { d2 };
