// Lambing shed mode (design/11 §4): full screen, ALWAYS dark, no keyboard ever, every target
// ≥ 72px (lamb toggles 64px), works in airplane mode, keeps the phone awake. One save writes one
// `lambings` record; lambs are counts with sex and alive/dead until they're tagged.
import { html, raw } from "../../core/html.js";
import { el, vibrate, reduceMotion } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { chipGroup } from "../../ui/form.js";
import { softDelete } from "../../services/records.js";
import { canWrite } from "../../core/policy.js";
import { daysBetween } from "../../core/dates.js";
import { timeHM } from "../../ui/format.js";
import { liveSnap } from "./data.js";
import { entrySheet, chipsField, opt } from "./ui.js";
import { tonight, nextFreePen, pensInUse, DEATH_CAUSES, EWE_PROBLEMS, lambDate } from "./model/lambing.js";
import { raddleCycles } from "./model/year.js";
import { activeMobs } from "./model/mobs.js";
import { swatch } from "./model/settings.js";
import * as A from "./actions.js";

const LAST = (lid) => `fl10-sheep-shed-${lid}`;
const loadLast = (lid) => { try { return JSON.parse(localStorage.getItem(LAST(lid)) || "{}"); } catch (e) { return {}; } };
const saveLast = (lid, v) => { try { localStorage.setItem(LAST(lid), JSON.stringify(v)); } catch (e) { /* blocked */ } };
const blankLamb = () => ({ alive: true, sex: null, deathCause: null });

export default async function shed(ctx) {
  const { ledger } = ctx;
  const root = el(html`<div class="shed" role="dialog" aria-modal="true" aria-label="Lambing shed" data-sector="sheep"></div>`);
  const holder = el(html`<div class="sheep-page"><p class="t-callout ink-2" style="padding:24px 4px">Lambing shed is open.</p></div>`);
  let snap = null; let wake = null; let clockT = null;
  const last = loadLast(ledger.id);
  const st = { eweTag: "", mobId: last.mobId || null, raddle: last.raddle || null, n: 1, lambs: [blankLamb()], help: "none", pen: null, problems: [], fosteredOff: 0, fosteredOn: 0, pad: false, pickMob: false, more: false };
  const write = canWrite(ledger.role, "lambings");

  const paint = () => {
    if (!snap) return;
    const t = tonight(snap.data, new Date(), snap.s.shedNightFrom);
    const mobs = activeMobs(snap.data).filter((m) => ["ewes", "ewesWithLambs", "eweLambs", "hoggets"].includes(m.class));
    const mob = mobs.find((m) => m.id === st.mobId) || null;
    const used = new Set(pensInUse(snap.data, new Date()).map((p) => p.pen));
    if (st.pen == null || used.has(st.pen)) st.pen = nextFreePen(snap.data, new Date(), +snap.s.pens || 12);
    const colours = raddleCycles(snap.cy, snap.s, snap.cy.ramsOut).cycles.map((c) => c.colour);
    const alive = st.lambs.filter((l) => l.alive).length;
    const saveLabel = !write ? "You can't add lambings" : !mob && !st.eweTag ? "Pick the ewe or mob" : st.lambs.some((l) => !l.alive && !l.deathCause) ? "Pick why the lamb died" : `Save — ${st.lambs.length} lamb${st.lambs.length === 1 ? "" : "s"}${alive < st.lambs.length ? ` (${st.lambs.length - alive} dead)` : ""}`;
    const ok = write && (mob || st.eweTag) && !st.lambs.some((l) => !l.alive && !l.deathCause);
    root.innerHTML = el(html`<div style="display:contents">
      <div class="top"><button type="button" class="text-btn" data-done>Done</button><h2>Lambing shed</h2><span class="clock" data-clock>${timeHM(new Date())}</span></div>
      <p class="tonight">Tonight: <b>${t.ewes}</b> ewes · <b>${t.born}</b> lambs · <b>${t.dead}</b> dead</p>
      <div class="sbody">
        <div class="eweBox"><p class="lbl" style="margin-top:0">Ewe</p>
          <div class="two"><button type="button" class="t72" data-a="scan" aria-pressed="${!!st.eweTag}">${raw(icon("scan"))} ${st.eweTag ? `Tag …${st.eweTag}` : "Scan tag"}</button><button type="button" class="t72" data-a="mob" aria-pressed="${!st.eweTag && !!mob}">No tag / mob ewe</button></div>
          <p class="mobline">${mob ? mob.name : "No mob chosen"}${st.raddle ? html` · <span class="sw" style="background:${swatch(st.raddle)}"></span>${st.raddle} raddle` : ""}</p>
          ${st.pad ? html`<div data-pad><p class="lbl">Last 5 digits of her tag (or read the EID)</p><p class="tonight" style="font-size:28px;text-align:center"><b>${st.padVal || "_____"}</b></p><div class="grid3">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => html`<button type="button" class="t72" data-k="${k}">${k}</button>`)}<button type="button" class="t72" data-k="del">⌫</button><button type="button" class="t72" data-k="0">0</button><button type="button" class="t72" data-k="ok">OK</button></div><input data-eid aria-label="EID reader input" style="position:absolute;opacity:0;width:1px;height:1px" inputmode="none"></div>` : ""}
          ${st.pickMob ? html`<div class="two" style="margin-top:8px">${mobs.map((m) => html`<button type="button" class="t72" data-mob="${m.id}" aria-pressed="${m.id === st.mobId}">${m.name}</button>`)}</div>
            <p class="lbl">Raddle colour</p><div class="two">${colours.map((c) => html`<button type="button" class="t72" data-raddle="${c}" aria-pressed="${c === st.raddle}"><span class="sw" style="background:${swatch(c)}"></span>${c}</button>`)}</div>` : ""}
        </div>
        <p class="lbl">Lambs born</p>
        <div class="count4">${[1, 2, 3, 4].map((n) => html`<button type="button" class="t72" data-n="${n}" aria-pressed="${st.n === n}">${n === 4 ? "4+" : n}</button>`)}</div>
        ${st.lambs.map((l, i) => html`<div class="lrow"><b>Lamb ${i + 1}</b><span class="pair"><button type="button" class="tg" data-l="${i}" data-f="alive" aria-pressed="${l.alive}">Alive</button><button type="button" class="tg dead" data-l="${i}" data-f="dead" aria-pressed="${!l.alive}">Dead</button></span><span class="pair"><button type="button" class="tg" data-l="${i}" data-f="M" aria-pressed="${l.sex === "M"}">Ram</button><button type="button" class="tg" data-l="${i}" data-f="F" aria-pressed="${l.sex === "F"}">Ewe</button></span></div>
          ${!l.alive ? html`<div class="chips" style="margin:6px 0 0 62px">${DEATH_CAUSES.map((c) => html`<button type="button" class="chip" data-l="${i}" data-cause="${c}" aria-checked="${l.deathCause === c}">${c}</button>`)}</div>` : ""}`)}
        <p class="lbl">Help</p><div class="grid3">${[["none", "None"], ["assisted", "Assisted"], ["vet", "Vet"]].map(([k, l]) => html`<button type="button" class="t72" data-help="${k}" aria-pressed="${st.help === k}">${l}</button>`)}</div>
        <p class="lbl">Pen</p><div class="penrow">${Array.from({ length: +snap.s.pens || 12 }, (_, i) => i + 1).map((p) => html`<button type="button" data-pen="${p}" aria-pressed="${st.pen === p}" ${raw(used.has(p) ? "disabled" : "")} aria-label="Pen ${p}${used.has(p) ? " (in use)" : ""}">${p}</button>`)}<button type="button" data-pen="0" aria-pressed="${st.pen === 0}" style="width:96px;font-size:15px">No pen</button></div>
        <details ${raw(st.more ? "open" : "")} data-more><summary>More ▾ <span class="ink-2" style="font-weight:500;margin-left:8px">fostered, ewe problem, aborted</span></summary>
          <p class="lbl">Ewe problem (adds her to the cull list and the watch list)</p><div class="two">${EWE_PROBLEMS.map((p) => html`<button type="button" class="t72" data-prob="${p}" aria-pressed="${st.problems.includes(p)}">${p}</button>`)}</div>
          <p class="lbl">Fostered</p><div class="two"><button type="button" class="t72" data-fo="off">Fostered off: ${st.fosteredOff}</button><button type="button" class="t72" data-fo="on">Fostered on: ${st.fosteredOn}</button></div>
          <p class="lbl">Ewe aborted</p><button type="button" class="t72" data-abort style="width:100%">Ewe aborted — save</button>
        </details>
      </div>
      <div class="save"><button type="button" class="btn" data-save ${raw(ok ? "" : "disabled")}>${saveLabel}</button></div></div>`).innerHTML;
    if (st.pad) setTimeout(() => root.querySelector("[data-eid]")?.focus({ preventScroll: true }), 30);
  };

  const reset = () => { Object.assign(st, { eweTag: "", n: 1, lambs: [blankLamb()], help: "none", pen: null, problems: [], fosteredOff: 0, fosteredOn: 0, pad: false, pickMob: false, more: false, padVal: "" }); };
  const doSave = (aborted = false) => {
    const mob = snap.data.mobs.find((m) => m.id === st.mobId);
    const ewe = st.eweTag ? snap.data.sheep.find((x) => String(x.tag || "").replace(/\s+/g, "").endsWith(st.eweTag) || String(x.eid || "").endsWith(st.eweTag)) : null;
    const lambs = aborted ? [] : st.lambs.map((l, i) => ({ alive: l.alive, sex: l.sex || undefined, deathCause: l.alive ? undefined : l.deathCause, fosteredTo: i >= st.lambs.length - st.fosteredOff ? "another ewe" : undefined })).concat(Array.from({ length: st.fosteredOn }, () => ({ alive: true, fosteredFrom: "another ewe" })));
    const id = A.lambing(snap.lid, { eweId: ewe?.id, eweTag: ewe?.tag || (st.eweTag ? `…${st.eweTag}` : undefined), mobId: mob?.id || ewe?.mobId, mobName: mob?.name, raddle: st.raddle || undefined, datetime: new Date().toISOString(), lambs, help: st.help, pen: aborted || !st.pen ? undefined : st.pen, problems: st.problems, aborted });
    if (ewe) for (const p of st.problems) A.flagCull(snap.lid, ewe, p);
    if (ewe && aborted) A.flagCull(snap.lid, ewe, "Aborted");
    saveLast(snap.lid, { mobId: st.mobId, raddle: st.raddle });
    vibrate(20);
    const n = lambs.filter((l) => !l.fosteredFrom).length;
    if (!reduceMotion()) { const fly = el(html`<div class="fly">${aborted ? "Abortion saved" : `Saved — ${n} lamb${n === 1 ? "" : "s"}`}</div>`); root.append(fly); fly.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: `translateY(-${innerHeight - 220}px) scale(.6)`, opacity: 0 }], { duration: 520, easing: "cubic-bezier(.22,1,.36,1)" }).onfinish = () => fly.remove(); }
    toast(aborted ? "Ewe aborted — saved" : `Lambing saved: ${n} lamb${n === 1 ? "" : "s"}`, { action: "Undo", duration: 6000, onAction: () => softDelete(snap.lid, "lambings", id) });
    reset(); paint(); root.querySelector(".sbody").scrollTop = 0;
  };
  root.addEventListener("click", (e) => {
    const t = e.target.closest("button,summary"); if (!t || !snap) return; const d = t.dataset;
    if (d.done !== undefined) { history.length > 1 ? history.back() : (location.hash = `#/l/${ledger.id}/year/lambing`); return; }
    if (t.tagName === "SUMMARY") { st.more = !st.more; return; }
    vibrate(6);
    if (d.a === "scan") { st.pad = !st.pad; st.pickMob = false; st.padVal = ""; }
    else if (d.a === "mob") { st.pickMob = !st.pickMob; st.pad = false; st.eweTag = ""; }
    else if (d.k) { if (d.k === "del") st.padVal = (st.padVal || "").slice(0, -1); else if (d.k === "ok") { if (st.padVal) { st.eweTag = st.padVal; const ew = snap.data.sheep.find((x) => String(x.tag || "").replace(/\s+/g, "").endsWith(st.padVal)); if (ew?.mobId) st.mobId = ew.mobId; } st.pad = false; } else if ((st.padVal || "").length < 5) st.padVal = (st.padVal || "") + d.k; }
    else if (d.mob) { st.mobId = d.mob; }
    else if (d.raddle) { st.raddle = d.raddle; st.pickMob = false; }
    else if (d.n) { st.n = +d.n; while (st.lambs.length < st.n) st.lambs.push(blankLamb()); st.lambs.length = st.n; }
    else if (d.cause) { st.lambs[+d.l].deathCause = d.cause; }
    else if (d.f) { const l = st.lambs[+d.l]; if (d.f === "alive") { l.alive = true; l.deathCause = null; } else if (d.f === "dead") l.alive = false; else l.sex = l.sex === d.f ? null : d.f; }
    else if (d.help) st.help = d.help;
    else if (d.pen) st.pen = +d.pen;
    else if (d.prob) st.problems = st.problems.includes(d.prob) ? st.problems.filter((x) => x !== d.prob) : [...st.problems, d.prob];
    else if (d.fo) { if (d.fo === "off") st.fosteredOff = (st.fosteredOff + 1) % (st.lambs.filter((l) => l.alive).length + 1); else st.fosteredOn = (st.fosteredOn + 1) % 4; }
    else if (d.abort !== undefined) { if (st.mobId || st.eweTag) doSave(true); else toast("Pick the ewe or mob first"); return; }
    else if (d.save !== undefined) { doSave(false); return; }
    paint();
  });
  // EID readers type the number then Enter, like a keyboard
  root.addEventListener("keydown", (e) => { const i = e.target.closest?.("[data-eid]"); if (!i || e.key !== "Enter") return; const v = i.value.replace(/\D/g, ""); if (v) { st.eweTag = v.slice(-5); const ew = snap.data.sheep.find((x) => String(x.eid || "").endsWith(v.slice(-8)) || String(x.tag || "").replace(/\s+/g, "").endsWith(v.slice(-5))); if (ew?.mobId) st.mobId = ew.mobId; st.pad = false; paint(); } });

  const { first, stop } = liveSnap(ledger, (s) => { const before = !snap; snap = s; if (before || !root.contains(document.activeElement) || document.activeElement === root) paint(); else { const tn = root.querySelector(".tonight"); if (tn) { const t = tonight(s.data, new Date(), s.s.shedNightFrom); tn.innerHTML = `Tonight: <b>${t.ewes}</b> ewes · <b>${t.born}</b> lambs · <b>${t.dead}</b> dead`; } } });
  await first;
  return {
    el: holder, title: "Lambing shed", tab: "year", depth: 1,
    mounted() {
      document.body.append(root); document.documentElement.classList.add("shed-open");
      try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then((w) => (wake = w)).catch(() => {}); } catch (e) { /* not supported */ }
      clockT = setInterval(() => { const c = root.querySelector("[data-clock]"); if (c) c.textContent = timeHM(new Date()); }, 20000);
      try { if (!localStorage.getItem("fl10-shed-tip")) { localStorage.setItem("fl10-shed-tip", "1"); toast("Tip: add this screen to your home screen from the browser menu for one-tap night checks.", { duration: 6000 }); } } catch (e) { /* blocked */ }
    },
    destroy() { stop(); clearInterval(clockT); root.remove(); document.documentElement.classList.remove("shed-open"); try { wake && wake.release(); } catch (e) { /* gone */ } },
  };
}

/** Edit a lambing from the lambing book (anyone for 7 days, then owner/manager). */
export function editLambingSheet(snap, l) {
  const body = el(html`<form novalidate>
    ${chipsField("Help", chipGroup("help", opt([["none", "None"], ["assisted", "Assisted"], ["vet", "Vet"]]), l.help || "none", { multi: false }))}
    ${chipsField("Ewe problems", chipGroup("problems", opt(EWE_PROBLEMS), l.problems || []))}
    ${(l.lambs || []).map((x, i) => chipsField(`Lamb ${i + 1}`, chipGroup(`lamb${i}`, opt([["alive", "Alive"], ["dead", "Dead"]]), x.alive ? "alive" : "dead", { multi: false })))}
    <p class="hint">Recorded ${lambDate(l)} by ${l.by || "someone"}. ${daysBetween(lambDate(l), snap.today) > 7 ? "Older than 7 days: only an owner or manager can change it." : "Anyone can correct it for 7 days."}</p></form>`);
  entrySheet({ title: "Edit lambing", body, label: "Save changes", missing: () => null,
    save: (v, sh) => { A.editLambing(snap.lid, l, { help: v.help, problems: v.problems, lambs: (l.lambs || []).map((x, i) => ({ ...x, alive: v[`lamb${i}`] === "alive", deathCause: v[`lamb${i}`] === "alive" ? null : x.deathCause || "Unknown" })) }); sh.close(true, { force: true }); toast("Lambing updated"); } });
}
