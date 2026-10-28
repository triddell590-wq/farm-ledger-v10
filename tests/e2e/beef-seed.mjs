// A realistic Beef ledger for e2e tests and screenshots (Tom-like: pedigree Charolais sucklers
// plus finishers), written through the app's own services on the in-memory backend. Every date
// is relative to the day the test runs, so the season mode and deadlines stay meaningful.
export async function seedBeef(page, { pedigree = true } = {}) {
  return page.evaluate(async ({ pedigree }) => {
    const R = await import("./js/services/records.js");
    const { store } = await import("./js/core/store.js");
    const { tagCheckDigit } = await import("./js/sectors/beef/model/tags.js");
    const { addDays, todayStr } = await import("./js/core/dates.js");
    const { session } = window.__fl;
    await session.load(true);
    const L = session.ledgers.find((l) => l.type === "beef"); const lid = L.id; const T = todayStr(); const d = (n) => addDays(T, n);
    const tag = (herd, n, cc = "UK", lead = "9") => { const a = String(n).padStart(4, "0"); return `${cc} ${lead} ${herd} ${a} ${tagCheckDigit(herd, a)}`; };
    const H = "012345"; let seq = 100;
    const add = (coll, data, id) => R.addRecord(lid, coll, data, id);
    const id = () => store.newId();
    R.setMeta(lid, "keeper", { name: "Tom Riddell", address: "Gulladuff, Magherafelt, Co. Londonderry", herdNo: "123456" });
    add("finance", { kind: "prices", source: "beef", perKgDead: 6.2, enteredOn: d(-6), pricePerTonne: 300 }, "beef-prices");
    R.setMeta(lid, "settings", { calvingSeason: "Spring", housingDate: d(13), shedSpaces: 96, healthPlanSigned: d(-320), hparDate: d(-340), pedigree, society: "Charolais Cattle Society", nextTag: tag(H, 240, "XI") });
    const g = { fin: id(), cows: id(), calves: id(), stores: id() };
    add("groups", { name: "Shed 2 finishers", class: "finisher", shed: "Shed 2", spaces: 30 }, g.fin);
    add("groups", { name: "Far Hill cows", class: null, shed: "Far Hill" }, g.cows);
    add("groups", { name: "Calf shed", class: null, shed: "Calf shed" }, g.calves);
    add("groups", { name: "Stores", class: "store", shed: "Shed 1" }, g.stores);
    const bull = id(); add("animals", { tag: tag(H, 11), mgmtNo: "B1", name: "Gulladuff Ruler", sex: "Bull", breed: "CH", colour: "W", dob: "2021-04-10", bornInHerd: true, stockBull: true, status: "onFarm", groupId: g.cows, pedigree: { herdBookNo: "CH 2101", regName: "Gulladuff Ruler", society: "Charolais", fertilityTest: { date: d(-190), result: "Passed", vet: "Jane Vet MRCVS" } } }, bull);
    const cows = [["0412", "Daisy", "2018-03-02"], ["0388", "Bluebell", "2017-02-11"], ["0291", "Rosie", "2016-04-20"], ["0105", "Peggy", "2015-03-05"], ["0420", "Molly", "2019-02-14"], ["0433", "Nancy", "2019-03-01"], ["0450", "Primrose", "2020-02-20"], ["0461", "Bella", "2021-02-02"]];
    const cowIds = [];
    cows.forEach(([no, name, dob], i) => {
      const cid = id(); cowIds.push(cid);
      add("animals", { tag: tag(H, 400 + i), mgmtNo: no, name, sex: "Cow", breed: "CH", colour: "W", dob, bornInHerd: true, status: "onFarm", groupId: g.cows, temperament: name === "Peggy", bvd: { status: "BVDN" } }, cid);
      // last spring's calf and this spring's calf (born in the herd: calvings derive from them)
      const prev = d(-590 + i * 6), cur = d(-225 + i * 5 + (name === "Rosie" ? 75 : 0));
      add("calvings", { damId: cid, date: prev, ease: name === "Rosie" ? 3 : 1, calves: [] });
      const calf = id(); add("animals", { tag: tag(H, seq++), sex: i % 2 ? "Heifer" : "Bull", breed: "CH", colour: "W", dob: cur, damId: cid, damTag: tag(H, 400 + i), sireText: "Gulladuff Ruler", sireId: bull, bornInHerd: true, bornInNI: true, status: "onFarm", groupId: g.calves, birthKg: 44 + i, calvingEase: name === "Rosie" ? 3 : 1, reg: { tagged: cur, bvdSample: cur, nifais: addDays(cur, 5), society: addDays(cur, 20), dna: addDays(cur, 40) }, bvd: { status: "BVDN", resultDate: addDays(cur, 10) } }, calf);
      add("calvings", { damId: cid, date: cur, ease: name === "Rosie" ? 3 : 1, sireText: "Gulladuff Ruler", calves: [{ animalId: calf, alive: true, sex: i % 2 ? "Heifer" : "Bull", birthKg: 44 + i }] });
      add("weighings", { animalId: calf, date: d(-20), kg: 260 + i * 9, method: "scale" });
    });
    // breeding: bull in with 7 cows in June, out in August, scanned in September
    add("services", { kind: "natural", bullIn: d(-140), bullOut: d(-77), femaleIds: cowIds.slice(0, 7), sireText: "Gulladuff Ruler", sireBreed: "CH", sireId: bull });
    cowIds.slice(0, 5).forEach((c, i) => add("scans", { femaleId: c, date: d(-40), result: "inCalf", foetalAgeDays: 90 - i * 6 }));
    add("scans", { femaleId: cowIds[3], date: d(-39), result: "empty" });
    // an autumn-calving cow due in 5 days (AI) and two recent calves still to register
    const autumn = id(); add("animals", { tag: tag(H, 470), mgmtNo: "0470", name: "Clover", sex: "Cow", breed: "LIM", colour: "R", dob: "2020-05-01", bornInHerd: true, status: "onFarm", groupId: g.cows }, autumn);
    add("calvings", { damId: autumn, date: d(-370), ease: 1, calves: [] });
    add("services", { kind: "AI", date: d(-280), femaleIds: [autumn], sireText: "CH Elite (AI)", sireBreed: "CH" });
    const autumn2 = id(); add("animals", { tag: tag(H, 471), mgmtNo: "0471", name: "Holly", sex: "Cow", breed: "SIM", colour: "R", dob: "2019-04-01", bornInHerd: true, status: "onFarm", groupId: g.cows }, autumn2);
    add("calvings", { damId: autumn2, date: d(-390), ease: 2, calves: [] });
    const k1 = id(); add("animals", { tag: tag(H, 231, "XI"), sex: "Bull", breed: "CH", colour: "W", dob: d(-24), damId: autumn2, damTag: tag(H, 471), sireText: "Gulladuff Ruler", bornInHerd: true, bornInNI: true, status: "onFarm", groupId: g.calves, reg: { tagged: d(-23), bvdSample: d(-23), nifais: null, society: null, dna: null }, bvd: { status: "" } }, k1);
    add("calvings", { damId: autumn2, date: d(-24), ease: 2, sireText: "Gulladuff Ruler", calves: [{ animalId: k1, alive: true, sex: "Bull", birthKg: 47 }] });
    // finishers (NI-born and one bought from GB), stores, replacement heifers
    const fin = [];
    for (let i = 0; i < 6; i++) {
      const fid = id(); fin.push(fid); const gb = i === 5;
      add("animals", { tag: gb ? tag("312345", 600 + i, "UK", "3") : tag(H, 108 + i), sex: i === 4 ? "Heifer" : "Steer", breed: i % 2 ? "LIM" : "CH", colour: i % 2 ? "R" : "W", dob: d(-790 + i * 12), bornInHerd: !gb, onDate: gb ? d(-300) : null, fromText: gb ? "Ballymena Mart" : "", lot: gb ? "214" : "", prevMoves: gb ? 2 : 0, status: "onFarm", groupId: g.fin }, fid);
      add("weighings", { animalId: fid, date: d(-52), kg: 560 + i * 12, method: "scale" });
      add("weighings", { animalId: fid, date: d(-9), kg: 610 + i * 12 + (i === 3 ? -40 : 0), method: "scale" });
    }
    for (let i = 0; i < 4; i++) { const s = id(); add("animals", { tag: tag(H, 180 + i), sex: "Steer", breed: "CH", colour: "W", dob: d(-520 + i * 9), bornInHerd: true, status: "onFarm", groupId: g.stores }, s); add("weighings", { animalId: s, date: d(-60), kg: 410 + i * 8, method: "scale" }); }
    for (let i = 0; i < 2; i++) add("animals", { tag: tag(H, 190 + i), sex: "Heifer", breed: "CH", colour: "W", dob: d(-470 - i * 30), bornInHerd: true, status: "onFarm", replacement: true });
    // medicines: Draxxin for pneumonia in Shed 2 (outbreak + withdrawal), a wormer, product store
    add("medProducts", { name: "Draxxin 100 mg/ml", wdMeat: 49, batch: "B23418", expiry: d(500), source: "Bannside Vets", unit: "ml", rateAmount: 2.5, rateKg: 100 });
    add("medProducts", { name: "Ivomec Super", wdMeat: 66, batch: "B1192", expiry: d(25), source: "Bannside Vets", unit: "ml", rateAmount: 1, rateKg: 50 });
    const finTags = fin.map((x, i) => (i === 5 ? null : tag(H, 108 + i))).filter(Boolean);
    finTags.slice(0, 3).forEach((t, i) => add("medicines", { date: d(-8 + i), lastDate: d(-8 + i), productName: "Draxxin 100 mg/ml", batchNumber: "B23418", source: "Bannside Vets", quantity: "15", quantityUnit: "ml", administeredBy: "Tom Riddell", animalTags: [t], animalIds: [fin[i]], reason: "Pneumonia", route: "Injection (SC)", courseDays: 1, withdrawalMeatDays: 49, withdrawalEndDateMeat: addDays(d(-8 + i), 49), notUsed: false }));
    add("purchases", { kind: "medicine", date: d(-60), productName: "Draxxin 100 mg/ml", quantity: "250 ml", batchNumber: "B23418", expiryDate: d(500), supplier: "Bannside Vets", supplierAddress: "Main St, Magherafelt" });
    add("purchases", { kind: "medicine", date: d(-200), productName: "Ivomec Super", quantity: "500 ml", batchNumber: "B1192", expiryDate: d(25), supplier: "Bannside Vets" });
    // sold two stores at the mart 3 days ago (not yet notified), one calf died in spring
    const sold = [id(), id()];
    sold.forEach((s, i) => add("animals", { tag: tag(H, 170 + i), sex: "Steer", breed: "CH", colour: "W", dob: d(-560), bornInHerd: true, status: "gone", offDate: d(-3), offTo: "Dungannon Mart", offReason: "sold" }, s));
    add("movements", { kind: "off", date: d(-3), animalIds: sold, to: "Dungannon Mart", nifaisNotified: null });
    const saleId = id(), saleFin = id();
    add("sales", { kind: "mart", date: d(-3), buyer: "Dungannon Mart", lines: sold.map((s, i) => ({ animalId: s, tag: tag(H, 170 + i), liveKg: 520 })), financeId: saleFin }, saleId);
    add("finance", { kind: "revenue", category: "Livestock Sales", amount: 3000, date: d(-3), note: "2 cattle · Dungannon Mart", source: "sale", saleId, lines: sold.map((s, i) => ({ animalId: s, tag: tag(H, 170 + i), liveKg: 520, price: 1480 + i * 40 })) }, saleFin);
    add("finance", { kind: "expense", category: "Feed", amount: 1860, date: d(-30), note: "Beef nuts 6 t", supplier: "Thompsons" });
    add("finance", { kind: "expense", category: "Vet & medicine", amount: 420, date: d(-60), note: "Draxxin" });
    add("vetOps", { date: d(-200), animalIds: [], animalTags: [tag(H, 100)], operation: "Disbudding", ageDays: 14, operator: "Tom Riddell", anaesthetic: true, analgesic: true });
    add("tbTests", { date: d(-340), readingDate: d(-337), stage: "read", herdStatus: "OTF", testType: "Herd test", vet: "Jane Vet MRCVS", nextDue: d(25), results: {} });
    // silage pit (v9 shape) and feed groups (v9 rations)
    R.setMeta(lid, "silage", { pits: [{ name: "Main pit", lenFt: 60, widFt: 24, htFt: 9, grabFt: 4, biteFt: 2.5, blockHtFt: 2.5, density: 700, openedOn: d(-20), dm: 28, me: 10.8, dValue: 68 }], turnout: d(170) });
    add("feedGroups", { name: "Shed 2 finishers", animalIds: fin, rations: [{ from: d(-40), meal: 5, silage: 22, blocks: 0, every: 1 }] });
    add("feedGroups", { name: "Cows", animalIds: cowIds, rations: [{ from: d(-20), meal: 0, silage: 0, blocks: 1, every: 1 }] });
    await new Promise((r) => setTimeout(r, 150));
    return lid;
  }, { pedigree });
}
