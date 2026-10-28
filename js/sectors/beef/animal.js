// Animal card (design/10 §4.2): identity, pills, weight/gain tiles, the deadlines box (or the
// breeding box for a cow, fertility for a bull), quick actions, timeline with who/when, and
// the Identity · NIFAIS · Health · Pedigree · Notes sections.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { canWrite } from "../../core/policy.js";
import { daysBetween, shortDate, addDays } from "../../core/dates.js";
import { listDate, num, timeHM } from "../../ui/format.js";
import { backLink, groupLabel } from "../../screens/common.js";
import { listMembers } from "../../services/members.js";
import { liveSnap } from "./data.js";
import { tagHtml, pill, numTile, kvRows } from "./ui.js";
import { onFarm, classOf, describe, ageLong, withdrawal, lastWeight, dlwg, shortName, ordinal } from "./model/animals.js";
import { breedName, colourName, sexCode, tagParts } from "./model/tags.js";
import { dueInfo, scStatus, SC_WORDS, SC_LEVEL, lastCalving, birthsToRegister, heiferWindow, HEIFER_WORDS } from "./model/breeding.js";
import { finishingFacts } from "./model/finishing.js";
import { adj200 } from "./model/finishing.js";
import { timelineFor } from "./model/timeline.js";

export default async function animalScreen(ctx) {
  const { ledger } = ctx; const id = ctx.match.groups.id;
  const body = el(html`<div class="beef-page"></div>`);
  let names = new Map();
  listMembers(ledger.id).then((m) => { names = new Map(m.map((x) => [x.uid || x.id, x.displayName || x.email])); }).catch(() => {});
  let title = "Animal";
  const { first, stop } = liveSnap(ledger, (snap) => {
    const a = snap.ix.byId.get(id);
    if (!a) { body.replaceChildren(el(html`<div>${backLink(`#/l/${ledger.id}/herd`, "Herd")}<div class="card pad">This animal isn't in the herd any more. It may have been removed.</div></div>`)); return; }
    title = shortName(a) || tagParts(a.tag).tail; const y = window.scrollY;
    body.replaceChildren(render(snap, a, names)); if (y) window.scrollTo(0, y);
  });
  await first;
  return { el: body, title, depth: 1, tab: "herd", destroy: stop };
}

function render(snap, a, names) {
  const { ix, today, lid } = snap; const cls = classOf(ix, a, today);
  const canEdit = canWrite(snap.role, "animals"); const live = onFarm(a);
  const pills = [];
  const wd = withdrawal(ix, a, today); if (wd) pills.push(pill("late", `Withdrawal · ${listDate(wd.until).slice(4)}`));
  const isYoung = !["cow", "bull"].includes(cls);
  const f = isYoung && a.dob && live ? finishingFacts(snap.data, snap.s, ix, a, today) : null;
  if (f) for (const d of f.deadlines.filter((x) => x.left >= 0 && x.left <= 60)) pills.push(pill(d.left <= 30 ? "due" : "neutral", `${d.kind === "bcrs" ? "BCRS" : "Spec"} · ${listDate(d.date).slice(4)}`));
  const g = a.groupId ? ix.groups.get(a.groupId) : null; if (g) pills.push(pill("neutral", g.name, "grid"));
  for (const fl of (a.flags || []).filter((x) => x !== "temperament")) pills.push(pill("due", fl));
  if (!live) pills.push(pill("neutral", a.offTo === "Dead" ? `Died ${listDate(a.offDate).slice(4)}` : `Left ${listDate(a.offDate).slice(4)}`));
  const reg = a.reg ? birthsToRegister({ animals: [a] }, snap.s, today)[0] : null;
  const lw = lastWeight(ix, a); const gain = dlwg(ix, a); const target = snap.s.dlwgTarget[cls] ?? snap.s.dlwgTarget.finisher;
  const tl = timelineFor(snap.data, ix, a);
  const node = el(html`<div>
    ${backLink(`#/l/${lid}/herd`, "Herd")}
    <div class="animal-head"><span class="tile lg">${raw(icon("beef", { size: 40, stroke: 1.75 }))}</span>
      <div style="min-width:0"><h1>${shortName(a) ? html`${shortName(a)} <span class="ink-2" style="font-weight:600">${tagParts(a.tag).tail}</span>` : tagHtml(a.tag)}</h1>
      <p>${shortName(a) ? html`${tagHtml(a.tag)}<br>` : ""}${[breedName(a.breed), (describe(ix, a, today).split(" · ")[0] || "").split(" ").slice(1).join(" ")].filter(Boolean).join(" ")}${a.dob ? ` · born ${shortDate(a.dob)} · ${ageLong(a, today)}` : ""}</p>
      ${a.temperament ? html`<p class="late-ink" style="font-weight:600">⚠ Handle with care</p>` : ""}</div></div>
    ${pills.length ? html`<div class="pills">${pills}</div>` : ""}
    ${reg ? html`<div class="pills reg-pills">${reg.steps.map((s) => pill(s.done ? "ok" : s.level === "info" ? "neutral" : s.level, s.done ? `${s.label} ✓` : `${s.label} by ${listDate(s.by).slice(4)} (${s.left < 0 ? `${-s.left} d late` : `${s.left} d`})`))}</div>` : ""}
    <div class="tiles" style="margin-top:16px">${tiles(snap, a, cls, lw, gain, target)}</div>
    ${box(snap, a, cls, f)}
    ${live && canEdit ? html`<div class="act-grid">${["Weigh", "Treat", "Move", "Sell"].map((l) => html`<button type="button" class="btn secondary" data-act="${l}">${l}</button>`)}<button type="button" class="btn secondary" data-more style="grid-column:1/-1">More for this animal…</button></div>` : ""}
    <div class="section">${groupLabel("Timeline", tl.length || "")}
      ${tl.length ? html`<div class="list timeline">${tl.slice(0, 40).map((e) => html`<div class="row no-lead"><span class="when">${shortDate(e.date).replace(/ (\d{4})$/, (m, y) => (y === today.slice(0, 4) ? "" : ` ${y.slice(2)}`))}</span><span class="main"><span class="primary">${e.title}</span>${e.sub ? html`<span class="secondary">${e.sub}</span>` : ""}${e.by && e.by.createdBy ? html`<span class="secondary">Added by ${names.get(e.by.createdBy) || "someone on the ledger"}${e.by.createdAt ? `, ${shortDate(isoOf(e.by.createdAt))} ${timeHM(e.by.createdAt)}` : ""}</span>` : ""}</span></div>`)}</div>`
        : html`<div class="card pad ink-2">Nothing recorded yet.</div>`}</div>
    <div class="section"><div class="list">${sections(snap, a).map(([k, label, sub]) => html`<button type="button" class="row" data-sec="${k}"><span class="main"><span class="primary">${label}</span><span class="secondary">${sub}</span></span><span class="chev">${raw(icon("chevron"))}</span></button>`)}</div></div>
  </div>`);
  node.querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
    const ids = [a.id]; const k = b.dataset.act;
    if (k === "Weigh") (await import("./flows/weigh.js")).default(snap, { animalIds: ids });
    if (k === "Treat") (await import("./flows/treatment.js")).default(snap, { animalIds: ids });
    if (k === "Move") (await import("./flows/move.js")).default(snap, { animalIds: ids });
    if (k === "Sell") (await import("./flows/sale.js")).default(snap, { animalIds: ids });
  }));
  node.querySelector("[data-more]")?.addEventListener("click", () => moreSheet(snap, a, cls));
  node.querySelectorAll("[data-sec]").forEach((b) => (b.onclick = () => import("./flows/animal-edit.js").then((m) => m.sectionSheet(snap, a, b.dataset.sec))));
  return node;
}
const isoOf = (d) => { try { return new Date(d).toISOString().slice(0, 10); } catch (e) { return ""; } };

function tiles(snap, a, cls, lw, gain, target) {
  const { ix, today } = snap;
  if (cls === "cow") {
    const cv = ix.calvings.get(a.id) || []; const kids = ix.kids.get(a.id) || [];
    const weaned = kids.filter((k) => k.weanedOn || (k.dob && daysBetween(k.dob, today) > 240)).length;
    const w200 = kids.map((k) => { const w = (ix.weights.get(k.id) || []).find((x) => daysBetween(k.dob, x.date) >= 150 && daysBetween(k.dob, x.date) <= 280); return w ? adj200({ weanKg: w.kg, birthKg: +k.birthKg || 40, ageDays: daysBetween(k.dob, w.date) })?.adj200 : null; }).filter(Boolean);
    const ease = cv.slice(-3).map((c) => c.ease).filter(Boolean);
    return html`${numTile({ label: "Calves weaned (lifetime)", value: num(weaned), delta: w200.length ? `avg 200-day weight ${Math.round(w200.reduce((s, x) => s + x, 0) / w200.length)} kg` : `${num(cv.length)} calving${cv.length === 1 ? "" : "s"} recorded` })}
      ${numTile({ label: "Calving ease last 3", value: ease.length ? ease.join(", ") : "—", delta: "1 easy … 5 caesar" })}`;
  }
  if (cls === "bull") {
    const season = snap.data.services.filter((s) => s.sireId === a.id || (s.sireText && [a.name, a.mgmtNo, tagParts(a.tag).tail].filter(Boolean).some((n) => s.sireText.includes(n))));
    const served = new Set(season.filter((s) => (s.date || s.bullIn || "") >= addDays(today, -365)).flatMap((s) => s.femaleIds || [])).size;
    const progeny = snap.data.animals.filter((x) => x.sireId === a.id || (x.sireText && [a.name, tagParts(a.tag).tail].filter(Boolean).some((n) => x.sireText.includes(n)))).length;
    return html`${numTile({ label: "Cows served this season", value: num(served) })}${numTile({ label: "Progeny", value: num(progeny) })}`;
  }
  return html`${numTile({ label: "Last weight", value: lw ? `${num(lw.kg)} kg` : "—", delta: lw ? `${listDate(lw.date).slice(4)}${lw.est ? " (estimate)" : ""}` : "Not weighed yet" })}
    ${numTile({ label: "Gain", value: gain ? `${gain.value.toFixed(2)}` : "—", delta: gain ? html`<span class="${gain.value >= target ? "ok-ink" : "late-ink"}">kg/day ${gain.value >= target ? "▲" : "▼"} target ${target}</span>` : "Two weighings 14+ days apart", tone: gain ? (gain.value >= target ? "ok" : "late") : "" })}`;
}

function box(snap, a, cls, f) {
  const { data, s, ix, today } = snap;
  if (cls === "cow") {
    const lc = lastCalving(ix, a); const due = dueInfo(data, s, ix, a); const sc = scStatus(data, s, ix, a, today);
    const n = (ix.calvings.get(a.id) || []).length; const prev = (ix.calvings.get(a.id) || []).slice(-2);
    const lastInterval = prev.length === 2 ? daysBetween(prev[0].date, prev[1].date) : null;
    const svc = due.service;
    return html`<div class="card" style="margin-top:12px"><div class="card-head">Breeding</div>${kvRows([
      lc && ["Calved", `${listDate(lc.date).slice(4)} ${lc.date.slice(0, 4)} (${ordinal(n)})`],
      lastInterval && ["Calving interval last", `${lastInterval} d`],
      svc && [svc.kind === "AI" ? "Served (AI)" : "Bull in", listDate(svc.date || svc.bullIn).slice(4)],
      due.empty ? ["Scan", "Empty", "late"] : due.date ? [due.basis === "scan" ? "Scan: in calf, due" : "Due", `${listDate(due.date).slice(4)} ${due.date.slice(0, 4)}`] : due.from ? ["Due window", `${listDate(due.from).slice(4)} – ${listDate(due.to).slice(4)}`] : ["Due", "Not served yet"],
      sc && ["SC Scheme", sc.status === "ok" ? `✓ calve by ${listDate(sc.deadline).slice(4)} ${sc.deadline.slice(0, 4)}` : `${SC_WORDS[sc.status]} · by ${listDate(sc.deadline).slice(4)}`, SC_LEVEL[sc.status] === "ok" ? "ok" : SC_LEVEL[sc.status] === "neutral" ? "" : SC_LEVEL[sc.status]],
    ])}</div>`;
  }
  if (cls === "bull") {
    const ft = a.pedigree?.fertilityTest;
    return html`<div class="card" style="margin-top:12px"><div class="card-head">Fertility</div>${kvRows([["Fertility test", ft?.date ? `${listDate(ft.date).slice(4)} ${ft.date.slice(0, 4)} (${ft.result || "?"}${ft.vet ? `, ${ft.vet}` : ""})` : "Not recorded"]])}</div>`;
  }
  if (cls === "heifer" && (a.replacement || sexCode(a.sex) === "F")) {
    const w = heiferWindow(data, s, ix, a, today);
    if (w && !f?.deadlines.length) return html`<div class="card" style="margin-top:12px"><div class="card-head">Breeding window</div>${kvRows([["Status", HEIFER_WORDS[w.status], w.status === "missed" ? "late" : w.status === "open" ? "due" : ""], ["Serve between", `${listDate(w.serveFrom).slice(4)} – ${listDate(w.serveTo).slice(4)} ${w.serveTo.slice(0, 4)}`], ["Best: serve by", `${listDate(w.best).slice(4)} (calve at 24 months)`]])}</div>`;
  }
  if (!f) return "";
  const money = snap.role !== "worker";
  return html`<div class="card" style="margin-top:12px"><div class="card-head">Deadlines</div>${kvRows([
    ...f.deadlines.map((d) => [d.label, `${listDate(d.date).slice(4)} ${d.date.slice(0, 4)} · ${d.left < 0 ? "passed" : `${d.left} d`}`, d.left < 0 ? "late" : d.left <= 30 ? "due" : ""]),
    f.estCarcase && ["Est. carcase now", `${Math.round(f.estCarcase)} kg (${Math.round(f.ko)}%)`],
    f.readyBy && [`Ready by (at ${s.targetCarcaseKg} kg)`, f.readyBy <= today ? "Now" : listDate(f.readyBy).slice(4)],
    money && s.price.perKgDead && f.estCarcase && ["Value today", `£${num(f.estCarcase * s.price.perKgDead)}`],
  ])}${f.flags.length ? html`<div style="padding:4px 16px 12px">${f.flags.map((x) => html`<p class="hint ${x.level === "due" ? "due-ink" : ""}" style="margin:6px 0 0">${x.text}</p>`)}</div>` : ""}</div>`;
}

function sections(snap, a) {
  const health = [a.bvd?.status ? `BVD: ${bvdWord(a.bvd.status)}` : "BVD: no result", a.tb?.lastTest ? `TB ${a.tb.status || "clear"} ${shortDate(a.tb.lastTest)}` : null, `treatments (${snap.data.medicines.filter((m) => !m.notUsed && ((m.animalIds || []).includes(a.id) || (m.animalTags || []).includes(a.tag))).length})`].filter(Boolean).join(" · ");
  return [
    ["identity", "Identity", [`${breedName(a.breed) || "Breed?"}`, colourName(a.colour) || "colour?", a.sex || "sex?", a.dob ? shortDate(a.dob) : "DOB?", a.bornInHerd ? "born in herd" : a.onDate ? "bought in" : null].filter(Boolean).join(" · ")],
    ["nifais", "NIFAIS", [a.reg ? (a.reg.nifais ? `Birth notified ${shortDate(a.reg.nifais)}` : "Birth not marked as notified") : a.onDate ? `Moved on ${shortDate(a.onDate)}` : "Birth notified (before this app)", (a.flags || []).filter((x) => x !== "temperament").join(", ")].filter(Boolean).join(" · ")],
    ["health", "Health", health],
    snap.s.pedigree && ["pedigree", "Pedigree", a.pedigree?.herdBookNo ? `${a.pedigree.society || "Herd book"} ${a.pedigree.herdBookNo}` : "Herd book, DNA, EBVs, sale sheet"],
    ["notes", "Notes", a.notes ? String(a.notes).slice(0, 60) : "Free text"],
  ].filter(Boolean);
}
export const bvdWord = (s) => ({ BVDN: "Negative (BVDN)", INDNEG: "Indirect negative", BVDP: "Positive (BVDP)", BVDI: "Inconclusive", BVDU: "Untested" }[s] || s);

function moreSheet(snap, a, cls) {
  const female = sexCode(a.sex) === "F";
  const items = [
    female && ["calving", "Record a calving", "birth"], female && ["service", "Bull in or AI", "beef"], female && ["scan", "Scan result", "search"], female && ["heat", "Seen bulling", "clock"],
    ["bvd", "BVD result", "syringe"], ["retag", "Replace a tag", "tag"], ["vetop", "Castration or disbudding", "syringe"], ["edit", "Edit identity", "edit"],
    ["death", "Record a death", "alert"],
  ].filter(Boolean);
  const body = el(html`<div><p class="sheet-title-sm">${shortName(a) || tagParts(a.tag).tail}</p><div class="list">${items.map(([k, l, ic]) => html`<button type="button" class="row" data-k="${k}"><span class="tile">${raw(icon(ic))}</span><span class="main"><span class="primary">${l}</span></span></button>`)}</div></div>`);
  const sh = openSheet({ size: "small", body, label: "More for this animal", auto: true });
  body.onclick = async (e) => {
    const b = e.target.closest("[data-k]"); if (!b) return; sh.close(true, { force: true }); const k = b.dataset.k; const ids = [a.id];
    await new Promise((r) => setTimeout(r, 120));
    if (k === "calving") (await import("./flows/calving.js")).default(snap, { damId: a.id });
    if (k === "service") (await import("./flows/breeding-events.js")).serviceSheet(snap, { femaleIds: ids });
    if (k === "scan") (await import("./flows/breeding-events.js")).scanSheet(snap, { femaleId: a.id });
    if (k === "heat") (await import("./flows/breeding-events.js")).heatSheet(snap, { femaleId: a.id });
    if (k === "bvd") (await import("./flows/animal-edit.js")).bvdSheet(snap, a);
    if (k === "retag") (await import("./flows/animal-edit.js")).retagSheet(snap, a);
    if (k === "vetop") (await import("./flows/vetop.js")).default(snap, { animalIds: ids });
    if (k === "edit") (await import("./flows/animal-edit.js")).editIdentitySheet(snap, a);
    if (k === "death") (await import("./flows/death.js")).default(snap, { animalId: a.id });
  };
}
