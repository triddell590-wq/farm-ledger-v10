// Death (design/13 §7.4) — one tap from a room, pen or crate. "Put down" opens the euthanasia
// check (Red Tractor AH.9.4–9.5): method + "checked for signs of life" (required). Suckling
// deaths in a crate are kept on the litter so pre-weaning mortality counts them once. In contract
// mode a photo note is required (the integrator's batch report).
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { checkRow, stepper } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { entrySheet, chipsField, roomPickRow, lawNote } from "./common.js";
import { recordDeath, undoAdd } from "../actions.js";
import { roomFacts } from "../model/facts.js";
import { DEATH_CAUSES } from "../model/litters.js";
import { sowLabel } from "../model/sows.js";
import { crateMap } from "./farrowing.js";
import { photoStrip } from "../../../ui/photo-strip.js";

const STAGES = ["Suckling", "Weaner", "Grower", "Finisher", "Sow", "Boar"];
const CAUSES = ["Found dead", "Put down", "Tail bite", "Scour", "Lame", "Respiratory", "Rupture", "Unknown", "Other"];
const STAGE_OF = { farrowing: "Suckling", weaner: "Weaner", grower: "Grower", finisher: "Finisher", service: "Sow", dry: "Sow", hospital: null };

export default function deathSheet(snap, { roomId = null, pen = null, crate = null, sowId = null } = {}) {
  const facts = roomFacts(snap.c); const fx = (id) => facts.find((x) => x.room.id === id);
  let rid = roomId;
  const body = el(html`<form novalidate>
    <div class="form-group" data-where></div>
    <div class="form-group" data-penrow></div>
    <div class="form-group"><div class="field stepper-field"><span class="label">How many</span><span class="spacer"></span>${stepper("n", 1, { min: 1, max: 500, label: "How many" })}</div></div>
    <div class="form-group">${chipsField("stage", "Stage", STAGES, null)}</div>
    <div class="form-group" data-causes></div>
    <div class="form-group" data-eu hidden>${chipsField("method", "Method", ["Captive bolt + pithing", "Electrical", "Blunt force (piglets under 5 kg)", "Vet — injection", "Firearm"], null)}${checkRow("checked", "Checked for signs of life", false, "No breathing, no corneal reflex, pupils fixed")}</div>
    <div class="form-group" data-kg><div class="field stepper-field"><span class="label">Est. weight (kg)</span><span class="spacer"></span>${stepper("estKg", 0, { min: 0, max: 400, label: "Estimated weight" })}</div></div>
    <div class="form-group">${chipsField("collection", "Collection", ["Fallen stock booked", "On farm"], "Fallen stock booked")}
      <div class="field"><label>Photo note <span class="opt">(optional)</span></label><input name="photo" placeholder="${snap.s.contract.on ? "Or describe the photo for the integrator" : "What the photo shows"}"></div>
      <div class="field"><label>Date</label><input type="date" name="date" value="${snap.today}"></div></div>
    ${lawNote("Every death goes in the mortality record with date, place and cause (Red Tractor AH.2). Fallen stock goes to an approved collector.")}
  </form>`);
  const where = roomPickRow(snap, { label: "Where", id: rid, title: "Which room?", onChange: (v) => { rid = v; paintWhere(); es.refresh(); } });
  body.querySelector("[data-where]").append(where.node);
  const paintWhere = () => {
    const r = rid && snap.ix.rooms.get(rid); const x = rid && fx(rid);
    const box = body.querySelector("[data-penrow]");
    if (r?.kind === "farrowing") { const cr = crateMap(snap, r).filter((c) => c.sow); box.replaceChildren(el(chipsField("crate", "Crate", cr.map((c) => [String(c.no), `C${c.no} · ${sowLabel(c.sow)}`]), crate ? String(crate) : null))); }
    else if (r && (r.pens || []).length) box.replaceChildren(el(chipsField("pen", "Pen", r.pens.map((p) => [String(p.no), String(p.no)]), pen ? String(pen) : null)));
    else box.replaceChildren();
    box.hidden = !box.children.length;
    const st = body.querySelector("[data-chips=stage]"); const def = sowId ? "Sow" : STAGE_OF[r?.kind];
    if (st && def && !st.querySelector("[aria-checked=true]")) st.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", String(c.dataset.value === def)));
    const kg = body.querySelector("[name=estKg]"); if (x?.f && kg && (+kg.value === 0)) kg.value = Math.round(x.f.est);
    paintCauses();
  };
  let lastStage = null;
  const paintCauses = () => {
    const v = es ? es.form.values() : {}; const stage = v.stage || (sowId ? "Sow" : STAGE_OF[rid && snap.ix.rooms.get(rid)?.kind]);
    if (stage === lastStage && body.querySelector("[data-causes]").children.length) return; lastStage = stage;
    body.querySelector("[data-causes]").replaceChildren(el(chipsField("cause", "Cause", stage === "Suckling" ? [...DEATH_CAUSES.slice(0, 5), "Put down", "Other"] : CAUSES, null)));
    body.querySelector("[data-kg]").hidden = stage === "Suckling";
  };
  // Death photos (contract mode: the integrator's batch report needs one).
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "deaths", label: "Death" }, title: snap.s.contract.on ? "Photo (contract)" : "Photos", hint: snap.s.contract.on ? "Needed for the integrator" : "", onChange: () => es && es.refresh() });
  body.appendChild(strip.node);
  let es = null;
  es = entrySheet({ title: "Death", body, label: "Save death",
    missing: (v) => {
      if (!rid && !sowId) return "Choose where";
      if (!v.stage) return "Choose the stage"; if (!v.cause) return "Choose the cause";
      if (v.stage === "Suckling" && snap.ix.rooms.get(rid)?.kind === "farrowing" && !v.crate) return "Choose the crate";
      if (v.cause === "Put down" && !v.method) return "Choose the method"; if (v.cause === "Put down" && !v.checked) return "Tick checked for signs of life";
      if (snap.s.contract.on && !v.photo && !strip.count()) return "Add a photo (contract)";
      return null;
    },
    save(v, sh) {
      const r = snap.ix.rooms.get(rid); let litterId = null;
      if (v.stage === "Suckling" && r?.kind === "farrowing") litterId = crateMap(snap, r).find((c) => c.no === +v.crate)?.litter?.id || null;
      const sid = sowId || (r?.kind === "farrowing" && v.crate && (v.stage === "Sow") ? crateMap(snap, r).find((c) => c.no === +v.crate)?.sow?.id : null);
      const id = recordDeath(snap, { roomId: rid, pen: v.pen, crate: v.crate, litterId, sowId: sid, n: v.n, stage: v.stage, cause: v.cause, estKg: v.stage === "Suckling" ? undefined : v.estKg || undefined, euthanasia: v.cause === "Put down" ? { method: v.method, checked: !!v.checked } : undefined, collection: v.collection, photo: v.photo, date: v.date || snap.today });
      if (typeof id === "string") strip.commit(id, `Death · ${v.stage || ""}${r ? " · " + r.name : ""}`);
      sh.close(true, { force: true });
      toast(`${v.n} death${v.n > 1 ? "s" : ""} saved${r ? " · " + r.name : ""}`, typeof id === "string" ? { action: "Undo", onAction: () => undoAdd(snap.lid, "deaths", id) } : {});
    } });
  es.form.onChange((name) => { if (name === "stage") paintCauses(); body.querySelector("[data-eu]").hidden = es.form.values().cause !== "Put down"; });
  paintWhere(); es.rebase();
  return es.sheet.done;
}
