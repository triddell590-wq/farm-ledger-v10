// A synthetic v9.14 farm document built from the field names the v9 code writes
// (reference/v9_14/index.html persist*/save* functions). Invented data, not Tom's.
// Shape: farms/tomsfarm65748392 = { herd, finance, fields, medicine, purchases, keeper, fqa,
// places, feed, medProducts, boardFeedToken } ; farms/<code>/photos/{id} = { dataUrl, createdAt }.

export const FARM_CODE = "tomsfarm65748392";
const today = new Date();
const iso = (dOff) => { const d = new Date(today.getTime() + dOff * 86400000); return d.toISOString().slice(0, 10); };

export function v9Doc() {
  return {
    boardFeedToken: "f".repeat(48),
    keeper: { name: "T. Example", herdNo: "123456", address: "1 Lane, Gulladuff, BT45 0XX" },
    herd: [
      { id: "h1", tag: "UK9 123456 700012", name: "Bella", dob: "2023-03-02", sex: "Heifer", breed: "Charolais", fieldId: "fld1",
        logs: [{ id: "l1", type: "Weight check", date: "2025-09-01", note: "410kg" }, { id: "l2", medId: "m1", type: "Medication", date: iso(-3), note: "Ivomec (batch B12) — 10ml" }],
        colour: "White", damTag: "UK9 123456 600011", retag: "", lastWeightKg: 410, lastWeightDate: "2025-09-01", lastWeightEst: false },
      { id: "h2", tag: "UK9 123456 700023", name: "", dob: "2024-04-10", sex: "Bull", breed: "Charolais", fieldId: null, logs: [],
        onDate: "2025-05-02", fromText: "Ballymena Mart, Ballymena", lot: "42", purchaseId: "p1", weightKg: 320, price: 1450.5 },
      { id: "h3", tag: "UK9 123456 700034", name: "Old Girl", dob: "2014-02-14", sex: "Cow", breed: "Charolais X", fieldId: null, logs: [],
        offDate: "2025-08-01", offTo: "Dead", disposal: "Knackery, NI Fallen Stock", editedAt: "2025-08-02T10:00:00.000Z", createdAt: null,
        history: [{ at: "2025-08-02T10:00:00.000Z", before: { id: "h3", tag: "UK9 123456 700034", offDate: "" } }] },
      { id: "h4", tag: "UK9 123456 700045", name: "", dob: "2024-06-01", sex: "Steer", breed: "Limousin X", fieldId: "fld1", logs: [] },
    ],
    finance: [
      { id: "fin1", kind: "expense", category: "Animal Purchase", amount: 1450.5, date: "2025-05-02", note: "Ballymena Mart statement 9981: 1 cattle", purchaseId: "p1" },
      { id: "fin2", kind: "expense", category: "Feed", amount: 640, date: "2025-09-10", note: "Meal 2t", feedTag: "meal", feedKg: 2000 },
      { id: "fin3", kind: "revenue", category: "Cattle Sales", amount: 2100, date: "2025-09-20", note: "Steer sold" },
      { id: "fin4", kind: "expense", category: "Diesel", amount: 85.2, date: "2025-10-01", note: "" },
    ],
    fields: [
      { id: "fld1", name: "Top Field", acreage: 6.2, type: "Grazing", description: "Dry, good access",
        polygon: [{ lat: 54.85, lng: -6.57 }, { lat: 54.851, lng: -6.569 }, { lat: 54.8505, lng: -6.568 }] },
      { id: "fld2", name: "Bog Meadow", acreage: 3, type: "Cutting", description: "", polygon: [] },
    ],
    medicine: [
      { id: "m1", date: iso(-3), lastDate: iso(-3), productName: "Ivomec", batchNumber: "B12", source: "Vet Co", quantity: "10", quantityUnit: "ml",
        administeredBy: "Tom", animalTags: ["UK9 123456 700012"], withdrawalMeatDays: 42, withdrawalMilkDays: null,
        withdrawalEndDateMeat: iso(39), withdrawalEndDateMilk: null, withdrawalOther: "", brokenNeedle: false, injectionSite: "", notUsed: false, photoId: "ph1",
        doses: [{ tag: "UK9 123456 700012", dose: 10, weightKg: 410, est: false }] },
      { id: "m2", date: "2025-01-05", lastDate: "2025-01-07", productName: "Pen & Strep", batchNumber: "PS9", source: "Vet Co", quantity: "30", quantityUnit: "ml",
        administeredBy: "Tom", animalTags: ["UK9 123456 700023"], withdrawalMeatDays: 23, withdrawalMilkDays: null,
        withdrawalEndDateMeat: "2025-01-30", withdrawalEndDateMilk: null, withdrawalOther: "", brokenNeedle: true, injectionSite: "Left neck", notUsed: false, photoId: null },
      { id: "m3", date: "2025-06-01", productName: "Old drench", batchNumber: "OD1", notUsed: true, disposalDate: "2025-06-01", disposalQty: "200ml", disposalMethod: "Returned to vet", animalTags: [] },
    ],
    purchases: [
      { id: "p1", kind: "livestock", date: "2025-05-02", supplier: "Ballymena Mart", fromText: "Ballymena Mart, Ballymena", statementNo: "9981", cost: 1450.5,
        productName: "1 cattle", quantity: "UK9 123456 700023", animalTags: ["UK9 123456 700023"], animals: [{ tag: "UK9 123456 700023", lot: "42", weight: "320", price: "1450.50" }],
        notified: true, notifiedAt: "2025-05-03T09:00:00.000Z", photoId: "ph2" },
      { id: "p2", kind: "medicine", date: "2025-09-01", productName: "Ivomec", supplier: "Vet Co", quantity: "500ml", supplierAddress: "2 Main St, Magherafelt",
        batchNumber: "B12", expiryDate: "2027-01-01", cost: null, photoId: null },
    ],
    medProducts: [
      { id: "mp1", name: "Ivomec", wdMeat: 42, wdMilk: 0, wdOther: "", dosePerHead: null, rateAmount: 1, rateKg: 50, doseType: "weight", source: "Vet Co", unit: "ml", lastUsed: iso(-3) },
    ],
    feed: {
      groups: [{ id: "g1", name: "Weanlings", animalIds: ["h2", "h4"], rations: [{ from: "2025-10-01", meal: 2, silage: 0, blocks: 1, every: 2 }] }],
      adjust: [{ id: "adj1", groupId: "g1", date: "2025-10-05", meal: 0, silage: null, note: "No meal" }],
      silage: { lengthFt: 60, widthFt: 30, heightFt: 8, density: 700, blockWFt: 4, blockDFt: 2.5, blockHtFt: 2.5, blockKg: null, pitTonnes: 480, openedOn: "2025-10-01", turnout: "2026-04-15", costPerTonne: 35 },
    },
    fqa: { items: { "records-medicine": { done: true, date: "2025-09-01" }, "housing-light": { na: true, date: "2025-09-01" } } },
    places: [{ id: "farm", name: "Farm", lat: 54.849988, lng: -6.569267, zoom: 16 }, { id: "pl1", name: "Outfarm gate", lat: 54.86, lng: -6.58, zoom: 17 }],
  };
}

export function v9Photos() {
  return {
    ph1: { dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==", createdAt: 1727000000000 },
    ph2: { dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAg==", createdAt: 1727000001000 },
  };
}
