// One printable register (#/l/<id>/reg/<key>, design/14 §6.1, §9.1, §19): choose the period
// (12 months by default; the app keeps everything), see the latest rows (each as a card on the phone; the print has the full columns), then Print / PDF or CSV.
// The Egg production register prints exactly the DAERA producer daily record columns.
import { html } from "../../../core/html.js";
import { addDays } from "../../../core/dates.js";
import { largeTitle, backLink } from "../../../screens/common.js";
import { liveScreen, remember } from "./live.js";
import { okCard, docButtons, d3 } from "../ui.js";

const fmt = (v) => (v == null ? "" : /^\d{4}-\d\d-\d\d$/.test(String(v)) ? d3(v) : typeof v === "number" ? v.toLocaleString("en-GB") : String(v));
import { REGISTERS, buildRegister } from "../model/registers.js";

const PERIODS = [["365", "12 months"], ["730", "2 years"], ["1095", "3 years"], ["all", "Everything"]];

export default async function registers(ctx) {
  const key = ctx.match.groups.key;
  return liveScreen(ctx, { title: (REGISTERS.find((r) => r[0] === key) || [])[1] || "Register", tab: "more", paint: (snap) => paint(snap, key), after: (node, snap, repaint) => {
    node.querySelectorAll("[data-period]").forEach((b) => (b.onclick = () => { remember(snap.lid, `reg:${key}`, b.dataset.period); repaint(); }));
    const s = node.querySelector("[data-docs]"); if (s) s.replaceWith(docButtons(() => buildRegister(snap.c, key, range(snap, key))));
  } });
}

function range(snap, key) {
  const p = remember(snap.lid, `reg:${key}`) || (key === "mortality" ? "1095" : key === "salmonella" ? "730" : "365");
  return { p, from: p === "all" ? "2000-01-01" : addDays(snap.today, -+p), to: snap.today };
}

function paint(snap, key) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const meta = REGISTERS.find((r) => r[0] === key);
  const back = backLink(L("layers-paperwork"), "Paperwork");
  if (!meta) return html`<div>${back}${largeTitle("Register not found")}</div>`;
  const r = range(snap, key); const doc = buildRegister(snap.c, key, r);
  const show = doc.rows.slice(0, 25);
  return html`<div>${back}${largeTitle(meta[1], meta[2])}
    <div class="ly-segs" role="radiogroup" aria-label="Period">${PERIODS.map(([v, l]) => html`<button type="button" class="chip" role="radio" aria-checked="${v === r.p}" data-period="${v}">${l}</button>`)}</div>
    <div class="section"><p class="ly-cap" style="margin:0 4px 8px">${doc.top.map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
      ${show.length ? html`<div class="list ly-regrows">${show.map((row) => html`<div class="row no-lead"><span class="main"><span class="primary">${[row[0], row[1]].filter((v) => v !== "" && v != null).map(fmt).join(" · ")}</span><span class="secondary">${doc.headers.slice(2).map((h, i) => [h, row[i + 2]]).filter(([, v]) => v !== "" && v != null).map(([h, v]) => html`<span class="ly-rk">${h}</span> ${fmt(v)}`).reduce((a, x, i) => (i ? [...a, " · ", x] : [x]), [])}</span></span></div>`)}</div>
        <p class="ly-cap">${doc.rows.length > show.length ? `Showing the latest ${show.length} of ${doc.rows.length} rows — print or CSV for all.` : `${doc.rows.length} row${doc.rows.length === 1 ? "" : "s"}.`}${doc.note ? ` ${doc.note}` : ""}</p>`
        : okCard("Nothing recorded in this period.")}</div>
    <div class="section"><div data-docs></div></div></div>`;
}
