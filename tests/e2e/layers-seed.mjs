// A realistic Layers ledger for e2e tests and screenshots, as in design/14 and mockups/layers.html:
// a free-range unit outside Gulladuff with two 16,000-bird houses on contract to a packer.
//   House 1 · Lohmann Brown-Classic · week 34 · sheet done today 07:40 by Seán, in standard.
//   House 2 · Hy-Line Brown · week 61 · sheet not done yet; yesterday 86.0% lay — below the band
//             for 3 days, 9 dead, water −12%; boot swabs due in 2 days; packer mortality trigger.
//   House 3 · empty · depopulated 8 days ago, clean-out under way, next flock placed in 13 days
//             (DAERA 2-week notice job).
// Everything is written through the app's own records service on the in-memory backend, relative
// to today. opts.empty: houses only (no flocks) — for empty-state screenshots.
export async function seedLayers(page, { houses = true } = {}) {
  return page.evaluate(async () => {
    const R = await import("./js/services/records.js");
    const { store } = await import("./js/core/store.js");
    const { addDays, todayStr } = await import("./js/core/dates.js");
    const ST = await import("./js/sectors/layers/model/standards.js");
    const { session } = window.__fl;
    await session.load(true);
    const L = session.ledgers.find((l) => l.type === "layers"); const lid = L.id; const T = todayStr(); const d = (n) => addDays(T, n);
    const add = (coll, data, id) => R.addRecord(lid, coll, data, id); const nid = () => store.newId();
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const dowOf = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
    R.setMeta(lid, "keeper", { name: "Tom Riddell", address: "Gulladuff, Magherafelt, Co. Londonderry" });
    R.setMeta(lid, "settings", { producerCode: "1UK9-0412", registeredEmi: true, establishmentNo: "BT45 0412", packer: "Skea Eggs", collectionDays: [1, 4], vetPhone: "028 7963 1122", miteDay: dowOf(T), layingHens: 31600 });
    const h1 = nid(), h2 = nid(), h3 = nid();
    add("houses", { name: "House 1", order: 1, system: 1, producerCode: "1UK9-0412", establishmentNo: "BT45 0412", usableM2: 1820, nests: 2300, perchM: 2500, litterM2: 600, rangeHa: 6.4, rangeMaxM: 140, sheltersPerHa: 4, places: 16000, trapRows: 2, trapCols: 6 }, h1);
    add("houses", { name: "House 2", order: 2, system: 1, producerCode: "1UK9-0412", establishmentNo: "BT45 0412", usableM2: 1800, nests: 2200, perchM: 2400, litterM2: 600, rangeHa: 6.4, rangeMaxM: 165, sheltersPerHa: 2, places: 16000, trapRows: 2, trapCols: 6 }, h2);
    add("houses", { name: "House 3", order: 3, system: 2, producerCode: "2UK9-0412", establishmentNo: "BT45 0412", usableM2: 1200, nests: 1600, perchM: 1650, litterM2: 400, places: 10000, trapRows: 2, trapCols: 5 }, h3);

    // flocks: hatch so that today is week 34 (House 1) and week 61 (House 2)
    const f1 = nid(), f2 = nid(), f0 = nid(), fNext = nid();
    const hatch1 = d(-34 * 7 - 3), hatch2 = d(-61 * 7 - 2);
    const fl1 = { houseId: h1, breedStdId: "lohmann-brown-classic-alt-2021", hatchDate: hatch1, placedDate: addDays(hatch1, 17 * 7), placed: 16000, ageAtPlacement: 17, rearer: "Moy Park Rearing, Dungannon", rearerEst: "BT71 2201", feedSource: "Thompsons (UFAS)", plannedDepop: addDays(hatch1, 76 * 7), turnaroundWeeks: 3, daeraNotified: addDays(hatch1, 15 * 7) };
    const fl2 = { houseId: h2, breedStdId: "hyline-brown-2025", hatchDate: hatch2, placedDate: addDays(hatch2, 17 * 7), placed: 16300, ageAtPlacement: 17, rearer: "Hillview Pullets, Ballymena", rearerEst: "BT42 1180", feedSource: "Thompsons (UFAS)", plannedDepop: addDays(hatch2, 76 * 7), turnaroundWeeks: 3, nextPlacement: addDays(hatch2, 79 * 7), daeraNotified: addDays(hatch2, 15 * 7) };
    add("flocks", fl1, f1); add("flocks", fl2, f2);
    add("flocks", { houseId: h3, breedStdId: "hyline-brown-2025", hatchDate: d(-86 * 7), placedDate: d(-69 * 7), placed: 10000, ageAtPlacement: 17, rearer: "Hillview Pullets, Ballymena", plannedDepop: d(-8), depopDate: d(-8), numberOut: 9480, destination: "Spent hens — Moy Park, Craigavon", turnaroundWeeks: 3, nextPlacement: d(13), turnaround: { stages: [{ stage: "Cleaned out", date: d(-6), by: "Seán" }, { stage: "Washed", date: d(-3), by: "Seán" }] } }, f0);
    add("flocks", { houseId: h3, breedStdId: "hyline-brown-2025", hatchDate: d(13 - 17 * 7), placedDate: d(13), placed: 10000, ageAtPlacement: 17, rearer: "Hillview Pullets, Ballymena", rearerEst: "BT42 1180", plannedDepop: d(13 + 59 * 7) }, fNext);
    for (const [fid, hid, f] of [[f1, h1, fl1], [f2, h2, fl2]]) add("birdMoves", { flockId: fid, houseId: hid, date: f.placedDate, direction: "in", n: f.placed, kind: "placement", est: f.rearerEst });
    add("birdMoves", { flockId: f0, houseId: h3, date: d(-8), direction: "out", n: 9480, kind: "depop", est: "Moy Park Craigavon", fci: true });

    // daily sheets
    const people = ["Seán McKee", "Tom Riddell"];
    function sheets(fid, hid, f, { lastDate, tail }) {
      const std = ST.standardFor(f.breedStdId); let alive = f.placed; let meter = 400000 + Math.round(rnd() * 90000); const out = [];
      for (let date = f.placedDate; date <= lastDate; date = addDays(date, 1)) {
        const wk = Math.floor((new Date(date) - new Date(f.hatchDate)) / 604800000);
        const b = ST.layBand(std, wk); const midL = (b[0] + b[1]) / 2;
        const tailIdx = Math.round((new Date(lastDate) - new Date(date)) / 86400000);
        let lay = wk < 19 ? 0 : Math.max(0, midL - (wk > 50 ? 0.9 + (wk - 50) * 0.12 : 0.2) + (rnd() - 0.5) * 1.2);
        let dead = Math.max(0, Math.round(1.6 + (rnd() - 0.4) * 2.5 + (wk < 20 ? 2 : 0)));
        if (tail && tailIdx < tail.lay.length) { lay = tail.lay[tail.lay.length - 1 - tailIdx]; dead = tail.dead[tail.dead.length - 1 - tailIdx]; }
        const eggs = Math.round(alive * lay / 100);
        let litres = alive * (0.195 + (rnd() - 0.5) * 0.008); if (tail?.water && tailIdx === 0) litres *= 1 - tail.water / 100;
        meter += Math.round(litres);
        const cull = rnd() < 0.15 ? 1 : 0;
        const causes = []; let left = dead; const C = ["Found dead (unknown)", "Peritonitis", "Pecking / vent", "Prolapse"];
        while (left > 0) { const k = C[Math.floor(rnd() * (wk > 40 ? 4 : 2))]; const m = causes.find((x) => x.cause === k); if (m) m.n++; else causes.push({ cause: k, n: 1 }); left--; }
        if (cull) causes.push({ cause: "Culled — sick", n: 1 });
        const free = true;
        out.push({ houseId: hid, flockId: fid, date, eggsTotal: eggs, seconds: Math.round(eggs * (wk > 55 ? 0.016 : 0.009) / 10) * 10, floor: wk < 22 ? Math.round(300 - (wk - 18) * 60) : Math.round(20 + rnd() * 30), dead, culled: cull, deaths: causes, waterMeter: meter, tMin: 16 + Math.round(rnd() * 3), tMax: 21 + Math.round(rnd() * 3), popOpen: free ? "08:10" : undefined, popClose: free ? "18:" + String(10 + Math.round(rnd() * 15)).padStart(2, "0") : undefined, checks: ["Birds", "Water", "Feed", "Lights", "Alarm panel"], savedAt: `07:${String(20 + Math.round(rnd() * 30)).padStart(2, "0")}`, byName: people[rnd() < 0.7 ? 0 : 1], inspectedBy: people[0], source: "manual" });
        alive -= dead + cull;
      }
      return out;
    }
    const s1 = sheets(f1, h1, fl1, { lastDate: T, tail: { lay: [93.8, 93.6, 94.1, 93.7, 93.9, 93.5, 93.8, 93.6, 93.2, 93.9, 93.4, 93.7, 93.5, 93.4], dead: [2, 1, 3, 2, 2, 1, 2, 3, 2, 1, 2, 2, 1, 3] } });
    s1[s1.length - 1].savedAt = "07:40"; s1[s1.length - 1].byName = "Seán McKee";
    const s2 = sheets(f2, h2, fl2, { lastDate: d(-1), tail: { lay: [89.4, 89.1, 88.9, 89.0, 88.6, 88.8, 88.3, 88.5, 88.2, 88.0, 87.4, 86.6, 86.3, 86.0], dead: [3, 2, 4, 3, 2, 3, 4, 3, 5, 4, 6, 7, 8, 9], water: 12 } });
    // House 2 smothering pile-up three weeks ago (where/time/weather recorded, §4.2)
    { const x = s2[s2.length - 22]; x.deaths.push({ cause: "Smothered", n: 14, where: "Back left", time: "06:50", weather: "Thunder" }); x.dead += 14; }
    [...s1, ...s2].forEach((x) => add("days", x));

    // feed deliveries every 5 days per house (UFAS, samples kept) + feed bills
    for (const [hid, f] of [[h1, fl1], [h2, fl2]]) for (let date = f.placedDate; date <= T; date = addDays(date, 5)) {
      const id = nid(); add("feedDeliveries", { houseId: hid, date, kg: 9400, mill: "Thompsons", ration: date < addDays(f.hatchDate, 45 * 7) ? "Layers phase 1" : "Layers phase 2", ticket: `T${(Math.round(rnd() * 90000) + 10000)}`, ufas: true, sample: rnd() > 0.05 }, id);
      add("finance", { kind: "expense", category: "Feed", amount: Math.round(9.4 * 285 * 100) / 100, date, note: "Layers 9.4 t · Thompsons", source: "feed", feedDeliveryId: id, houseId: hid });
    }
    add("finance", { kind: "expense", category: "Animal Purchase", amount: 16000 * 4.35, date: fl1.placedDate, note: "16,000 pullets · Moy Park Rearing", source: "pullets", flockId: f1, houseId: h1 });
    add("finance", { kind: "expense", category: "Animal Purchase", amount: 16300 * 4.2, date: fl2.placedDate, note: "16,300 pullets · Hillview Pullets", source: "pullets", flockId: f2, houseId: h2 });
    for (let m = 1; m <= 6; m++) add("finance", { kind: "expense", category: "Electricity", amount: 1380, date: d(-30 * m), note: "Electricity — both houses", source: "energy" });
    add("finance", { kind: "prices", category: "Egg price profile", date: d(-60), note: "Egg price profile (not a money entry)", prices: { XL: 158, L: 147, M: 132, S: 90, Seconds: 40 }, deductions: 310, refPrice: 153, feedPerTonne: 285 }, "layers-price-profile");

    // packer collections Mon + Thu; statements for the last 5 full weeks
    const all = [...s1, ...s2];
    for (let date = d(-70); date <= T; date = addDays(date, 1)) if ([1, 4].includes(dowOf(date)) && date < T) add("eggDeliveries", { date, packer: "Skea Eggs", trays: 0, eggs: Math.round(all.filter((x) => x.date <= date && x.date > addDays(date, dowOf(date) === 1 ? -4 : -3)).reduce((t, x) => t + x.eggsTotal, 0)), docketNo: `SK${40000 + Math.round(rnd() * 9999)}`, storeTemp: 15 + Math.round(rnd() * 3), bestBefore: addDays(date, 26), buyer: "Skea Eggs, Dungannon" });
    const monday = (iso) => addDays(iso, -((dowOf(iso) + 6) % 7));
    const mix = [0.06, 0.515, 0.375, 0.025, 0.025]; const G = ["XL", "L", "M", "S", "Seconds"]; const P = [158, 147, 132, 90, 40];
    const nW = Math.floor((new Date(T) - new Date(fl2.placedDate)) / 604800000) - 1; // a statement for every full week since House 2 was placed
    for (let w = nW; w >= 1; w--) {
      const ws = monday(d(-7 * w)); const collected = all.filter((x) => x.date >= ws && x.date <= addDays(ws, 6)).reduce((t, x) => t + x.eggsTotal, 0);
      if (collected < 1000) continue;
      const counted = Math.round(collected * (w === 1 ? 0.9933 : 0.9985 - rnd() * 0.002));
      const shift = Math.max(0, 5 - w) * 0.004; const grades = G.map((g, i) => ({ grade: g, eggs: Math.round(counted * (i === 1 ? mix[i] + shift : i === 2 ? mix[i] - shift : mix[i]) / 10) * 10 }));
      const sid = nid(); const wkNo = (await import("./js/sectors/layers/model/eggs.js")).isoWeek(ws);
      const lines = grades.map((g, i) => ({ grade: g.grade, eggs: g.eggs, ppd: P[i], amount: Math.round(g.eggs / 12 * P[i]) / 100 }));
      const gross = lines.reduce((t, l) => t + l.amount, 0); const paid = Math.round((gross - 310) * 100) / 100; const cnt = grades.reduce((t, g) => t + g.eggs, 0);
      const fin = nid();
      add("finance", { kind: "revenue", category: "Eggs", amount: paid, date: addDays(ws, 6), note: `Eggs wk ${wkNo} · ${cnt.toLocaleString("en-GB")} · avg ${(paid / (cnt / 12) * 100).toFixed(1)}p/doz`, source: "packerStatement", statementId: sid, weekStart: ws, eggs: cnt, lines, deductions: [{ label: "Levy and transport", amount: 310 }], avgPpd: Math.round(paid / (cnt / 12) * 1000) / 10 }, fin);
      add("packerStatements", { weekStart: ws, week: wkNo, packer: "Skea Eggs", grades, counted: cnt, collected: collected, financeId: fin }, sid);
    }
    // egg store temperatures (last 21 days; one warm day 5 days ago)
    for (let i = 21; i >= 1; i--) add("storeTemps", { date: d(-i), min: 13 + Math.round(rnd() * 2), max: i === 5 ? 20.5 : 16 + Math.round(rnd() * 2), byName: "Seán McKee" });

    // Salmonella: House 1 wk 24 negative (next due wk 39); House 2 wk 24/39/54 negative + official, next due in 2 days
    const at = (f, wk, plus = 0) => addDays(f.hatchDate, wk * 7 + plus);
    add("salmSamples", { flockId: f1, houseId: h1, date: at(fl1, 24, 2), time: "10:15", sampler: "operator", sampleType: "2 pairs boot swabs", lab: "AFBI Stormont", result: "Negative", resultDate: at(fl1, 24, 6) });
    const due2 = d(2); const last2 = addDays(due2, -105);
    for (const [k, date] of [[0, addDays(last2, -210)], [1, addDays(last2, -105)], [2, last2]]) add("salmSamples", { flockId: f2, houseId: h2, date, time: "09:40", sampler: "operator", sampleType: "2 pairs boot swabs", lab: "AFBI Stormont", result: "Negative", resultDate: addDays(date, 4 + k % 2) });
    add("salmSamples", { flockId: f2, houseId: h2, date: d(-120), time: "11:00", sampler: "official", sampleType: "2 pairs boot swabs", lab: "AFBI Stormont", result: "Negative", resultDate: d(-115) });

    // red mite: 8 weekly sessions per house (House 2 rising)
    const traps = (n, base) => Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, score: Math.max(0, Math.min(4, Math.round(base + (rnd() - 0.5) * 2))) }));
    for (let w = 8; w >= 1; w--) {
      add("miteScores", { houseId: h1, date: d(-7 * w + 0), traps: traps(12, 0.6), byName: "Seán McKee" });
      add("miteScores", { houseId: h2, date: d(-7 * w + 0), traps: traps(12, 0.5 + (8 - w) * 0.24), byName: "Seán McKee" });
    }
    // fix House 1 latest = the mockup's map
    add("miteScores", { houseId: h1, date: d(-0), traps: [0, 1, 0, 2, 1, 0, 0, 1, 3, 2, 0, 0].map((s, i) => ({ id: `t${i + 1}`, score: s })), byName: "Seán McKee" });

    // vaccinations (rearer certificate + farm), one planned booster for House 2
    for (const [fid, f] of [[f1, fl1], [f2, fl2]]) {
      for (const [dis, prod, wk] of [["Marek's disease", "Rispens", 0], ["S. Enteritidis", "AviPro Salmonella Duo", 1], ["S. Typhimurium", "AviPro Salmonella Duo", 7], ["Infectious bronchitis", "Nobilis IB 4-91", 10], ["Egg drop syndrome", "Nobilis EDS", 15], ["Avian metapneumovirus", "Nemovac", 12]]) add("vaccinations", { flockId: fid, disease: dis, product: prod, date: addDays(f.hatchDate, wk * 7 + 1), batch: `B${Math.round(rnd() * 9000 + 1000)}`, source: "rearer" });
    }
    add("vaccinations", { flockId: f2, disease: "Infectious bronchitis", product: "Nobilis IB Ma5", plannedWk: 62, dose: "Booster", source: "farm" });

    // samples: weights, egg weights, feather scores
    const ws = (mean, n, sd) => Array.from({ length: n }, () => Math.round(mean + (rnd() + rnd() + rnd() - 1.5) * sd * 1.4));
    add("samples", { houseId: h1, flockId: f1, kind: "weights", date: d(-9), wk: 33, values: ws(1960, 100, 110), mean: 1958, cv: 7.6, uniformity: 84, n: 100 });
    add("samples", { houseId: h2, flockId: f2, kind: "weights", date: d(-12), wk: 59, values: ws(2010, 100, 150), mean: 2012, cv: 9.8, uniformity: 74, n: 100 });
    add("samples", { houseId: h1, flockId: f1, kind: "eggs", date: d(-4), wk: 33, values: ws(63.4, 60, 3.5), mean: 63.4, mix: { S: 2, M: 38, L: 54, XL: 6 }, n: 60 });
    add("samples", { houseId: h2, flockId: f2, kind: "eggs", date: d(-5), wk: 60, values: ws(65.1, 60, 4), mean: 65.1, mix: { S: 1, M: 30, L: 58, XL: 11 }, n: 60 });
    add("samples", { houseId: h1, flockId: f1, kind: "feather", date: d(-12), wk: 32, tally: { 0: 44, 1: 5, 2: 1 }, good: 88, n: 50, enrichment: "Pecking blocks" });
    add("samples", { houseId: h2, flockId: f2, kind: "feather", date: d(-40), wk: 55, tally: { 0: 31, 1: 14, 2: 5 }, good: 62, n: 50, enrichment: "Lucerne bales" });

    // treatments: a past mite treatment (no egg withdrawal) and a wormer
    add("medicines", { houseId: h2, flockId: f2, date: d(-30), productName: "Exzolt 10 mg/ml", batch: "EX2231", dose: "0.5 ml/kg in water", route: "Drinking water", reason: "Red mite", doses: 2, intervalDays: 7, eggDays: 0, meatDays: 14, lastDose: d(-23), meatOkFrom: d(-9), givenBy: "Seán McKee", vet: "Dr A. Kerr, Moy Vets" });
    add("medicines", { houseId: h1, flockId: f1, date: d(-60), productName: "Flubenvet 1%", batch: "FV0912", dose: "Premix in feed, 7 days", route: "In feed", reason: "Worms (Ascaridia)", doses: 1, eggDays: 0, meatDays: 7, lastDose: d(-60), meatOkFrom: d(-53), givenBy: "Tom Riddell", vet: "Dr A. Kerr, Moy Vets" });

    // logs: alarm tests (House 2 last 9 days ago → overdue), visitors, rodent, health plans, manure, housing
    add("alarmTests", { date: d(-2), houseId: h1, what: "Alarm and generator", result: "Working", byName: "Seán McKee" });
    add("alarmTests", { date: d(-9), houseId: h2, what: "Alarm", result: "Working", byName: "Seán McKee" });
    add("alarmTests", { date: d(-2), houseId: h3, what: "Alarm", result: "Working", byName: "Seán McKee" });
    for (const [i, n, co, why] of [[1, "Mark Doherty", "Skea Eggs", "Egg collection"], [3, "Dr Aoife Kerr", "Moy Vets", "Vet visit"], [6, "Gary Bell", "Rentokil", "Rodent control"], [12, "Paul Quinn", "Thompsons", "Feed rep"]]) add("visitors", { date: d(-i), name: n, company: co, reason: why, timeIn: "10:30", lastPoultry: i === 1 ? "Within 72 hours" : "Over 72 hours", disinfected: true });
    add("rodentVisits", { date: d(-40), controller: "Gary Bell, Rentokil", findings: "Some activity", report: "RK-55120" });
    add("healthPlans", { date: d(-200), vet: "Dr Aoife Kerr, Moy Vets", next: d(165), note: "IB booster at 62 weeks for House 2" });
    add("manure", { date: d(-8), houseId: h3, tonnes: 96, destination: "Mushroom compost", ref: "MC-2026-118", heapCovered: true });
    add("manure", { date: d(-35), tonnes: 41, destination: "Own land", ref: "", heapCovered: true });
    add("housing", { from: "2026-01-02", to: "2026-05-05", reason: "AI housing order" });
    add("housing", { from: d(-16), to: d(-15), houseId: h2, reason: "Weather" });
    add("lightPlans", { flockId: f1, weeks: [{ wk: 17, hours: 10, on: "07:00", off: "17:00" }, { wk: 18, hours: 11, on: "06:30", off: "17:30" }, { wk: 19, hours: 12, on: "06:00", off: "18:00" }, { wk: 20, hours: 13, on: "05:30", off: "18:30" }, { wk: 21, hours: 14, on: "05:00", off: "19:00" }, { wk: 23, hours: 15, on: "04:30", off: "19:30" }, { wk: 25, hours: 16, on: "04:00", off: "20:00" }] });
    add("notes", { text: "House 2 drinker line 3 pressure low — check regulator", houseId: h2, date: d(-1), byName: "Seán McKee" });
    add("birdRegisterReturns", { year: +T.slice(0, 4), establishmentNo: "BT45 0412", countDate: `${T.slice(0, 4)}-06-01`, birds: { [h1]: 15920, [h2]: 15990, [h3]: 9650 }, total: 41560, submittedOn: `${T.slice(0, 4)}-06-03` });
    R.setMeta(lid, "lion", { internalAudit: d(-150), independentAudit: d(-300), items: { noProtein: { ok: true, at: d(-150), byName: "Tom Riddell" }, eggTest: { ok: true, at: d(-60), byName: "Tom Riddell", note: "Skea tests 20 eggs a quarter" } } });
    await new Promise((r) => setTimeout(r, 300));
    return lid;
  });
}
