// One individual sheep (design/11 §5.1 — optional, EID or need): tag, EID, breed, born,
// lambing history (born / reared per year), problems, treatments, cull flags; rams show MOT.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { chipGroup } from "../../ui/form.js";
import { canWrite } from "../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../screens/common.js";
import { liveScreen } from "./screen.js";
import { short, kvRows, pill, entrySheet, chipsField, opt } from "./ui.js";
import { CULL_REASONS } from "./model/selling.js";
import * as A from "./actions.js";

export function lambingHistory(snap, sh) {
  const tail = String(sh.tag || "").replace(/\s+/g, "").slice(-5);
  const mine = snap.data.lambings.filter((l) => l.eweId === sh.id || (tail && String(l.eweTag || "").replace(/\s+/g, "").endsWith(tail)));
  const by = {};
  for (const l of mine) { const y = (l.datetime || "").slice(0, 4); by[y] = by[y] || { year: y, born: 0, alive: 0, problems: [], aborted: false }; by[y].born += (l.lambs || []).length; by[y].alive += (l.lambs || []).filter((x) => x.alive).length; by[y].problems.push(...(l.problems || [])); if (l.aborted) by[y].aborted = true; }
  return Object.values(by).sort((a, b) => b.year.localeCompare(a.year));
}

export default async function ewe(ctx) {
  const id = ctx.match.groups.id;
  return liveScreen(ctx, { title: "Sheep", tab: "mobs", depth: 2, paint: (snap) => {
    const sh = snap.data.sheep.find((x) => x.id === id);
    if (!sh) return html`<div>${backLink(`#/l/${snap.lid}/mobs`, "Mobs")}${largeTitle("Sheep not found")}</div>`;
    const mob = snap.data.mobs.find((m) => m.id === sh.mobId); const w = canWrite(snap.role, "sheep");
    const hist = lambingHistory(snap, sh);
    const tail = String(sh.tag || "").replace(/\s+/g, "").slice(-5);
    const meds = snap.data.medicines.filter((m) => (m.tags || []).some((t) => String(t).replace(/\s+/g, "").endsWith(tail)) || (m.mobId === sh.mobId && !(m.tags || []).length)).slice(0, 10);
    const lastMot = (sh.mot || []).slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    return html`<div>${backLink(mob ? `#/l/${snap.lid}/mob/${mob.id}` : `#/l/${snap.lid}/mobs`, mob ? mob.name : "Mobs")}
      ${largeTitle(sh.tag || sh.eid, [sh.class === "ram" ? "Ram" : sh.sex === "M" ? "Male" : "Ewe", sh.breed, sh.birthYear ? `born ${sh.birthYear}` : null, sh.status && sh.status !== "on" ? sh.status : null].filter(Boolean).join(" · "))}
      ${(sh.cullFlags || []).length ? html`<div class="banner late">${raw(icon("alert"))}<span><b>On the cull list</b>${[...new Set(sh.cullFlags.map((f) => f.reason))].join(", ")}</span></div>` : ""}
      ${kvRows([["Tag", sh.tag || "–"], ["EID", sh.eid || "–"], ["Mob", mob ? mob.name : "–"], ["Species", sh.species === "goat" ? "Goat" : "Sheep"], sh.damTag && ["Dam", sh.damTag], sh.sireTag && ["Sire", sh.sireTag], ...(sh.replacementTags || []).map((r) => ["Replacement tag", `${r.old} ↔ ${r.new}`, "", short(r.date)])])}
      ${w ? html`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0"><button type="button" class="btn secondary" data-a="cull">${raw(icon("alert", { size: 20 }))} Flag to cull</button><button type="button" class="btn secondary" data-a="death">${raw(icon("alert", { size: 20 }))} Died</button>${sh.class === "ram" ? html`<button type="button" class="btn secondary" data-a="mot">${raw(icon("check", { size: 20 }))} Ram MOT</button><button type="button" class="btn secondary" data-a="rest">${sh.resting ? "Back to work" : "Resting"}</button>` : ""}</div>` : ""}
      ${sh.class === "ram" ? html`<div class="section">${groupLabel("Ram MOT")}${lastMot ? kvRows([["Last MOT", short(lastMot.date), lastMot.ok ? "ok" : "late"], ["Teeth", lastMot.teeth ? "OK" : "Check"], ["Toes", lastMot.toes ? "OK" : "Check"], ["Testicles", lastMot.testicles ? "OK" : "Check"], ["Tone", lastMot.tone ? "OK" : "Check"], ["Body condition", lastMot.bcs || "–"]]) : html`<div class="card pad t-callout ink-2">No MOT yet. Check teeth, toes, testicles and tone 6–8 weeks before rams in.</div>`}</div>` : html`<div class="section">${groupLabel("Lambing history")}${hist.length ? kvRows(hist.map((h) => [h.year, h.aborted ? "Aborted" : `${h.born} born · ${h.alive} alive`, h.aborted ? "late" : "", h.problems.length ? h.problems.join(", ") : ""])) : html`<div class="card pad t-callout ink-2">No lambings recorded against this ewe's tag.</div>`}</div>`}
      <div class="section">${groupLabel("Treatments")}${meds.length ? kvRows(meds.map((m) => [m.productName, short(m.date), "", `${m.reason}${(m.tags || []).length ? "" : " · whole mob"}`])) : html`<div class="card pad t-callout ink-2">No treatments recorded.</div>`}</div>
      ${(sh.cullFlags || []).length ? html`<div class="section">${groupLabel("Cull flags")}${kvRows(sh.cullFlags.map((f) => [f.reason, short(f.date), "", f.by]))}</div>` : ""}
    </div>`;
  }, after: (node, snap) => {
    const sh = snap.data.sheep.find((x) => x.id === id); if (!sh) return;
    node.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-a]"); if (!b) return;
      if (b.dataset.a === "cull") { const body = el(html`<form novalidate>${chipsField("Reason", chipGroup("reason", opt(CULL_REASONS), [], { multi: false }))}</form>`); entrySheet({ title: "Flag to cull", body, label: "Add to cull list", missing: (v) => (v.reason ? null : "Choose a reason"), save: (v, s) => { A.flagCull(snap.lid, sh, v.reason); s.close(true, { force: true }); toast("Added to the cull list"); } }); }
      if (b.dataset.a === "death") (await import("./flows/events.js")).deathSheet(snap, { mob: snap.data.mobs.find((m) => m.id === sh.mobId), sheep: sh });
      if (b.dataset.a === "mot") (await import("./rams.js")).motSheet(snap, sh);
      if (b.dataset.a === "rest") { A.updateSheep(snap.lid, sh, { resting: !sh.resting }); toast(sh.resting ? "Back to work" : "Marked as resting"); }
    });
  } });
}
export { pill };
