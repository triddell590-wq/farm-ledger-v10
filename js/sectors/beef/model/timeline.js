// One animal's life, newest first (design/10 §4.2 Timeline). Pure: built from the snapshot.
import { normTag, tagParts } from "./tags.js";
import { daysBetween } from "../../../core/dates.js";

const EASE = { 1: "easy", 2: "some help", 3: "hard pull", 4: "vet", 5: "caesarean" };

/** [{ date, title, sub, coll, id, by }] newest first. */
export function timelineFor(data, ix, a) {
  const out = []; const tagK = normTag(a.tag); const add = (e) => out.push(e);
  const w = (ix.weights.get(a.id) || []);
  w.forEach((x, i) => {
    const prev = [...w.slice(0, i)].reverse().find((p) => daysBetween(p.date, x.date) >= 14);
    const g = prev ? (x.kg - prev.kg) / daysBetween(prev.date, x.date) : null;
    add({ date: x.date, title: `Weighed ${x.kg} kg${g != null ? ` · ${g >= 0 ? "+" : ""}${g.toFixed(2)}/day` : ""}`, coll: "weighings", id: x.id, by: rec(data.weighings, x.id) });
  });
  for (const m of data.medicines) {
    if (m.notUsed) continue;
    if (!(m.animalIds || []).includes(a.id) && !(m.animalTags || []).some((t) => normTag(t) === tagK)) continue;
    const dose = (m.doses || [])[0]?.dose;
    add({ date: m.date, title: `Treated: ${m.productName || "medicine"}${dose ? ` ${dose} ${m.quantityUnit || "ml"}` : ""}${m.reason ? ` (${m.reason})` : ""}`, sub: m.withdrawalEndDateMeat ? `Withdrawal to ${m.withdrawalEndDateMeat}` : "", coll: "medicines", id: m.id, by: m });
  }
  for (const mv of data.movements) {
    if (!(mv.animalIds || []).includes(a.id) || mv.death) continue;
    const t = mv.kind === "on" ? `Moved on from ${mv.from || "?"}` : mv.kind === "off" ? `Moved off to ${mv.to || "?"}` : mv.kind === "housing" ? `Housed: ${mv.to}` : `Moved to ${mv.to || "a group"}`;
    add({ date: mv.date, title: t, sub: ["on", "off"].includes(mv.kind) ? (mv.nifaisNotified ? "NIFAIS notified" : "NIFAIS not marked as notified") : "", coll: "movements", id: mv.id, by: mv });
  }
  for (const c of ix.calvings.get(a.id) || []) {
    const kids = (c.calves || []).map((k) => ix.byId.get(k.animalId)).filter(Boolean);
    add({ date: c.date, title: `Calved${c.ease ? ` (${EASE[c.ease] || c.ease})` : ""}: ${kids.length ? kids.map((k) => `${k.sex ? k.sex.toLowerCase() : "calf"} ${tagParts(k.tag).tail}`).join(", ") : "calf"}`, coll: "calvings", id: c.id, by: c.id && rec(data.calvings, c.id) });
  }
  for (const s of data.services) {
    if (!(s.femaleIds || []).includes(a.id)) continue;
    add({ date: s.date || s.bullIn, title: s.kind === "AI" ? `Served by AI${s.sireText ? `: ${s.sireText}` : ""}` : `Bull in${s.sireText ? `: ${s.sireText}` : ""}${s.bullOut ? ` (out ${s.bullOut})` : ""}`, coll: "services", id: s.id, by: s });
  }
  for (const s of data.scans) if (s.femaleId === a.id) add({ date: s.date, title: `Scanned: ${s.result === "empty" ? "empty" : s.result === "twins" ? "twins" : "in calf"}${+s.foetalAgeDays ? ` (${s.foetalAgeDays} days)` : ""}`, coll: "scans", id: s.id, by: s });
  for (const h of data.heats || []) if (h.femaleId === a.id) add({ date: h.date, title: "Seen bulling", coll: "heats", id: h.id, by: h });
  for (const v of data.vetOps) if ((v.animalIds || []).includes(a.id)) add({ date: v.date, title: `Vet operation: ${v.operation}`, sub: [v.anaesthetic ? "anaesthetic" : "", v.analgesic ? "pain relief" : ""].filter(Boolean).join(", "), coll: "vetOps", id: v.id, by: v });
  for (const t of data.tbTests) { const r = (t.results || {})[a.id]; if (r) add({ date: t.readingDate || t.date, title: `TB test: ${r}`, coll: "tbTests", id: t.id, by: t }); }
  for (const r of a.replacementTags || []) add({ date: r.date, title: r.tag === "Same no." ? `Replacement tag fitted (${r.note || "same number"})` : `Re-tagged (old number ${r.tag})`, coll: "animals", id: a.id });
  if (a.offDate && a.offTo === "Dead") add({ date: a.offDate, title: `Died${a.disposal ? ` · ${a.disposal}` : ""}`, coll: "animals", id: a.id });
  else if (a.offDate && !data.movements.some((m) => (m.animalIds || []).includes(a.id) && m.kind === "off")) add({ date: a.offDate, title: `Moved off to ${a.offTo || "?"}`, coll: "animals", id: a.id });
  if (a.dob) { const dam = a.damId ? ix.byId.get(a.damId) : a.damTag ? ix.byTag.get(normTag(a.damTag)) : null; add({ date: a.dob, title: a.bornInHerd || dam ? `Born${dam ? ` to ${[dam.mgmtNo, dam.name].filter(Boolean).join(" ") || tagParts(dam.tag).tail}` : " in the herd"}` : "Born", coll: "animals", id: a.id, by: a.bornInHerd ? a : null }); }
  if (a.onDate && !data.movements.some((m) => (m.animalIds || []).includes(a.id) && m.kind === "on")) add({ date: a.onDate, title: `Moved on from ${a.fromText || "?"}${a.lot ? ` (lot ${a.lot})` : ""}`, coll: "animals", id: a.id });
  return out.filter((e) => e.date).sort((x, y) => y.date.localeCompare(x.date));
}
const rec = (list, id) => (list || []).find((r) => r.id === id) || null;
