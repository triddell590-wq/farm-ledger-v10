// A realistic Dairy ledger for e2e tests and screenshots (NI all-year Holstein herd, ~50 cows +
// heifers + calves), written through the app's own services on the in-memory backend. Dates are
// relative to today, so the home always has cows withheld, heats, PDs, dry-offs and calvings.
export async function seedDairy(page) {
  return page.evaluate(async () => {
    const R = await import("./js/services/records.js");
    const { store } = await import("./js/core/store.js");
    const { addDays, todayStr } = await import("./js/core/dates.js");
    const M = await import("./js/sectors/dairy/model/milking.js");
    const { session } = window.__fl;
    await session.load(true);
    const L = session.ledgers.find((l) => l.type === "dairy"); const lid = L.id; const T = todayStr(); const d = (n) => addDays(T, n);
    const now = M.nowStr();
    const add = (coll, data, id) => R.addRecord(lid, coll, data, id); const nid = () => store.newId();
    R.setMeta(lid, "keeper", { name: "Tom Riddell", address: "Gulladuff, Magherafelt, Co. Londonderry", herdNo: "223344" });
    R.setMeta(lid, "settings", { herdNo: "223344", processor: "Dale Farm", tbLastDate: d(-340), johnes: "Johne's declaration signed by J. Kerr MRCVS, Mar 2026" });
    R.setMeta(lid, "silage", { tonnes: 820, date: d(-6) });
    // cows: [cowNo, name, lactation, calved days ago | null (dry: calved long ago, dried), state]
    const cows = []; let n = 0;
    const mk = (cowNo, name, lac, calvedAgo, extra = {}) => { const id = nid(); const age = 24 + lac * 13; cows.push({ id, cowNo, calvedAgo, lac });
      add("animals", { cowNo: String(cowNo), name, tag: `UK 9 223344 ${String(10000 + cowNo * 7).slice(-5)}`, sex: "F", breed: "HOL", dob: d(-Math.round(age * 30.4)), bornInHerd: true, lactationBase: lac - 1, calvedDateBase: d(-calvedAgo - 400), ...extra }, id);
      add("calvings", { damId: id, date: d(-calvedAgo), time: "05:30", ease: "Unassisted", calves: [{ sex: n++ % 2 ? "M" : "F", alive: true }], lactation: lac });
      return id; };
    const names = ["Bella", "Daisy", "Molly", "Rosie", "Lily", "Poppy", "Ruby", "Holly", "Maisie", "Bluebell", "Clover", "Primrose", "Hazel", "Willow", "Meg", "Tilly"];
    const ids = {};
    const herd = [[214, 3, 142], [140, 5, 298], [302, 2, 61], [101, 1, 35], [102, 2, 70], [103, 4, 210], [104, 3, 25], [105, 2, 95], [106, 6, 330], [107, 1, 12], [108, 2, 48], [109, 3, 120], [110, 4, 180], [111, 2, 240], [112, 3, 275], [113, 1, 150], [115, 2, 9], [116, 3, 66], [117, 5, 101], [118, 2, 133], [119, 1, 199], [120, 4, 46], [121, 2, 260], [122, 3, 84], [123, 1, 4], [124, 2, 222], [125, 3, 160], [126, 2, 55], [127, 4, 310], [128, 1, 90], [129, 2, 30], [130, 3, 115], [166, 4, 285], [201, 3, 291], [288, 2, 77]];
    herd.forEach(([no, lac, ago], i) => { ids[no] = mk(no, i < names.length ? names[i] : "", lac, ago); });
    // dry cows: calved ~320 days ago, dried 20–50 days ago, PD+
    for (const [no, lac, dried] of [[131, 3, 20], [132, 2, 35], [133, 4, 48], [134, 5, 10]]) { const id = mk(no, "", lac, 300 + dried); ids[no] = id; add("dryOffs", { animalId: id, date: d(-dried), lastScc: 120, treatment: "Sealant only", productName: "Orbeseal", batch: "OB221", expectedCalving: d(60 - dried) }); }
    // breeding: serves, heats, PDs
    const serve = (no, ago, extra = {}) => add("services", { animalId: ids[no], date: d(-ago), time: "10:00", sireText: extra.sire || "Peak Altaiot", sireBreed: extra.breed || "HOL", sexed: !!extra.sexed, technician: "Self", kind: "AI", serviceNo: 1 });
    const pd = (no, ago, result) => add("pds", { animalId: ids[no], date: d(-ago), result, vet: "John Kerr MRCVS" });
    serve(140, 200); pd(140, 165, "+");
    // in-calf cows: conceived 50–160 days ago (some at a second serve), so the 21-day rates have history
    const dimOf = Object.fromEntries(herd.map(([no, , ago]) => [no, ago]));
    const AGO = [52, 60, 68, 77, 85, 96, 108, 120, 135, 150];
    [103, 106, 110, 111, 112, 121, 124, 127, 166, 201].forEach((no, i) => { const ago = Math.min(AGO[i], dimOf[no] - 50); const opt = { breed: no % 2 ? "AA" : "HOL", sire: no % 2 ? "Angus — Rawburn" : "Peak Altaiot" }; if (no % 3 === 0) serve(no, ago + 21, opt); serve(no, ago, opt); pd(no, ago - 35, "+"); });
    for (const no of [131, 132, 133, 134]) { serve(no, 260 + (no % 5)); pd(no, 225, "+"); }
    serve(140, 268); // keeps 140 in the dry-off list
    for (const no of [214, 109, 125, 113, 130]) { serve(no, 33 + (no % 3)); } // PD due
    for (const no of [105, 117, 118, 122]) { serve(no, 20 + (no % 3)); } // heats due (repeat window)
    add("heats", { animalId: ids[302], date: T, time: "06:20", sign: "standing", source: "eye" }); // to serve
    add("heats", { animalId: ids[116], date: d(-19), time: "07:00", sign: "mounting", source: "eye" });
    pd(119, 10, "-"); serve(119, 45);
    // straws
    add("straws", { bull: "Peak Altaiot", code: "HOUSA3132", breed: "HOL", sexed: true, count: 14 });
    add("straws", { bull: "Rawburn Eljay", code: "AA-RE22", breed: "AA", sexed: false, count: 30 });
    // heifers + calves
    for (let i = 0; i < 6; i++) { const id = nid(); add("animals", { cowNo: String(401 + i), tag: `UK 9 223344 ${String(30100 + i)}`, sex: "F", breed: "HOL", dob: d(-(420 + i * 25)), bornInHerd: true }, id); if (i < 3) { add("services", { animalId: id, date: d(-(90 + i * 10)), sireText: "Peak Altaiot", sireBreed: "HOL", sexed: true, kind: "AI" }); add("pds", { animalId: id, date: d(-(55 + i * 10)), result: "+" }); } }
    const calf = (k, ago, sex, extra = {}) => { const id = nid(); add("animals", { tag: ago < 2 ? "" : `UK 9 223344 ${String(30200 + k)}`, cowNo: "", sex, breed: sex === "M" && k % 2 ? "AAX" : "HOL", dob: d(-ago), birthTime: "04:10", bornInHerd: true, damId: ids[[107, 123, 115, 101][k % 4]], reg: ago < 2 ? {} : { tagged: d(-ago), register: d(-ago + 2), nifais: ago > 10 ? d(-ago + 5) : null }, calf: { pen: String(1 + (k % 3)), colostrum: { litres: 3, time: "05:00", brix: 24 }, destination: sex === "M" ? "Sell" : "Rear as replacement", ...extra } }, id); return id; };
    const k0 = calf(0, 1, "F"), k1 = calf(1, 4, "M"), k2 = calf(2, 9, "F"); calf(3, 35, "F"); calf(4, 12, "M"); calf(5, 60, "F", { disbud: { date: d(-40), anaesthetic: true, analgesic: true } }); calf(6, 150, "F", { weaned: d(-80) });
    add("calfFeeds", { pen: "1", calfIds: [k0, k2], lPerFeed: 3, feedsPerDay: 2, gPerL: 150, stage: "Milk" });
    add("calfFeeds", { pen: "2", calfIds: [k1], lPerFeed: 3, feedsPerDay: 2, gPerL: 150, stage: "Milk" });
    // milk recording (3 monthly recordings)
    for (const [k, ago] of [[0, 75], [1, 45], [2, 14]]) add("recordings", { date: d(-ago), source: "NMR", cows: herd.filter(([, , c]) => c > ago + 5).map(([no], i) => ({ animalId: ids[no], cowNo: String(no), litres: 22 + ((no * 7 + k) % 18), fat: 4.1, protein: 3.35, scc: no === 214 ? [380, 410, 450][k] : no === 302 ? [220, 260, 240][k] : no === 120 ? [90, 210, 230][k] : 60 + ((no * 13 + k * 17) % 140) })) });
    // treatments and the withhold board
    const prod = { name: "Synulox LC", wdMilkHours: 84, wdMeatDays: 7 };
    const treat = (no, quarters, hoursAgo, okInH, extra = {}) => { const lastDoseAt = M.addHours(now, -hoursAgo); const okFrom = M.addHours(now, okInH); const date = lastDoseAt.slice(0, 10), time = lastDoseAt.slice(11, 16);
      const medId = add("medicines", { date, time, animalIds: [ids[no]], reason: "Mastitis", quarters, severity: "Mild (milk only)", productName: extra.product || prod.name, batch: "L2291", doses: 3, intervalH: 12, givenBy: "Seán McKee", marks: ["Red leg band"], wdMilkHours: 84, wdMeatDays: 7, milkOkFrom: okFrom, lastDoseAt, meatOkFrom: addDays(date, 7) });
      const wId = add("milkWithhold", { animalId: ids[no], medId, date, time, quarters, productName: extra.product || prod.name, wdMilkHours: 84, lastDoseAt, okFrom, marks: extra.marks || ["Red leg band"], byName: "Seán McKee" });
      add("mastitis", { animalId: ids[no], date, time, quarters, grade: "Mild (milk only)", medId, withholdId: wId, productName: extra.product || prod.name, okFrom, caseNo: extra.caseNo || 1, recurrence: !!extra.recurrence, failure: !!extra.failure, treated: true }); };
    treat(214, ["RF"], 20, 64, { caseNo: 2, recurrence: true, failure: true });
    treat(302, ["LH"], 70, 14);
    treat(140, ["LF", "RF", "LH", "RH"], 30, 40, { product: "Cobactan DC", marks: ["Spray"] });
    treat(110, ["RH"], 100, -3); // withdrawal over: waiting for release
    add("mastitis", { animalId: ids[214], date: d(-60), quarters: ["LH"], grade: "Moderate (udder)", productName: "Ubrolexin", caseNo: 1, treated: true });
    add("mastitis", { animalId: ids[120], date: d(-120), quarters: ["LF"], grade: "Mild (milk only)", productName: "Synulox LC", caseNo: 1, treated: true });
    add("medicines", { date: d(-30), animalIds: [ids[104], ids[105]], reason: "Lame", productName: "Metacam 20", batch: "M4410", doses: 1, wdMilkHours: 0, wdMeatDays: 15, givenBy: "Tom Riddell" });
    // handover
    add("handover", { text: "214 treated RF last night, marked with red leg band. 3 to fetch from the back field.", by: null, byName: "Seán McKee", at: `${T}T05:40`, auto: false, replies: [] });
    // tank log: last 13 days am + pm, one missing, one high with the action noted
    for (let i = 13; i >= 1; i--) for (const part of ["am", "pm"]) { if (i === 6 && part === "pm") continue;
      add("tankLog", { date: d(-i), milking: part, time: part === "am" ? "07:45" : "18:10", tempC: i === 4 && part === "am" ? 9.2 : 3.4 + ((i * 3 + (part === "am" ? 1 : 2)) % 6) / 10, collected: part === "am", receiptTemp: part === "am" ? 3.8 : null, litres: part === "am" ? 3300 + i * 17 : null, action: i === 4 && part === "am" ? "Compressor tripped — reset, temp 3.9 °C by 09:30" : "", byName: "Seán McKee" }); }
    // milk quality: monthly results for 6 months
    for (let k = 0; k < 6; k++) add("milkQuality", { date: d(-15 - k * 30), tbc: [14, 18, 11, 25, 16, 13][k], scc: [186, 205, 172, 160, 190, 178][k], fat: 4.12, protein: 3.38, lactose: 4.6, inhibitory: k === 4 ? "fail" : "pass", action: k === 4 ? "Withheld 3 cows, vet informed" : "", vetInformed: k === 4 ? "Yes" : "" });
    // money (owner): price profile, milk statements, feed deliveries
    add("finance", { kind: "prices", category: "Milk price profile", date: d(-90), note: "Milk price profile (not a money entry)", profile: { basePpl: 38.5, baseFat: 4.0, baseProtein: 3.3, fatPer01: 0.25, proteinPer01: 0.45, sccBands: [{ over: 250, ppl: -0.5 }], tbcBands: [{ over: 50, ppl: -0.5 }], deductPpl: 0.6 } }, "dairy-price-profile");
    for (let k = 1; k <= 4; k++) { const dt = new Date(T + "T12:00:00Z"); dt.setUTCMonth(dt.getUTCMonth() - k); const month = dt.toISOString().slice(0, 7); const litres = 98000 + k * 1500;
      add("finance", { kind: "revenue", category: "Milk", amount: Math.round(litres * (0.392 - k * 0.002)), date: `${month}-28`.replace(/-(29|30|31)$/, "-28"), note: `Milk statement ${month}`, cheque: { month, litres, cows: 39, fat: 4.15, protein: 3.4, scc: 190, tbc: 15, basePpl: 38.5, processor: "Dale Farm", adjustments: [{ label: "Constituents", amount: 520 }], deductions: [{ label: "Deductions", amount: 590 }] } });
      add("finance", { kind: "expense", category: "Feed", amount: 7800 + k * 120, date: `${month}-12`, note: "18% dairy nut", product: "18% dairy nut", kg: 24000, supplier: "Thompsons", batch: `T-${4400 + k}`, sampleKept: k > 1 }); }
    // scores, foot trims, machine, training, TB, vet ops, fresh checks
    add("scoreSessions", { date: d(-70), method: "mobility", scorer: "Tom Riddell", scores: herd.slice(0, 30).map(([no], i) => ({ animalId: ids[no], cowNo: String(no), score: i % 9 === 0 ? 2 : i % 4 === 0 ? 1 : 0 })) });
    add("scoreSessions", { date: d(-30), method: "mobility", scorer: "Tom Riddell", scores: herd.slice(0, 32).map(([no], i) => ({ animalId: ids[no], cowNo: String(no), score: i % 11 === 0 ? 2 : i === 5 ? 3 : i % 3 === 0 ? 1 : 0 })) });
    add("scoreSessions", { date: d(-150), method: "bcs", scorer: "Tom Riddell", scores: herd.slice(0, 30).map(([no], i) => ({ animalId: ids[no], cowNo: String(no), score: [2.5, 3, 3, 3.5, 2.75][i % 5] })) });
    add("footTrims", { animalId: ids[106], date: d(-28), foot: "LH", lesion: "Sole ulcer", treatment: "Trimmed, block", block: true, trimmer: "Hoofcare NI" });
    add("footTrims", { animalId: ids[104], date: d(-28), foot: "RH", lesion: "Digital dermatitis", treatment: "Spray", block: false, trimmer: "Hoofcare NI" });
    add("parlourService", { date: d(-340), type: "ISO 6690 static test", technician: "Milkline Services", faults: "Pulsator 4 slow", rectified: "Replaced same day" });
    add("parlourService", { date: d(-200), type: "Liner change", technician: "Tom Riddell" });
    add("parlourService", { date: d(-150), type: "Service", technician: "Milkline Services" });
    add("training", { name: "Seán McKee", date: d(-400), training: "Induction", provider: "Tom Riddell" });
    add("training", { name: "Seán McKee", date: d(-300), training: "Medicines course", provider: "CAFRE" });
    add("tbTests", { date: d(-340), type: "Herd test", count: 52, result: "Clear", vet: "John Kerr MRCVS" });
    add("freshChecks", { animalId: ids[123], date: d(-1), temp: "38.6", appetite: "Good", cleansing: "Yes", ketones: "Negative", events: [] });
    add("movements", { direction: "off", animalIds: [], date: d(-50), place: "Dungannon Mart", reason: "Sold" });
    // the farm's medicine store (shared farm space): milk withdrawal in hours
    const space = session.farms().find((f) => f.farmId === L.farmId)?.space;
    if (space) {
      R.addRecord(space.id, "medProducts", { name: "Synulox LC", wdMilkHours: 84, wdMeatDays: 7, batch: "L2291", expiry: d(600), unit: "tube", intramammary: true });
      R.addRecord(space.id, "medProducts", { name: "Orbeseal", wdMilkHours: 0, wdMeatDays: 0, batch: "OB221", expiry: d(500), unit: "tube", intramammary: true, dryCow: true });
      R.addRecord(space.id, "medProducts", { name: "Cefaguard DC", wdMilkHours: 96, wdMeatDays: 2, afterCalvingHours: 96, batch: "CG10", expiry: d(400), unit: "tube", intramammary: true, dryCow: true });
      R.addRecord(space.id, "medProducts", { name: "Metacam 20", wdMilkHours: 120, wdMeatDays: 15, batch: "M4410", expiry: d(300), unit: "ml" });
      R.addRecord(space.id, "medProducts", { name: "Bultavo 3", wdMilkHours: 0, wdMeatDays: 0, batch: "BT3-01", expiry: d(200), unit: "ml", vaccine: true });
    }
    await new Promise((r) => setTimeout(r, 300));
    return lid;
  });
}
