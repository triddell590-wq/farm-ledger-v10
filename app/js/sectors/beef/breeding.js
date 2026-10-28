// Beef → Breeding (design/10 §5): [Calving] [Board] [To register] [Heifers], and Fertility.
import { nifaisOnline, usesNifaisRegister } from "./model/region.js";
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { segmented, wireForm } from "../../ui/form.js";
import { toast } from "../../ui/toast.js";
import { canRead, canWrite } from "../../core/policy.js";
import { daysBetween, addDays, shortDate, todayStr } from "../../core/dates.js";
import { listDate, num } from "../../ui/format.js";
import { largeTitle, groupLabel, emptyState, backLink } from "../../screens/common.js";
import { liveSnap } from "./data.js";
import { pill, numTile, tagHtml, animalLabel, sparkBars } from "./ui.js";
import { onFarm, lastWeight, ageText } from "./model/animals.js";
import { breedingFemales, dueInfo, scStatus, SC_WORDS, SC_LEVEL, notSeenBulling, lastCalving, birthsToRegister, replacementHeifers, heiferWindow, HEIFER_WORDS, fertilityKpis, scYearReport } from "./model/breeding.js";
import { schemeYear, schemeYearLabel, scLimitDays, SC_PAYMENT } from "./model/rules.js";
import { breedCode, colourCode, sexCode, tagParts } from "./model/tags.js";
import { updateAnimal } from "./actions.js";

const SEGS = [["calving", "Calving"], ["board", "Board"], ["register", "To register"], ["heifers", "Heifers"]];
const EASE = { 1: "easy", 2: "help", 3: "hard", 4: "vet", 5: "caesar" };

export default async function breeding(ctx) {
  const { ledger } = ctx; const seg = ctx.match?.groups?.seg || "calving";
  if (seg === "fertility") return fertility(ctx);
  const st = { seg, f: ctx.params?.query?.f || "all" };
  const body = el(html`<div class="beef-page"></div>`);
  const { first, stop } = liveSnap(ledger, (snap) => { const y = window.scrollY; body.replaceChildren(render(snap, st, () => body.replaceChildren(render(snap, st, null)))); if (y) window.scrollTo(0, y); });
  await first;
  return { el: body, title: "Breeding", tab: "breeding", depth: ctx.match ? 0 : 0, destroy: stop };
}

function render(snap, st, repaint) {
  const cows = breedingFemales(snap.data, snap.ix, snap.today);
  const calvedSeason = [...snap.ix.calvings.values()].filter((l) => l.some((c) => daysBetween(c.date, snap.today) <= 240)).length;
  const node = el(html`<div>${largeTitle("Breeding", `${num(cows.length)} cows · ${num(calvedSeason)} calved this season`)}
    <div class="seg-wrap">${segmented("seg", SEGS.map(([value, label]) => ({ value, label })), st.seg)}</div>
    <div data-body style="margin-top:16px"></div>
    <div class="section"><div class="list"><a class="row" href="#/l/${snap.lid}/breeding/fertility"><span class="tile">${raw(icon("birth"))}</span><span class="main"><span class="primary">Fertility</span><span class="secondary">Calving interval, spread, born and weaned per 100 cows, SC Scheme year</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div></div></div>`);
  const f = wireForm(node);
  f.onChange((n) => { if (n === "seg") { st.seg = f.values().seg; history.replaceState(history.state, "", `#/l/${snap.lid}/breeding/${st.seg}`); paintBody(); } });
  const paintBody = () => node.querySelector("[data-body]").replaceChildren(({ calving, board, register, heifers })[st.seg](snap, st, paintBody));
  paintBody();
  return node;
}

function calving(snap) {
  const { data, s, ix, today, lid } = snap;
  const fem = breedingFemales(data, ix, today).concat(replacementHeifers(data, ix, today));
  const rows = fem.map((c) => ({ c, d: dueInfo(data, s, ix, c) })).map((x) => ({ ...x, dd: x.d.date || x.d.from })).filter((x) => x.dd && !(lastCalving(ix, x.c) && lastCalving(ix, x.c).date > addDays(x.dd, -200))).sort((a, b) => a.dd.localeCompare(b.dd));
  const over = rows.filter((x) => daysBetween(today, x.d.date || x.d.to || x.dd) < 0);
  const week = rows.filter((x) => !over.includes(x) && daysBetween(today, x.dd) <= 7);
  const month = rows.filter((x) => !over.includes(x) && !week.includes(x) && daysBetween(today, x.dd) <= 30);
  const later = rows.filter((x) => daysBetween(today, x.dd) > 30);
  const calved = []; for (const [damId, l] of ix.calvings) for (const c of l) if (daysBetween(c.date, today) <= 240 && daysBetween(c.date, today) >= 0) calved.push({ dam: ix.byId.get(damId), c });
  calved.sort((a, b) => b.c.date.localeCompare(a.c.date));
  const row = (x) => { const due = x.d.date ? listDate(x.d.date) : `${listDate(x.d.from).slice(4)} – ${listDate(x.d.to).slice(4)}`; const left = daysBetween(today, x.d.date || x.d.to || x.dd);
    const lc = lastCalving(ix, x.c); const hard = lc && lc.ease >= 3;
    return html`<a class="row" href="#/l/${lid}/animal/${x.c.id}"><span class="main"><span class="primary">${animalLabel(x.c)}</span><span class="secondary">due ${due}${x.d.date && left >= 0 ? ` · in ${left} d` : left < 0 ? ` · ${-left} d over` : ""}${!lc ? " · heifer" : ""}${x.d.basis === "bull" ? " · bull window" : ""}${x.d.twins ? " · twins" : ""}</span>${hard ? html`<span class="secondary late-ink">⚠ hard calving last time</span>` : ""}</span><span class="chev">${raw(icon("chevron"))}</span></a>`; };
  const sect = (label, list, cls = "") => (list.length ? html`<h2 class="group-label ${cls}"><span>${label}</span><span>${list.length}</span></h2><div class="list">${list.map(row)}</div>` : "");
  const can = canWrite(snap.role, "calvings");
  const out = el(html`<div>
    ${!rows.length && !calved.length ? emptyState({ sector: "beef", title: "No calvings due", body: "Record bull-in dates, AI or scan results and due dates appear here.", action: can ? "Record bull in or AI" : null, actAttr: "data-svc" }) : ""}
    ${sect("Overdue", over, "late-ink")}${sect("This week", week)}${sect("Next 30 days", month)}
    ${later.length ? html`<button type="button" class="disclosure" data-later aria-expanded="false">Later (${later.length}) ${raw(icon("down", { size: 18 }))}</button><div data-later-list hidden><div class="list">${later.map(row)}</div></div>` : ""}
    ${calved.length ? html`<button type="button" class="disclosure" data-calved aria-expanded="false" style="margin-top:12px">Calved (${calved.length}) ${raw(icon("down", { size: 18 }))}</button><div data-calved-list hidden><div class="list">${calved.map(({ dam, c }) => html`<a class="row no-lead" href="#/l/${lid}/animal/${dam?.id}"><span class="main"><span class="primary">${dam ? animalLabel(dam) : "?"} · ${listDate(c.date)}</span><span class="secondary">${(c.calves || []).map((k) => { const calf = k.animalId && ix.byId.get(k.animalId); return `${(k.sex || calf?.sex || "calf").toLowerCase()} ${calf ? tagParts(calf.tag).tail : ""}${k.alive === false ? " (stillborn)" : ""}`; }).join(", ")}${c.ease ? ` · ${EASE[c.ease]}` : ""}</span></span></a>`)}</div></div>` : ""}
    ${can ? html`<div class="sticky-foot"><button type="button" class="btn" data-calving>Record a calving</button></div>` : ""}
  </div>`);
  const tog = (b, l) => { const x = out.querySelector(b); if (x) x.onclick = () => { const L = out.querySelector(l); L.hidden = !L.hidden; x.setAttribute("aria-expanded", String(!L.hidden)); }; };
  tog("[data-later]", "[data-later-list]"); tog("[data-calved]", "[data-calved-list]");
  out.querySelector("[data-calving]")?.addEventListener("click", () => import("./flows/calving.js").then((m) => m.default(snap)));
  out.querySelector("[data-svc]")?.addEventListener("click", () => import("./flows/breeding-events.js").then((m) => m.serviceSheet(snap)));
  return out;
}

function board(snap, st, again) {
  const { data, s, ix, today, lid } = snap; const money = canRead(snap.role, "finance");
  const cows = breedingFemales(data, ix, today).map((c) => ({ c, sc: scStatus(data, s, ix, c, today), nsb: notSeenBulling(data, ix, c, today) }));
  const n = { all: cows.length, risk: cows.filter((x) => x.sc && (x.sc.status === "risk" || x.sc.status === "cant")).length, nsb: cows.filter((x) => x.nsb).length, empty: cows.filter((x) => x.sc?.status === "empty").length };
  const list = cows.filter((x) => st.f === "risk" ? x.sc && ["risk", "cant"].includes(x.sc.status) : st.f === "nsb" ? x.nsb : st.f === "empty" ? x.sc?.status === "empty" : true)
    .sort((a, b) => ["cant", "risk", "empty", "soon", "open", "ok"].indexOf(a.sc?.status || "ok") - ["cant", "risk", "empty", "soon", "open", "ok"].indexOf(b.sc?.status || "ok"));
  const y = schemeYear(today); const okN = cows.filter((x) => x.sc?.status === "ok").length;
  const counts = { ok: okN, risk: cows.filter((x) => x.sc?.status === "risk" || x.sc?.status === "open").length, cant: cows.filter((x) => x.sc?.status === "cant").length };
  const out = el(html`<div>
    <div class="chips scroll-chips">${[["all", "All"], ["risk", "At risk"], ["nsb", "Not seen bulling"], ["empty", "Empty"]].map(([k, l]) => html`<button type="button" class="chip" data-f="${k}" aria-pressed="${st.f === k}">${l} <span class="count">${n[k]}</span></button>`)}</div>
    ${list.length ? html`<div class="list" style="margin-top:12px">${list.map(({ c, sc, nsb }) => {
      const lc = lastCalving(ix, c); const d = sc?.due || {};
      const line2 = lc ? `Calved ${listDate(lc.date).slice(4)} · ${daysBetween(lc.date, today)} d · ${d.empty ? "empty" : d.basis === "scan" ? "in calf (scan)" : d.basis === "ai" ? "served (AI)" : d.basis === "bull" ? "bull in" : nsb ? "not seen bulling" : "not served yet"}` : "No calving recorded";
      const line3 = sc ? (sc.status === "ok" ? `Due ${listDate(sc.expected).slice(4)} · interval ${daysBetween(lc.date, sc.expected)} d` : sc.status === "empty" ? `Scanned empty ${listDate(d.scan?.date).slice(4)}` : `Must calve by ${listDate(sc.deadline).slice(4)} ${sc.deadline.slice(0, 4)}${money ? ` for £${SC_PAYMENT}` : ""}`) : "";
      return html`<div class="row board-row"><a class="main" href="#/l/${lid}/animal/${c.id}"><span class="primary">${animalLabel(c)}</span><span class="secondary">${line2}</span><span class="secondary">${line3}</span></a>${sc ? (sc.status === "ok" ? html`<span class="pill ok" aria-label="On track for the Suckler Cow Scheme">${raw(icon("check"))}On track</span>` : pill(SC_LEVEL[sc.status], SC_WORDS[sc.status])) : ""}
        ${sc?.status === "empty" && canWrite(snap.role, "animals") ? html`<span class="row-actions"><button type="button" class="text-btn" data-cull="${c.id}">${c.cull ? "On cull list ✓" : "Cull list"}</button><button type="button" class="text-btn" data-reserve="${c.id}">Re-serve</button></span>` : ""}</div>`;
    })}</div>` : html`<div class="card pad ink-2" style="margin-top:12px">${cows.length ? "No cows in this list." : "No cows yet. Cows show here once a calving is recorded for them."}</div>`}
    <p class="board-foot">SC Scheme ${schemeYearLabel(y)} (1 Apr ${y} – 31 Mar ${y + 1}) · limit ${scLimitDays(today)} days${money ? ` · £${SC_PAYMENT} a calving` : ""}<br>On track ${counts.ok} · At risk ${counts.risk} · Can't make it ${counts.cant}${money ? ` · = up to £${num(counts.ok * SC_PAYMENT)}` : ""}</p>
  </div>`);
  out.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { st.f = b.dataset.f; again(); }));
  out.querySelectorAll("[data-cull]").forEach((b) => (b.onclick = () => { const c = ix.byId.get(b.dataset.cull); updateAnimal(snap.lid, c, { cull: !c.cull }); toast(c.cull ? "Taken off the cull list" : "Added to the cull list"); }));
  out.querySelectorAll("[data-reserve]").forEach((b) => (b.onclick = () => import("./flows/breeding-events.js").then((m) => m.serviceSheet(snap, { femaleIds: [b.dataset.reserve] }))));
  return out;
}

function register(snap) {
  const { s, today, ix } = snap; const list = birthsToRegister(snap.data, s, today); const can = canWrite(snap.role, "animals");
  if (!list.length) return el(emptyState({ sector: "beef", title: "All calves registered", body: "Every calf is tagged, sampled and on NIFAIS." }));
  const out = el(html`<div>${usesNifaisRegister(s) ? html`<p class="hint" style="margin-top:0">NIFAIS Online is your herd register: births must be recorded on NIFAIS within ${nifaisOnline(s).birth} days.</p>` : ""}${list.map((b) => {
    const a = b.animal; const dam = a.damId ? ix.byId.get(a.damId) : null;
    return html`<div class="reg-card" data-calf="${a.id}"><div class="rc-title">Calf of ${dam ? animalLabel(dam) : a.damTag ? tagParts(a.damTag).tail : "?"} · ${(a.sex || "").toLowerCase()} · born ${listDate(a.dob).slice(4)}</div>
      <div>${a.tag ? tagHtml(a.tag) : html`<span class="late-ink">No tag number yet</span>`}</div>
      <div class="pills">${b.steps.map((st) => st.done ? pill("ok", `${st.label} ✓`) : html`<button type="button" class="pill ${st.level === "info" ? "neutral" : st.level}" data-step="${st.key}" ${raw(can ? "" : "disabled")}>${raw(icon(st.level === "late" ? "alert" : "clock"))}${st.label} by ${listDate(st.by).slice(4)} (${st.left < 0 ? `${-st.left} d late` : `${st.left} d`})</button>`)}</div>
      ${b.late ? html`<p class="hint late-ink" style="margin:8px 0 0">Late: this calving won't count for the Suckler Cow Scheme.${b.steps.find((x) => x.key === "nifais" && !x.done && x.left < 0) ? " Late births get NNO status, which restricts moves and may affect slaughter and subsidy." : ""}</p>` : ""}
      ${b.bvdMissing ? html`<p class="hint late-ink" style="margin:6px 0 0">No BVD result yet — calves must be tested before 30 days old.</p>` : ""}
      <div class="rc-actions"><button type="button" class="btn secondary" data-copy>${raw(icon("copy"))}Copy details for NIFAIS</button>${can ? html`<button type="button" class="btn secondary" data-done>Done</button>` : ""}</div></div>`;
  })}<p class="hint">Notify by DAERA Online Services (NIFAIS Online), phone 0300 200 7855, or a paper MC1 card.</p></div>`);
  out.querySelectorAll("[data-calf]").forEach((card) => {
    const a = ix.byId.get(card.dataset.calf);
    card.querySelectorAll("[data-step]").forEach((b) => (b.onclick = () => { updateAnimal(snap.lid, a, { reg: { ...(a.reg || {}), [b.dataset.step]: todayStr() } }); toast(`${b.textContent.split(" by ")[0]} marked done today`); }));
    card.querySelector("[data-copy]").onclick = async () => {
      const dam = a.damId ? ix.byId.get(a.damId) : null;
      const text = [a.tag, shortDate(a.dob), { F: "Female", M: "Male", B: "Male" }[sexCode(a.sex)] || a.sex, breedCode(a.breed), colourCode(a.colour), dam?.tag || a.damTag || "", a.sireText || ""].join("\t");
      try { await navigator.clipboard.writeText(text); toast("Calf details copied. Paste them into NIFAIS Online."); } catch (e) { toast(text); }
    };
    const d = card.querySelector("[data-done]"); if (d) d.onclick = () => { const r = { ...(a.reg || {}) }; for (const k of ["tagged", "bvdSample", "nifais", ...(snap.s.pedigree ? ["society", "dna"] : [])]) r[k] = r[k] || todayStr(); updateAnimal(snap.lid, a, { reg: r }); toast("Calf registered — all done"); };
  });
  return out;
}

function heifers(snap) {
  const { data, s, ix, today, lid } = snap;
  const list = replacementHeifers(data, ix, today).map((h) => ({ h, w: heiferWindow(data, s, ix, h, today) })).filter((x) => x.w).sort((a, b) => a.w.serveTo.localeCompare(b.w.serveTo));
  if (!list.length) return el(emptyState({ sector: "beef", title: "No replacement heifers", body: "Heifers 9 months and older that haven't calved show here with their breeding window." }));
  return el(html`<div class="list">${list.map(({ h, w }) => { const lw = lastWeight(ix, h); const lvl = { open: "due", served: "neutral", inCalf: "ok", young: "neutral", missed: "late" }[w.status];
    return html`<a class="row no-lead" href="#/l/${lid}/animal/${h.id}"><span class="main"><span class="primary">${animalLabel(h)} · ${ageText(h, today)}${lw ? ` · ${lw.kg} kg${lw.kg < s.heiferServeKg ? ` (target ${s.heiferServeKg})` : ""}` : ""}</span>
      <span class="secondary">Serve ${listDate(w.serveFrom).slice(4)} – ${listDate(w.serveTo).slice(4)} ${w.serveTo.slice(0, 4)} to calve between 21 and ${w.maxM} months</span><span class="secondary">Best: serve by ${listDate(w.best).slice(4)} to calve at 24 months</span>
      ${w.status === "missed" ? html`<span class="secondary">Won't count for £100, but still worth calving.</span>` : ""}</span>${pill(lvl, w.status === "open" ? `Open · ${w.daysLeft} d left` : HEIFER_WORDS[w.status])}</a>`; })}</div>`);
}

async function fertility(ctx) {
  const { ledger } = ctx; const st = { year: Number(todayStr().slice(0, 4)) };
  const body = el(html`<div class="beef-page"></div>`);
  const { first, stop } = liveSnap(ledger, (snap) => {
    const paint = () => {
      const k = fertilityKpis(snap.data, snap.ix, st.year); const t = snap.s.kpiTargets || {}; const money = canRead(snap.role, "finance");
      const sy = schemeYear(snap.today); const rep = scYearReport(snap.data, snap.ix, sy); const ok = rep.filter((r) => r.qualifies).length;
      const why = {}; rep.filter((r) => !r.qualifies).forEach((r) => r.reasons.forEach((x) => { const key = x.replace(/\d+/g, "#"); why[key] = (why[key] || 0) + 1; }));
      const cum = []; let c = 0; for (const w of k.weeks) { c += w; cum.push(c); }
      const node = el(html`<div>${backLink(`#/l/${snap.lid}/breeding`, "Breeding")}${largeTitle("Fertility", `${k.calvings} calvings in ${st.year}`)}
        <div class="seg-wrap">${segmented("year", [st.year, st.year - 1].map((y) => ({ value: String(y), label: String(y) })), String(st.year))}</div>
        <div class="tiles" style="margin-top:16px">
          ${numTile({ label: "Calving interval", value: k.interval ? `${k.interval} d` : "—", delta: `target ${t.interval || 365} d`, tone: k.interval ? (k.interval <= (t.interval || 365) ? "ok" : "late") : "" })}
          ${numTile({ label: "Calved in 3 / 6 weeks", value: k.pct3 != null ? `${k.pct3}% / ${k.pct6}%` : "—", delta: "target 65% / 90%", tone: k.pct3 != null ? (k.pct3 >= 65 ? "ok" : "late") : "" })}
          ${numTile({ label: "Age at first calving", value: k.firstCalvingMonths ? `${k.firstCalvingMonths} mo` : "—", delta: "target 24 mo (SC limit 32)" })}
          ${numTile({ label: "Born alive per 100 cows", value: k.bornAlivePer100 ?? "—", delta: "target 95" })}
          ${numTile({ label: "Weaned per 100 cows", value: k.bornAlivePer100 != null && k.mortality != null ? Math.round(k.bornAlivePer100 * (1 - k.mortality / 100)) : "—", delta: "target 94" })}
          ${numTile({ label: "Mortality birth–weaning", value: k.mortality != null ? `${k.mortality}%` : "—", delta: "target under 3%", tone: k.mortality != null ? (k.mortality < 3 ? "ok" : "late") : "" })}
        </div><p class="source">Targets based on AHDB and AFBI suckler herd figures; set your own in Targets.</p>
        ${k.weeks.length ? html`<div class="section">${groupLabel("Calving spread", "calvings per week")}<div class="card pad">${sparkBars(k.weeks)}<p class="hint" style="margin:8px 0 0">${cum[2] != null ? `${Math.round((cum[2] / k.calvings) * 100)}% calved by week 3 (target 65%)` : ""}</p></div></div>` : ""}
        <div class="section">${groupLabel(`SC Scheme ${schemeYearLabel(sy)}`)}<div class="card pad"><p style="margin:0"><b>${ok} of ${rep.length}</b> calvings qualify${money ? ` · £${num(ok * SC_PAYMENT)} (estimate until paid)` : ""}</p>
          ${Object.keys(why).length ? html`<ul class="hint" style="margin:8px 0 0;padding-left:20px">${Object.entries(why).map(([r, n]) => html`<li>${n} × ${r.replace(/#/g, "…")}</li>`)}</ul>` : ""}
          <a class="text-btn" href="#/l/${snap.lid}/paperwork/sc">See each calving ›</a></div></div></div>`);
      const f = wireForm(node); f.onChange(() => { st.year = Number(f.values().year); paint(); });
      body.replaceChildren(node);
    };
    paint();
  });
  await first;
  return { el: body, title: "Fertility", depth: 1, tab: "breeding", destroy: stop };
}
