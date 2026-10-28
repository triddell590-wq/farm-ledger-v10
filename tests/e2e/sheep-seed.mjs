// A realistic Sheep ledger for e2e tests and screenshots (NI lowland flock, ~240 ewes), written
// through the app's own services on the in-memory backend. Rams went in 17 days ago, so the home
// is on day 18 of tupping whatever day the tests run; last year's crop fills the funnel.
export async function seedSheep(page) {
  return page.evaluate(async () => {
    const R = await import("./js/services/records.js");
    const { store } = await import("./js/core/store.js");
    const { addDays, todayStr } = await import("./js/core/dates.js");
    const { session } = window.__fl;
    await session.load(true);
    const L = session.ledgers.find((l) => l.type === "sheep"); const lid = L.id; const T = todayStr(); const d = (n) => addDays(T, n);
    const RI = d(-17); const P = addDays(RI, -365); const pd = (n) => addDays(P, n); // last cycle's rams-in
    const add = (coll, data, id) => R.addRecord(lid, coll, data, id); const id = () => store.newId();
    R.setMeta(lid, "keeper", { name: "Tom Riddell", address: "Gulladuff, Magherafelt, Co. Londonderry", flockNo: "654321" });
    R.setMeta(lid, "settings", { flockNo: "654321", ramsIn: RI.slice(5), inventoryDeadline: "", mealPrice: 350, targetEwes: 240 });
    const m = { mule: id(), tex: id(), el: id(), rams: id(), lambs: id(), tx: id() };
    const mob = (k, name, cls, extra, n, at = pd(-30)) => { add("mobs", { name, class: cls, species: "sheep", active: true, ...extra }, m[k]); add("events", { kind: "countCheck", mobId: m[k], date: at, counts: { count: n }, reason: "start" }); };
    mob("mule", "Mule ewes 2022", "ewes", { breed: "Mule", birthYears: [2022], fieldName: "Far Hill" }, 120);
    mob("tex", "Texel × ewes", "ewes", { breed: "Texel ×", fieldName: "Long field" }, 96);
    mob("el", "Ewe lambs 2026", "eweLambs", { breed: "Mule", birthYears: [2026], fieldName: "Low field" }, 0);
    mob("rams", "Rams", "rams", { breed: "Texel" }, 6);
    mob("lambs", "Lambs 2026", "lambs", { birthYears: [2026], fieldName: "Bottom field" }, 0);
    // last year: rams in, scanning, lambing, tagging, weaning, sales
    add("events", { kind: "ramsIn", mobIds: [m.mule, m.tex], mobId: m.rams, date: P });
    add("events", { kind: "scan", mobId: m.mule, date: pd(90), counts: { empty: 4, single: 22, twin: 84, triplet: 9 } });
    add("events", { kind: "scan", mobId: m.tex, date: pd(90), counts: { empty: 5, single: 30, twin: 57, triplet: 4 } });
    for (let i = 0; i < 200; i++) { const lambs = i % 23 === 0 ? [{ alive: true, sex: "M" }, { alive: true, sex: "F" }, { alive: true, sex: "F" }] : i % 10 === 0 ? [{ alive: true, sex: "F" }] : i % 9 === 0 ? [{ alive: true, sex: "M" }, { alive: false, sex: "F", deathCause: "Stillborn" }] : [{ alive: true, sex: "M" }, { alive: true, sex: "F" }];
      add("lambings", { mobId: i % 2 ? m.mule : m.tex, mobName: i % 2 ? "Mule ewes 2022" : "Texel × ewes", raddle: ["Yellow", "Yellow", "Red", "Blue"][i % 4], datetime: `${pd(143 + (i % 30))}T0${i % 9}:15:00.000Z`, lambs, help: i % 5 ? "none" : "assisted", penOut: `${pd(146 + (i % 30))}T09:00:00.000Z` }); }
    add("deaths", { date: pd(150), lamb: true, ageBand: "<48h", number: 3, cause: "Watery mouth", mobName: "Lambs" });
    add("lambCrops", { year: +pd(143).slice(0, 4), taggings: [{ date: pd(170), mobId: m.lambs, count: 324, tagFrom: "XI 0654321 00101", tagTo: "XI 0654321 00424", tagType: "EID set", enteredOn: pd(172) }, { date: pd(171), mobId: m.el, count: 30, tagFrom: "XI 0654321 00425", tagTo: "XI 0654321 00454", tagType: "EID set", enteredOn: pd(171) }], taggedCount: 354 }, `crop-${pd(143).slice(0, 4)}`);
    add("events", { kind: "wean", mobId: m.lambs, date: pd(250), counts: { weaned: 348 } });
    // the lambs sold this autumn (one move not yet notified), the ewe lambs kept
    add("movements", { kind: "off", date: d(-40), mobId: m.lambs, mobName: "Lambs 2026", count: 30, lambs: true, crop: +pd(143).slice(0, 4), dest: "abattoir", otherName: "Linden Foods", otherFlock: "CPR 9001", docSerial: `FL-654321-${d(-40).slice(0, 4)}-0001`, cprList: true, cprListFiledOn: d(-39), notifiedOn: d(-38) });
    add("movements", { kind: "off", date: d(-3), mobId: m.lambs, mobName: "Lambs 2026", count: 32, lambs: true, crop: +pd(143).slice(0, 4), dest: "abattoir", otherName: "Linden Foods", otherFlock: "CPR 9001", docSerial: `FL-654321-${d(-3).slice(0, 4)}-0002`, cprList: true });
    add("sales", { date: d(-40), outlet: "Linden Foods", outletType: "abattoir", count: 30, lambs: true, deadKg: 594, lines: [{ deadKg: 594, grade: "R3L" }], description: "30 lambs · 594 kg dead" });
    add("finance", { kind: "revenue", category: "Livestock Sales", amount: 4120, gross: 4200, deductions: { levy: 30, haulage: 50, commission: 0 }, date: d(-40), note: "30 lambs · 594 kg dead · Linden Foods", source: "sheep-sale", lambs: true, count: 30, deadKg: 594, outletType: "abattoir", lines: [{ deadKg: 594, grade: "R3L", price: 4200 }] });
    add("finance", { kind: "revenue", category: "Livestock Sales", amount: 4512, gross: 4600, deductions: { levy: 32, haulage: 56, commission: 0 }, date: d(-3), note: "32 lambs · 640 kg dead · Linden Foods", source: "sheep-sale", lambs: true, count: 32, deadKg: 640, outletType: "abattoir", lines: [{ deadKg: 640, grade: "U3L", price: 4600 }] });
    add("finance", { kind: "expense", category: "Feed", amount: 2950, date: d(-200), note: "Ewe nuts 8.5 t" });
    add("finance", { kind: "expense", category: "Vet & medicine", amount: 640, date: d(-90), note: "Wormers and vaccines" });
    add("finance", { kind: "revenue", category: "Other Income", amount: 410, date: d(-120), note: "Wool cheque" });
    // this year: rams in 17 days ago, first raddle check, a Texel shearling group bought at a mart
    add("events", { kind: "ramsIn", mobIds: [m.mule, m.tex], mobId: m.rams, date: RI });
    add("events", { kind: "raddle", mobId: m.mule, date: d(-7), counts: { colour: "Yellow", newlyMarked: 61 } });
    add("events", { kind: "raddle", mobId: m.tex, date: d(-7), counts: { colour: "Yellow", newlyMarked: 66 } });
    add("events", { kind: "fieldMove", mobId: m.mule, toField: "Far Hill", fromField: "Long field", date: RI });
    add("events", { kind: "lame", mobId: m.mule, date: d(-5), counts: { lame: 2, outOf: 120, individuals: [] } });
    add("events", { kind: "fec", mobId: m.el, date: d(-30), lab: "AFBI", counts: { strongyle: 750, nematodirus: 50 } });
    add("medicines", { kind: "use", date: d(-28), mobId: m.el, mobName: "Ewe lambs 2026", reason: "Worms", productName: "Cydectin 0.1% oral", wormerGroup: "3-ML", wormerColour: "clear", numberTreated: 30, heaviest: 42, doseMethod: "heaviest", doseEach: 8.4, totalDose: 252, unit: "ml", wdMeatDays: 14, withdrawalUntil: d(-14), givenBy: "Seán McKee" });
    add("medicines", { kind: "use", date: d(-4), mobId: m.mule, mobName: "Mule ewes 2022", reason: "Fluke", productName: "Fasinex 240", numberTreated: 120, heaviest: 85, doseMethod: "heaviest", doseEach: 10, totalDose: 1200, unit: "ml", wdMeatDays: 56, withdrawalUntil: d(52), givenBy: "Tom Riddell" });
    add("medicines", { kind: "use", date: pd(30), mobId: m.mule, mobName: "Mule ewes 2022", reason: "Worms", productName: "Levacide", wormerGroup: "2-LV", numberTreated: 118, wdMeatDays: 28, givenBy: "Tom Riddell" });
    add("movements", { kind: "on", date: d(-5), mobId: m.tx, mobName: "Texel shearlings", count: 8, otherName: "Ballymena Mart", otherFlock: "712345", fromMarket: true, quarantine: true, quarantineDays: 28, description: "8 Texel shearlings from Ballymena Mart" });
    add("mobs", { name: "Texel shearlings", class: "hoggets", species: "sheep", breed: "Texel", active: true, fieldName: "Paddock" }, m.tx);
    // individuals: a few EID ewes and the rams with their MOT
    const ewe = id(); add("sheep", { tag: "UK 0654321 01234", eid: "826000654321234", species: "sheep", breed: "Mule", birthYear: 2022, sex: "F", status: "on", mobId: m.mule, class: "ewe", cullFlags: [{ reason: "Mastitis", date: d(-2), by: "Tom Riddell" }], replacementTags: [] }, ewe);
    add("sheep", { tag: "UK 0654321 01240", eid: "826000654321240", species: "sheep", breed: "Mule", birthYear: 2022, sex: "F", status: "on", mobId: m.mule, class: "ewe", cullFlags: [], replacementTags: [] });
    ["Ruler", "Duke", "Major", "Bertie", "Ted", "Rocky"].forEach((n, i) => add("sheep", { tag: `UK 0712345 0${300 + i}`, species: "sheep", breed: "Texel", sex: "M", status: "on", mobId: m.rams, class: "ram", name: n, resting: false, ramLamb: i === 4, mot: [{ date: d(-35), teeth: true, toes: true, testicles: true, tone: true, bcs: 3.5, ok: true }] }));
    add("deaths", { date: d(-60), mobId: m.tex, mobName: "Texel × ewes", number: 1, cause: "Pneumonia", over18m: true, tseDone: d(-60), disposal: "Knackery", docket: "K-2231" });
    add("vetOps", { date: pd(150), mobName: "Lambs 2026", operation: "Castration", method: "Rubber ring", number: 48, ageDays: 3, by: "Tom Riddell" });
    add("vetOps", { date: pd(150), mobName: "Lambs 2026", operation: "Tail docking", method: "Rubber ring", number: 96, ageDays: 3, by: "Tom Riddell" });
    add("feedRecords", { date: d(-200), feed: "Ewe nuts 18%", supplier: "Thompsons", batch: "D-44120", tonnes: 8.5 });
    add("inventories", { year: +P.slice(0, 4) - (P.slice(5, 7) < "06" ? 1 : 0), countDate: `${P.slice(0, 4)}-12-02`, counts: { ewes: 214, rams: 6, otherAdults: 0, lambs: 0, goats: 0 }, total: 220, registerTotal: 220, submittedOn: `${P.slice(0, 4)}-12-10`, ref: "INV-88213" }, `inv-${P.slice(0, 4)}`);
    // the farm's medicine store (shared farm space)
    const space = session.farms().find((f) => f.farmId === L.farmId)?.space;
    if (space) {
      R.addRecord(space.id, "medProducts", { name: "Cydectin 0.1% oral", wdMeat: 14, batch: "C7731", expiry: d(400), unit: "ml", rateAmount: 1, rateKg: 5 });
      R.addRecord(space.id, "medProducts", { name: "Zolvix", wdMeat: 7, batch: "Z101", expiry: d(300), unit: "ml", rateAmount: 1, rateKg: 10 });
      R.addRecord(space.id, "medProducts", { name: "Footvax", wdMeat: 0, batch: "F55", expiry: d(20), unit: "ml" });
    }
    await new Promise((r) => setTimeout(r, 200));
    return lid;
  });
}
