// Beef → Today (design/10 §3): header with season mode, alerts, the season block, To do today,
// Coming up this week, herd strip. Season modes reorder, never hide.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { radioGroup, wireForm } from "../../ui/form.js";
import { taskList } from "../../ui/tasks.js";
import { todaysTasks } from "../../services/tasks.js";
import { auth } from "../../core/auth.js";
import { canRead, canWrite } from "../../core/policy.js";
import { addDays, daysBetween, ddmmyy } from "../../core/dates.js";
import { listDate, num, plural, moneyText } from "../../ui/format.js";
import { largeTitle, groupLabel, emptyState } from "../../screens/common.js";
import { alertCard } from "../../screens/overview-today.js";
import { liveSnap } from "./data.js";
import { numTile, sparkBars, tagHtml, animalLabel } from "./ui.js";
import { autoMode, MODE_NAMES, scLimitDays } from "./model/rules.js";
import { onFarm, classOf, CLASS_NAMES, ageMonths, lastWeight } from "./model/animals.js";
import { breedingFemales, dueInfo, scStatus, notSeenBulling, replacementHeifers, heiferWindow, birthsToRegister, lastCalving } from "./model/breeding.js";
import { deadlineAnimals, finishingFacts } from "./model/finishing.js";
import { beefAlerts, todayTasks, weekTasks, tbNext } from "./model/duties.js";
import { mealToday } from "./model/feed.js";
import { tickGenerated } from "./actions.js";
import { beefBanner } from "./model/region.js";

const LS = (lid) => `fl10-beef-mode-${lid}`;
function savedMode(lid) { try { return localStorage.getItem(LS(lid)) || "auto"; } catch (e) { return "auto"; } }

export function modeFor(snap) {
  const m = savedMode(snap.lid);
  return m === "auto" ? autoMode(snap.s.calvingSeason, snap.today) : m;
}
export function contextLine(snap) {
  const herdNo = snap.meta.keeper?.herdNo || snap.s.herdNo;
  const n = snap.data.animals.filter(onFarm).length;
  return [snap.ledger.name, herdNo ? `Herd ${herdNo}` : null, n === 1 ? "1 animal" : `${num(n)} cattle`].filter(Boolean).join(" · ");
}

export default async function today(ctx) {
  const { ledger } = ctx;
  const body = el(html`<div class="beef-page"></div>`);
  const { first, stop } = liveSnap(ledger, (snap) => paint(body, snap));
  await first;
  return { el: body, title: "Today", destroy: stop };
}

async function paint(body, snap) {
  const { lid, today } = snap; const money = canRead(snap.role, "finance");
  const mode = modeFor(snap); const auto = savedMode(lid) === "auto";
  const alerts = beefAlerts(snap.c, { money });
  const by = { uid: auth.user?.uid, name: auth.user?.displayName || auth.user?.email };
  const gen = todayTasks(snap.c, snap.doneKeys).map((t) => ({ id: t.key, title: t.title, due: t.due, href: t.href, legal: t.legal, generated: true, done: false, ledger: snap.ledger, tick: (d) => tickGenerated(lid, snap, t, d, by) }));
  const stored = (await todaysTasks([snap.ledger])).filter((t) => !t.sourceRef || t.done);
  const tasks = [...gen, ...stored].sort((a, b) => (a.done - b.done) || String(a.due).localeCompare(String(b.due)));
  const week = weekTasks(snap.c, snap.doneKeys);
  const dueSoon = breedingFemales(snap.data, snap.ix, today).some((c) => { const d = dueInfo(snap.data, snap.s, snap.ix, c); const dd = d.date || d.from; return dd && daysBetween(today, dd) <= 14 && daysBetween(today, dd) >= -21; });
  const blocks = [mode]; if (dueSoon && mode !== "calving") blocks.unshift("calving");
  const head = snap.data.animals.filter(onFarm);
  const scrollY = window.scrollY;

  const node = el(html`<div>
    ${largeTitle("Today", contextLine(snap))}
    <button type="button" class="mode-chip" data-mode>${raw(icon("clock"))}${MODE_NAMES[mode]} mode${auto ? "" : " (set by you)"} · change</button>
    ${alerts.length ? html`<div class="section" data-alerts>${alerts.slice(0, 3).map((a) => alertCard(a, false))}${alerts.length > 3 ? html`<button type="button" class="text-btn" data-more-alerts style="margin-top:4px">${alerts.length - 3} more ${alerts.length - 3 === 1 ? "thing needs" : "things need"} attention ›</button>` : ""}</div>` : ""}
    ${beefBanner(snap.s).map((n) => html`<div class="info-card disease-banner ${n.level}" style="margin-top:12px">${raw(icon(n.level === "info" ? "info" : "alert"))}<span>${n.text}</span></div>`)}
    ${snap.meta.settings?.suspicion ? html`<div class="alert late" style="margin-top:12px"><span class="a-icon">${raw(icon("alert"))}</span><div><div class="a-title">Holding restricted: ${snap.meta.settings.suspicion.what} suspicion</div><div class="a-body">Cattle can only go direct to slaughter until the results are back.</div><div class="a-actions"><a class="text-btn" href="#/l/${lid}/disease">Record the result</a></div></div></div>` : ""}
    ${blocks.map((b) => html`<div class="section">${groupLabel(MODE_NAMES[b])}<div class="season">${seasonBlock(b, snap, money)}</div></div>`)}
    <div class="section" data-tasks>${groupLabel("To do today", tasks.filter((t) => !t.done).length || "")}</div>
    ${week.length ? html`<div class="section"><div class="list"><button type="button" class="disclosure" data-week aria-expanded="false">Coming up this week (${week.length}) ${raw(icon("down", { size: 18 }))}</button>
      <div data-week-list hidden>${week.map((t) => html`<div class="row no-lead"><span class="main"><span class="primary">${t.title}</span><span class="secondary">${listDate(t.show)}</span></span></div>`)}</div></div></div>` : ""}
    <p class="herd-strip">${herdStrip(snap, head)}</p>
  </div>`);
  const tb = node.querySelector("[data-tasks]");
  if (tasks.length) tb.append(taskList(tasks, { max: 12, onChange: () => {} }));
  else if (!alerts.length) {
    const tbn = tbNext(snap.c);
    tb.append(el(emptyState({ sector: "beef", title: head.length ? "Nothing due today" : "No cattle yet", body: head.length ? `The herd's up to date.${tbn ? ` Next thing: TB test ${daysBetween(today, tbn) >= 0 ? `in ${daysBetween(today, tbn)} days` : "overdue"}.` : ""}` : "Add your herd once and every register, reminder and list fills itself.", action: !head.length && canWrite(snap.role, "animals") ? "Add cattle" : null, href: !head.length ? `#/l/${lid}/herd` : null })));
  } else tb.append(el(html`<div class="card pad t-callout ink-2">Nothing else to do today.</div>`));
  body.replaceChildren(node);
  if (scrollY) window.scrollTo(0, scrollY);
  node.querySelector("[data-mode]").onclick = () => modeSheet(snap, () => paint(body, snap));
  const ma = node.querySelector("[data-more-alerts]"); if (ma) ma.onclick = () => openSheet({ title: "Needs attention", body: el(html`<div>${alerts.map((a) => alertCard(a, false))}</div>`), cancelText: "Done" });
  const wk = node.querySelector("[data-week]"); if (wk) wk.onclick = () => { const l = node.querySelector("[data-week-list]"); l.hidden = !l.hidden; wk.setAttribute("aria-expanded", String(!l.hidden)); };
}

function herdStrip(snap, head) {
  const by = {}; for (const a of head) { const c = classOf(snap.ix, a, snap.today); by[c] = (by[c] || 0) + 1; }
  return ["cow", "bull", "heifer", "calf", "weanling", "store", "finisher"].filter((c) => by[c]).map((c) => `${num(by[c])} ${CLASS_NAMES[c].toLowerCase()}`).join(" · ") || "No cattle on the farm yet.";
}

function modeSheet(snap, after) {
  const cur = savedMode(snap.lid);
  const body = el(html`<div><p class="sheet-title-sm">Season mode</p>${radioGroup("mode", [
    { value: "auto", label: "Automatic (by date)", help: `${snap.s.calvingSeason} calving · now ${MODE_NAMES[autoMode(snap.s.calvingSeason, snap.today)]}` },
    ...["calving", "breeding", "sales", "winter"].map((m) => ({ value: m, label: `${MODE_NAMES[m]} mode` })),
  ], cur)}<p class="hint">Modes only change the order of the Today screen. Nothing is hidden.</p></div>`);
  const f = wireForm(body);
  const sh = openSheet({ size: "small", body, label: "Season mode", auto: true });
  f.onChange(() => { try { localStorage.setItem(`fl10-beef-mode-${snap.lid}`, f.values().mode); } catch (e) { /* blocked */ } sh.close(true, { force: true }); after(); });
}

function seasonBlock(mode, snap, money) {
  const { data, s, ix, today, lid } = snap; const L = (h) => `#/l/${lid}/${h}`;
  if (mode === "calving") {
    const cows = breedingFemales(data, ix, today).concat(replacementHeifers(data, ix, today));
    const dues = cows.map((c) => ({ c, d: dueInfo(data, s, ix, c) })).map((x) => ({ ...x, dd: x.d.date || x.d.from })).filter((x) => x.dd && daysBetween(today, x.dd) >= -21 && !(lastCalving(ix, x.c) && lastCalving(ix, x.c).date > addDays(x.dd, -200)));
    const week = dues.filter((x) => daysBetween(today, x.dd) <= 7).sort((a, b) => a.dd.localeCompare(b.dd));
    const bars = Array.from({ length: 14 }, (_, i) => dues.filter((x) => x.dd === addDays(today, i)).length);
    const seasonStart = addDays(today, -120);
    const calvedN = [...ix.calvings.values()].filter((l) => l.some((c) => c.date >= seasonStart)).length;
    const total = calvedN + dues.length;
    const reg = birthsToRegister(data, s, today); const late = reg.filter((r) => r.late).length;
    const next = dues.filter((x) => x.dd >= today).sort((a, b) => a.dd.localeCompare(b.dd));
    return html`${numTile({ hero: true, label: "Due this week", value: num(week.length), delta: next[0] ? `Next: ${animalLabel(next[0].c)} · ${listDate(next[0].dd)}` : "None due in the next 14 days", href: L("breeding/calving") })}
      ${bars.some(Boolean) ? html`<div class="num-tile hero" style="min-height:0;padding-top:8px"><span class="label">Due by day, next 14 days</span>${sparkBars(bars)}</div>` : ""}
      ${numTile({ label: "Calved", value: `${num(calvedN)}${total ? ` of ${num(total)}` : ""}`, delta: "this season", href: L("breeding/fertility") })}
      ${numTile({ label: "To register", value: num(reg.length), delta: reg.length ? `${late} late · ${reg.length - late} due` : "All done", href: L("breeding/register"), tone: late ? "late" : "" })}`;
  }
  if (mode === "breeding" || mode === "grazing") {
    const bull = data.services.filter((x) => x.kind !== "AI" && x.bullIn && x.bullIn <= today && (!x.bullOut || x.bullOut >= today)).sort((a, b) => b.bullIn.localeCompare(a.bullIn))[0];
    const ai = data.services.filter((x) => x.kind === "AI" && daysBetween(x.date, today) <= 7);
    const cows = breedingFemales(data, ix, today);
    const sc = cows.map((c) => scStatus(data, s, ix, c, today)).filter(Boolean);
    const okN = sc.filter((x) => x.status === "ok" || x.status === "open").length;
    const nsb = cows.filter((c) => notSeenBulling(data, ix, c, today)).length;
    const heif = replacementHeifers(data, ix, today).filter((h) => heiferWindow(data, s, ix, h, today)?.status === "open").length;
    let hero;
    if (bull) {
      const outD = bull.bullOut || bull.plannedOut || addDays(bull.bullIn, 63); const len = daysBetween(bull.bullIn, outD); const day = daysBetween(bull.bullIn, today) + 1;
      hero = html`<a class="num-tile hero" href="${L("breeding/board")}"><span class="label">Bull in</span><span class="value" style="font-size:24px;line-height:30px">${bull.sireText || "Bull"} in with ${(bull.femaleIds || []).length} since ${listDate(bull.bullIn)}</span><span class="sub">Day ${day} of ${len} · scan from ${listDate(addDays(outD, 30)).slice(4)}</span><span class="progress-line"><i style="width:${Math.min(100, (day / len) * 100)}%"></i></span></a>`;
    } else hero = numTile({ hero: true, label: ai.length ? "AI this week" : "Breeding", value: ai.length ? num(ai.reduce((n, x) => n + (x.femaleIds || []).length, 0)) : "—", delta: ai.length ? "served · watch for repeats day 18–24" : "Record bull in or AI to start the season", href: L("breeding/board") });
    return html`${hero}
      ${numTile({ label: "Not seen bulling", value: num(nsb), delta: "calved 6 weeks+, no heat", href: L("breeding/board?f=nsb"), tone: nsb ? "due" : "" })}
      ${numTile({ label: "Heifers to serve", value: num(heif), delta: "window open", href: L("breeding/heifers") })}
      ${numTile({ hero: true, label: "SC Scheme on track", value: `${num(okN)} of ${num(cows.length)}`, delta: `can still calve within ${scLimitDays(today)} days${money ? " · £100 each" : ""}`, href: L("breeding/board?f=risk") })}`;
  }
  if (mode === "sales") {
    const fin = deadlineAnimals(data, ix, today).map((a) => ({ a, f: finishingFacts(data, s, ix, a, today) })).filter((x) => x.f.nearest && x.f.nearest.left >= 0).sort((x, y) => x.f.nearest.left - y.f.nearest.left);
    const finishers = data.animals.filter((a) => onFarm(a) && classOf(ix, a, today) === "finisher");
    const month = fin.filter((x) => x.f.nearest.left <= 31).length;
    const unweighed = data.animals.filter((a) => onFarm(a) && ["finisher", "store", "weanling"].includes(classOf(ix, a, today)) && (!lastWeight(ix, a) || daysBetween(lastWeight(ix, a).date, today) > s.weighEveryDays)).length;
    const weanlings = data.animals.filter((a) => onFarm(a) && classOf(ix, a, today) === "calf" && (ageMonths(a, today) ?? 0) >= 6 && !a.weanedOn).length;
    const n = fin[0];
    const spaces = +snap.meta.settings?.shedSpaces || 0; const housing = snap.meta.settings?.housingDate;
    return html`<a class="num-tile hero" href="${L("finishing")}"><span class="label">Finishing</span><span class="value">${num(finishers.length || fin.length)}</span>
        <span class="sub">${month} at a deadline this month</span>${n ? html`<span class="sub">Next: ${tagHtml(n.a.tag)} — ${n.f.nearest.kind === "bcrs" ? `BCRS ${n.f.bcrs.months} months` : "processor spec"} on ${listDate(n.f.nearest.date)} (${n.f.nearest.left} d)</span>` : ""}</a>
      ${numTile({ label: "Weigh due", value: num(unweighed), delta: `not weighed in ${s.weighEveryDays} days`, href: L("herd?f=unweighed"), tone: unweighed ? "due" : "" })}
      ${numTile({ label: "Weanlings", value: num(weanlings), delta: "calves 6 months+ on cows", href: L("herd?f=calf") })}
      ${numTile({ hero: true, label: "Housing", value: housing ? listDate(housing) : "Not planned", delta: spaces ? `shed spaces ${spaces} for ${snap.data.animals.filter(onFarm).length} head` : "Set housing date and shed spaces in Targets", href: L("targets"), tone: spaces && spaces < snap.data.animals.filter(onFarm).length ? "late" : "" })}`;
  }
  // winter feeding
  const sil = snap.silage; const meal = mealToday(data.feedGroups, data.feedAdjust, data, today);
  const price = +s.meal.pricePerTonne || null; const tb = tbNext(snap.c);
  const fort = data.medicines.filter((m) => !m.notUsed && m.date >= addDays(today, -14));
  const reasons = {}; fort.forEach((m) => { if (m.reason) reasons[m.reason] = (reasons[m.reason] || 0) + 1; });
  const topR = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  return html`<a class="num-tile hero" href="${L("feed")}"><span class="label">Silage</span>
      ${sil && sil.runOut ? html`<span class="value">Lasts until ${listDate(sil.runOut).slice(4)}</span>${sil.short != null ? html`<span class="sub ${sil.short > 0 ? "late" : "ok"}">${sil.short > 0 ? `${sil.short} days short of turnout` : `${-sil.short} days spare before turnout`}</span>` : html`<span class="sub">Add a turnout date to see if it'll last</span>`}` : html`<span class="value" style="font-size:24px">No silage recorded</span><span class="sub">Measure your pit to see how long it'll last</span>`}</a>
    ${numTile({ label: "Meal today", value: `${num(meal.kg)} kg`, delta: money && price ? moneyText((meal.kg / 1000) * price) : `${meal.rows.length} feed group${meal.rows.length === 1 ? "" : "s"}`, href: L("feed") })}
    ${numTile({ label: "TB test", value: tb ? (daysBetween(today, tb) >= 0 ? `in ${daysBetween(today, tb)} d` : "Overdue") : "—", delta: tb ? listDate(tb) : "Add your last test", href: L("paperwork/tb"), tone: tb && daysBetween(today, tb) < 0 ? "late" : "" })}
    ${numTile({ hero: true, label: "Treatments this fortnight", value: num(fort.length), delta: topR ? `${topR[1]} ${topR[0].toLowerCase()}` : "None recorded", href: L("paperwork/medicine") })}`;
}
