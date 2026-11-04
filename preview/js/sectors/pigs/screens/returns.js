// Returns and vet visits (design/13 §8.4, §8.5, §19, §8.1 "Plans"):
//   qvr        — quarterly vet visit countdown (due at 16 weeks, late at 20), actions as jobs
//   emb        — eMB-Pigs quarterly antibiotic export (CSV / print), mg/PCU ESTIMATE (labelled)
//   inventory  — the 1 June pig inventory helper, one return per establishment number
//   plans      — health, tail-biting, emergency, extreme weather, biosecurity, trichinella
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { canWrite, canWriteMeta } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { dm, d2, pill, docButtons, n0, n1 } from "../ui.js";
import { qvrState, embDue, quarterOf, embRows, EMB_HEADERS, inventoryDue, PLANS, checkState } from "../model/paperwork.js";
import { mgPerPcu, PCU_NOTE, UK_2024 } from "../model/pcu.js";
import { inventoryCounts } from "../model/inventory.js";
import { markEmb, doneVetAction, saveSettings } from "../actions.js";
import { addDays } from "../model/dates.js";

export default async function returns(ctx) {
  const page = ctx.match.groups.page;
  const title = { qvr: "Vet visits (QVR)", emb: "eMB-Pigs", inventory: "Pig inventory", plans: "Plans" }[page];
  let qSel = null;
  return liveScreen(ctx, { title, tab: "paperwork", paint: (snap) => {
    const back = backLink(`#/l/${snap.lid}/${snap.s.breeding && !snap.s.smallHerd ? "pigs-paperwork" : "paperwork"}`, "Paperwork");
    if (page === "qvr") return qvrHtml(snap, back);
    if (page === "emb") return embHtml(snap, back, qSel);
    if (page === "inventory") return invHtml(snap, back);
    return plansHtml(snap, back);
  }, after: (node, snap, repaint) => {
    node.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => { const [vid, i] = b.dataset.act.split(":"); const v = snap.data.vetVisits.find((x) => x.id === vid); const done = !v.actions[+i].done; doneVetAction(snap, v, +i, done); toast(done ? "Action done" : "Action reopened"); }));
    node.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => { qSel = b.dataset.q; repaint(); }));
    const up = node.querySelector("[data-uploaded]"); if (up) up.onclick = () => { markEmb(snap, up.dataset.uploaded); toast(`${up.dataset.uploaded} marked uploaded to eMB-Pigs`); };
    const eb = node.querySelector("[data-embbtns]"); if (eb) { const q = quarterOf(eb.dataset.embbtns); eb.replaceChildren(docButtons(() => ({ title: `eMB-Pigs antibiotic use ${q.label}`, top: [["Herd mark", snap.s.herdMark || ""], ["Quarter", `${q.start} to ${q.end}`]], headers: EMB_HEADERS, rows: embRows(snap.data.medicines, q).map((r) => [r.product, r.active, r.qty, r.unit, r.pigs, r.batches, r.routes]), note: "From the medicine use records. eMB-Pigs calculates the official mg/PCU." }))); }
    node.querySelectorAll("[data-strength]").forEach((inp) => (inp.onchange = () => { const s = { ...(snap.s.strengths || {}) }; s[inp.dataset.strength] = +inp.value || null; saveSettings(snap, { strengths: s }); }));
  } });
}

function qvrHtml(snap, back) {
  const q = qvrState(snap.data.vetVisits, snap.today); const can = canWrite(snap.role, "vetVisits");
  const visits = snap.data.vetVisits.slice().sort((a, b) => b.date.localeCompare(a.date));
  return html`<div>${back}${largeTitle("Vet visits (QVR)", "Every quarter, never more than 20 weeks apart")}
    <div class="card pad">${q.last ? html`<b>Last QVR ${d2(q.last.date)}${q.last.vet ? ` (${q.last.vet})` : ""}</b><p class="pg-note" style="margin:4px 0 0">${q.weeks} weeks ago · next by ${dm(q.nextBy)} (20-week limit)</p>` : html`<b>No quarterly vet visit recorded</b>`}
      <div class="pg-progress ${q.level === "late" ? "late" : q.level === "due" ? "due" : ""}"><i style="width:${Math.round((q.pct || 0) * 100)}%"></i></div>
      <p class="pg-note" style="margin:0">Turns amber at 16 weeks, red at 20 (Red Tractor AH.10.1).</p>
      ${can ? html`<button type="button" class="btn" style="margin-top:12px" data-flow="vetVisit">${raw(icon("plus"))}Record a vet visit</button>` : ""}</div>
    ${visits.map((v) => html`<div class="section">${groupLabel(`${d2(v.date)} · ${v.type === "other" ? "visit" : "QVR"}`, v.vet || "")}<div class="list">
      ${v.reportNote ? html`<div class="row no-lead"><span class="main"><span class="secondary">${v.reportNote}</span></span></div>` : ""}
      ${(v.actions || []).map((a, i) => html`<div class="row no-lead"><button type="button" class="checkbox" role="checkbox" aria-checked="${!!a.done}" aria-label="${a.text}" data-act="${v.id}:${i}" ${raw(can ? "" : "disabled")} style="border:0;margin-right:12px">${raw(icon("check"))}</button><span class="main"><span class="primary">${a.text}</span><span class="secondary">${a.done ? `Done ${d2(a.done)}` : `Due ${d2(a.due)}`}</span></span>${!a.done && a.due < snap.today ? pill("late", "Late") : ""}</div>`)}
      <div class="row no-lead"><span class="main"><span class="secondary">${[v.tailDockingApproved ? "Tail-docking need reviewed" : null, v.prophylaxisReviewed ? "Prophylaxis reviewed" : null].filter(Boolean).join(" · ") || "—"}</span></span></div></div></div>`)}</div>`;
}

function embHtml(snap, back, qSel) {
  const due = embDue(snap.today, snap.data.embUploads); const cur = quarterOf(snap.today); const prev = quarterOf(addDays(cur.start, -1)); const prev2 = quarterOf(addDays(prev.start, -1));
  const q = [cur, prev, prev2].find((x) => x.label === qSel) || quarterOf(due.start);
  const rows = embRows(snap.data.medicines, q); const done = snap.data.embUploads.find((u) => u.quarter === q.label);
  const strengths = snap.s.strengths || {};
  const mg = rows.reduce((t, r) => t + (strengths[r.product] ? r.qty * strengths[r.product] : 0), 0); const allKnown = rows.length && rows.every((r) => strengths[r.product]);
  const outs = snap.data.moves.filter((m) => m.direction === "off" && m.date >= q.start && m.date <= q.end);
  const produced = { finishers: outs.filter((m) => m.category === "finishers").reduce((t, m) => t + m.n, 0), weaners: outs.filter((m) => m.category === "weaners").reduce((t, m) => t + m.n, 0), sows: snap.data.sows.filter((s) => s.type !== "boar" && !s.cull?.date && !s.died).length / 4 };
  const est = mg ? mgPerPcu(mg, produced) : null; const owner = canWriteMeta(snap.role, "settings");
  return html`<div>${back}${largeTitle(`eMB-Pigs ${q.label}`, `${d2(q.start)} – ${d2(q.end)} · upload by ${d2(q.due)}`)}
    <div class="chips" style="margin-bottom:12px">${[prev2, prev, cur].map((x) => html`<button type="button" class="chip" aria-checked="${x.label === q.label}" data-q="${x.label}">${x.label}</button>`)}</div>
    ${done ? html`<div class="info-card">${raw(icon("check"))}<span>Uploaded ${d2(done.date)}${done.byName ? " · " + done.byName : ""}.</span></div>` : ""}
    <div class="section">${groupLabel("Antibiotics used", rows.length || "")}<div class="list">${rows.length ? rows.map((r) => html`<div class="row no-lead"><span class="main"><span class="primary">${r.product}</span><span class="secondary">${[r.active, `${n1(r.qty, 0)} ${r.unit}`, `${n0(r.pigs)} pigs`, r.batches, r.routes].filter(Boolean).join(" · ")}</span></span>${owner ? html`<label class="pg-mini"><input inputmode="decimal" data-strength="${r.product}" value="${strengths[r.product] || ""}" placeholder="mg"><small>mg/${r.unit || "unit"}</small></label>` : ""}</div>`) : html`<div class="row no-lead"><span class="main"><span class="secondary">No antibiotics recorded this quarter — upload a nil return.</span></span></div>`}</div></div>
    <div data-embbtns="${q.start}"></div>
    ${canWrite(snap.role, "embUploads") && !done ? html`<button type="button" class="btn" style="margin-top:12px" data-uploaded="${q.label}">${raw(icon("check"))}Mark ${q.label} uploaded</button>` : ""}
    <div class="section">${groupLabel("mg/PCU — estimate only")}<div class="card pad"><div class="pg-head" style="margin:0"><b style="font-size:28px">${est != null ? n0(est) : "—"}<small style="font-size:15px;color:var(--ink-2)"> mg/PCU</small></b><span class="ink-2">${UK_2024.label}</span></div>
      <p class="pg-note">${PCU_NOTE}${!allKnown && rows.length ? " Add the mg of active ingredient per unit beside each product to include it." : ""}</p></div></div></div>`;
}

function invHtml(snap, back) {
  const inv = inventoryDue(snap.today, snap.ledger.region || "NI"); const c = inventoryCounts(snap); const past = snap.data.inventories.slice().sort((a, b) => b.date.localeCompare(a.date));
  const done = past.find((x) => x.date === inv.date);
  return html`<div>${back}${largeTitle("Pig inventory", `Count on ${dm(inv.date)} · DAERA / NISRA survey`)}
    <div class="info-card">${raw(icon("info"))}<span>One return per herd / establishment number (the new name for the herd mark), even with no pigs on the day.${snap.s.contract.on ? " Pigs you rear for another business are left out." : ""}</span></div>
    <div class="section">${groupLabel("From your records today")}<div class="list">${Object.entries(c.counts).map(([k, n]) => html`<div class="row no-lead pg-kv"><span class="main"><span class="primary">${k[0].toUpperCase() + k.slice(1)}</span></span><span class="v">${n0(n)}</span></div>`)}<div class="row no-lead pg-kv"><span class="main"><span class="primary"><b>Total</b></span></span><span class="v">${n0(c.total)}</span></div></div></div>
    ${canWrite(snap.role, "inventories") ? html`<button type="button" class="btn" style="margin-top:12px" data-flow="inventory" data-arg="${flowArg({ date: inv.date })}">${done ? "Record it again" : `Record the ${d2(inv.date)} count`}</button>` : ""}
    <div class="section">${groupLabel("Returns")}<div class="list">${past.length ? past.map((x) => html`<div class="row no-lead"><span class="main"><span class="primary">${d2(x.date)} ${x.date.slice(0, 4)} · ${n0(x.total)} pigs</span><span class="secondary">${x.establishment || ""}${x.submittedOn ? ` · sent ${d2(x.submittedOn)}` : " · not sent yet"}${x.ref ? " · ref " + x.ref : ""}</span></span>${x.submittedOn ? pill("ok", "Sent") : pill("due", "To send")}</div>`) : html`<div class="row no-lead"><span class="main"><span class="secondary">No inventory recorded yet.</span></span></div>`}</div></div></div>`;
}

function plansHtml(snap, back) {
  const can = canWrite(snap.role, "plans"); const tr = checkState(snap.data.siteChecks, "tailRisk", snap.today);
  return html`<div>${back}${largeTitle("Plans", "Signed off and reviewed every year")}
    <div class="list">${PLANS.map(([k, name]) => { const p = snap.data.plans.filter((x) => x.kind === k).sort((a, b) => b.signedOn.localeCompare(a.signedOn))[0]; const old = p && p.signedOn < addDays(snap.today, -365);
      return html`<div class="row no-lead"><span class="main"><span class="primary">${name}</span><span class="secondary">${p ? `Signed ${d2(p.signedOn)} ${p.signedOn.slice(0, 4)}${p.by ? " · " + p.by : ""}${p.note ? " · " + p.note : ""}` : "Not on file"}</span></span>${p ? (old ? pill("due", "Review") : pill("ok", "On file")) : pill("late", "Missing")}${can ? html`<button type="button" class="text-btn" data-flow="plan" data-arg="${flowArg({ kind: k })}">${p ? "Renew" : "Add"}</button>` : ""}</div>`; })}</div>
    <div class="section">${groupLabel("Tail-biting risk assessment")}<div class="list"><div class="row no-lead"><span class="main"><span class="primary">Yearly assessment (HP.3.1)</span><span class="secondary">${tr.last ? `Done ${d2(tr.last.date)} · next by ${d2(tr.due)}` : "Not done yet"}</span></span>${can ? html`<button type="button" class="text-btn" data-flow="siteCheck" data-arg="${flowArg({ kind: "tailRisk" })}">Record</button>` : ""}</div></div></div>
    <p class="pg-note">Keep the documents themselves in Documents on your farm (Overview → More).</p></div>`;
}
