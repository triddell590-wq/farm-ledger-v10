// One register on screen (design/15 §11): a scrollable table of the latest rows, Print / PDF and
// CSV, and the button that adds to it. House records are per crop (pick the crop).
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel, backLink } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { docButtons, d2, note } from "../ui.js";
import { registerDoc, docTitle } from "../model/registers.js";

const ADD = { medicines: ["medicine", "syringe", "Medicine in water", "medicines"], alarms: ["alarm", "bell", "Record a test", "alarmTests"], visitors: ["visitor", "people", "Sign a visitor in", "visitors"], water: ["water", "water", "Record a water test", "waterTests"], training: ["training", "user", "Add training", "training"], salmonella: ["salm", "scan", "Boot swabs", "salmSamples"], feed: ["feed", "feed", "Feed delivery", "feedDeliveries"] };

const cell = (c) => { const t = String(c ?? ""); if (/^\d{4}-\d\d-\d\d$/.test(t)) return d2(t); const m = /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d)$/.exec(t); return m ? `${d2(m[1])} ${m[2]}` : c; };

export default async function registers(ctx) {
  const { doc, cropId } = ctx.match.groups;
  return liveScreen(ctx, { title: docTitle(doc), tab: "paperwork", paint: (snap) => paint(snap, doc, cropId),
    after: (node, snap) => { const b = node.querySelector("[data-docbtns]"); if (b) b.replaceChildren(docButtons(() => registerDoc(snap.c, doc, { cropId }))); } });
}

function paint(snap, doc, cropId) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const back = backLink(L("paperwork"), "Paperwork");
  const d = registerDoc(snap.c, doc, { cropId });
  if (!d) return html`<div>${back}${largeTitle("Not found")}</div>`;
  const a = ADD[doc];
  const picker = doc === "house" && snap.ix.crops.length > 1 ? html`<div class="section">${groupLabel("Crop")}<div class="chips br-lines">${snap.ix.crops.slice().reverse().slice(0, 12).map((c) => html`<a class="chip" role="radio" aria-checked="${c.id === (cropId || snap.ix.crops.slice(-1)[0].id)}" href="${L(`paperwork/house/${c.id}`)}">${snap.ix.houseById.get(c.houseId)?.name.replace("House ", "H") || ""} · crop ${c.no || ""}</a>`)}</div></div>` : "";
  const rows = d.rows.slice(0, 60);
  return html`<div>${back}${largeTitle(d.title, (d.top || []).map(([k, v]) => `${k}: ${v}`).slice(0, 3).join(" · "))}
    ${picker}
    ${a && canWrite(snap.role, a[3]) ? html`<button type="button" class="btn br-mt" data-flow="${a[0]}">${raw(icon(a[1]))}${a[2]}</button>` : ""}
    <div class="section"><div class="br-tblwrap" tabindex="0" role="region" aria-label="${d.title}"><table class="br-tbl"><thead><tr>${d.headers.map((h) => html`<th>${h}</th>`)}</tr></thead>
      <tbody>${rows.length ? rows.map((r) => html`<tr class="${String(r.join(" ")).includes("CLASH") ? "late" : ""}">${r.map((c) => html`<td>${cell(c)}</td>`)}</tr>`) : html`<tr><td colspan="${d.headers.length}">Nothing recorded yet.</td></tr>`}</tbody></table></div>
      ${d.rows.length > rows.length ? note(`Showing the latest ${rows.length} of ${d.rows.length}. Print or CSV has them all.`) : ""}</div>
    <div class="section" data-docbtns></div>
    ${d.note ? note(d.note) : ""}</div>`;
}
