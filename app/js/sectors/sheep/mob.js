// One mob (design/11 §5.1): count over time, events, individuals, field history, health
// (doses with wormer group colour, FEC, lame checks with the 2% line), split / merge.
import { html, raw } from "../../core/html.js";
import { icon } from "../../ui/icons.js";
import { canWrite } from "../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../screens/common.js";
import { liveScreen } from "./screen.js";
import { short, num, groupChip, lineChart, kvRows, pill } from "./ui.js";
import { CLASSES, countHistory, fieldHistory, mobField } from "./model/mobs.js";
import { doses, lameChecks, lamePct, mobWithdrawal, fecVerdict } from "./model/health.js";
import { mobLines } from "./mobs.js";

const KIND = { set: "Count check", delta: "", move: "Split", merge: "Merged" };
function changeLabel(c, snap) {
  const r = c.ref || {}; const name = (id) => snap.data.mobs.find((m) => m.id === id)?.name || "another mob";
  if (c.kind === "set") return r.reason === "start" ? "Mob started" : `Count check (${r.reason || "confirmed"})`;
  if (c.kind === "move") return c.count < c.was ? `Split: ${c.was - c.count} to ${name(r.toMobId)}` : `From ${name(r.mobId)} (split)`;
  if (c.kind === "merge") return c.count === 0 ? `Merged into ${name(r.toMobId)}` : `${name(r.mobId)} merged in`;
  if (r.kind === "off") return `Moved off: ${r.otherName || r.dest || ""}`;
  if (r.kind === "on") return `Bought in / moved on: ${r.otherName || r.otherFlock || ""}`;
  if (r.cause || r.over18m != null) return `Died${r.cause ? ": " + r.cause.toLowerCase() : ""}`;
  if (r.count != null && r.tagFrom != null || r.tagType) return "Lambs tagged";
  return "Change";
}

export default async function mob(ctx) {
  const id = ctx.match.groups.id;
  return liveScreen(ctx, { title: "Mob", tab: "mobs", paint: (snap) => {
    const m = snap.data.mobs.find((x) => x.id === id);
    if (!m) return html`<div>${backLink(`#/l/${snap.lid}/mobs`, "Mobs")}${largeTitle("Mob not found")}<p class="t-callout ink-2">It may have been removed.</p></div>`;
    const w = canWrite(snap.role, "events"); const n = snap.counts.get(m.id) || 0; const f = mobField(snap.data, m);
    const hist = countHistory(snap.data, m.id); const pts = hist.map((h) => ({ x: h.date, y: h.count }));
    const ds = doses(snap.data, m.id); const lames = lameChecks(snap.data, m.id); const fecs = snap.data.events.filter((e) => e.kind === "fec" && e.mobId === m.id).sort((a, b) => b.date.localeCompare(a.date));
    const inds = (snap.data.sheep || []).filter((x) => x.mobId === m.id && (x.status || "on") === "on");
    const wd = mobWithdrawal(snap.data, m.id, snap.today); const fields = fieldHistory(snap.data, m.id);
    const A = (flow, label, ic) => html`<button type="button" class="btn secondary" data-flow="${flow}">${raw(icon(ic, { size: 20 }))} ${label}</button>`;
    return html`<div>${backLink(`#/l/${snap.lid}/mobs`, "Mobs")}${largeTitle(m.name, [CLASSES[m.class], m.breed, (m.birthYears || []).join(", "), m.active === false ? "closed" : null].filter(Boolean).join(" · "))}
      <div class="s-hero"><span class="k">${f.name || "No field set"}${f.since ? ` · since ${short(f.since)}` : ""}</span><div class="big">${num(n)} <span style="font-size:19px;font-weight:600">in the mob</span></div>${mobLines(snap, m).map((l) => html`<span class="sub" style="display:block">${l}</span>`)}</div>
      ${wd ? html`<div class="banner late">${raw(icon("alert"))}<span><b>Under meat withdrawal</b>Don't sell for meat until ${short(wd.until)} (${wd.med.productName}).</span></div>` : ""}
      ${w && m.active !== false ? html`<div class="act-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0" data-acts>
        ${A("treat", "Treat", "syringe")}${A("move", "Move field", "map")}${A("lame", "Lame count", "alert")}${A("fec", "FEC result", "search")}${A("weigh", "Weigh", "scale")}${A("death", "Death", "alert")}
        <button type="button" class="btn secondary" data-mobact="count">${raw(icon("check", { size: 20 }))} Count check</button><button type="button" class="btn secondary" data-mobact="split">${raw(icon("grid", { size: 20 }))} Split</button>
        <button type="button" class="btn secondary" data-mobact="merge">${raw(icon("people", { size: 20 }))} Merge into…</button><button type="button" class="btn secondary" data-mobact="edit">${raw(icon("edit", { size: 20 }))} Edit</button>
        ${A("offMove", "Move off farm", "truck")}<button type="button" class="btn secondary" data-mobact="addSheep">${raw(icon("tag", { size: 20 }))} Add a sheep</button></div>` : ""}
      ${pts.length > 1 ? html`<div class="section">${groupLabel("Count over time")}<div class="card pad">${lineChart(pts)}</div></div>` : ""}
      <div class="section">${groupLabel("Health", ds.length || "")}
        ${ds.length ? html`<div class="list">${ds.slice(0, 12).map((d) => html`<div class="row no-lead"><span class="main"><span class="primary">${d.productName} · ${d.reason}</span><span class="secondary">${short(d.date)} · ${d.numberTreated} treated${d.wormerGroup ? html` · ${groupChip(d.wormerGroup)}` : ""}${d.withdrawalUntil ? ` · clear ${short(d.withdrawalUntil)}` : ""}</span></span></div>`)}</div>` : html`<div class="card pad t-callout ink-2">No doses recorded for this mob.</div>`}
        ${fecs.length ? html`<p class="form-label">Worm egg counts</p>${kvRows(fecs.slice(0, 6).map((e) => [short(e.date), `${e.counts?.strongyle ?? "–"} epg`, fecVerdict(e.counts?.strongyle, snap.s.fecThreshold)?.dose ? "late" : "ok", [e.lab, e.counts?.nematodirus != null ? `Nematodirus ${e.counts.nematodirus}` : null, e.postDoseOf ? "drench check" : null].filter(Boolean).join(" · ")]))}` : ""}
        ${lames.length ? html`<p class="form-label">Lame checks · target under ${snap.s.lameTarget}%</p><div class="card pad">${lineChart(lames.slice().reverse().map((e) => ({ x: e.date, y: lamePct(+e.counts.lame, +e.counts.outOf) })), { target: snap.s.lameTarget, unit: "%" })}${kvRows(lames.slice(0, 5).map((e) => [short(e.date), `${lamePct(+e.counts.lame, +e.counts.outOf)}%`, lamePct(+e.counts.lame, +e.counts.outOf) > snap.s.lameTarget ? "late" : "ok", `${e.counts.lame} of ${e.counts.outOf}`]))}</div>` : ""}</div>
      ${inds.length ? html`<div class="section">${groupLabel("Individual sheep", inds.length)}<div class="list">${inds.map((x) => html`<a class="row no-lead" href="#/l/${snap.lid}/sheep/${x.id}"><span class="main"><span class="primary">${x.tag || x.eid}</span><span class="secondary">${[x.breed, x.birthYear].filter(Boolean).join(" · ")}</span></span>${(x.cullFlags || []).length ? pill("due", "Cull") : ""}<span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>` : ""}
      <div class="section">${groupLabel("Count trail")}<div class="list">${hist.slice().reverse().slice(0, 20).map((h) => html`<div class="row no-lead"><span class="main"><span class="primary">${changeLabel(h, snap)}</span><span class="secondary">${short(h.date)}</span></span><span class="kv-v">${h.count}</span></div>`)}</div></div>
      ${fields.length ? html`<div class="section">${groupLabel("Field history")}${kvRows(fields.map((e) => [e.toField, short(e.date), "", e.fromField ? `from ${e.fromField}` : ""]))}</div>` : ""}
    </div>`;
  }, after: (node, snap) => {
    const m = snap.data.mobs.find((x) => x.id === id); if (!m) return;
    node.querySelector("[data-acts]")?.addEventListener("click", async (e) => {
      const fb = e.target.closest("[data-flow]"); if (fb) { e.stopPropagation(); const { FLOWS } = await import("./quick-add.js"); FLOWS[fb.dataset.flow].run(snap, { mob: m }); return; }
      const b = e.target.closest("[data-mobact]"); if (!b) return; const E = await import("./flows/mob-edit.js");
      ({ count: () => E.countCheckSheet(snap, m), split: () => E.splitSheet(snap, m), merge: () => E.mergeSheet(snap, m), edit: () => E.editMobSheet(snap, m), addSheep: () => E.addSheepSheet(snap, { mob: m }) })[b.dataset.mobact]();
    }, true);
  } });
}
