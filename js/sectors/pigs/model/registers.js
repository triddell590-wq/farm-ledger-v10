// Printable registers for the Pigs ledger (design/13 §8.3 and the inspection pack). Each doc:
// { title, top: [[k, v]], headers, rows, note }. Fields follow Research B's record layouts
// (pig_move, pig_breeder, med_use, alarm_test, visitor). No £ figure appears in any register.
import { pm1Rows, PM1_HEADERS, CAT_NAME, notifyDays } from "./paperwork.js";
import { cycleOf, sowLabel, lifetime } from "./sows.js";
import { batchName } from "./batches.js";
import { sucklingDeathsByDay } from "./litters.js";
import { WASH, WASH_WORD } from "./rooms.js";

const live = (a) => (a || []).filter((r) => !r.deleted);
const desc = (k) => (a, b) => String(b[k] || "").localeCompare(String(a[k] || ""));

export function registerDoc(snap, doc) {
  const d = snap.data; const top = [["Keeper", snap.meta.keeper?.name || snap.ledger.farmName || ""], ["Herd mark", snap.s.herdMark || ""]];
  const room = (id) => snap.ix.rooms.get(id)?.name || "";
  switch (doc) {
    case "pm1": return { title: "Movement book (PM1)", top, headers: PM1_HEADERS, rows: pm1Rows(live(d.moves)), note: `Moves off are notified on NIFAIS within ${notifyDays(snap.ledger.region || "NI")} days. Kept 3 years (Red Tractor TI.2).` };
    case "herd": return { title: "Breeding herd register", top, headers: ["Sow no.", "Ear tag", "Type", "Born", "Entered", "Source", "Parity", "Services", "Farrowings", "Last weaned", "Cull / death"], rows: live(d.sows).sort((a, b) => String(a.sowNo).localeCompare(String(b.sowNo), "en", { numeric: true })).map((s) => { const c = cycleOf(snap.s, snap.ix, s, snap.today); const lt = lifetime(c.litters); return [sowLabel(s), s.tag || "", s.type, s.dob || "", s.entered || "", s.source || "", c.parity, (snap.ix.services.get(s.id) || []).length, lt.litters, c.weaned || "", s.cull?.date ? `Culled ${s.cull.date} (${s.cull.reason || ""})` : s.died ? `Died ${s.died}` : ""]; }), note: "Semen and breeding-stock supplier records kept 6 years (Red Tractor TI.7)." };
    case "medicines": return { title: "Medicines — use", top, headers: ["Date", "Batch / sow", "Room · pens", "Route", "Product", "Active", "Dose", "Qty", "Pigs", "Days", "Reason", "MFS no.", "Withdrawal end", "Given by", "Vet"], rows: live(d.medicines).filter((m) => m.kind === "use").sort(desc("date")).map((m) => [m.date, m.batchName || (m.sowId ? "Sow " + sowLabel(snap.ix.byId.get(m.sowId) || {}) : ""), [room(m.roomId), (m.pens || []).length ? "pens " + m.pens.join(",") : ""].filter(Boolean).join(" · "), m.route || "", m.productName || "", m.activeIngredient || "", m.dose || "", m.quantity != null ? `${m.quantity} ${m.quantityUnit || ""}` : "", m.pigs ?? "", m.days || 1, `${m.reason || ""}${m.prophylaxis ? " (prophylaxis)" : ""}`, m.mfsNo || "", m.withdrawalEndDateMeat || "", m.givenBy || "", m.vet || ""]), note: "Medicine records are kept 5 years. Purchases and disposal are on the farm's medicine store." };
    case "mortality": {
      const rows = live(d.deaths).sort(desc("date")).map((x) => [x.date, room(x.roomId) + (x.where?.pen ? ` pen ${x.where.pen}` : x.where?.crate ? ` C${x.where.crate}` : ""), batchName(snap.ix.batches.get(x.batchId)), x.stage, x.n, x.cause + (x.euthanasia ? ` (${x.euthanasia.method}${x.euthanasia.checked ? ", checked" : ""})` : ""), x.estKg ?? "", x.collection || ""]);
      for (const r of sucklingDeathsByDay(live(d.litters))) rows.push([r.date, "Farrowing (daily summary)", "", "Suckling", r.n, Object.entries(r.causes).map(([k, v]) => `${k} ${v}`).join(", "), "", ""]);
      rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
      return { title: "Mortality and fallen stock", top, headers: ["Date", "Where", "Batch", "Stage", "No.", "Cause", "Est. kg", "Collection"], rows, note: "Includes the daily suckling-pig mortality summary (Red Tractor AH.2)." };
    }
    case "tailbites": return { title: "Tail biting and injurious behaviour", top, headers: ["Date", "Room", "Pen", "Pigs", "Severity", "Action taken", "By"], rows: live(d.tailBites).sort(desc("date")).map((t) => [t.date, room(t.roomId), t.pen ?? "", t.pigs, t.severity, (t.actions || []).join(", "), t.byName || ""]), note: "Red Tractor AH.2 / HP.3.1 — review against your tail-biting action plan." };
    case "enrichment": return { title: "Enrichment", top, headers: ["Date", "Room", "Material", "By"], rows: live(d.enrichment).sort(desc("date")).map((e) => [e.date, room(e.roomId), e.material, e.byName || ""]).concat(live(d.roomChecks).filter((c) => c.enrichmentOk).sort(desc("date")).slice(0, 60).map((c) => [c.date, room(c.roomId), "Checked OK at room check", c.by || ""])).sort((a, b) => String(b[0]).localeCompare(String(a[0]))), note: "Permanent access to enrichment material (Red Tractor AH.12)." };
    case "feed": return { title: "Feed deliveries", top, headers: ["Date", "Supplier", "Ration", "Tonnes", "Bin", "Batch", "Docket", "Sample kept until"], rows: live(d.feedDeliveries).sort(desc("date")).map((f) => [f.date, f.supplier || "", f.ration || "", ((f.kg || 0) / 1000).toFixed(2), d.bins.find((b) => b.id === f.binId)?.name || (f.bags ? `${f.bags} bags` : ""), (f.batchIds || []).map((id) => batchName(snap.ix.batches.get(id))).join(" "), f.docketNo || "", f.sampleKeptUntil || ""]), note: "Feed records kept 2 years (FW.6); samples 6 months (FW.8)." };
    case "alarms": return { title: "Alarm tests", top, headers: ["Date", "Time", "House", "Sounded", "Back-up checked", "Action", "By"], rows: live(d.alarmTests).sort(desc("date")).map((t) => [t.date, t.time || "", t.house, t.sounded ? "Yes" : "NO", t.backupChecked ? "Yes" : "No", t.action || "", t.by || ""]), note: "Weekly where ventilation is mechanical (Schedule 8; Red Tractor HF.2.3)." };
    case "vermin": case "water": { const lab = doc === "vermin" ? "Vermin surveys" : "Water tests"; return { title: lab, top, headers: ["Date", "Result", "By", "Note"], rows: live(d.siteChecks).filter((c) => c.kind === doc).sort(desc("date")).map((c) => [c.date, c.result || "", c.by || "", c.note || ""]), note: doc === "vermin" ? "Quarterly vermin survey (Red Tractor VC.1)." : "Yearly TVC + coliforms where water is not mains (Red Tractor FW.3)." }; }
    case "wash": { const rows = []; for (const r of live(d.rooms)) { const at = r.wash?.at || {}; if (Object.keys(at).length || r.washException || r.wash?.exception) rows.push([String(at.emptied || "").slice(0, 10), r.name, WASH.filter((s) => at[s]).map((s) => `${WASH_WORD[s]} ${String(at[s]).slice(5, 16).replace("T", " ")}`).join(" → "), r.wash?.product ? `${r.wash.product} ${r.wash.dilution || ""}` : "", r.washException || r.wash?.exception ? `Filled before Ready (${(r.washException || r.wash.exception).date})` : ""]); } return { title: "Wash and disinfection", top, headers: ["Emptied", "Room", "Stages", "Disinfectant", "Exception"], rows: rows.sort((a, b) => String(b[0]).localeCompare(String(a[0]))), note: "Cleaning and disinfection between batches (Red Tractor BI.12)." }; }
    case "visitors": return { title: "Visitors", top, headers: ["Date", "Time", "Name", "Company", "Reason", "Last pig contact", "Vehicle", "Rules read", "Boots/overalls", "Signed in by"], rows: live(d.visitors).sort(desc("date")).map((v) => [v.date, v.time || "", v.name, v.company || "", v.reason || "", v.lastPigContact || "", v.vehicle || "", v.readRules ? "Yes" : "No", v.bootsChanged ? "Yes" : "No", v.source === "qr" ? "QR (own phone)" : v.byName || "farm"]), note: "Visitor records (Red Tractor BI.2)." };
    default: return null;
  }
}

/** Contract batch report (design/13 §8.6) for the integrator. Money lines only when `money`. */
export function contractReport(snap, batchId, { money = false } = {}) {
  const b = snap.ix.batches.get(batchId); const f = snap.c.bf.get(batchId); const d = snap.data;
  const ins = live(d.moves).filter((m) => m.batchId === batchId && m.direction === "on");
  const outs = live(d.moves).filter((m) => m.batchId === batchId && m.direction === "off");
  const deaths = live(d.deaths).filter((x) => x.batchId === batchId);
  const meds = live(d.medicines).filter((m) => m.batchId === batchId);
  const feed = live(d.feedDeliveries).filter((x) => (x.batchIds || []).includes(batchId));
  const ks = live(d.killSheets).filter((k) => k.batchId === batchId);
  const rows = [
    ...ins.map((m) => [m.date, "Pigs in", `${m.n} ${CAT_NAME[m.category] || ""} from ${[m.fromCode, m.fromName].filter(Boolean).join(" ")}${m.avgKg ? ` · ${m.avgKg} kg avg` : ""}`]),
    ...feed.map((x) => [x.date, "Feed received", `${((x.kg || 0) / 1000).toFixed(2)} t ${x.ration || ""} · ${x.supplier || ""}${x.docketNo ? " · docket " + x.docketNo : ""}`]),
    ...deaths.map((x) => [x.date, "Death", `${x.n} · ${x.cause}${x.photoNote ? " · photo: " + x.photoNote : ""}`]),
    ...meds.map((m) => [m.date, "Treatment", `${m.productName} · ${m.route || ""} · ${m.pigs || ""} pigs · ${m.reason || ""}`]),
    ...outs.map((m) => [m.date, "Pigs out", `${m.n} to ${[m.toName, m.toCode].filter(Boolean).join(" ")}`]),
    ...ks.map((k) => [k.date, "Kill sheet", `${k.totals?.pigs} pigs · ${k.totals?.dwKg} kg dw · avg ${k.totals?.avgDw?.toFixed?.(1) ?? ""} kg`]),
  ].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const top = [["Batch", batchName(b)], ["Integrator", snap.s.contract.integrator || ""], ["Pig places", snap.ix.rooms.get(b.roomId)?.places ?? ""], ["Days", f?.days ?? ""], ["Mortality", f?.mortPct != null ? (f.mortPct * 100).toFixed(1) + "%" : ""], ["FCR", f?.fcr ? f.fcr.toFixed(2) + (f.final ? "" : " (estimate)") : ""]];
  if (money && !snap.s.contract.integratorOwns && f?.feedPounds) top.push(["Feed £", f.feedPounds.toFixed(0)]);
  return { title: `Batch report — ${batchName(b)}`, top, headers: ["Date", "What", "Detail"], rows, note: snap.s.contract.integratorOwns ? "Pigs and feed owned by the integrator — money lines left out." : "" };
}
