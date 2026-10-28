// Overview → Today (design/01 §7.1): merged alerts and tasks from every ledger the person can
// see (sector tag on each), one card per ledger with that sector's own headline, money this month.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { auth } from "../core/auth.js";
import { session } from "../services/session.js";
import { sectorModule } from "../sectors/ui.js";
import { sectorName } from "../sectors/registry.js";
import { META } from "../sectors/meta.js";
import { todaysTasks } from "../services/tasks.js";
import { moneyFor, periodRange } from "../services/money.js";
import { canRead, canWrite } from "../core/policy.js";
import { taskList } from "../ui/tasks.js";
import { money, longDate } from "../ui/format.js";
import { openSheet } from "../ui/sheet.js";
import { largeTitle, groupLabel, sectorTile, emptyState } from "./common.js";
import { offlineHours } from "./sync-sheet.js";
import { resendVerification } from "./verify.js";
import { toast } from "../ui/toast.js";

const ORDER = { late: 0, due: 1, info: 2 };

export function alertCard(a, showTag = true) {
  return html`<div class="alert ${a.level}" role="${a.level === "late" ? "alert" : "status"}">
    <span class="a-icon">${raw(icon(a.level === "info" ? "info" : a.level === "due" ? "clock" : "alert"))}</span>
    <div style="flex:1;min-width:0"><div class="a-title">${a.title}</div>
      <div class="a-body">${showTag && a.ledger ? html`${META[a.ledger.type]?.short} · ` : ""}${a.body || ""}</div>
      ${a.href ? html`<div class="a-actions"><a class="text-btn" href="${a.href}">${a.action || "Open"}</a></div>` : ""}</div></div>`;
}

export default async function today(farm, params) {
  const ledgers = farm ? farm.ledgers : [];
  const all = farm ? [farm.space, ...farm.ledgers].filter(Boolean) : [];
  const moneyRoles = all.filter((l) => canRead(l.role, "finance"));
  const u = auth.user;
  const body = el(html`<div>
    ${largeTitle(farm?.farmName || "Your farm", longDate())}
    <div data-notes class="stack"></div>
    <div class="section" data-alerts></div>
    <div class="section" data-tasks></div>
    <div class="section"><div data-ledgers></div></div>
    <div class="section" data-money></div>
  </div>`);
  // notes: welcome tips, unconfirmed email, long offline
  const notes = body.querySelector("[data-notes]");
  if (params.query.welcome === "1" || !ledgers.some((l) => l.settings && l.settings.seenTips)) {
    if (params.query.welcome === "1") notes.append(el(html`<div class="info-card">${raw(icon("info"))}<span><b>Your farm is set up.</b> Tip: tap a ledger at the top to jump straight in.</span></div>`));
  }
  if (u && !u.emailVerified) {
    const n = el(html`<div class="info-card">${raw(icon("mail"))}<span>Confirm your email so you can invite people and get your records back if you lose your phone. <button type="button" class="text-btn" data-resend>Send the link again</button></span></div>`);
    n.querySelector("[data-resend]").onclick = async () => { try { await resendVerification(); toast("Sent. Check your spam folder too."); } catch (e) { toast(e.friendly || "Couldn't send"); } };
    notes.append(n);
  }
  if (offlineHours() > 24) notes.append(el(html`<div class="info-card">${raw(icon("cloudOff"))}<span>You've been offline since yesterday. Your work is safe on this phone.</span></div>`));
  if (!notes.children.length) notes.remove();

  // alerts from each ledger's own module
  const mods = await Promise.all(ledgers.map((l) => sectorModule(l.type)));
  const alerts = (await Promise.all(ledgers.map((l, i) => mods[i].alerts(l, l.role).catch(() => []).then((as) => as.map((a) => ({ ...a, ledger: l })))))).flat()
    .filter((a) => !(ledgers.find((l) => l === a.ledger)?.role === "accountant") || a.money)
    .sort((a, b) => ORDER[a.level] - ORDER[b.level] || String(a.date || "").localeCompare(String(b.date || "")));
  const ab = body.querySelector("[data-alerts]");
  if (alerts.length) {
    ab.append(el(html`<div>${alerts.slice(0, 3).map((a) => alertCard(a))}</div>`));
    if (alerts.length > 3) { const more = el(html`<button type="button" class="text-btn" style="margin-top:4px">${alerts.length - 3} more ${alerts.length - 3 === 1 ? "thing needs" : "things need"} attention ›</button>`); more.onclick = () => openSheet({ title: "Needs attention", body: el(html`<div>${alerts.map((a) => alertCard(a))}</div>`), cancelText: "Done" }); ab.append(more); }
  } else ab.remove();

  // tasks
  const tb = body.querySelector("[data-tasks]");
  const paintTasks = async () => {
    const tasks = await todaysTasks(ledgers);
    // jobs a ledger works out from its records (e.g. Beef: tag a calf, notify NIFAIS)
    const gen = await Promise.all(ledgers.map((l, i) => (mods[i].tasks ? mods[i].tasks(l).catch(() => []) : [])));
    gen.flat().forEach((t) => tasks.push(t));
    tasks.sort((a, b) => (a.done - b.done) || String(a.due).localeCompare(String(b.due)));
    // at most 8 per ledger then "See all N in Beef"
    const per = new Map(); const shown = [];
    for (const t of tasks) { const k = t.ledger.id; per.set(k, (per.get(k) || 0) + 1); if (t.done || per.get(k) <= 8) shown.push(t); }
    tb.replaceChildren(el(html`<div>${groupLabel("To do today", tasks.filter((t) => !t.done).length || "")}</div>`));
    if (shown.length) tb.append(taskList(shown, { showTag: true, max: 99, onChange: paintTasks }));
    else tb.append(el(html`<div class="card pad t-callout ink-2">Nothing due today. Jobs you add in any ledger show here.</div>`));
    for (const [lid, n] of per) if (n > 8) { const l = ledgers.find((x) => x.id === lid); tb.append(el(html`<a class="text-btn" href="#/l/${lid}">See all ${n} in ${META[l.type].short} ›</a>`)); }
  };
  await paintTasks();

  // ledger cards
  const lb = body.querySelector("[data-ledgers]");
  if (ledgers.length) {
    const heads = await Promise.all(ledgers.map((l, i) => mods[i].headline(l).catch(() => ({}))));
    lb.append(el(html`<div>${groupLabel("Your ledgers")}<div class="list">${ledgers.map((l, i) => html`<a class="row" href="#/l/${l.id}" data-sector="${l.type}" data-ledger-card="${l.id}">
      ${sectorTile(l.type)}<span class="main"><span class="primary" style="font-weight:700">${l.name || sectorName(l.type)}</span><span class="secondary">${l.role === "accountant" ? "Money only" : heads[i].line || ""}</span></span>
      ${heads[i].value && l.role !== "accountant" ? html`<span class="value">${heads[i].value} <span class="t-callout ink-2" style="font-weight:500">${heads[i].unit}</span></span>` : ""}<span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>`));
  } else lb.append(el(emptyState({ iconName: "farm", title: "No ledgers on this farm yet", body: "Add a ledger for each kind of farming you do.", action: "Add a ledger", href: "#/add-ledger" })));

  // money this month
  const mb = body.querySelector("[data-money]");
  if (moneyRoles.length) {
    const m = await moneyFor(moneyRoles, periodRange("month"));
    const max = Math.max(1, m.totalIn, m.totalOut);
    const bar = (kind) => m.byLedger.map((x) => html`<span data-sector="${x.ledger.type === "farm" ? "" : x.ledger.type}" style="width:${((kind === "in" ? x.in : x.out) / max) * 100}%;${x.ledger.type === "farm" ? "background:var(--ink-3)" : ""}"></span>`);
    mb.append(el(html`<div>${groupLabel("Money this month")}<a class="card pad" href="#/farm/money" style="display:block;color:inherit">
      <div class="money-sum"><span class="ink-2">In</span><span class="v">${money(m.totalIn)}</span></div><div class="bar-track" style="margin:6px 0 12px">${bar("in")}</div>
      <div class="money-sum"><span class="ink-2">Out</span><span class="v">${money(m.totalOut)}</span></div><div class="bar-track" style="margin-top:6px">${bar("out")}</div>
      <p class="text-btn" style="padding:0;margin-top:8px">See money ›</p></a></div>`));
  } else mb.remove();

  const writable = ledgers.filter((l) => canWrite(l.role, "tasks"));
  const fab = writable.length ? async () => {
    let target = writable[0];
    if (writable.length > 1) {
      const b = el(html`<div><p class="sheet-title-sm">Add to which ledger?</p><div class="list">${writable.map((l) => html`<button type="button" class="row" data-l="${l.id}" data-sector="${l.type}">${sectorTile(l.type)}<span class="main"><span class="primary">${l.name}</span></span></button>`)}</div></div>`);
      const sh = openSheet({ size: "small", body: b, label: "Add to which ledger?", auto: true });
      target = await new Promise((r) => { b.addEventListener("click", (e) => { const x = e.target.closest("[data-l]"); if (x) { sh.close(undefined, { force: true }); r(writable.find((l) => l.id === x.dataset.l)); } }); sh.done.then(() => r(null)); });
      if (!target) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    const mod = await sectorModule(target.type);
    return mod.fab && mod.fab({ ledger: target, role: target.role });
  } : null;
  return { el: body, title: farm?.farmName || "Your farm", fab };
}
