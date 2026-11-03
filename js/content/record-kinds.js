// What a saved record is called, in the words a farmer would use (review B #2, A #8):
// "Death · Finisher 2 pen 3 · 1 finisher · tail bite", "Served · sow 0931 · AI",
// "Treatment · 117 Rosie · Synulox LC", "Calving · 0412 Daisy · bull calf".
// Also the labelled fields for the record summary and the generic edit form (never raw keys or
// JSON), and the few values an edit must work out again (withdrawal end dates).
// Pure: no DOM, no store. `L` is a lookup built by makeLookup() from the ledger's records.
import { tagParts } from "../sectors/beef/model/tags.js";
import { addDays, shortDate } from "../core/dates.js";

const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** £38,805.00 */
export const pounds = (v) => { const n = Number(v) || 0; return (n < 0 ? "−" : "") + "£" + nf2.format(Math.abs(n)); };
const plural = (n, one, many = one + "s") => `${nf0.format(n)} ${+n === 1 ? one : many}`;
const lower = (s) => String(s || "").toLowerCase();
const short = (s, n = 60) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isDayTime = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
const words = (k) => String(k || "").replace(/([A-Z])/g, " $1").toLowerCase().trim();
const isTime = (v) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);

// ---------------------------------------------------------------- lookup (names, not ids)
/** all: { coll: records[] } for one ledger. */
export function makeLookup(type, all = {}) {
  const by = (coll) => new Map((all[coll] || []).map((r) => [r.id, r]));
  const animals = by("animals"), sows = by("sows"), sheep = by("sheep"), rooms = by("rooms"), batches = by("batches"), mobs = by("mobs");
  const houses = by("houses"), crops = by("crops"), flocks = by("flocks"), groups = by("groups");
  const animal = (id) => {
    const a = animals.get(id) || sows.get(id) || sheep.get(id); if (!a) return "";
    if (type === "pigs" || a.sowNo != null) return `${a.type === "boar" ? "boar" : a.type === "gilt" ? "gilt" : "sow"} ${a.sowNo || tagParts(a.tag).tail}`;
    if (type === "dairy") return [a.cowNo, a.name].filter(Boolean).join(" ") || tagParts(a.tag).tail || a.tag || "";
    return [a.mgmtNo, a.name].filter(Boolean).join(" ") || tagParts(a.tag).tail || a.tag || "";
  };
  return {
    type, all,
    animal, animalRec: (id) => animals.get(id) || sows.get(id) || sheep.get(id) || null,
    room: (id) => rooms.get(id)?.name || "",
    batch: (id) => { const b = batches.get(id); return b ? (b.no != null ? `B${b.no}` : b.name || "batch") : ""; },
    mob: (id) => mobs.get(id)?.name || "",
    house: (id) => houses.get(id)?.name || "",
    crop: (id) => { const c = crops.get(id); return c ? `${houses.get(c.houseId)?.name ? houses.get(c.houseId).name + " · " : ""}crop ${c.no ?? ""}`.trim() : ""; },
    flock: (id) => { const f = flocks.get(id); return f ? `${houses.get(f.houseId)?.name || "flock"} flock` : ""; },
    group: (id) => groups.get(id)?.name || "",
    /** every animal / cow / sow / sheep the ledger has, for the edit form's chooser */
    animalChoices: () => [...animals.values(), ...sows.values(), ...sheep.values()].filter((a) => !a.deleted).map((a) => ({ value: a.id, label: [animal(a.id), a.tag && animal(a.id) !== tagParts(a.tag).tail ? a.tag : ""].filter(Boolean).join(" · ") })).sort((x, y) => x.label.localeCompare(y.label, "en", { numeric: true })),
  };
}
const nullL = makeLookup("", {});

/** Who / where a record is about, as the farmer says it ("117 Rosie", "Finisher 2 pen 3", "Mule ewes"). */
export function whoOf(r, L = nullL) {
  const ids = r.animalIds || r.femaleIds || r.calfIds || null;
  const one = r.animalId || r.damId || r.femaleId || r.sowId || r.sheepId || (Array.isArray(ids) && ids.length === 1 ? ids[0] : null);
  if (one) { const n = L.animal(one); if (n) return n; }
  if (Array.isArray(ids) && ids.length > 1) {
    const names = ids.map(L.animal).filter(Boolean);
    const word = L.type === "dairy" ? "cows" : L.type === "pigs" ? "pigs" : L.type === "sheep" ? "sheep" : "cattle";
    return names.length && names.length <= 3 ? names.join(", ") : plural(ids.length, word === "cattle" ? "animal" : word.replace(/s$/, ""), word === "sheep" ? "sheep" : word);
  }
  if (r.roomId || r.where?.roomId) { const room = L.room(r.roomId || r.where.roomId); const pen = r.where?.pen ?? r.pen; if (room) return `${room}${pen != null && pen !== "" ? ` pen ${Array.isArray(pen) ? pen.join(", ") : pen}` : ""}`; }
  if (r.batchId && L.batch(r.batchId)) return L.batch(r.batchId);
  if (r.mobId && (L.mob(r.mobId) || r.mobName)) return L.mob(r.mobId) || r.mobName;
  if (r.mobName) return r.mobName;
  if (r.cropId && L.crop(r.cropId)) return L.crop(r.cropId);
  if (r.houseId && L.house(r.houseId)) return L.house(r.houseId);
  if (r.flockId && L.flock(r.flockId)) return L.flock(r.flockId);
  if (r.groupId && L.group(r.groupId)) return L.group(r.groupId);
  const tags = r.animalTags || r.tags; if (Array.isArray(tags) && tags.length) return tags.length === 1 ? tagParts(tags[0]).tail || tags[0] : plural(tags.length, "animal");
  if (r.tag) return tagParts(r.tag).tail || r.tag;
  return "";
}

// ---------------------------------------------------------------- the record's date
const DATE_KEYS = ["date", "dateOn", "treatedOn", "bullIn", "eventDate", "placedDate", "movedOn", "farrowedAt", "datetime", "catchAt", "weekStart", "countDate", "serveDate", "inDate", "signedOn", "at", "due", "dob", "from", "received", "entered"];
/** The day the thing happened (YYYY-MM-DD), not the day it was typed in — unless that's all there is. */
export function recordDay(r) {
  for (const k of DATE_KEYS) { const v = r[k]; if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10); }
  const c = r.createdAt instanceof Date ? r.createdAt : r.createdAt?.toDate ? r.createdAt.toDate() : r.createdAt ? new Date(r.createdAt) : null;
  return c && !isNaN(c) ? c.toISOString().slice(0, 10) : "";
}
export const createdMs = (r) => { const c = r.createdAt instanceof Date ? r.createdAt : r.createdAt?.toDate ? r.createdAt.toDate() : r.createdAt ? new Date(r.createdAt) : null; return c && !isNaN(c) ? c.getTime() : 0; };

// ---------------------------------------------------------------- titles
const CALF = (sex, alive, type) => { const s = lower(sex); const w = /^(m|bull|male|steer)/.test(s) ? "bull calf" : /^(f|heifer|female)/.test(s) ? "heifer calf" : "calf"; return alive === false ? `dead ${w}` : w; };
const SCAN = { inCalf: "in calf", empty: "empty", twins: "twins", "+": "in pig", "-": "empty", "?": "recheck" };

/** The kind word, e.g. "Treatment", "Death", "Served". */
export function kindWord(type, coll, r = {}) {
  switch (coll) {
    case "medicines": return r.notUsed ? "Medicine disposal" : r.vaccine || /vaccin/i.test(r.reason || "") ? "Vaccination" : r.reason === "Worms" || r.wormerGroup ? "Dose" : "Treatment";
    case "deaths": return "Death";
    case "calvings": return "Calving";
    case "services": return type === "beef" && r.kind === "natural" ? "Bull in" : "Served";
    case "scans": return "Scan";
    case "heats": return type === "dairy" ? "Heat" : "Seen bulling";
    case "pds": return "PD";
    case "weighings": case "weighs": return "Weighed";
    case "movements": case "moves": { const d = r.kind || r.direction; return d === "on" ? "Moved on" : d === "off" ? (r.death ? "Died (movement)" : "Moved off") : d === "housing" ? "Housed" : d === "fieldMove" ? "Field move" : "Moved"; }
    case "sales": return "Sale";
    case "purchases": return r.kind === "medicine" ? "Medicine bought" : "Bought";
    case "finance": return r.kind === "revenue" ? "Money in" : r.kind === "prices" ? "Prices" : "Money out";
    case "tasks": return "Job";
    case "milkWithhold": return "Milk withheld";
    case "mastitis": return "Mastitis case";
    case "handover": return "Handover note";
    case "dryOffs": return "Dried off";
    case "tankLog": return "Tank check";
    case "recordings": return "Milk recording";
    case "footTrims": return "Foot trim";
    case "freshChecks": return "Fresh cow check";
    case "scoreSessions": return r.method === "bcs" ? "Body condition scores" : "Mobility scores";
    case "litters": return "Farrowing";
    case "roomChecks": return "Room check";
    case "tailBites": return "Tail bite";
    case "readings": return "Readings";
    case "feedDeliveries": return "Feed delivery";
    case "killSheets": return "Kill sheet";
    case "alarmTests": return "Alarm test";
    case "visitors": return "Visitor";
    case "lambings": return "Lambing";
    case "vetOps": return r.operation || "Vet operation";
    case "tbTests": return "TB test";
    case "animals": return type === "dairy" ? "Cow" : "Animal";
    case "sows": return r.type === "boar" ? "Boar" : r.type === "gilt" ? "Gilt" : "Sow";
    case "sheep": return "Sheep";
    case "mobs": return "Mob";
    case "groups": return "Group";
    case "houses": return "House";
    case "flocks": return "Flock";
    case "crops": return "Crop";
    case "days": return "Daily sheet";
    case "checks": return "Daily check";
    case "thins": return r.kind === "clear" ? "Clear-out" : "Thin";
    case "eggDeliveries": return "Egg collection";
    case "events": return EVENT_WORD[r.kind] || "Note";
    case "notes": return "Note";
    case "batches": return "Batch";
    case "rooms": return "Room";
    default: return collWord(coll);
  }
}
const EVENT_WORD = { countCheck: "Head count", split: "Mob split", merge: "Mobs merged", fieldMove: "Field move", ramsIn: "Rams in", ramsOut: "Rams out", raddle: "Raddle", scan: "Scan", bcs: "Body condition", lame: "Lameness check", fec: "Worm egg count", weigh: "Weighed", wean: "Weaned", cullCheck: "Cull check", tagLost: "Lost tag" };
const COLL_NAMES = { tbTests: "TB test", vetOps: "Vet operation", medProducts: "Medicine product", medStock: "Medicine stock", feedGroups: "Feed group", feedAdjust: "Feed change", pds: "PD result", dryOffs: "Dry-off", fci: "FCI form", salmSamples: "Salmonella sample", birdRegisterReturns: "Bird Register return", killSheets: "Kill sheet", roomChecks: "Room check", alarmTests: "Alarm test", tailBites: "Tail bite", pm2Months: "PM2 month", embUploads: "eMB upload", finance: "Money", tasks: "Job", calfFeeds: "Calf feeding plan", parlourService: "Parlour service", abFailures: "Antibiotic failure", storeTemps: "Egg store temperature", miteScores: "Red mite score", packerStatements: "Packer statement", farmGate: "Farm gate sale", birdMoves: "Bird movement", lightPlans: "Lighting plan", rodentVisits: "Rodent control visit", healthPlans: "Health plan", controllerReadings: "Controller reading", waterTests: "Water test", lambCrops: "Lamb tagging", inventories: "Inventory", diseaseReports: "Disease report", feedRecords: "Feed record", siteChecks: "Site check", vetVisits: "Vet visit", enrichment: "Enrichment", semen: "Semen", straws: "Straws", milkQuality: "Milk quality result", imports: "Import", training: "Training record", energy: "Energy reading", turnarounds: "Turnaround", brooding: "Brooding check" };
export function collWord(coll) { return COLL_NAMES[coll] || String(coll).replace(/([A-Z])/g, " $1").replace(/s$/, "").replace(/^./, (x) => x.toUpperCase()).replace(/ (.)/g, (m, c) => " " + c.toLowerCase()); }
/** Plural heading for a collection ("Treatments", "Deaths"). */
const PLURALS = { finance: "Money", medStock: "Medicine stock", enrichment: "Enrichment", semen: "Semen", straws: "Straws", sheep: "Sheep", milkQuality: "Milk quality results", handover: "Handover notes", tankLog: "Tank checks", days: "Daily sheets", checks: "Daily checks", housing: "Housing orders", farmGate: "Farm gate sales", medicines: "Medicines", milkWithhold: "Milk withheld", mastitis: "Mastitis cases" };
export function collHeading(coll) { if (PLURALS[coll]) return PLURALS[coll]; const w = COLL_NAMES[coll]; if (!w) return String(coll).replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase()).replace(/ (.)/g, (m, c) => " " + c.toLowerCase()); return /s$/.test(w) ? w : /y$/.test(w) && !/ey$/.test(w) ? w.slice(0, -1) + "ies" : /(sh|ch|x)$/.test(w) ? w + "es" : w + "s"; }

/** What happened, in a few words (after the kind and who). */
function detail(type, coll, r, L) {
  switch (coll) {
    case "medicines": {
      const p = r.productName || r.product || "";
      return [p, r.quarters?.length ? r.quarters.join(" ") : "", r.reason && !/vaccin/i.test(r.reason) && r.reason !== p ? lower(r.reason) : ""].filter(Boolean).join(" · ");
    }
    case "deaths": {
      if (type === "pigs") { const n = +r.n || 1; const st = lower(r.stage || "pig"); return [plural(n, st === "suckling" ? "piglet" : st, st === "suckling" ? "piglets" : st === "sow" ? "sows" : st + "s"), lower(r.cause)].filter(Boolean).join(" · "); }
      if (type === "sheep") return [r.number ? plural(+r.number, r.lamb ? "lamb" : "sheep", r.lamb ? "lambs" : "sheep") : "", lower(r.cause)].filter(Boolean).join(" · ");
      return [lower(r.cause === "Other" ? r.causeText || "other" : r.cause)].filter(Boolean).join(" · ");
    }
    case "calvings": { const c = r.calves || []; return c.length ? c.map((k) => CALF(k.sex, k.alive)).join(", ") : "no calf recorded"; }
    case "services": return type === "pigs" ? [r.kind || "AI", r.boar].filter(Boolean).join(" · ") : r.kind === "natural" ? [r.sireText, r.bullOut ? `out ${shortDate(r.bullOut)}` : ""].filter(Boolean).join(" · ") : [type === "beef" ? "AI" : "", r.sireText, r.sexed ? "sexed" : ""].filter(Boolean).join(" · ");
    case "scans": return SCAN[r.result] || lower(r.result);
    case "pds": return r.result === "+" ? "in calf" : r.result === "-" ? "empty" : "recheck";
    case "heats": return lower(r.sign);
    case "weighings": return r.kg ? `${r.kg} kg` : "";
    case "weighs": return r.mean ? `${Math.round(r.mean)} g average` : "";
    case "movements": case "moves": {
      const n = r.count ?? r.n ?? (Array.isArray(r.animalIds) && r.animalIds.length > 1 ? r.animalIds.length : null);
      const where = r.to || r.toName || r.dest || r.otherName || r.place || r.from || r.fromName || r.toField || "";
      return [n != null && !Array.isArray(r.animalIds) ? plural(+n, type === "pigs" ? "pig" : type === "sheep" ? (r.lambs ? "lamb" : "sheep") : "animal", type === "sheep" && !r.lambs ? "sheep" : undefined) : "", where ? (r.kind === "on" || r.direction === "on" ? `from ${where}` : `to ${where}`) : "", r.reason && r.reason !== "Sold" ? lower(r.reason) : ""].filter(Boolean).join(" · ");
    }
    case "sales": {
      const n = r.count ?? (r.lines || []).length;
      return [n ? plural(+n, type === "sheep" ? (r.lambs ? "lamb" : "sheep") : "animal", type === "sheep" && !r.lambs ? "sheep" : type === "sheep" ? "lambs" : "cattle") : "", r.buyer || r.outlet || (r.kind && type === "beef" ? r.kind : "")].filter(Boolean).join(" · ");
    }
    case "purchases": return [r.productName, r.supplier].filter(Boolean).join(" · ");
    case "finance": return [r.category, typeof r.amount === "number" ? pounds(r.amount) : "", short(r.note, 40)].filter(Boolean).join(" · ");
    case "tasks": return short(r.title, 70);
    case "milkWithhold": return [r.productName, r.quarters?.length ? r.quarters.join(" ") : "", r.releasedAt ? "released" : ""].filter(Boolean).join(" · ");
    case "mastitis": return [r.quarters?.length ? r.quarters.join(" ") : "", r.caseNo ? `case ${r.caseNo}` : "", r.productName].filter(Boolean).join(" · ");
    case "handover": case "notes": return short(r.text, 70);
    case "dryOffs": return [lower(r.treatment), r.productName].filter(Boolean).join(" · ");
    case "tankLog": return [r.milking, r.tempC != null ? `${r.tempC} °C` : ""].filter(Boolean).join(" · ");
    case "footTrims": return [r.foot, lower(r.lesion)].filter(Boolean).join(" · ");
    case "litters": return [r.bornAlive != null ? plural(+r.bornAlive, "born alive", "born alive") : "", r.weaned ? `${r.weaned.n} weaned` : ""].filter(Boolean).join(" · ");
    case "roomChecks": return [r.time, r.by].filter(Boolean).join(" · ");
    case "tailBites": return [r.pigs ? plural(+r.pigs, "pig") : "", lower(r.severity)].filter(Boolean).join(" · ");
    case "feedDeliveries": return [r.ration, r.kg ? `${nf0.format(r.kg)} kg` : r.tonnes ? `${r.tonnes} t` : "", r.supplier || r.mill].filter(Boolean).join(" · ");
    case "killSheets": return [r.abattoir, r.totals?.pigs ? plural(+r.totals.pigs, "pig") : ""].filter(Boolean).join(" · ");
    case "visitors": return [r.name, r.company].filter(Boolean).join(" · ");
    case "batches": return [r.no != null ? `B${r.no}` : r.name, lower(r.stage), r.numberIn ? plural(+r.numberIn, "pig") : ""].filter(Boolean).join(" · ");
    case "alarmTests": return [r.house || (r.houseIds ? "" : ""), r.what, r.result || (r.sounded === true || r.ok === true ? "working" : r.sounded === false || r.ok === false ? "failed" : "")].filter(Boolean).map(String).join(" · ");
    case "storeTemps": return r.min != null || r.max != null ? `${r.min ?? "?"}–${r.max ?? "?"} °C` : "";
    case "packerStatements": return [r.week ? `week ${r.week}` : "", r.packer].filter(Boolean).join(" · ");
    case "birdRegisterReturns": case "inventories": return [r.year ? String(r.year) : "", r.total != null ? `${nf0.format(r.total)} counted` : ""].filter(Boolean).join(" · ");
    case "embUploads": return r.quarter || "";
    case "plans": case "siteChecks": return [words(r.kind), lower(r.result), r.by].filter(Boolean).join(" · ");
    case "lambCrops": return [r.year ? String(r.year) : "", r.taggedCount ? `${nf0.format(r.taggedCount)} tagged` : ""].filter(Boolean).join(" · ");
    case "manure": return [r.tonnes ? `${r.tonnes} t` : "", r.destination].filter(Boolean).join(" · ");
    case "rodentVisits": return [r.controller, lower(r.findings)].filter(Boolean).join(" · ");
    case "housing": return [r.from && r.to ? `${shortDate(r.from)} – ${shortDate(r.to)}` : "", r.reason].filter(Boolean).join(" · ");
    case "semen": return [r.boar ? `boar ${r.boar}` : "", r.doses != null ? `${r.doses} doses` : ""].filter(Boolean).join(" · ");
    case "lambings": { const n = Array.isArray(r.lambs) ? r.lambs.length : r.lambs; return [r.aborted ? "aborted" : n != null && !Number.isNaN(+n) ? plural(+n, "lamb") : r.born != null ? plural(+r.born, "lamb") : "", r.raddle ? lower(r.raddle) + " raddle" : ""].filter(Boolean).join(" · "); }
    case "vetOps": return [r.number ? plural(+r.number, "animal") : "", r.method].filter(Boolean).join(" · ");
    case "tbTests": return [r.testType || r.type, r.result || r.stage].filter(Boolean).join(" · ");
    case "checks": return [r.dead != null ? `${r.dead} dead` : "", r.time].filter(Boolean).join(" · ");
    case "days": return [r.eggsTotal != null ? `${nf0.format(r.eggsTotal)} eggs` : "", r.dead != null ? `${r.dead} dead` : ""].filter(Boolean).join(" · ");
    case "thins": return [r.birds != null ? plural(+r.birds, "bird") : "", r.catchAt ? r.catchAt.slice(0, 10) === r.catchAt ? "" : r.catchAt.slice(11, 16) : ""].filter(Boolean).join(" · ");
    case "eggDeliveries": return [r.eggs != null ? `${nf0.format(r.eggs)} eggs` : "", r.packer].filter(Boolean).join(" · ");
    case "events": { const c = r.counts || {}; return [c.count != null ? plural(+c.count, "head", "head") : c.n != null ? `${c.n}` : c.weaned != null ? `${c.weaned} weaned` : c.lame != null ? `${c.lame} of ${c.outOf} lame` : "", r.toField || r.reason || r.tag || ""].filter(Boolean).join(" · "); }
    default: {
      const pick = ["productName", "product", "name", "person", "course", "title", "label", "operation", "disease", "text", "reason", "kind", "supplier", "buyer", "result", "description", "note", "category", "item", "type"];
      for (const k of pick) { const v = r[k]; if (v != null && v !== "" && typeof v !== "object") return short(String(v), 50); }
      return typeof r.amount === "number" ? pounds(r.amount) : "";
    }
  }
}
const SEXW = { m: "male", f: "female", b: "bull" };
const animalDetail = (a) => [SEXW[lower(a.sex)] || lower(a.sex), a.offTo === "Dead" || a.died ? "died" : a.offDate || a.cull?.date ? "left the farm" : ""].filter(Boolean).join(" · ");
/** "Treatment · 117 Rosie · Synulox LC" */
export function recordTitle(type, coll, r, L = nullL) {
  const kind = kindWord(type, coll, r);
  const NAMED = ["mobs", "groups", "houses", "rooms", "feedGroups", "medProducts", "contacts", "fields"];
  const who = ["animals", "sows", "sheep"].includes(coll) ? (L.animal(r.id) || (r.tag ? tagParts(r.tag).tail : "") || r.name || "") : NAMED.includes(coll) ? r.name || "" : whoOf(r, L);
  const d = ["animals", "sows", "sheep"].includes(coll) ? animalDetail(r) : NAMED.includes(coll) ? (coll === "feedGroups" && r.animalIds ? plural(r.animalIds.length, "animal") : "") : detail(type, coll, r, L);
  return [kind, who, d].filter((x, i, a) => x && a.indexOf(x) === i).join(" · ");
}

// ---------------------------------------------------------------- fields (summary + edit form)
// Never shown or edited: bookkeeping, links between records, ids that only the app uses.
const HIDDEN = new Set(["id", "history", "createdAt", "createdBy", "updatedAt", "updatedBy", "deleted", "deletedAt", "deletedBy", "actionId", "actionEffects", "cascadeId", "cascadeEffects", "courseId", "sessionId",
  "medId", "withholdId", "saleId", "financeId", "moveId", "feedDeliveryId", "checkId", "purchaseId", "thinId", "fciId", "productId", "semenId", "strawId", "sireId", "litterId", "killSheetId", "photoIds", "by", "doneBy", "releasedBy", "_path", "source", "money", "sourceRef", "generated"]);
// Ids that point at another record the farmer knows by name.
export const REF_KEYS = { animalId: "animal", damId: "animal", femaleId: "animal", sowId: "animal", sheepId: "animal", mobId: "mob", roomId: "room", batchId: "batch", houseId: "house", cropId: "crop", flockId: "flock", groupId: "group" };
const LABELS = {
  date: "Date", time: "Time", productName: "Product", product: "Product", batch: "Batch number", batchNumber: "Batch number", expiry: "Expiry", expiryDate: "Expiry", reason: "What for", cause: "Cause", causeText: "What happened",
  note: "Note", notes: "Notes", amount: "Amount (£)", category: "Category", kind: "Type", kg: "Weight (kg)", liveKg: "Live weight (kg)", deadKg: "Dead weight (kg)", quantity: "Quantity", quantityUnit: "Unit", unit: "Unit",
  administeredBy: "Given by", givenBy: "Given by", vet: "Vet", source: "Supplier", supplier: "Supplier", vat: "VAT", buyer: "Buyer", buyerAddress: "Buyer's address", route: "Route", dose: "Dose", doses: "Number of doses", doseEach: "Dose each",
  courseDays: "Course (days)", days: "Days", intervalH: "Every (hours)", intervalDays: "Every (days)", lastDate: "Last dose", lastDose: "Last dose", lastDoseAt: "Last dose",
  withdrawalMeatDays: "Meat withdrawal (days)", withdrawalMilkDays: "Milk withdrawal (days)", wdMeatDays: "Meat withdrawal (days)", wdMilkHours: "Milk withdrawal (hours)", wdDays: "Meat withdrawal (days)", meatDays: "Meat withdrawal (days)", eggDays: "Egg withdrawal (days)",
  withdrawalEndDateMeat: "Meat withdrawal ends", withdrawalEndDateMilk: "Milk withdrawal ends", withdrawalUntil: "Meat withdrawal ends", withdrawalEnd: "Withdrawal ends", meatOkFrom: "Meat OK from", milkOkFrom: "Milk OK from", eggsOkFrom: "Eggs OK from", okFrom: "Milk OK from",
  quarters: "Quarters", severity: "Severity", grade: "Grade", marks: "Marked with", organism: "Organism", caseNo: "Case number", recurrence: "Repeat case", failure: "Treatment failure", treated: "Treated",
  animalId: "Animal", damId: "Cow", femaleId: "Cow", sowId: "Sow", sheepId: "Sheep", mobId: "Mob", roomId: "Room", batchId: "Batch", houseId: "House", cropId: "Crop", flockId: "Flock", groupId: "Group",
  animalIds: "Animals", femaleIds: "Cows", calfIds: "Calves", animalTags: "Tags", tags: "Tags", tag: "Tag", tagLabel: "Tag", mgmtNo: "Herd number", cowNo: "Cow number", sowNo: "Sow number", name: "Name",
  disposal: "Carcass went to", docketNo: "Docket number", foundAtInspection: "Found dead at inspection", tseRequired: "TSE test needed", tseDone: "TSE test done", nifaisNotified: "NIFAIS notified",
  ease: "Calving ease", sireText: "Sire", sireBreed: "Sire breed", bullIn: "Bull in", bullOut: "Bull out", result: "Result", foetalAgeDays: "Foetus age (days)", sign: "Sign", sexed: "Sexed semen", technician: "Technician", serviceNo: "Service number", boar: "Boar",
  method: "Method", to: "To", from: "From", toName: "To", fromName: "From", place: "Place", dest: "Destination", count: "Number", number: "Number", n: "Number", stage: "Stage", estKg: "Estimated weight (kg)", collection: "Collected by", pen: "Pen", crate: "Crate",
  haulage: "Distance (km)", fci: "FCI declared", lot: "Lot", text: "Note", title: "Job", due: "Due", done: "Done", byName: "Recorded by", operation: "Operation", anaesthetic: "Anaesthetic used", analgesic: "Pain relief given", operator: "Done by",
  ageDays: "Age (days)", tempC: "Temperature (°C)", milking: "Milking", litres: "Litres", collected: "Collected", foot: "Foot", lesion: "Lesion", treatment: "Treatment", trimmer: "Trimmer", block: "Block fitted", lastScc: "Last cell count",
  expectedCalving: "Expected calving", vetReason: "Vet's reason", pigs: "Pigs", severityNote: "Severity", actions: "Actions", releasedAt: "Released", releasedByName: "Released by", auto: "Written by the app",
  mobName: "Mob", outlet: "Outlet", outletType: "Outlet type", deductions: "Deductions", gross: "Gross (£)", lambs: "Lambs", abattoir: "Abattoir", ration: "Ration", tonnes: "Tonnes", mill: "Mill", pricePerT: "Price per tonne (£)",
  company: "Company", purpose: "Purpose", vehicle: "Vehicle", readRules: "Read the rules", bootsChanged: "Changed boots", activeIngredient: "Active ingredient", antibiotic: "Antibiotic", mfsNo: "MFS number", prophylaxis: "Preventive",
  sex: "Sex", breed: "Breed", colour: "Colour", dob: "Date of birth", eid: "EID", direction: "Direction", nifais: "NIFAIS", birthKg: "Birth weight (kg)", alive: "Alive", calvingEase: "Calving ease", offDate: "Left the farm", offTo: "Went to", offReason: "Why it left",
};
export function fieldLabel(key) { return LABELS[key] || String(key).replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase()).replace(/ (.)/g, (m, c) => " " + c.toLowerCase()); }
// Choices for a few fields, so the edit form offers the same list as the entry form.
const OPTIONS = {
  "beef.deaths.cause": ["Calving", "Pneumonia", "Scour", "Accident", "Old age", "Unknown", "Other"],
  "beef.deaths.disposal": ["NFSCO collection", "Knackery", "Renderer", "TSE sampling site"],
  "beef.scans.result": [["inCalf", "In calf"], ["empty", "Empty"], ["twins", "Twins"]],
  "dairy.pds.result": [["+", "In calf"], ["-", "Empty"], ["?", "Recheck"]],
  "pigs.scans.result": [["+", "In pig"], ["-", "Empty"], ["?", "Recheck"]],
  "finance.kind": [["expense", "Money out"], ["revenue", "Money in"]],
};
const optionsFor = (type, coll, key) => OPTIONS[`${type}.${coll}.${key}`] || OPTIONS[`${coll}.${key}`] || null;

/**
 * The record's fields for the summary and the edit form, in a sensible order.
 * Each: { key, label, input: 'text'|'number'|'date'|'time'|'datetime'|'check'|'select'|'ref'|'list'|'none', value, text, options? }
 * input 'none' = shown, not editable here (nested details, several animals).
 */
export function fieldsOf(type, coll, r, L = nullL) {
  const out = [];
  const keys = Object.keys(r).filter((k) => !HIDDEN.has(k) && !(k === "animalTags" && Array.isArray(r.animalIds) && r.animalIds.length));
  const ORDER = ["date", "time", "animalId", "animalIds", "damId", "femaleId", "femaleIds", "sowId", "mobId", "roomId", "pen", "batchId", "houseId", "cropId", "flockId", "reason", "productName", "product", "cause", "kind"];
  keys.sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  for (const k of keys) {
    const v = r[k]; if (v == null || v === "") { if (LABELS[k]) out.push({ key: k, label: fieldLabel(k), input: inputFor(k, v, type, coll), value: v ?? "", text: "", options: optionsFor(type, coll, k) || undefined }); continue; }
    const f = { key: k, label: fieldLabel(k), value: v };
    if (["animalId", "animalIds"].includes(k)) f.label = type === "dairy" ? (Array.isArray(v) && v.length > 1 ? "Cows" : "Cow") : Array.isArray(v) && v.length === 1 ? "Animal" : f.label;
    if (REF_KEYS[k]) { f.input = REF_KEYS[k] === "animal" ? "ref" : "none"; f.text = refName(REF_KEYS[k], v, L) || "(not found)"; }
    else if (["animalIds", "femaleIds", "calfIds"].includes(k) && Array.isArray(v)) { f.input = v.length === 1 ? "ref" : "none"; f.text = v.map(L.animal).map((x, i) => x || "animal " + (i + 1)).join(", "); }
    else if (Array.isArray(v)) { const simple = v.every((x) => typeof x === "string" || typeof x === "number"); f.input = simple ? "list" : "none"; f.text = simple ? v.join(", ") : describeList(k, v); }
    else if (v && typeof v === "object") { f.input = "none"; f.text = describeObject(v); if (!f.text) continue; }
    else if (typeof v === "boolean") { f.input = "check"; f.text = v ? "Yes" : "No"; }
    else { f.input = inputFor(k, v, type, coll); f.text = textOf(k, v); const o = optionsFor(type, coll, k); if (o) { f.input = "select"; f.options = o; const hit = o.find((x) => (Array.isArray(x) ? x[0] : x) === v); if (hit && Array.isArray(hit)) f.text = hit[1]; } }
    if (DERIVED[`${type}.${coll}`]?.includes(k)) f.input = "derived";
    out.push(f);
  }
  return out;
}
// Worked out by deriveEdit (or the entry form) — shown, never typed over.
const DERIVED = { "beef.medicines": ["lastDate", "withdrawalEndDateMeat", "withdrawalEndDateMilk"], "pigs.medicines": ["withdrawalEndDateMeat"], "sheep.medicines": ["withdrawalUntil"], "broilers.medicines": ["withdrawalEnd"],
  "dairy.medicines": ["milkOkFrom", "lastDoseAt", "meatOkFrom", "withdrawalEndDateMeat"], "dairy.milkWithhold": ["okFrom", "lastDoseAt", "firstWithheldAt"], "layers.medicines": ["lastDose", "eggsOkFrom", "meatOkFrom"] };
function inputFor(k, v, type, coll) {
  if (optionsFor(type, coll, k)) return "select";
  if (typeof v === "number" || /^(amount|kg|liveKg|deadKg|n|count|number|doses|days|courseDays|intervalH|intervalDays|withdrawal\w*Days|wd\w*|meatDays|eggDays|tempC|litres|estKg|pigs|gross|tonnes|ageDays|foetalAgeDays|caseNo|birthKg)$/.test(k)) return "number";
  if (isDayTime(v) || /At$/.test(k) && typeof v === "string" && v.length > 10) return "datetime";
  if (isDay(v) || /^(date|dob|bullIn|bullOut|due|lastDate|expectedCalving)$|Date$|OkFrom$|Until$|End$/.test(k)) return "date";
  if (isTime(v) || k === "time") return "time";
  if (typeof v === "boolean") return "check";
  return "text";
}
const refName = (kind, id, L) => (kind === "animal" ? L.animal(id) : L[kind] ? L[kind](id) : "");
export function textOf(k, v) {
  if (v == null || v === "") return "";
  if (k === "amount" || k === "gross" || /^price/.test(k)) return typeof v === "number" ? pounds(v) : String(v);
  if (isDay(v)) return shortDate(v);
  if (isDayTime(v)) return `${shortDate(v.slice(0, 10))} ${v.slice(11, 16)}`;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return nf0.format(v) === String(v) || Math.abs(v) >= 1000 ? (Number.isInteger(v) ? nf0.format(v) : String(v)) : String(v);
  return String(v);
}
function describeList(k, v) {
  if (k === "calves") return v.map((c) => CALF(c.sex, c.alive)).join(", ");
  if (k === "lines") return plural(v.length, "line");
  if (k === "doses") return v.map((d) => [d.dose != null ? `${d.dose}` : "", d.weightKg ? `${d.weightKg} kg` : ""].filter(Boolean).join(" at ")).filter(Boolean).join(", ");
  if (k === "replies") return plural(v.length, "reply", "replies");
  return plural(v.length, "item");
}
function describeObject(o) {
  const parts = [];
  for (const [k, v] of Object.entries(o)) { if (v == null || v === "" || typeof v === "object" || HIDDEN.has(k)) continue; parts.push(`${fieldLabel(k)}: ${textOf(k, v)}`); }
  return parts.slice(0, 6).join(" · ");
}

// ---------------------------------------------------------------- values an edit works out again
/** After an edit, the dependent values (withdrawal end dates) — returns extra changes. */
export function deriveEdit(type, coll, merged, L = nullL) {
  const out = {};
  if (coll === "medicines" && type === "beef" && merged.date) {
    const course = Math.max(1, +merged.courseDays || 1); const last = addDays(merged.date, course - 1);
    out.lastDate = last;
    const m = merged.withdrawalMeatDays === "" || merged.withdrawalMeatDays == null ? null : +merged.withdrawalMeatDays;
    const k = merged.withdrawalMilkDays === "" || merged.withdrawalMilkDays == null ? null : +merged.withdrawalMilkDays;
    out.withdrawalEndDateMeat = m != null ? addDays(last, m) : null;
    out.withdrawalEndDateMilk = k ? addDays(last, k) : null;
  }
  if (coll === "medicines" && type === "pigs" && merged.date) out.withdrawalEndDateMeat = +merged.wdMeatDays ? addDays(merged.date, Math.max(0, (+merged.days || 1) - 1) + +merged.wdMeatDays) : null;
  if (coll === "medicines" && type === "sheep" && merged.date && merged.wdMeatDays != null) out.withdrawalUntil = +merged.wdMeatDays > 0 ? addDays(merged.date, +merged.wdMeatDays) : null;
  if (coll === "medicines" && type === "broilers" && merged.date && merged.wdDays != null) out.withdrawalEnd = addDays(merged.date, Math.max(0, (+merged.days || 1) - 1) + (+merged.wdDays || 0));
  // one animal changed: keep its tag beside it (registers print the tag)
  if (Array.isArray(merged.animalIds) && merged.animalIds.length === 1 && Array.isArray(merged.animalTags)) { const a = L.animalRec(merged.animalIds[0]); if (a?.tag) out.animalTags = [a.tag]; }
  if (merged.animalId && "tag" in merged && coll === "deaths") { const a = L.animalRec(merged.animalId); if (a?.tag) { out.tag = a.tag; if ("tagLabel" in merged) out.tagLabel = tagParts(a.tag).tail; } }
  return out;
}

// ---------------------------------------------------------------- withdrawal that a delete would lift
const WD_KEYS = [["withdrawalEndDateMeat", "in withdrawal"], ["withdrawalUntil", "in withdrawal"], ["withdrawalEnd", "in withdrawal"], ["meatOkFrom", "in meat withdrawal"], ["withdrawalEndDateMilk", "in milk withdrawal"], ["milkOkFrom", "in milk withdrawal"], ["eggsOkFrom", "in egg withdrawal"]];
/**
 * Plain-words warnings for records whose deletion lifts a live withdrawal:
 * "0108 7 will no longer show as in withdrawal (until 9 Dec)".
 */
export function withdrawalWarnings(type, list, today, L = nullL) {
  const out = [];
  for (const { coll, rec } of list) {
    if (rec.deleted) continue;
    if (coll === "milkWithhold") { if (!rec.releasedAt && rec.okFrom && rec.okFrom.slice(0, 10) >= today) out.push(`${whoOf(rec, L) || "This cow"} will no longer show on the milk-out board (milk out until ${dayMonth(rec.okFrom)}${rec.okFrom.length > 10 ? " " + rec.okFrom.slice(11, 16) : ""})`); continue; }
    if (coll !== "medicines") continue;
    for (const [k, words] of WD_KEYS) {
      const v = rec[k]; if (typeof v !== "string" || v.slice(0, 10) <= today) continue;
      if (type === "dairy" && k === "milkOkFrom" && list.some((x) => x.coll === "milkWithhold")) continue; // said once, by the board line
      out.push(`${whoOf(rec, L) || "These animals"} will no longer show as ${type === "dairy" && words === "in withdrawal" ? "in meat withdrawal" : words} (until ${dayMonth(v)})`); break;
    }
  }
  return [...new Set(out)];
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayMonth = (iso) => { if (!iso) return ""; const [, m, d] = iso.slice(0, 10).split("-"); return `${+d} ${MON[+m - 1]}`; };
