// Red Tractor Dairy self-check (route "rt") and the "Inspector is here" pack (route "inspect"),
// design/12 §8. Header copy is exact and versioned (model/content.js); auto items evidence
// themselves from the records; the rest are ticked by the owner or a manager (meta rtChecklist).
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { textField } from "../../../ui/form.js";
import { canWriteMeta } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { auth } from "../../../core/auth.js";
import { liveSnap } from "../data.js";
import { setMeta } from "../actions.js";
import { evidenceStrip } from "../../../ui/photo-strip.js";
import { entrySheet } from "../flows/common.js";
import { evaluate, summary, SECTIONS } from "../model/checklist.js";
import { buildRegister } from "../model/registers.js";
import { RT_HEADER, RT_NOTE, RT_VERSION } from "../model/content.js";
import { printDoc, toHtmlTable } from "../ui.js";

const MARK = { ok: ["ok", "check", "In place"], due: ["due", "clock", "Check"], gap: ["late", "alert", "Gap"], open: ["neutral", "clock", "Tick yourself"] };

export default async function checklist(ctx) {
  const page = ctx.match.groups.page; const body = el(html`<div class="dairy-page"></div>`);
  const st = { who: "mi" };
  const { first, stop } = liveSnap(ctx.ledger, (snap) => { const y = window.scrollY; body.replaceChildren(page === "rt" ? rt(snap) : inspect(snap, st, body)); if (y) window.scrollTo(0, y); });
  await first;
  return { el: body, title: page === "rt" ? "Red Tractor" : "Inspector is here", tab: "more", destroy: stop };
}

function rt(snap) {
  const signs = snap.meta.rtChecklist?.items || {}; const rows = evaluate(snap.c, signs); const sm = summary(rows);
  const can = canWriteMeta(snap.role, "rtChecklist");
  const node = el(html`<div>${backLink(`#/l/${snap.lid}/paperwork`, "Paperwork")}${largeTitle("Red Tractor ready?", `${sm.done} of ${sm.n} in place · ${sm.keyGaps} Key open`)}
    <div class="card pad"><p class="t-callout" style="margin:0"><b>${RT_HEADER}</b></p><p class="hint" style="margin:6px 0 0">${RT_NOTE}</p></div>
    ${SECTIONS.map(([k, name]) => { const items = rows.filter((r) => r.sec === k); if (!items.length) return ""; const done = items.filter((r) => r.status === "ok").length;
      return html`<div class="section" id="${k}">${groupLabel(name, `${done}/${items.length}`)}<div class="list">${items.map((r) => { const [lvl, ic, word] = MARK[r.status];
        return html`<div class="row rt-item" data-id="${r.id}"><span class="rt-id">${r.id}</span><span class="main"><span class="primary">${r.text}${r.key ? html`<span class="key-tag">Key</span>` : ""}${r.auto ? html` <span class="auto-tag">auto</span>` : ""}</span>
          ${r.ev ? html`<span class="secondary">${r.ev.text}</span>` : ""}${r.sign?.done ? html`<span class="secondary">Ticked ${r.sign.date || ""}${r.sign.by ? " by " + r.sign.by : ""}${r.sign.note ? " · " + r.sign.note : ""}${r.sign.photos ? ` · ${r.sign.photos} photo${r.sign.photos > 1 ? "s" : ""}` : ""}</span>` : ""}
          <span class="row-actions">${r.link ? html`<a class="text-btn" href="${r.link}">Show me</a>` : ""}${r.upload ? html`<a class="text-btn" href="#/farm/documents">Documents</a>` : ""}${can && (!r.auto || r.ev?.state === "due") ? html`<button type="button" class="text-btn" data-tick>${r.sign?.done ? "Update" : "Tick"}</button>` : ""}</span></span>
          <span class="pill ${lvl}">${raw(icon(ic))}${word}</span></div>`; })}</div></div>`; })}</div>`);
  node.querySelectorAll("[data-tick]").forEach((b) => (b.onclick = () => tickSheet(snap, b.closest("[data-id]").dataset.id, signs)));
  return node;
}

function tickSheet(snap, id, signs) {
  const t = signs[id] || {};
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "date", label: "Checked on", type: "date", value: t.date || snap.today })}${textField({ name: "note", label: "Note", value: t.note || "", optional: true, placeholder: "Where it's kept, who signed it…" })}</div>
    ${t.done ? html`<button type="button" class="text-btn danger" data-clear>Clear this tick</button>` : ""}</form>`);
  // photo evidence (e.g. AH.1.3 the signed Johne's declaration), saved at once on the item
  const strip = evidenceStrip(body, { lid: snap.lid, role: snap.role, list: "rtChecklist", itemId: id, label: `Red Tractor ${id}` });
  const save = (v) => setMeta(snap.lid, "rtChecklist", { version: `${RT_VERSION.name} ${RT_VERSION.version}`, effective: RT_VERSION.effective, items: { ...signs, [id]: { ...v, photos: strip.count() } } });
  const es = entrySheet({ title: `Tick ${id}`, body, label: "In place", missing: (v) => (!v.date ? "Add the date" : null),
    save(v, sh) { save({ done: true, date: v.date, note: v.note, by: auth.user?.displayName || auth.user?.email || "" }); sh.close(true, { force: true }); toast("Checklist updated"); } });
  es.sheet.done.then(() => strip.destroy());
  const c = body.querySelector("[data-clear]"); if (c) c.onclick = () => { save({ done: false }); es.sheet.close(true, { force: true }); toast("Tick cleared"); };
}

// Inspector packs: what each inspector asks for first (design/12 §8).
const PACKS = {
  mi: { label: "Milk Inspectorate", docs: ["tank", "quality", "withhold", "medicine", "machine", "register"] },
  rt: { label: "Red Tractor", docs: ["medicine", "withhold", "tank", "machine", "training", "scores", "mastitis", "dryoffs", "abfailures", "register"] },
  vs: { label: "DAERA Veterinary Service", docs: ["register", "movements", "deaths", "medicine", "tb", "withhold"] },
};

function inspect(snap, st, body) {
  const { lid } = snap; const pack = PACKS[st.who];
  const docs = pack.docs.map((k) => ({ k, doc: buildRegister(k, snap.c) })).filter((x) => x.doc);
  const node = el(html`<div>${backLink(`#/l/${lid}/paperwork`, "Paperwork")}${largeTitle("Inspector is here", "Open what they ask for — everything prints or downloads")}
    <div class="chips scroll-chips" role="radiogroup" aria-label="Who is inspecting">${Object.entries(PACKS).map(([k, p]) => html`<button type="button" class="chip" role="radio" aria-checked="${k === st.who}" data-who="${k}">${p.label}</button>`)}</div>
    <div class="section"><div class="inspect-grid">${docs.map(({ k, doc }) => html`<a href="#/l/${lid}/paperwork/${k}">${raw(icon("records"))}<span>${doc.title}</span><span class="t-cap ink-2" style="font-weight:500">${doc.rows.length} ${doc.rows.length === 1 ? "entry" : "entries"}</span></a>`)}
      <a href="#/farm/documents">${raw(icon("document"))}<span>Health plan, Johne's, BVD plan</span><span class="t-cap ink-2" style="font-weight:500">Farm documents</span></a></div></div>
    <div class="section"><button type="button" class="btn" data-all>${raw(icon("print"))}Print the whole pack</button>
      <p class="source" style="margin:8px 4px 0">${RT_HEADER}</p></div></div>`);
  node.querySelectorAll("[data-who]").forEach((b) => (b.onclick = () => { st.who = b.dataset.who; body.replaceChildren(inspect(snap, st, body)); }));
  node.querySelector("[data-all]").onclick = () => {
    const top = [["Herd", snap.s.herdNo || ""], ["Farm", snap.ledger.farmName || snap.ledger.name || ""]];
    const all = docs.map(({ doc }) => toHtmlTable({ ...doc, top })).join('<div style="page-break-after:always"></div>');
    printDoc({ title: `${pack.label} pack`, headers: [], rows: [], __html: all });
  };
  return node;
}
