// Sale or kill sheet (design/10 §6.4). Guards: withdrawal (factory blocked; live sale only with
// an FCI declaration), TB restriction (factory only), BVD breeding-female restriction (from
// 1 Mar 2026, Research B verification pass). After save: animals off the farm, movement off,
// NIFAIS job (factory notifies for you), finance line with copied sale lines (01 §15.2), BCRS check.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { textField, selectField, segmented, checkRow } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr, addDays } from "../../../core/dates.js";
import { canRead } from "../../../core/policy.js";
import { cattleRow, entrySheet, opt } from "./common.js";
import { recordSale } from "../actions.js";
import { withdrawal, lastWeight, ageMonths } from "../model/animals.js";
import { tagParts, isFemale } from "../model/tags.js";
import { listDate, moneyText } from "../../../ui/format.js";
import { animalLabel } from "../ui.js";
import { bvdFemaleRule, standstillDays } from "../model/region.js";
import { nifaisDays } from "../model/duties.js";
import { parseKillSheet } from "../model/docket.js";
import { readTextSheet } from "./read-text.js";
import { photoStrip } from "../../../ui/photo-strip.js";

export default function saleSheet(snap, { animalIds = [], kind = null } = {}) {
  const money = canRead(snap.role, "finance");
  const restricted = snap.meta.settings?.tbStatus === "restricted" || snap.meta.settings?.bvdRestricted || !!snap.meta.settings?.suspicion;
  const contacts = snap.contacts.filter((c) => ["Mart", "Processor", "Haulier"].includes(c.kind));
  const body = el(html`<form novalidate data-sector="beef">
    ${segmented("kind", opt([["mart", "Mart"], ["factory", "Factory"], ["private", "Private"], ["export", "Export"]]), restricted ? "factory" : kind || "mart")}
    <div data-guard style="margin-top:12px"></div>
    <div class="form-group" style="margin-top:12px" data-top>
      ${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}
      ${contacts.length ? selectField({ name: "buyerPick", label: "Buyer", value: "", options: [{ value: "", label: "Type below" }, ...contacts.map((c) => ({ value: c.id, label: c.name }))] }) : ""}
      ${textField({ name: "buyer", label: "Mart / factory / buyer", placeholder: "e.g. Linden Foods, Dungannon" })}
      ${textField({ name: "haulage", label: "Distance (km)", inputmode: "numeric", optional: true })}
    </div>
    <p class="hint" data-atc></p>
    <div data-kill hidden style="margin:8px 0"><button type="button" class="btn secondary" data-killsheet>${raw(icon("camera"))}Kill sheet: photo or type it in</button></div>
    <p class="form-label">Per animal</p><div data-lines></div>
    <div class="form-group" data-declare hidden style="margin-top:12px">${checkRow("fci", "I'll declare the withdrawal to the buyer (FCI)", false, "Live sales during withdrawal are legal only if declared.")}</div>
  </form>`);
  const who = cattleRow(snap, { label: "Cattle", ids: animalIds, onChange: () => { paintLines(); refresh(); } });
  body.querySelector("[data-top]").prepend(who.node);
  const vals = {}; // per animal line values
  const cols = (kind) => kind === "factory" ? [["deadKg", "Dead kg"], ["grade", "Grade"], ["pricePerKg", "£/kg"]] : kind === "mart" ? [["lot", "Lot"], ["liveKg", "Live kg"], ["price", "£"]] : [["liveKg", "Live kg"], ["price", "£"]];
  const paintLines = () => {
    const v = F ? F.values() : { kind: "mart" }; const c = cols(v.kind).filter(([k]) => money || !["price", "pricePerKg"].includes(k));
    const rows = who.ids().map((id) => snap.ix.byId.get(id)).filter(Boolean);
    body.querySelector("[data-lines]").replaceChildren(el(rows.length ? html`<div class="card pad"><table class="dose-table"><thead><tr><th>Animal</th>${c.map(([, l]) => html`<th>${l}</th>`)}${money && v.kind === "factory" ? html`<th>£</th>` : ""}</tr></thead><tbody>
      ${rows.map((a) => html`<tr><td>${tagParts(a.tag).tail}<br><span class="ink-2" style="font-size:13px">${Math.floor(ageMonths(a, snap.today) || 0)} mo</span></td>${c.map(([k]) => html`<td><input data-l="${a.id}" data-k="${k}" value="${vals[a.id]?.[k] ?? (k === "liveKg" ? lastWeight(snap.ix, a)?.kg ?? "" : "")}" ${raw(k === "grade" || k === "lot" ? "" : 'inputmode="decimal"')} aria-label="${k} for ${tagParts(a.tag).tail}"></td>`)}
        ${money && v.kind === "factory" ? html`<td>${(+vals[a.id]?.deadKg && +vals[a.id]?.pricePerKg) ? moneyText(+vals[a.id].deadKg * +vals[a.id].pricePerKg) : "—"}</td>` : ""}</tr>`)}</tbody></table></div>` : html`<p class="hint">Choose the cattle first.</p>`));
    body.querySelectorAll("[data-l]").forEach((i) => i.addEventListener("change", () => { (vals[i.dataset.l] = vals[i.dataset.l] || {})[i.dataset.k] = i.value; if (v.kind === "factory") paintLines(); }));
    paintGuard();
  };
  const blockers = () => {
    const v = F ? F.values() : { kind: "mart" }; const out = [];
    const inWd = who.ids().map((id) => snap.ix.byId.get(id)).filter((a) => a && withdrawal(snap.ix, a, v.date || snap.today));
    if (inWd.length) out.push({ kind: "wd", animals: inWd });
    if (restricted && v.kind !== "factory") out.push({ kind: "tb" });
    const bvd = bvdFemaleRule(snap.s, v.date || snap.today);
    if (bvd && bvd.inForce && snap.meta.settings?.bvdRestricted && v.kind !== "factory" && who.ids().some((id) => { const a = snap.ix.byId.get(id); return a && isFemale(a) && (ageMonths(a, snap.today) || 0) >= bvd.minAgeMonths; })) out.push({ kind: "bvd", rule: bvd });
    return out;
  };
  const paintGuard = () => {
    const v = F ? F.values() : { kind: "mart" }; const g = body.querySelector("[data-guard]"); const b = blockers();
    const wd = b.find((x) => x.kind === "wd");
    g.replaceChildren(el(html`<div>${b.map((x) => x.kind === "wd" ? html`<div class="alert late" role="alert"><span class="a-icon">${raw(icon("alert"))}</span><div style="flex:1"><div class="a-title">${x.animals.length === 1 ? `${animalLabel(x.animals[0])} is in withdrawal until ${listDate(withdrawal(snap.ix, x.animals[0], v.date).until)}` : `${x.animals.length} cattle are in withdrawal`}</div><div class="a-body">${v.kind === "factory" ? "Cattle in withdrawal can't go for slaughter." : "You can sell them live only if you declare it to the buyer."}</div><div class="a-actions"><button type="button" class="text-btn" data-rm-wd>Remove from sale</button></div></div></div>`
      : x.kind === "tb" ? html`<div class="alert late"><span class="a-icon">${raw(icon("alert"))}</span><div><div class="a-title">Your herd is restricted${snap.meta.settings?.suspicion ? ` (${snap.meta.settings.suspicion.what} suspicion)` : snap.meta.settings?.tbStatus === "restricted" ? " (TB)" : " (BVD)"}</div><div class="a-body">Cattle can only go direct to slaughter.</div></div></div>`
      : html`<div class="alert late"><span class="a-icon">${raw(icon("alert"))}</span><div><div class="a-title">BVD rules: breeding-age females in an affected herd can't move for breeding${x.rule.fromText ? ` (from ${x.rule.fromText})` : ""}</div><div class="a-body">Females ${x.rule.minAgeMonths} months and over can only go direct to slaughter for ${x.rule.restrictWeeks} weeks.</div></div></div>`)}</div>`));
    const sd = standstillDays(snap.s); const bvdInfo = bvdFemaleRule(snap.s, v.date || snap.today);
    if (bvdInfo && !bvdInfo.inForce && snap.meta.settings?.bvdRestricted && v.kind !== "factory") g.append(el(html`<p class="hint" data-bvd-info>BVD breeding-female rule ${bvdInfo.status === "delayed" ? "delayed" : "announced"} — not in force yet.</p>`));
    const stand = sd == null ? [] : who.ids().map((id) => snap.ix.byId.get(id)).filter(Boolean).map((a) => ({ a, m: snap.data.movements.filter((m) => m.kind === "on" && (m.animalIds || []).includes(a.id) && (m.lot || /mart|market/i.test(m.from || "")) && m.date > addDays(v.date || snap.today, -(sd + 1))).sort((x, y) => y.date.localeCompare(x.date))[0] })).filter((x) => x.m);
    if (stand.length && v.kind === "mart") g.append(el(html`<div class="alert due"><span class="a-icon">${raw(icon("clock"))}</span><div><div class="a-title">Market standstill</div><div class="a-body">${stand.map((x) => `${animalLabel(x.a)} was at ${x.m.from || "a mart"} on ${listDate(x.m.date)} — can't go to a market again until ${listDate(addDays(x.m.date, sd + 1))}.`).join(" ")}</div></div></div>`));
    const rm = g.querySelector("[data-rm-wd]"); if (rm) rm.onclick = () => { who.set(who.ids().filter((id) => !wd.animals.some((a) => a.id === id))); paintLines(); refresh(); };
    body.querySelector("[data-declare]").hidden = !(wd && v.kind !== "factory");
    body.querySelector("[data-kill]").hidden = v.kind !== "factory";
    const km = +v.haulage || 0; body.querySelector("[data-atc]").textContent = km > 65 ? "Over 65 km: you need a transporter authorisation and certificate of competence (ATC)." : "";
  };
  const missing = (v) => {
    if (!who.ids().length) return "Choose the cattle to save";
    const b = blockers();
    if (b.some((x) => x.kind === "tb" || x.kind === "bvd")) return "Restricted: factory only";
    if (b.some((x) => x.kind === "wd") && (v.kind === "factory" || !v.fci)) return v.kind === "factory" ? "Remove cattle in withdrawal to save" : "Tick the declaration to save";
    if (!v.buyer && !v.buyerPick) return "Add where they went to save";
    return null;
  };
  let F = null;
  // Docket / kill sheet photos are kept on the sale (grades, weights, BCRS evidence).
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "sales", label: "Sale" }, title: "Docket / kill sheet photos" });
  body.appendChild(strip.node);
  const { form, refresh } = entrySheet({
    title: "Sale", body, label: "Save sale", missing, dirty: () => !!who.ids().length || strip.dirty(),
    async save(v, sh) {
      const c = snap.contacts.find((x) => x.id === v.buyerPick);
      const lines = who.ids().map((id) => ({ animalId: id, ...(vals[id] || {}), liveKg: vals[id]?.liveKg ?? lastWeight(snap.ix, snap.ix.byId.get(id))?.kg ?? null }));
      const r = recordSale(snap.lid, snap, { kind: v.kind, date: v.date, buyer: v.buyer || c?.name || "", buyerAddress: c?.note || "", animalIds: who.ids(), lines, haulage: v.haulage, fci: !!v.fci });
      strip.commit(r.saleId, `Sale · ${v.buyer || c?.name || v.kind}`);
      sh.close(true, { force: true });
      toast(`${who.ids().length} sold${money && r.total ? ` · ${moneyText(r.total)}` : ""}${v.kind === "factory" ? "" : nifaisDays(snap.s).moveOff === 0 ? " · record the move on NIFAIS today" : ` · notify NIFAIS within ${nifaisDays(snap.s).moveOff} days`}`);
    },
  });
  F = form;
  body.querySelector("[data-killsheet]").onclick = async () => {
    const rows = who.ids().map((id) => snap.ix.byId.get(id)).filter(Boolean);
    if (!rows.length) { toast("Choose the cattle first"); return; }
    const text = await readTextSheet({ title: "Kill sheet", hint: "Take a photo of the kill sheet or paste its text. We match each line to your cattle by the last 5 digits of the tag.", onPhoto: (f) => strip.addFiles([f]) });
    if (!text) return;
    const got = parseKillSheet(text, rows);
    for (const [id, r] of Object.entries(got)) vals[id] = { ...(vals[id] || {}), ...Object.fromEntries(Object.entries(r).filter(([k]) => money || k !== "pricePerKg")) };
    paintLines(); refresh();
    const n = Object.keys(got).length;
    toast(n ? `Read ${n} of ${rows.length} from the kill sheet — check every line` : "Couldn't match any cattle on that kill sheet. Type the weights in.");
  };
  form.onChange((n) => { if (n === "kind") paintLines(); paintGuard(); refresh(); });
  paintLines();
}
