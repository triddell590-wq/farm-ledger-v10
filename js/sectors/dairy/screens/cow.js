// Cow card (design/12 §4.2) and calf card. Cow number leads; the official tag is second.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { daysBetween } from "../../../core/dates.js";
import { num } from "../../../ui/format.js";
import { emptyState } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { cowPill, pill, udderHtml, sectionOf, kvRows, lineChart, cowLabel, dm } from "../ui.js";
import { groupOf, lactation, dim, yieldToDate, sccHistory, lastRecording, mobility, bcs, listOf, ordinal, isDry, ageMonths, GROUP_NAMES } from "../model/cows.js";
import { fertilityOf } from "../model/fertility.js";
import { casesThisLactation } from "../model/mastitis.js";
import { growthStatus, brixGood } from "../model/calves.js";
import { okLabel, quartersText } from "../model/milking.js";
import { tagParts } from "../../beef/model/tags.js";
import { calfSteps } from "../model/duties.js";
import { setVetList, tickGenerated } from "../actions.js";

const flow = (name, fn = "default") => async (snap, extra) => (await import(`../flows/${name}.js`))[fn](snap, extra);

export default async function cowCard(ctx) {
  const body = el(html`<div class="dairy-page"></div>`); const id = ctx.match.groups.id;
  const { first, stop } = liveSnap(ctx.ledger, (snap) => paint(body, snap, id));
  await first;
  return { el: body, title: "Cow", destroy: stop, tab: "cows" };
}

function lactationsTable(snap, a) {
  const cs = listOf(snap.ix.calvings, a).map((c) => c.date); if (a.calvedDateBase && !cs.includes(a.calvedDateBase)) cs.push(a.calvedDateBase); cs.sort();
  if (!cs.length) return "";
  const total = lactation(snap.ix, a);
  const rows = cs.map((d, i) => {
    const next = cs[i + 1] || "9999"; const n = Math.max(1, total - (cs.length - 1 - i));
    const cases = listOf(snap.ix.cases, a).filter((c) => c.date >= d && c.date < next).length;
    const svcs = listOf(snap.ix.services, a).filter((x) => x.date > d && x.date < next).length;
    const tests = listOf(snap.ix.rec, a).filter((r) => r.date >= d && r.date < next && +r.litres > 0);
    const y305 = tests.length ? Math.round(tests.reduce((t, r) => t + +r.litres, 0) / tests.length * 305) : null;
    return html`<tr><td>${n}</td><td>${dm(d)} ${d.slice(2, 4)}</td><td>${i ? daysBetween(cs[i - 1], d) + " d" : "—"}</td><td>${y305 ? num(y305) : "—"}</td><td>${cases}</td><td>${svcs}</td></tr>`;
  });
  return sectionOf("Lifetime", html`<div class="card pad"><table class="tbl"><thead><tr><th>Lact</th><th>Calved</th><th>Interval</th><th>305-d est L</th><th>Mastitis</th><th>Serves</th></tr></thead><tbody>${rows.reverse()}</tbody></table><p class="formula">305-day estimate = average test-day litres × 305 (no recordings = —).</p></div>`);
}

function timeline(snap, a) {
  const ev = [];
  const p = (date, text, by) => ev.push({ date, text, by });
  for (const c of listOf(snap.ix.calvings, a)) p(c.date, `Calved (${c.ease || "unassisted"})`, c.byName);
  for (const h of listOf(snap.ix.heats, a)) p(h.date, `Seen bulling${h.sign ? " · " + h.sign : ""}`, h.byName);
  for (const s of listOf(snap.ix.services, a)) p(s.date, `Served · ${s.sireText || "sire"}${s.sexed ? " (sexed)" : ""}`, s.byName || s.technician);
  for (const x of listOf(snap.ix.pds, a)) p(x.date, `PD ${x.result === "+" ? "+ in calf" : x.result === "-" ? "− empty" : "recheck"}`, x.vet || x.byName);
  for (const d of listOf(snap.ix.dryOffs, a)) p(d.date, `Dried off · ${d.treatment}`, d.byName);
  for (const m of snap.data.medicines.filter((x) => (x.animalIds || []).includes(a.id))) p(m.date, `${m.reason || "Treatment"}${m.quarters?.length ? " " + quartersText(m.quarters) : ""} · ${m.productName || ""}`, m.givenBy);
  for (const f of listOf(snap.ix.fresh, a)) if (f.events?.length) p(f.date, `Fresh cow: ${f.events.join(", ")}`, f.byName);
  for (const t of listOf(snap.ix.trims, a)) p(t.date, `Foot trim · ${t.foot || ""} ${t.lesion || ""}`, t.byName);
  ev.sort((x, y) => y.date.localeCompare(x.date));
  if (!ev.length) return "";
  return sectionOf("Timeline", html`<div class="list timeline">${ev.slice(0, 30).map((e) => html`<div class="row no-lead"><span class="when">${dm(e.date)}</span><span class="main"><span class="primary">${e.text}</span>${e.by ? html`<span class="secondary">${e.by}</span>` : ""}</span></div>`)}</div>`);
}

function calfPart(snap, a) {
  const c = a.calf || {}; const col = c.colostrum || {}; const w = listOf(snap.ix.weights, a); const lw = w[w.length - 1];
  const g = lw ? growthStatus(a.dob, lw, snap.s.matureKg, snap.s.birthKg) : null; const reg = calfSteps(snap.c).find((r) => r.a.id === a.id);
  return html`${reg ? sectionOf("Tag and register", html`<div class="list">${reg.steps.map((st) => html`<button type="button" class="row no-lead" data-step="${st.key}" ${raw(canWrite(snap.role, "animals") ? "" : "disabled")}><span class="main"><span class="primary">${st.label}</span><span class="secondary">${st.done ? "Done" : st.left < 0 ? `${-st.left} days late` : `by ${dm(st.due)}`}</span></span>${pill(st.done ? "ok" : st.left < 0 ? "late" : "due", st.done ? "Done" : "Tick when done")}</button>`)}</div>`) : ""}
    ${sectionOf("Calf", kvRows([
      ["Colostrum", col.litres ? `${col.litres} L at ${col.time || "?"}${col.brix ? ` · Brix ${col.brix}%` : ""}` : "Not recorded", col.litres ? (brixGood(col.brix) === false ? "due" : "ok") : "due"],
      ["Feeding", c.stage || (snap.data.calfFeeds.find((p) => (p.calfIds || []).includes(a.id))?.stage) || "—"],
      ["Pen", c.pen || "—"],
      ["Weight", lw ? `${lw.kg} kg (${dm(lw.date)}${lw.method === "tape" ? ", tape" : ""})` : "Not weighed"],
      g && ["Growth", `${g.behind ? "Behind" : "On track"} — target ${g.target} kg`, g.behind ? "late" : "ok"],
      ["Disbudding", c.disbud?.date ? `${dm(c.disbud.date)} · ${c.disbud.anaesthetic ? "anaesthetic ✓" : "no anaesthetic"} · ${c.disbud.analgesic ? "pain relief ✓" : "no pain relief"}` : "Not yet"],
      ["Weaning", c.weanDate ? dm(c.weanDate) : "—"],
      ["Goes to", c.destination || "—"],
    ]))}`;
}

function paint(body, snap, id) {
  const a = snap.ix.byId.get(id);
  if (!a) { body.replaceChildren(el(emptyState({ iconName: "search", title: "Cow not found", body: "She may have been removed.", action: "Back to cows", href: `#/l/${snap.lid}/cows` }))); return; }
  const { ix, today, s } = snap; const g = groupOf(ix, a, today); const lac = lactation(ix, a); const w = canWrite(snap.role, "animals");
  const f = ["milking", "dry", "heifer"].includes(g) ? fertilityOf(s, ix, a, today) : null;
  const y = yieldToDate(ix, a, today); const h = sccHistory(ix, a, 6); const lr = lastRecording(ix, a);
  const cases = casesThisLactation(ix, a); const qc = {}; cases.forEach((c) => (c.quarters || []).forEach((q) => (qc[q] = (qc[q] || 0) + 1)));
  const wh = snap.brd.withheld.find((x) => x.cow.id === a.id) || snap.brd.release.find((x) => x.cow.id === a.id);
  const p = cowPill(snap, a); const mob = mobility(ix, a); const bc = bcs(ix, a); const tp = tagParts(a.tag);
  const node = el(html`<div>
    <a class="back-link" href="#/l/${snap.lid}/cows">${raw(icon("back"))}Cows</a>
    <div class="cow-head"><span class="big">${cowLabel(a)}</span><div><h1>${a.name || (g === "calf" ? "Calf" : GROUP_NAMES[g].replace(/s$/, ""))}</h1>
      <p>${tp.head ? html`${tp.head} <b>${tp.tail}</b>` : a.tag || "No tag yet"}</p>
      <p>${[lac ? `${ordinal(lac)} lactation` : null, dim(ix, a, today) != null ? `${dim(ix, a, today)} days in milk` : null, isDry(ix, a) ? "Dry" : null, g === "heifer" || g === "calf" ? `${Math.floor(ageMonths(a, today) || 0)} months old` : null].filter(Boolean).join(" · ")}</p>
      <div class="pills">${p ? pill(p[0], p[1]) : ""}${a.vetCheck ? pill("info", "Vet list") : ""}${a.doNotBreed ? pill("neutral", "Do not breed") : ""}${a.sirePlan ? pill("neutral", a.sirePlan) : ""}</div></div></div>
    ${wh ? html`<div class="withpanel"><span class="inl">${raw(icon("alert"))}Milk out of the tank until</span><b>${okLabel(s, wh.okFrom)}</b><span>${quartersText(wh.w.quarters) || "All four"} · ${wh.w.productName || ""}${wh.w.marks?.length ? " · " + wh.w.marks.join(", ") : ""}</span></div>` : ""}
    ${w && g !== "calf" ? html`<div class="act-grid"><button type="button" class="btn" data-a="treat">Treat</button><button type="button" class="btn secondary" data-a="bulling">Seen bulling</button><button type="button" class="btn secondary" data-a="served">Served</button><button type="button" class="btn secondary" data-a="${g === "milking" ? "dry" : "pd"}">${g === "milking" ? "Dry off" : "PD"}</button></div>` : ""}
    ${g === "calf" ? calfPart(snap, a) : html`
      ${lac ? sectionOf("This lactation", kvRows([
        ["Yield to date", y ? `${num(y.litres)} L in ${y.days} days` : "No milk recordings yet"],
        ["Last test day", lr && lr.litres ? `${lr.litres} L · ${dm(lr.date)}${lr.fat ? ` · ${lr.fat}% fat · ${lr.protein}% protein` : ""}` : "—"],
        y?.p305 && ["305-day projection", `${num(y.p305)} L`],
      ])) : ""}
      ${h.length ? sectionOf("SCC (last recordings)", html`<div class="card pad"><span class="big-fig">${h[h.length - 1].scc}<small>k</small></span>${lineChart(h.map((x) => x.scc), { limit: 200 })}<p class="formula">Dashed line: 200k (likely infected above it). ${h.map((x) => `${dm(x.date)} ${x.scc}k`).join(" · ")}</p></div>`) : ""}
      ${f ? sectionOf("Fertility", kvRows([
        ["Calved", f.calved ? dm(f.calved) + " " + f.calved.slice(0, 4) : "Not calved"],
        ["Services this lactation", String(f.serviceNo)],
        f.lastServe && ["Last serve", `${dm(f.lastServe.date)} · ${f.lastServe.sireText || "?"}`],
        ["PD", f.pd ? `${f.pd.result === "+" ? "In calf" : f.pd.result === "-" ? "Empty" : "Recheck"} (${dm(f.pd.date)})` : f.lastServe ? "Not yet" : "—", f.pregnant ? "ok" : ""],
        f.due && ["Due to calve", dm(f.due) + " " + f.due.slice(0, 4)],
        f.dryOffDue && !isDry(ix, a) && ["Dry off", dm(f.dryOffDue), daysBetween(today, f.dryOffDue) <= 7 ? "due" : ""],
      ])) : ""}
      ${lac ? sectionOf("Health this lactation", html`<div class="card pad">${raw(udderHtml(new Set(Object.keys(qc)), { readonly: true, counts: qc }).s)}<p class="formula" style="text-align:center">Mastitis by quarter (viewed from behind)</p></div>${kvRows([["Mastitis cases", String(cases.length), cases.length >= 3 ? "late" : ""], ["Mobility", mob ? `Score ${mob.score} (${dm(mob.date)})` : "Not scored", mob && mob.score >= 2 ? "due" : ""], ["Body condition", bc ? `${bc.score} (${dm(bc.date)})` : "Not scored"], ["Fresh-cow problems", listOf(ix.fresh, a).flatMap((x) => x.events || []).join(", ") || "None"]])}`) : ""}
      ${lactationsTable(snap, a)}`}
    ${timeline(snap, a)}
    ${w ? html`<div class="section"><div class="list">
      <button type="button" class="row" data-a="edit"><span class="tile neutral">${raw(icon("edit"))}</span><span class="main"><span class="primary">Edit cow</span><span class="secondary">Number, name, tag, sire plan, do not breed, cull</span></span></button>
      ${g !== "calf" ? html`<button type="button" class="row" data-a="vet"><span class="tile neutral">${raw(icon("people"))}</span><span class="main"><span class="primary">${a.vetCheck ? "Take off the vet list" : "Add to the vet list"}</span>${a.vetCheck ? html`<span class="secondary">${a.vetCheck.reason}</span>` : ""}</span></button>
        <button type="button" class="row" data-a="pd"><span class="tile neutral">${raw(icon("search"))}</span><span class="main"><span class="primary">PD result</span></span></button>
        <button type="button" class="row" data-a="calving"><span class="tile neutral">${raw(icon("birth"))}</span><span class="main"><span class="primary">Calving</span></span></button>` : ""}
      <button type="button" class="row" data-a="off"><span class="tile neutral">${raw(icon("truck"))}</span><span class="main"><span class="primary">Off the farm</span><span class="secondary">Sold, culled or died</span></span></button></div></div>` : ""}
  </div>`);
  body.replaceChildren(node);
  const run = { treat: () => flow("treatment")(snap, { animalIds: [a.id] }), bulling: () => flow("breeding", "heatSheet")(snap, { animalIds: [a.id] }), served: () => flow("breeding", "serveSheet")(snap, { animalId: a.id }), pd: () => flow("breeding", "pdSheet")(snap, { animalId: a.id }), dry: () => flow("dryoff")(snap, { animalId: a.id }), calving: () => flow("calving")(snap, { animalId: a.id }), edit: () => flow("cow-edit", "editCowSheet")(snap, a), off: () => flow("cow-edit", "offSheet")(snap, { animalIds: [a.id] }),
    vet: () => { setVetList(snap.lid, a, a.vetCheck ? null : "Check at the next fertility visit"); toast(a.vetCheck ? "Taken off the vet list" : `${cowLabel(a)} added to the vet list`); } };
  node.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => run[b.dataset.a]()));
  node.querySelectorAll("[data-step]").forEach((b) => (b.onclick = () => { const st = b.dataset.step; const done = !(a.reg || {})[st]; tickGenerated(snap.lid, snap, { action: { type: "reg", animalId: a.id, step: st } }, done); toast(done ? "Ticked off" : "Unticked"); }));
}
