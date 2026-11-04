// Pedigree sale sheet (design/10 §12): one-page profile to print or share as a picture/PDF.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { shortDate, daysBetween } from "../../core/dates.js";
import { backLink } from "../../screens/common.js";
import { loadBeef } from "./data.js";
import { kvRows, tagHtml } from "./ui.js";
import { breedName, colourName } from "./model/tags.js";
import { parents, stageWeights } from "./flows/pedigree.js";
import { tbNext } from "./model/duties.js";
import { bvdWord } from "./animal.js";

export default async function saleSheet(ctx) {
  const snap = await loadBeef(ctx.ledger); const a = snap.ix.byId.get(ctx.match.groups.id);
  if (!a) return { el: el(html`<div>${backLink(`#/l/${snap.lid}/herd`, "Herd")}<p>Not found.</p></div>`), title: "Sale sheet", depth: 2 };
  const p = a.pedigree || {}; const par = parents(snap.ix, a); const sw = stageWeights(snap.ix, a);
  const tb = snap.data.tbTests.filter((t) => t.date).sort((x, y) => y.date.localeCompare(x.date))[0];
  const vacc = snap.data.medicines.filter((m) => !m.notUsed && /vaccine/i.test(m.reason || "") && (m.animalIds || []).includes(a.id)).map((m) => `${m.productName} ${shortDate(m.date)}`);
  const anyBvdPos = snap.data.animals.some((x) => /BVDP/.test(x.bvd?.status || "") && !x.offDate);
  const n = (x, f) => (x ? [x.pedigree?.regName || x.name, x.pedigree?.herdBookNo].filter(Boolean).join(" · ") || x.tag : f || "—");
  const keeper = snap.meta.keeper || {};
  const body = el(html`<div class="beef-page">${backLink(`#/l/${snap.lid}/animal/${a.id}`, "Animal")}
    <div class="sale-sheet card pad" data-sheet>
      <p class="ink-2" style="margin:0">${keeper.name || snap.ledger.farmName || ""}${keeper.herdNo ? ` · Herd ${keeper.herdNo}` : ""}</p>
      <h1 style="margin:4px 0 2px;font-size:26px;line-height:32px">${p.regName || a.name || tagHtml(a.tag)}</h1>
      <p style="margin:0">${tagHtml(a.tag)}${p.herdBookNo ? ` · HB ${p.herdBookNo}` : ""}</p>
      <p class="ink-2" style="margin:2px 0 12px">${breedName(a.breed)} ${(a.sex || "").toLowerCase()} · ${colourName(a.colour)} · born ${a.dob ? shortDate(a.dob) : "?"}</p>
      ${kvRows([["Sire", n(par.sire, par.sireName)], ["Dam", n(par.dam, par.damName)], (sw.birth || sw.d200 || sw.d400) && ["Weights", [sw.birth && `birth ${sw.birth} kg`, sw.d200 && `200-day ${sw.d200} kg`, sw.d400 && `400-day ${sw.d400} kg`].filter(Boolean).join(" · ")],
        ...(p.ebvs || []).map((e) => [`EBV ${e.name}`, `${e.value}${e.acc ? ` (${e.acc}%)` : ""}`]), (p.ebvs || [])[0]?.runDate && ["EBVs run", shortDate(p.ebvs[0].runDate)],
        ...Object.entries(p.dna || {}).filter(([, v]) => v).map(([k, v]) => [`DNA ${k}`, v]), p.docility && ["Docility", `${p.docility}/5`],
        ["Health status", `${anyBvdPos ? "BVD: herd has a positive" : "Herd BVD free"} · TB ${tb ? `${tb.herdStatus || "OTF"} tested ${shortDate(tb.date)}` : "test date not recorded"}`],
        a.bvd?.status && ["BVD (this animal)", bvdWord(a.bvd.status)], vacc.length && ["Vaccinations", vacc.join("; ")]])}
      <p class="hint" style="margin-top:12px">Health status as recorded by the breeder on ${shortDate(snap.today)}.</p>
    </div>
    <div class="act-grid"><button type="button" class="btn secondary" data-print>${raw(icon("print"))}Print</button><button type="button" class="btn secondary" data-share>${raw(icon("share"))}Share</button></div></div>`);
  body.querySelector("[data-print]").onclick = () => window.print();
  body.querySelector("[data-share]").onclick = async () => {
    const text = body.querySelector("[data-sheet]").innerText;
    try { if (navigator.share) await navigator.share({ title: p.regName || a.tag, text }); else { await navigator.clipboard.writeText(text); (await import("../../ui/toast.js")).toast("Sale sheet copied. Paste it into WhatsApp or an email."); } } catch (e) { /* cancelled */ }
  };
  void tbNext; void daysBetween;
  return { el: body, title: "Sale sheet", depth: 2, tab: "herd" };
}
