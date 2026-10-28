// A realistic Pigs ledger for e2e tests and screenshots: a Co. Londonderry farrow-to-finish
// unit on 3-week batches of 12 (12 crates per farrowing room), written through the app's own
// services on the in-memory backend. Everything is relative to today's production week, which is
// a farrowing week: B39 due in Farrowing 3, B38 suckling in Farrowing 1, B43 due its scan, B44
// served last week; B36/B37 in the weaner rooms, B35 in Finisher 2 (water drop, Finishing house
// alarm overdue), B34 near shipping with a load planned; B29–B33 closed.
export async function seedPigs(page, { small = false } = {}) {
  return page.evaluate(async (small) => {
    const R = await import("./js/services/records.js");
    const { store } = await import("./js/core/store.js");
    const { addDays, todayStr } = await import("./js/core/dates.js");
    const { session } = window.__fl;
    await session.load(true);
    const L = session.ledgers.find((l) => l.type === "pigs"); const lid = L.id; const T = todayStr(); const d = (n) => addDays(T, n);
    const add = (coll, data, id) => R.addRecord(lid, coll, data, id); const nid = () => store.newId();
    const dow = (new Date(T + "T12:00Z").getUTCDay() + 6) % 7; const mon = d(-dow);
    R.setMeta(lid, "keeper", { name: "Tom Riddell", address: "Gulladuff, Magherafelt, Co. Londonderry" });
    if (small) {
      R.setMeta(lid, "settings", { system: "ftf", smallHerd: true, herdMark: "NI 7788", lactation: 35 });
      const daisy = nid(), rosie = nid(), meg = nid(), boar = nid();
      add("sows", { sowNo: "1", name: "Daisy", type: "sow", entered: d(-700) }, daisy);
      add("sows", { sowNo: "2", name: "Rosie", type: "sow", entered: d(-700) }, rosie);
      add("sows", { sowNo: "3", name: "Meg", type: "gilt", entered: d(-200) }, meg);
      add("sows", { sowNo: "4", name: "Hector", type: "boar", entered: d(-500) }, boar);
      const b1 = nid(); add("batches", { no: 1, serveDate: d(-110), stage: "service", source: "born on farm" }, b1);
      add("services", { sowId: daisy, date: d(-110), kind: "Natural", boar: "Hector", serviceNo: 1, batchId: b1 });
      add("scans", { sowId: daisy, date: d(-80), result: "+" });
      const b2 = nid(); add("batches", { no: 2, serveDate: d(-126), stage: "service", source: "born on farm" }, b2);
      add("services", { sowId: rosie, date: d(-126), kind: "Natural", boar: "Hector", serviceNo: 1, batchId: b2 });
      add("litters", { sowId: rosie, roomId: null, crate: null, farrowedAt: `${d(-12)}T05:40`, bornAlive: 11, stillborn: 1, mummified: 0, fosterOn: [], fosterOff: [], deaths: [{ date: d(-11), n: 1, cause: "Overlaid" }], tasks: { iron: d(-10) }, nesting: true, batchId: b2 });
      const g = nid(); add("batches", { no: 3, numberIn: 23, avgKgIn: 9, inDate: d(-60), stage: "grower", source: "born on farm", sampleWeighs: [{ date: d(-6), n: 6, avgKg: 62 }] }, g);
      add("tasks", { title: "Ship 6 from the grower pen Tue — withdraw feed from 22:00 Mon", due: d(15), note: "", money: false, done: false, pig: { kind: "ship", batchId: g, n: 6 } });
      const fd = nid(); add("feedDeliveries", { date: d(-20), supplier: "Thompsons", ration: "Grower nuts", kg: 1000, bags: 40 }, fd);
      add("finance", { kind: "expense", category: "Feed", amount: 420, date: d(-20), note: "40 bags grower nuts", feedDeliveryId: fd, source: "feedDelivery" });
      const mv = nid(); add("moves", { direction: "off", date: d(-40), n: 6, category: "finishers", toSlaughter: true, toName: "Lough Neagh Meats", fci: { withdrawals: true }, notified: d(-39) }, mv);
      add("finance", { kind: "revenue", category: "Livestock Sales", amount: 1140, date: d(-40), note: "6 porkers · Lough Neagh Meats", source: "pigSale", pigs: 6, moveId: mv });
      return lid;
    }
    R.setMeta(lid, "settings", { system: "ftf", interval: 3, herdMark: "NI 1234", farrowingPlaces: 12, finisherPlaces: 1600, smallHerd: false, spp: 182.5, contract: { on: false } });
    // rooms (in the order the pigs flow) and bins
    const room = (name, house, kind, extra = {}) => { const id = nid(); add("rooms", { name, house, kind, mechVent: true, wash: { stage: "ready", at: {} }, ...extra }, id); return id; };
    const pens = (n, a) => Array.from({ length: n }, (_, i) => ({ no: i + 1, areaM2: a }));
    const r = {
      serv: room("Service 1", "Service house", "service", { places: 60, pens: pens(4, 30) }),
      dry: room("Dry sows", "Service house", "dry", { places: 120, pens: pens(6, 40) }),
      f1: room("Farrowing 1", "Farrowing house", "farrowing", { crates: 12, pens: [] }),
      f3: room("Farrowing 3", "Farrowing house", "farrowing", { crates: 12, pens: [] }),
      w1: room("Weaner 1", "Weaner house", "weaner", { places: 300, pens: pens(6, 15) }),
      w2: room("Weaner 2", "Weaner house", "weaner", { places: 300, pens: pens(6, 15) }),
      fin1: room("Finisher 1", "Finishing house", "finisher", { places: 440, pens: pens(8, 36) }),
      fin2: room("Finisher 2", "Finishing house", "finisher", { places: 440, pens: pens(8, 36) }),
      fin4: room("Finisher 4", "Finishing house", "finisher", { places: 440, pens: pens(8, 36), wash: { stage: "washed", at: { emptied: `${d(-3)}T09:00`, soaked: `${d(-2)}T08:00`, washed: `${d(-1)}T10:30` }, by: { emptied: "Seán McKee", soaked: "Seán McKee", washed: "Seán McKee" } } }),
    };
    const bin1 = nid(), bin3 = nid();
    add("bins", { name: "Bin 1", capacityT: 12, ration: "Weaner pellets", roomIds: [r.w1, r.w2], leadDays: 3 }, bin1);
    add("bins", { name: "Bin 3", capacityT: 18, ration: "Finisher pellets", roomIds: [r.fin1, r.fin2], leadDays: 3 }, bin3);
    add("semen", { boar: "77", batch: "JSR-2241", doses: 18, expiry: d(4), supplier: "Deerpark AI", received: d(-2) });
    add("semen", { boar: "81", batch: "JSR-2250", doses: 12, expiry: d(5), supplier: "Deerpark AI", received: d(-2) });
    // The production calendar: 3-week batches of 12, on a grid. This week is a FARROWING week
    // (serve week + 16 ≡ 1 mod 3): B39 is due Wed–Thu in Farrowing 3, B38 is suckling in
    // Farrowing 1 (wean next Monday), B44 was served last week, B43 is due its scan this week.
    const B = {}; const batch = (no, data) => { const id = nid(); B[no] = id; add("batches", { no, source: "born on farm", ...data }, id); return id; };
    const SERVE = { 38: -133, 39: -112, 40: -91, 41: -70, 42: -49, 43: -28, 44: -7 };
    for (const [no, off] of Object.entries(SERVE)) batch(+no, { serveDate: addDays(mon, off), stage: +no <= 39 ? "farrowing" : "service" });
    // growing batches (B37 weaned 11 days before Monday, B36 a month ago)
    batch(37, { numberIn: 128, avgKgIn: 8.1, inDate: addDays(mon, -11), roomId: r.w2, stage: "weaner" });
    batch(36, { numberIn: 270, avgKgIn: 7.6, inDate: addDays(mon, -32), roomId: r.w1, stage: "weaner", sampleWeighs: [{ date: d(-4), n: 20, avgKg: 18.6, by: "Seán McKee" }] });
    batch(35, { numberIn: 421, avgKgIn: 36.2, inDate: d(-71), roomId: r.fin2, stage: "finisher", phases: [{ stage: "weaner", roomId: r.w1, inDate: d(-120), numberIn: 430, avgKgIn: 7.4, outDate: d(-71), numberOut: 421, avgKgOut: 36.2, fcr: 1.58, dlwg: 590, died: 9 }], sampleWeighs: [{ date: d(-7), n: 10, avgKg: 86.5, pen: 1, by: "Seán McKee" }, { date: d(-7), n: 10, avgKg: 83.0, pen: 6, by: "Seán McKee" }, { date: d(-7), n: 20, avgKg: 85.0, by: "Seán McKee" }] });
    batch(34, { numberIn: 398, avgKgIn: 35.1, inDate: d(-92), roomId: r.fin1, stage: "finisher", sampleWeighs: [{ date: d(-6), n: 20, avgKg: 104.5, pen: 2 }] });
    for (const [i, no] of [29, 30, 31, 32, 33].entries()) batch(no, { numberIn: 400 + i * 5, avgKgIn: 35 + i * 0.4, inDate: d(-260 + i * 21), stage: "closed", closed: { date: d(-160 + i * 21), fcr: [2.61, 2.55, 2.49, 2.58, 2.44][i], dlwg: [842, 861, 880, 855, 902][i], mortPct: [0.031, 0.028, 0.024, 0.033, 0.021][i], days: 100 - i, inSpecPct: 0.9 } });
    // closed batches sold through Karro: one kill-sheet cheque and the batch's feed bill each (money in finance only)
    for (const [i, no] of [29, 30, 31, 32, 33].entries()) {
      const pigs = 388 + i * 5; const dw = Math.round(pigs * (88.6 + i * 0.3)); const ppk = [176, 179, 183, 181, 178][i];
      add("finance", { kind: "revenue", category: "Livestock Sales", amount: Math.round(dw * ppk) / 100, date: d(-160 + i * 21), note: `${pigs} finishers B${no} · ${dw.toLocaleString("en-GB")} kg dw · £${(ppk / 100).toFixed(2)}/kg`, source: "killSheet", batchId: B[no], pigs, dwKg: dw, ppk });
      add("finance", { kind: "expense", category: "Feed", amount: Math.round(pigs * (84 + i * 2)), date: d(-175 + i * 21), note: `Finisher feed B${no} (Thompsons)`, batchId: B[no] });
    }
    const rooms = await R.listRecords(lid, "rooms");
    for (const [k, b] of [["w1", 36], ["w2", 37], ["fin2", 35], ["fin1", 34]]) { const rr = rooms.find((x) => x.id === r[k]); R.updateRecord(lid, "rooms", rr, { batchId: B[b] }, { history: false }); }
    // sows: 7 groups of 12 on the 3-week grid
    const days = (a, b2) => Math.round((new Date(b2 + "T12:00Z") - new Date(a + "T12:00Z")) / 864e5);
    const sow = (no, extra = {}) => { const id = nid(); add("sows", { sowNo: String(no).padStart(4, "0"), tag: `UK NI1234 0${String(no).padStart(4, "0")}`, type: "sow", breed: "Large White × Landrace", source: "Hermitage Genetics", entered: no % 3 === 0 ? d(-200 - (no % 100)) : d(-900 + (no % 40) * 10), ...extra }, id); return id; };
    const cycle = 147; // one turn of the 3-week system: 114 + 28 + 5 days
    const oldLitters = (id, n, lastFarrow, bno) => { for (let k = n; k >= 1; k--) { const f = addDays(lastFarrow, -(k - 1) * cycle); add("litters", { sowId: id, roomId: k % 2 ? r.f1 : r.f3, crate: 1 + (k % 12), farrowedAt: `${f}T04:00`, bornAlive: 13 + ((k + bno) % 4), stillborn: k % 2, mummified: 0, fosterOn: [], fosterOff: [], deaths: [{ date: addDays(f, 1), n: 1 + ((k + bno) % 2), cause: k % 3 ? "Overlaid" : "Starved / weak" }], tasks: { iron: addDays(f, 2) }, nesting: true, weaned: { date: addDays(f, 28), n: 11 + ((k + bno) % 3), kg: (11 + ((k + bno) % 3)) * 7.6, ageDays: 28 } }); } };
    const serve = (id, date, b, boar = "77") => { add("services", { sowId: id, date, time: "07:30", kind: "AI", boar, semenBatch: "JSR-2190", serviceNo: 1, batchId: b }); add("services", { sowId: id, date: addDays(date, 1), time: "07:15", kind: "AI", boar, semenBatch: "JSR-2190", serviceNo: 2, batchId: b }); };
    const where = []; // [sowId, location]
    const group = (no, base, { prevFarrow = null } = {}) => { const serveDate = addDays(mon, SERVE[no]); const due = addDays(serveDate, 114); const ids = [];
      for (let i = 0; i < 12; i++) { const id = sow(base + i); ids.push(id); oldLitters(id, 3 + (i % 3), prevFarrow || addDays(serveDate, -33), no); serve(id, addDays(serveDate, i % 3 === 2 ? 1 : 0), B[no], i % 2 ? "81" : "77"); if (days(serveDate, T) >= 30) add("scans", { sowId: id, date: addDays(serveDate, 29), result: no === 40 && i === 4 ? "-" : "+" }); }
      return { ids, serveDate, due }; };
    // B38 suckling in Farrowing 1 (farrowed 3 weeks ago, wean next Monday)
    const g38 = group(38, 1180);
    g38.ids.forEach((id, i) => { const f = addDays(g38.due, (i % 3) - 1); add("litters", { sowId: id, roomId: r.f1, crate: i + 1, farrowedAt: `${f}T0${i % 9}:20`, bornAlive: 13 + (i % 4), stillborn: i % 3 === 0 ? 1 : 0, mummified: i === 5 ? 1 : 0, fosterOn: i === 2 ? [{ n: 2, date: addDays(f, 1) }] : [], fosterOff: i === 7 ? [{ n: 2, date: addDays(f, 1) }] : [], deaths: i % 3 === 1 ? [{ date: addDays(f, 1), n: 1, cause: "Overlaid" }, { date: addDays(f, 4), n: 1, cause: "Starved / weak" }] : i % 4 === 0 ? [{ date: addDays(f, 2), n: 1, cause: "Scour" }] : [], tasks: { iron: addDays(f, 2) }, nesting: true, batchId: B[38], crateEntry: addDays(g38.due, -5), gestation: 114 }); where.push([id, { roomId: r.f1, crate: i + 1, since: addDays(g38.due, -5) }]); });
    // B39 due this week in Farrowing 3; crate 12 farrowed this morning
    const g39 = group(39, 1200);
    g39.ids.forEach((id, i) => { where.push([id, { roomId: r.f3, crate: i + 1, since: addDays(g39.due, -5) }]); if (i === 11) add("litters", { sowId: id, roomId: r.f3, crate: 12, farrowedAt: `${T}T06:20`, bornAlive: 15, stillborn: 1, mummified: 0, fosterOn: [], fosterOff: [], deaths: [], tasks: {}, nesting: true, batchId: B[39], crateEntry: addDays(g39.due, -5), gestation: days(g39.serveDate, T) }); });
    // B40–B42 in pig (dry sows), B43 scan due and B44 served last week (service house)
    for (const [no, base, room] of [[40, 1220, r.dry], [41, 1240, r.dry], [42, 1260, r.dry], [43, 1300, r.serv]]) { const g = group(no, base); g.ids.forEach((id) => where.push([id, { roomId: room, since: addDays(g.serveDate, no >= 43 ? 0 : 30) }])); }
    // B44's sows weaned their B37 litters 11 days before Monday, then were served
    const g44 = group(44, 930, { prevFarrow: addDays(mon, -186) }); g44.ids.forEach((id) => where.push([id, { roomId: r.serv, since: addDays(mon, -7) }]));
    for (const [i, id] of g44.ids.entries()) { const f = addDays(mon, -39); add("litters", { sowId: id, roomId: r.f3, crate: i + 1, farrowedAt: `${f}T03:00`, bornAlive: 13, stillborn: 0, mummified: 0, fosterOn: [], fosterOff: [], deaths: [{ date: addDays(f, 1), n: 1, cause: "Overlaid" }], tasks: { iron: addDays(f, 2) }, nesting: true, batchId: B[37], weaned: { date: addDays(mon, -11), n: 11 - (i % 2), kg: (11 - (i % 2)) * 8.1, ageDays: 28 } }); }
    { const list = await R.listRecords(lid, "sows"); for (const [id, loc] of where) { const so = list.find((x) => x.id === id); R.updateRecord(lid, "sows", so, { location: loc }, { history: false }); }
      // a sow that returned from B41 and was served again with B44
      const so = list.find((x) => x.sowNo === "1243"); const sv = (await R.listRecords(lid, "services")).filter((x) => x.sowId === so.id);
      for (const x of sv) R.updateRecord(lid, "services", x, { returned: true, returnedOn: addDays(x.date, 21) }, { history: false });
      serve(so.id, addDays(mon, -6), B[44]); R.updateRecord(lid, "sows", so, { location: { roomId: r.serv, since: addDays(mon, -6) } }, { history: false }); }
    add("sows", { sowNo: "0870", tag: "UK NI1234 00870", type: "sow", entered: d(-1200), died: d(-100), source: "Hermitage Genetics" });
    add("deaths", { date: d(-100), roomId: r.dry, where: { roomId: r.dry }, n: 1, stage: "Sow", cause: "Lame", euthanasia: { method: "Vet — injection", checked: true }, estKg: 260, collection: "Fallen stock booked" });
    // gilts, boars, a cull, a lost tag
    for (let i = 0; i < 5; i++) add("sows", { sowNo: String(1401 + i), tag: `UK NI1234 0${1401 + i}`, type: "gilt", breed: "Hermitage", source: "Hermitage Genetics", entered: d(-60), inHeat: i < 2 ? T : undefined });
    add("sows", { sowNo: "B77", type: "boar", breed: "Duroc", tag: "UK NI1234 00077", entered: d(-500), source: "Deerpark AI" });
    add("sows", { sowNo: "B81", type: "boar", breed: "Pietrain", tag: "UK NI1234 00081", entered: d(-300), source: "Deerpark AI" });
    const all = await R.listRecords(lid, "sows");
    R.updateRecord(lid, "sows", all.find((s) => s.sowNo === "0935"), { cull: { planned: true, reason: "Repeat returns", on: d(-3) } });
    R.updateRecord(lid, "sows", all.find((s) => s.sowNo === "1222"), { lostTag: { date: d(-6) } });
    // feed deliveries (bins, batches) with the £ in finance only
    const feed = (date, binId, ration, t, ppt, batchIds, sample = true) => { const id = nid(); add("feedDeliveries", { date, supplier: "Thompsons", ration, kg: t * 1000, binId, batchIds, docketNo: `T${date.replace(/-/g, "").slice(2)}`, sampleKept: sample, sampleKeptUntil: sample ? addDays(date, 183) : undefined, byName: "Tom Riddell" }, id); add("finance", { kind: "expense", category: "Feed", amount: +(t * ppt).toFixed(2), date, note: `${ration} ${t.toFixed(1)} t · Thompsons`, feedDeliveryId: id, pricePerT: ppt, tonnes: t, source: "feedDelivery" }); };
    for (const [n, t] of [[-68, 16.0], [-50, 16.2], [-30, 16.4], [-12, 16.0]]) feed(d(n), bin3, "Finisher pellets", t, 302, [B[35]]);
    for (const [n, t] of [[-90, 14], [-70, 15], [-48, 16], [-26, 16], [-9, 13]]) feed(d(n), bin3, "Finisher pellets", t, 302, [B[34]]);
    feed(addDays(mon, -30), bin1, "Weaner pellets", 3.2, 465, [B[36]]); feed(d(-8), bin1, "Weaner pellets", 4, 465, [B[36], B[37]], false);
    // readings: Finisher 2 water drop today, bin dip
    const water = [41.0, 47.1, 53.3, 59.5, 65.8, 72.0, 78.3, 83.2]; water.forEach((w, i) => add("readings", { roomId: r.fin2, date: d(i - 7), waterM3: w, tMin: 17, tMax: 23 }));
    add("readings", { roomId: r.fin2, date: d(-1), binId: bin3, binDipKg: 7800 });
    // deaths
    for (const [n, c, kg, pen] of [[-60, "Respiratory", 45, 2], [-44, "Found dead", 58, 5], [-38, "Tail bite", 60, 3], [-30, "Rupture", 66, 7], [-21, "Respiratory", 72, 1], [-15, "Put down", 76, 3], [-9, "Found dead", 80, 6], [-4, "Lame", 84, 4], [-1, "Tail bite", 86, 3]]) add("deaths", { date: d(n), roomId: r.fin2, where: { roomId: r.fin2, pen }, batchId: B[35], n: 1, stage: "Finisher", cause: c, estKg: kg, collection: "Fallen stock booked", euthanasia: c === "Put down" ? { method: "Captive bolt + pithing", checked: true } : undefined, byName: "Seán McKee" });
    for (const [n, c] of [[-20, "Scour"], [-11, "Found dead"], [-3, "Scour"]]) add("deaths", { date: d(n), roomId: r.w1, where: { roomId: r.w1, pen: 2 }, batchId: B[36], n: 1, stage: "Weaner", cause: c, estKg: 12, collection: "Fallen stock booked" });
    // room checks today (Finisher 2 and Weaner 2 not yet), tail bite yesterday
    for (const k of ["f1", "f3", "w1", "fin1"]) add("roomChecks", { roomId: r[k], date: T, time: "07:42", by: "Seán McKee", pens: k === "w1" ? pens(6, 15).map((p) => ({ no: p.no, status: p.no === 4 ? ["Scour"] : ["OK"], ...(p.no === 4 ? { pigs: 3 } : {}) })) : [{ no: 0, status: ["OK"] }], enrichmentOk: true, waterOk: true, feedersOk: true });
    add("roomChecks", { roomId: r.fin2, date: d(-1), time: "08:05", by: "Seán McKee", pens: pens(8, 36).map((p) => ({ no: p.no, status: p.no === 3 ? ["Tail bite"] : ["OK"], ...(p.no === 3 ? { pigs: 2, severity: "Ear/tail marks", action: ["Extra enrichment"] } : {}) })), enrichmentOk: true, waterOk: true, feedersOk: true });
    add("tailBites", { roomId: r.fin2, pen: 3, date: d(-1), pigs: 2, severity: "Ear/tail marks", actions: ["Extra enrichment"], batchId: B[35], byName: "Seán McKee" });
    add("enrichment", { roomId: r.fin2, material: "straw + wood", date: d(-2), byName: "Seán McKee" });
    add("enrichment", { roomId: r.w1, material: "rope + hessian", date: d(-3), byName: "Seán McKee" });
    // alarm tests: Finishing house overdue (9 days)
    add("alarmTests", { house: "Farrowing house", date: d(-3), time: "08:10", sounded: true, backupChecked: true, by: "Seán McKee" });
    add("alarmTests", { house: "Weaner house", date: d(-6), time: "08:20", sounded: true, backupChecked: true, by: "Seán McKee" });
    add("alarmTests", { house: "Service house", date: d(-2), time: "08:00", sounded: true, backupChecked: true, by: "Tom Riddell" });
    add("alarmTests", { house: "Finishing house", date: d(-9), time: "08:30", sounded: true, backupChecked: true, by: "Seán McKee" });
    // medicines: in-water course on B36 (day 3 of 5), an injection on B34 (withdrawal over), a sow
    add("medicines", { kind: "use", date: d(-2), batchId: B[36], batchName: "B36", roomId: r.w1, pens: [4], route: "In water", productName: "Amoxinsol 50%", activeIngredient: "amoxicillin", antibiotic: true, dose: "20 mg/kg", quantity: 600, quantityUnit: "g", pigs: 270, days: 5, reason: "Strep / meningitis", vet: "Mark Bell MRCVS", wdMeatDays: 2, withdrawalEndDateMeat: d(4), givenBy: "Seán McKee" });
    add("medicines", { kind: "use", date: d(-40), batchId: B[34], batchName: "B34", roomId: r.fin1, route: "Injection", productName: "Pen & Strep", activeIngredient: "procaine benzylpenicillin", antibiotic: true, dose: "1 ml/25 kg", quantity: 60, quantityUnit: "ml", pigs: 22, days: 3, reason: "Lame / joints", vet: "Mark Bell MRCVS", wdMeatDays: 23, withdrawalEndDateMeat: d(-15), givenBy: "Tom Riddell" });
    add("medicines", { kind: "use", date: d(-60), batchId: B[35], batchName: "B35", roomId: r.fin2, route: "In feed", productName: "Pulmotil AC", activeIngredient: "tilmicosin", antibiotic: true, dose: "200 g/t", quantity: 2000, quantityUnit: "g", pigs: 421, days: 7, reason: "Respiratory", mfsNo: "MFS-55102", vet: "Mark Bell MRCVS", wdMeatDays: 14, withdrawalEndDateMeat: d(-40), givenBy: "Tom Riddell" });
    // loads: B34 planned this week; an earlier load off not yet notified
    const loadDay = d(Math.min(6 - dow, 3) > 0 ? Math.min(6 - dow, 3) : 2);
    add("tasks", { title: "Ship 180 from Finisher 1 Fri 06:00 — withdraw feed from 22:00 Thu", due: loadDay, note: "Pens 1, 2, 3, 4", money: false, done: false, pig: { kind: "ship", batchId: B[34], roomId: r.fin1, n: 180, loadAt: `${loadDay}T06:00`, withdrawAt: `${addDays(loadDay, -1)}T22:00`, pens: [1, 2, 3, 4] } });
    const mv = nid(); add("moves", { direction: "off", date: d(-5), time: "06:00", n: 96, category: "finishers", toSlaughter: true, toName: "Karro, Cookstown", toCode: "Plant 9011", markType: "Slap mark", mark: "NI 1234", haulier: "J. Kelly Haulage", haulierAuth: "UK/NI/T1/0042", vehicle: "LKZ 4471", fci: { withdrawals: true, disease: "No disease affecting meat safety" }, feedWithdrawnAt: `${d(-6)}T22:30`, batchId: B[34], roomId: r.fin1, byName: "Tom Riddell" }, mv);
    add("moves", { direction: "off", date: d(-26), time: "06:00", n: 102, category: "finishers", toSlaughter: true, toName: "Karro, Cookstown", markType: "Slap mark", mark: "NI 1234", haulier: "J. Kelly Haulage", fci: { withdrawals: true }, feedWithdrawnAt: `${d(-27)}T22:00`, batchId: B[34], roomId: r.fin1, notified: d(-25), notifiedBy: "Tom Riddell" });
    const ks = nid(); add("killSheets", { date: d(-5), abattoir: "Karro, Cookstown", batchId: B[34], pigs: [], doa: 0, condemned: 1, tailDamage: 2, totals: { pigs: 96, dwKg: 8544, inSpec: 88, avgDw: 89 }, moveId: mv }, ks);
    add("finance", { kind: "revenue", category: "Livestock Sales", amount: 15379.2, date: d(-5), note: "96 finishers B34 · 8,544 kg dw · avg 89.0 kg · £1.80/kg", source: "killSheet", killSheetId: ks, batchId: B[34], pigs: 96, dwKg: 8544, ppk: 180 });
    add("finance", { kind: "expense", category: "Vet & medicine", amount: 1280, date: d(-30), note: "Vet visit and medicines" });
    add("finance", { kind: "expense", category: "Electricity", amount: 2140, date: d(-15), note: "Power, Sept" });
    // paperwork: QVR 17 weeks ago, checks, plans, visitors, inventory, last month's PM2
    add("vetVisits", { date: d(-119), vet: "Mark Bell MRCVS", type: "QVR", reportNote: "Report in the office folder", actions: [{ text: "Raise water flow in the weaner drinkers", due: d(-90), done: d(-95) }, { text: "Review strep vaccination for B38 onwards", due: d(-20), done: null }], tailDockingApproved: true, prophylaxisReviewed: true, byName: "Tom Riddell" });
    add("siteChecks", { kind: "vermin", date: d(-80), result: "clear", by: "Rentokil" });
    add("siteChecks", { kind: "water", date: d(-200), result: "pass", by: "AFBI" });
    add("siteChecks", { kind: "tailRisk", date: d(-100), result: "done", by: "Tom Riddell" });
    for (const k of ["health", "emergency", "biosecurity", "tailBiting"]) add("plans", { kind: k, signedOn: d(-150), by: "Tom Riddell & Mark Bell MRCVS" });
    for (const [n, name, company, reason, contact] of [[0, "Mark Doherty", "Feeds Ltd", "Feed", "today"], [-1, "Aoife Byrne", "", "Engineer", "never"], [-2, "Mark Bell", "Bell Vets", "Vet", "3+"], [-3, "Jim Kelly", "J. Kelly Haulage", "Haulier", "1-2"]]) if (d(n) >= mon) add("visitors", { date: d(n), time: "10:42", name, company, reason, lastPigContact: contact, vehicle: "", readRules: true, bootsChanged: true, source: n === 0 ? "qr" : "self", byName: n === 0 ? undefined : "Tom Riddell" });
    add("visitors", { date: d(-9), time: "09:15", name: "Paul Quinn", company: "AFBI", reason: "Other", lastPigContact: "never", readRules: true, bootsChanged: true, source: "self", byName: "Tom Riddell" });
    add("inventories", { date: `${+T.slice(0, 4)}-06-01`, establishment: "NI 1234", counts: { sows: 58, gilts: 6, boars: 2, piglets: 260, weaners: 560, growers: 0, finishers: 1240 }, total: 2126, submittedOn: `${+T.slice(0, 4)}-06-08`, byName: "Tom Riddell" });
    add("embUploads", { quarter: `Q2 ${T.slice(0, 4)}`, date: `${T.slice(0, 4)}-07-28`, byName: "Tom Riddell" });
    return lid;
  }, small);
}
