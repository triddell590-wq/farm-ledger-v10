// A realistic Broilers ledger for e2e tests and screenshots, written through the app's own
// services on the in-memory backend. Two houses of 1,950 m² outside Gulladuff on a Pilgrim's-
// style contract (processor named "Moy Park"-free: "Lough Bann Poultry" is made up), Ross 308.
//   variant "growing" (default): crop 41 at day 23 in both houses — AM checks done, PM due,
//     House 2 41 dead since the morning (3× its 3-day average) and ~4% under Ross, thin planned
//     for day 31 (catch 02:00), Salmonella window open; crops 37–40 cleared with dockets,
//     settlements, energy and closed turnarounds behind them.
//   variant "turnaround": House 1 cleared 3 days ago (litter out + washed done, chicks planned
//     in 5 days), House 2 placed yesterday (brooding: pre-heat, ready, 8 h crop-fill done).
export async function seedBroilers(page, { variant = "growing" } = {}) {
  return page.evaluate(async (variant) => {
    const R = await import("./js/services/records.js");
    const { store } = await import("./js/core/store.js");
    const { addDays, todayStr } = await import("./js/core/dates.js");
    const { session } = window.__fl;
    await session.load(true);
    const L = session.ledgers.find((l) => l.type === "broilers"); const lid = L.id; const T = todayStr(); const d = (n) => addDays(T, n);
    const add = (coll, data, id) => R.addRecord(lid, coll, data, id); const nid = () => store.newId();
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ross = [[0, 44], [7, 213], [14, 533], [21, 1012], [28, 1616], [35, 2296], [42, 2998]];
    const wt = (day) => { for (let i = 1; i < ross.length; i++) if (day <= ross[i][0]) { const a = ross[i - 1], b = ross[i]; return a[1] + ((b[1] - a[1]) * (day - a[0])) / (b[0] - a[0]); } return 2998; };
    const feedG = (day) => Math.max(12, Math.min(210, 12 + day * 5.2));
    R.setMeta(lid, "keeper", { name: "Tom Riddell", address: "Gulladuff, Magherafelt, Co. Londonderry" });
    R.setMeta(lid, "settings", { processor: "Lough Bann Poultry", processorPlant: "Cookstown", fciEmail: "fci@loughbann.example", moduleSize: 100, contractStart: "2023-04-01", noticeMonths: 24,
      vetName: "Ann Devlin MRCVS", vetAddress: "Bann Vets, Maghera BT46", vetPhone: "028 7964 0000", registerNo: "NI-BR-20417", holdingNo: "NI 1234", crewName: "Mid-Ulster Catching", crewGlaa: "GLAA 0412/0091", nonMainsWater: true });
    R.addRecord(lid, "finance", { kind: "prices", category: "Broiler contract profile", date: d(-200), note: "Contract profile and energy prices (not a money entry)",
      profile: { basis: "bird", rate: 0.095, bonusRows: [{ metric: "fcr", op: "<", value: 1.55, amount: 0.012, per: "bird", label: "FCR under 1.55" }, { metric: "mortality", op: ">", value: 4, amount: -0.008, per: "bird", label: "Mortality over 4" }, { metric: "rejects", op: ">", value: 1.5, amount: -0.005, per: "bird", label: "Rejections % over 1.5" }] },
      energyPrices: { lpg: 0.52, biomass: 0.21, elec: 0.24 } }, "broilers-contract");
    const h1 = nid(), h2 = nid();
    add("houses", { name: "House 1", usableM2: 1950, heating: "gas", establishmentNo: "UK5012345" }, h1);
    add("houses", { name: "House 2", usableM2: 1950, heating: "biomass", establishmentNo: "UK5012345" }, h2);
    const houses = [[h1, 32900, 1.03, 0], [h2, 32800, 0.96, 1]];
    // ---- a crop with daily checks ----
    const checksFor = (crop, h, placed, ratio, upTo, { pmToday = false, today = null, todayDead = 0, bad = 0 } = {}) => {
      let meter = 100000 + bad * 50000; let alive = placed;
      for (let day = 0; day <= upTo; day++) {
        const date = addDays(crop.placedDate, day); const isToday = date === today;
        const base = day <= 3 ? 38 + bad * 12 : day <= 10 ? 16 + bad * 4 : 11 + Math.round(rnd() * 3);
        const dead = isToday ? todayDead : base; const cull = day > 7 && !isToday ? Math.round(rnd() * 3) : 0;
        meter += Math.round((alive * feedG(day) * 1.8) / 1000 * (isToday && bad ? 0.95 : 1));
        const T0 = (slot) => ({ cropId: crop.id, houseId: h, date, slot, day, source: "manual", byName: "Seán McKee", checks: ["Feeders", "Drinkers", "Lights", "Ventilation"], tempC: +(33 - Math.min(12, day * 0.45)).toFixed(1), rh: 58 + Math.round(rnd() * 8), nh3: 6 + Math.round(rnd() * 6), co2: 1800 + Math.round(rnd() * 600), outsideC: 9, litter: { front: "2", middle: String(2 + bad), back: "2" } });
        add("checks", { ...T0("am"), time: bad ? "06:35" : "06:20", dead: isToday ? dead : Math.round(dead * 0.6) || dead, culls: { legs: cull, runt: day < 10 && !isToday ? 1 : 0, ascites: 0, injury: 0, other: 0 }, waterMeter: meter });
        if (!isToday || pmToday) add("checks", { ...T0("pm"), time: "18:10", dead: Math.max(0, dead - (Math.round(dead * 0.6) || dead)), culls: { legs: 0, runt: 0, ascites: day > 20 ? Math.round(rnd()) : 0, injury: 0, other: 0 } });
        alive -= dead + cull + (day < 10 && !isToday ? 1 : 0);
      }
      return alive;
    };
    const weighs = (crop, h, ratio, days) => { for (const day of days) { const m = wt(day) * ratio; const ws = Array.from({ length: 50 }, () => Math.round(m * (1 + (rnd() - 0.5) * 0.28))); add("weighs", { cropId: crop.id, houseId: h, date: addDays(crop.placedDate, day), day, weights: ws, mean: ws.reduce((a, b) => a + b, 0) / ws.length, n: 50, cv: 8.1, uniformity: 81, source: "manual", byName: "Seán McKee" }); } };
    const feed = (crop, h, totalKg, upToDay) => { const parts = [["Starter crumb", 0.08, -1], ["Grower pellet", 0.32, 9], ["Finisher pellet", 0.45, 20], ["Withdrawal pellet", 0.15, 30]]; for (const [ration, f, day] of parts) if (day <= upToDay) add("feedDeliveries", { cropId: crop.id, houseId: h, date: addDays(crop.placedDate, day), mill: "Thompsons Belfast", ration, batch: `B${Math.round(rnd() * 90000 + 10000)}`, kg: Math.round(totalKg * f), kind: "delivery", byName: "Tom Riddell" }); };
    // ---- history: crops 37–40 per house, each ~46 days apart ----
    const curPlaced = variant === "growing" ? d(-23) : null;
    for (const [h, placedN, ratio, bad] of houses) {
      const base = variant === "growing" ? curPlaced : h === h1 ? d(5) : d(-1);
      let prevTa = null;
      for (let k = 4; k >= 1; k--) {
        const no = 41 - k; const placedDate = addDays(base, -46 * k + (bad ? 1 : 0)); const cleared = addDays(placedDate, 38);
        const cid = nid(); const crop = { id: cid, houseId: h, no, placedDate, placed: placedN - 200 + k * 50, hybrid: "Ross 308", breedStdId: "ross308-2022", plannedThins: [{ day: 31, birds: 6400 }], plannedClearDay: 38, targetDensity: 38, notifiedDaera: addDays(placedDate, -25), clearedDate: cleared, stage: "turnaround", feedbackReviewed: k > 1 ? cleared : null };
        add("crops", crop, cid);
        const alive = checksFor(crop, h, crop.placed, ratio, 37, { bad: bad && k === 2 ? 1 : 0 });
        weighs(crop, h, ratio, [7, 14, 21, 28]);
        const thinN = 6400; const clearN = alive - thinN - 15;
        const thinKg = Math.round(thinN * (wt(31) * ratio) / 1000); const clearKg = Math.round(clearN * (wt(38) * ratio * (1 - k * 0.004)) / 1000);
        feed(crop, h, (thinKg + clearKg) * (1.5 + k * 0.012 + bad * 0.03), 40);
        add("salmSamples", { cropId: cid, houseId: h, date: addDays(placedDate, 26), time: "10:00", swabPairs: 2, sampler: "Tom Riddell", lab: "AFBI Stormont", sentToLabAt: addDays(placedDate, 26), result: "negative", resultDate: addDays(placedDate, 28), byName: "Tom Riddell" });
        const t1 = nid(), t2 = nid();
        add("thins", { cropId: cid, houseId: h, kind: "thin", catchAt: `${addDays(placedDate, 31)}T02:00`, birds: thinN, processor: "Lough Bann Poultry", feedOffAt: `${addDays(placedDate, 30)}T17:00`, crew: { name: "Mid-Ulster Catching", glaa: "GLAA 0412/0091" }, status: "done", docket: { received: thinN - 4, kg: thinKg, doa: 4, rejPct: 0.6 + bad * 0.3, footpad: 10 + k * 2 + bad * 8, hockPct: 2 + bad } }, t1);
        add("thins", { cropId: cid, houseId: h, kind: "clear", catchAt: `${cleared}T01:00`, birds: clearN, processor: "Lough Bann Poultry", feedOffAt: `${addDays(cleared, -1)}T16:30`, crew: { name: "Mid-Ulster Catching", glaa: "GLAA 0412/0091" }, status: "done", docket: { received: clearN - 9, kg: clearKg, doa: 9, rejPct: 0.9 + bad * 0.4, footpad: 14 + k * 2 + bad * 10, hockPct: 3 + bad } }, t2);
        for (const [t, kind] of [[t1, "thin"], [t2, "clear"]]) add("fci", { cropId: cid, houseId: h, thinId: t, kind, sendBy: `${addDays(placedDate, kind === "thin" ? 30 : 37)}T02:00`, sentAt: `${addDays(placedDate, kind === "thin" ? 29 : 36)}T19:40`, sentTo: "fci@loughbann.example", method: "shared", byName: "Tom Riddell" });
        add("energy", { cropId: cid, houseId: h, readings: h === h1 ? [{ kind: "lpg", start: 9300 + k * 120, end: 6200 }, { kind: "elec", start: 40000 + k * 3000, end: 42600 + k * 3000 }] : [{ kind: "biomass", start: 20800, end: 11800 + k * 400 }, { kind: "elec", start: 61000 + k * 3000, end: 63700 + k * 3000 }], deliveries: [] }, `en-${cid}`);
        if (k <= 3) { const sold = thinN - 4 + clearN - 9; const amt = Math.round(sold * (0.095 + (k === 2 && bad ? 0 : 0.012)) * 100) / 100 - (k === 1 && bad ? 160 : 0);
          R.addRecord(lid, "finance", { kind: "revenue", category: "Crop payment", amount: amt, date: addDays(cleared, 21), note: `Crop ${no} ${h === h1 ? "House 1" : "House 2"} · ${sold.toLocaleString("en-GB")} birds · ${(thinKg + clearKg).toLocaleString("en-GB")} kg · £${Math.round(amt).toLocaleString("en-GB")}`, cropId: cid, houseId: h, settlement: { cropId: cid, ref: `ST-${no}${bad}` }, source: "settlement" }); }
        // results snapshot as at clear-out
        if (prevTa) R.updateRecord(lid, "turnarounds", prevTa, { placedDate, closedAt: placedDate, nextCropId: cid, steps: [...prevTa.steps, { key: "placed", at: placedDate, by: "Tom Riddell" }] });
        const taId = nid(); prevTa = { id: taId, houseId: h, cropId: cid, clearedDate: cleared, steps: [["litterOut", 1], ["washed", 2], ["disinfected", 3], ["dry", 4], ["pest", 4], ["waterLines", 5], ["rebedded", 6], ["preheat", 7]].map(([key, n]) => ({ key, at: addDays(cleared, n), by: key === "washed" ? "Hygiene Services NI" : "Tom Riddell", ...(key === "disinfected" ? { product: "Virkon S", dilution: "1:100" } : {}), ...(key === "rebedded" ? { litterType: "Wood shavings", tonnes: 9 } : {}), ...(key === "litterOut" ? { tonnes: 92 } : {}) })),
          litterOut: { t: 92, haulier: "J. Bradley Haulage", dest: "AD plant", docket: `44${71 + k}`, date: addDays(cleared, 1) }, byName: "Tom Riddell" };
        add("turnarounds", { ...prevTa }, taId);
      }
      // ---- now ----
      if (variant === "growing") {
        const cid = nid(); const crop = { id: cid, houseId: h, no: 41, placedDate: curPlaced, placedTime: "06:00", placed: placedN, hybrid: "Ross 308", breedStdId: "ross308-2022", hatchery: "Moy Hatchery", parentFlock: "PF 2231", plannedThins: [{ day: 31, birds: 6400 }], plannedClearDay: 38, targetDensity: 38, notifiedDaera: addDays(curPlaced, -25), stage: "growing", darkSetAt: d(-16), byName: "Tom Riddell" };
        add("crops", crop, cid);
        if (prevTa) R.updateRecord(lid, "turnarounds", prevTa, { placedDate: curPlaced, closedAt: curPlaced, nextCropId: cid, steps: [...prevTa.steps, { key: "placed", at: curPlaced, by: "Tom Riddell" }] });
        checksFor(crop, h, placedN, ratio, 23, { today: T, todayDead: bad ? 48 : 14, bad });
        weighs(crop, h, ratio, bad ? [7, 14, 21] : [7, 14, 21]);
        feed(crop, h, 125000, 23);
        add("brooding", { cropId: cid, houseId: h, preheat: { date: d(-24), time: "08:00", litterC: 29, airC: 31, by: "Tom Riddell" }, prep: { flushed: true, paper: true, drinkers: true, at: d(-23), by: "Seán McKee" }, chicksArrived: { time: "06:00", n: placedN, hatchery: "Moy Hatchery", parentFlock: "PF 2231", doa: 22 }, cropFill8h: 84, cropFill8hAt: `${d(-23)}T14:05`, cropFill24h: 97, cropFill24hAt: `${d(-22)}T06:30`, behaviour: { d1: { spread: "spread", at: d(-22), by: "Seán McKee" }, d2: { spread: "spread", at: d(-21), by: "Seán McKee" }, d3: { spread: bad ? "huddled" : "spread", at: d(-20), by: "Seán McKee" } }, day7: { g: Math.round(213 * ratio), mortPct: bad ? 1.1 : 0.8, at: d(-16), by: "Tom Riddell" } }, `br-${cid}`);
        if (h === h1) add("medicines", { cropId: cid, houseId: h, date: d(-15), days: 3, product: "Amoxinsol 50%", active: "amoxicillin", reason: "E. coli (vet diagnosed)", dose: "20 mg/kg in water", route: "in water", wdDays: 1, withdrawalEnd: d(-12), vet: "Ann Devlin MRCVS", byName: "Tom Riddell" });
        add("thins", { cropId: cid, houseId: h, kind: "thin", catchAt: `${addDays(curPlaced, 31)}T02:00`, birds: 6400, processor: "Lough Bann Poultry", destination: "Cookstown", feedOffAt: `${addDays(curPlaced, 30)}T17:00`, status: "planned", byName: "Tom Riddell" });
      } else if (h === h1) { // cleared 3 days ago → turnaround
        R.updateRecord(lid, "turnarounds", prevTa, { steps: prevTa.steps.slice(0, 2).map((s, i) => ({ ...s, at: d(-2 + i) })), nextPlacement: d(5), targetDensity: 38, notifiedDaera: d(-20), litterOut: { t: 94, haulier: "J. Bradley Haulage", dest: "AD plant", docket: "4479", date: d(-2) } });
      } else { // House 2: chicks placed yesterday, brooding
        if (prevTa) R.updateRecord(lid, "turnarounds", prevTa, { placedDate: d(-1), closedAt: d(-1), steps: [...prevTa.steps, { key: "placed", at: d(-1), by: "Tom Riddell" }] });
        const cid = nid(); add("crops", { id: cid, houseId: h, no: 41, placedDate: d(-1), placedTime: "06:00", placed: 32800, hybrid: "Ross 308", breedStdId: "ross308-2022", hatchery: "Moy Hatchery", parentFlock: "PF 2240", plannedThins: [{ day: 31, birds: null }], plannedClearDay: 38, targetDensity: 38, notifiedDaera: d(-26), stage: "brooding" }, cid);
        add("checks", { cropId: cid, houseId: h, date: d(-1), slot: "am", day: 0, time: "09:30", dead: 0, culls: {}, tempC: 32, rh: 55, byName: "Seán McKee", source: "manual" });
        add("checks", { cropId: cid, houseId: h, date: d(-1), slot: "pm", day: 0, time: "19:00", dead: 6, culls: { runt: 2 }, tempC: 32.5, rh: 56, byName: "Seán McKee", source: "manual" });
        add("brooding", { cropId: cid, houseId: h, preheat: { date: d(-2), time: "07:30", litterC: 29.5, airC: 32, by: "Tom Riddell" }, prep: { flushed: true, paper: true, drinkers: true, at: d(-1), by: "Seán McKee" }, chicksArrived: { time: "06:00", n: 32800, hatchery: "Moy Hatchery", parentFlock: "PF 2240", doa: 18 }, cropFill8h: 82, cropFill8hAt: `${d(-1)}T14:00` }, `br-${cid}`);
        feed({ id: cid, placedDate: d(-1) }, h, 125000, 0);
      }
    }
    // farm-wide registers
    add("alarmTests", { date: d(-8), time: "09:00", kind: "generator", houseIds: [h1, h2], ok: true, onLoadMinutes: 20, by: "Tom Riddell" });
    add("alarmTests", { date: d(-3), time: "09:10", kind: "alarm", houseIds: [h1, h2], ok: true, by: "Tom Riddell" });
    add("visitors", { date: d(-2), time: "11:00", name: "Paddy Quinn", company: "Lough Bann Poultry", reason: "Field visit", lastPoultryContact: d(-5), vehicle: "Van", readRules: true, bootsChanged: true });
    add("visitors", { date: d(-9), time: "08:30", name: "Feed driver", company: "Thompsons", reason: "Feed delivery", lastPoultryContact: d(-1), readRules: true, bootsChanged: true });
    add("waterTests", { date: d(-120), lab: "AFBI", result: "Satisfactory", note: "Borehole" });
    add("training", { person: "Tom Riddell", course: "Meat chicken welfare certificate", date: "2022-03-14", ref: "MCW-55102" });
    add("training", { person: "Seán McKee", course: "Meat chicken welfare certificate", date: "2024-09-02", ref: "MCW-71833" });
    add("birdRegisterReturns", { year: +T.slice(0, 4) - (T.slice(5) >= "06-01" ? 0 : 1), establishmentNo: "UK5012345", countDate: `${+T.slice(0, 4) - (T.slice(5) >= "06-01" ? 0 : 1)}-06-01`, birds: 61420, byHouse: [{ house: "House 1", birds: 30900 }, { house: "House 2", birds: 30520 }], submittedOn: `${+T.slice(0, 4) - (T.slice(5) >= "06-01" ? 0 : 1)}-06-03` });
    R.setMeta(lid, "checklist", { healthPlan: { ok: true, at: d(-60), by: "Tom Riddell" }, biosecurity: { ok: true, at: d(-60), by: "Tom Riddell" }, enrichment: { ok: true, at: d(-30), by: "Tom Riddell" } });
    return lid;
  }, variant);
}
