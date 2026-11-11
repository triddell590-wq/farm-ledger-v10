// Worm and fluke plan (design/11 §7): this year's rotation by wormer group, seasonal risk content
// (with its updated date), and a timeline per mob of doses, FEC results and drench checks.
import { viewPills } from "../../ui/view-pills.js";
import { html, raw } from "../../core/html.js";
import { icon } from "../../ui/icons.js";
import { canWrite } from "../../core/policy.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../screens/common.js";
import { liveScreen } from "./screen.js";
import { short, groupChip, pill } from "./ui.js";
import { activeMobs, mobField } from "./model/mobs.js";
import { rotation, WORMER_GROUPS, doses, fecVerdict, fecReduction, preDoseFec, drenchChecksDue, flukeStage, groupUses } from "./model/health.js";
import { seasonalFor } from "./model/content.js";

/** One mob's worm timeline: doses, FECs and moves, newest first. */
export function wormTimeline(data, mobId) {
  const out = [];
  for (const d of doses(data, mobId)) if (d.wormerGroup || d.reason === "Worms" || d.reason === "Fluke") out.push({ date: d.date, kind: "dose", d });
  for (const e of data.events || []) if (!e.deleted && e.mobId === mobId && (e.kind === "fec" || e.kind === "fieldMove")) out.push({ date: e.date, kind: e.kind, e });
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export default async function worms(ctx) {
  return liveScreen(ctx, { title: "Worm and fluke plan", tab: "mobs", depth: 0, paint: (snap) => {
    const { data, today, s, lid } = snap; const year = today.slice(0, 4); const rot = rotation(data, year); const max = Math.max(1, ...Object.values(rot));
    const write = canWrite(snap.role, "medicines"); const season = seasonalFor(today); const due = drenchChecksDue(data, s, today);
    const mobs = activeMobs(data).filter((m) => m.class !== "rams" || doses(data, m.id).length);
    const any = data.medicines.some((m) => m.wormerGroup || m.reason === "Worms" || m.reason === "Fluke");
    const used = Object.entries(rot).filter(([, n]) => n).map(([g, n]) => `${WORMER_GROUPS[g].label} ${n}`).join(" · ");
    return html`<div>${largeTitle("Worm and fluke plan", used || `No wormers recorded in ${year}`)}${viewPills(lid, [["mobs", "Mobs"], ["worms", "Worm & fluke"]], "worms", "Mob views")}
      ${season.map((x) => html`<div class="info-card" style="margin-bottom:8px">${raw(icon("info"))}<span><b>${x.title}:</b> ${x.text} <span class="ink-3">(Updated ${short(x.updated)} · ${x.source})</span></span></div>`)}
      ${write ? html`<div class="btn-col" style="margin:12px 0"><button type="button" class="btn" data-flow="treat">Record a dose</button><button type="button" class="btn secondary" data-flow="fec">FEC result</button></div>` : ""}
      ${!any ? emptyState({ sector: "sheep", title: "No doses recorded", body: "Record each dose with its wormer group so you can see what you've used.", action: write ? "Record a dose" : null, actAttr: 'data-flow="treat"' }) : html`
      <div class="section">${groupLabel(`Wormer groups used in ${year}`)}<div class="card pad rot">${Object.keys(WORMER_GROUPS).map((g) => html`<div><span>${groupChip(g)}</span><i style="width:${(rot[g] / max) * 100}%;${rot[g] ? "" : "opacity:.15"}"></i><b>${rot[g]}</b></div>`)}</div>
        <p class="hint">Rotate groups between years, not doses. Use 4-AD orange or 5-SI purple as a quarantine dose for bought-in sheep.</p></div>
      ${due.length ? html`<div class="section">${groupLabel("Drench checks due", due.length)}<div class="list">${due.map(({ dose, due: d }) => html`<div class="row no-lead"><span class="main"><span class="primary">${dose.mobName || data.mobs.find((m) => m.id === dose.mobId)?.name || "Mob"} — FEC 7–14 days after dose</span><span class="secondary">Dosed ${short(dose.date)} with ${dose.productName}${dose.wormerGroup ? ` (${WORMER_GROUPS[dose.wormerGroup].label})` : ""}</span></span>${pill(d < today ? "late" : d === today ? "due" : "info", short(d))}</div>`)}</div></div>` : ""}`}
      ${mobs.map((m) => { const tl = wormTimeline(data, m.id); if (!tl.length) return ""; const f = mobField(data, m);
        return html`<div class="section">${groupLabel(m.name, f.name || "")}<div class="list">${tl.slice(0, 10).map((x) => {
          if (x.kind === "dose") { const d = x.d; const uses = d.wormerGroup ? groupUses(data, m.id, d.wormerGroup, year) : 0; const stage = d.reason === "Fluke" ? flukeStage(d.productName, snap.store.find((p) => p.id === d.productId)?.notes) : "";
            return html`<div class="row no-lead"><span class="main"><span class="primary">${short(d.date)} · ${d.productName}</span><span class="secondary">${d.wormerGroup ? html`${groupChip(d.wormerGroup)} · ` : ""}${d.reason}${stage ? ` · kills ${stage}` : ""} · ${d.numberTreated} dosed${uses >= 3 ? ` · ${uses}× this year` : ""}</span></span></div>`; }
          if (x.kind === "fec") { const e = x.e; const v = fecVerdict(e.counts?.strongyle, s.fecThreshold); const dose = e.postDoseOf && data.medicines.find((d) => d.id === e.postDoseOf); const pre = dose && preDoseFec(data, dose); const red = pre && fecReduction(+pre.counts?.strongyle, +e.counts?.strongyle);
            return html`<div class="row no-lead"><span class="main"><span class="primary">${short(e.date)} · FEC ${e.counts?.strongyle ?? "–"} epg${e.postDoseOf ? " (drench check)" : ""}</span><span class="secondary">${[e.counts?.nematodirus != null ? `Nematodirus ${e.counts.nematodirus}` : null, e.counts?.fluke ? `fluke ${e.counts.fluke}` : null, red ? `reduction ${red.pct}%${red.ok ? "" : " — wormer may not be working"}` : null, e.lab].filter(Boolean).join(" · ")}</span></span>${v ? pill(v.dose ? "due" : "ok", v.dose ? "Dose" : "OK") : ""}</div>`; }
          return html`<div class="row no-lead"><span class="main"><span class="primary">${short(x.e.date)} · moved to ${x.e.toField}</span><span class="secondary">${x.e.fromField ? `from ${x.e.fromField}` : "field move"}${tl.some((y) => y.kind === "dose" && y.date === x.e.date) ? " · dose and move" : ""}</span></span></div>`;
        })}</div></div>`; })}
      <p class="foot-note">FEC threshold ${s.fecThreshold} epg (your vet sets this, in Targets). Drench check ${s.drenchCheckDays} days after a dose; under 95% reduction means the wormer may not be working.</p></div>`;
  } });
}
