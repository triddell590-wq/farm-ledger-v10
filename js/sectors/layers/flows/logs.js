// One entry sheet for the simple dated logs (model/logs.js): alarm tests, visitors, rodent control,
// feed deliveries (+ £ per tonne for money roles), bird movements, vet health plan, manure,
// housing periods, biosecurity checks.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField, checkRow } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { entrySheet, chipsField, numField, dateField, timeField, lawNote, liveHouses, nowHM } from "./common.js";
import { addLog, undoAdd } from "../actions.js";
import { LOGS } from "../model/logs.js";
import { photoStrip } from "../../../ui/photo-strip.js";

export function logSheet(snap, { kind, houseId = null, preset = {} } = {}) {
  const L = LOGS[kind]; if (!L) return null;
  const hs = liveHouses(snap).map((x) => x.h);
  const fld = ([k, label, type, o = {}]) => {
    const val = preset[k] ?? o.value;
    if (type === "date") return dateField(k, label, val || (o.optional ? "" : snap.today), o);
    if (type === "time") return timeField(k, label, val || nowHM());
    if (type === "number") return numField(k, label, val ?? "", { step: "any" });
    if (type === "check") return checkRow(k, label, val ?? false);
    if (type === "chips") return chipsField(k, label, o.options, val ?? null);
    if (type === "house") return hs.length > 1 || o.all ? chipsField(k, label, [...(o.all ? [["all", "All houses"]] : []), ...hs.map((h) => [h.id, h.name])], houseId || (o.all ? "all" : hs[0]?.id)) : html`<input type="hidden" name="${k}" value="${hs[0]?.id || ""}">`;
    return textField({ name: k, label, value: val || "", optional: o.optional, placeholder: o.placeholder || "" });
  };
  const grouped = (list) => { const out = []; let buf = []; const flush = () => { if (buf.length) out.push(html`<div class="form-group">${buf}</div>`); buf = []; };
    for (const f of list) { if (["chips", "house"].includes(f[2])) { flush(); out.push(html`<div style="margin:12px 0">${fld(f)}</div>`); } else buf.push(fld(f)); } flush(); return out; };
  const money = kind === "feed" && canWrite(snap.role, "finance");
  const body = el(html`<form novalidate>${grouped(L.fields)}${money ? html`<div class="form-group">${numField("pricePerT", "£ per tonne", snap.s.feedPerTonne ?? "", { optional: true })}</div>` : ""}<p class="ly-law">${L.sub}</p></form>`);
  // Photos: feed tickets, the rodent contractor's report, manure export forms, visitor sign-in sheets…
  const PH = { feed: ["Docket photos", "Feed ticket"], rodent: ["Report photos", "Contractor's report"], manure: ["Photos", "Export form"], alarm: ["Photos", ""], visitors: ["Photos", "Sign-in sheet"], moves: ["Photos", "Movement form"] }[kind] || ["Photos", ""];
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: L.coll, label: L.one[0].toUpperCase() + L.one.slice(1) }, title: PH[0], hint: PH[1] });
  body.querySelector(".ly-law").before(strip.node);
  const req = L.fields.filter(([, , t, o = {}]) => !o.optional && ["text", "number", "date"].includes(t));
  entrySheet({ title: L.one[0].toUpperCase() + L.one.slice(1), body, label: "Save", missing: (v) => { const m = req.find(([k]) => v[k] === "" || v[k] == null); return m ? `Add ${m[1].toLowerCase()}` : null; },
    save(v, sh) { const id = addLog(snap, kind, v); strip.commit(id, `${L.one[0].toUpperCase() + L.one.slice(1)} · ${v.date || snap.today}`); sh.close(true, { force: true }); toast(`${L.one[0].toUpperCase() + L.one.slice(1)} saved`, { action: "Undo", onAction: () => undoAdd(snap.lid, L.coll, id) }); } });
}
export { lawNote };
