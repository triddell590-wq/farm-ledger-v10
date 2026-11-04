// Layers settings with defaults (design/14 §13). Rules from Research C marked "guess" in the
// design are held here as editable settings, never constants in the logic.
export const DEFAULTS = {
  producerCode: "", registeredEmi: null, packer: "", collectionDays: [1, 4], // Mon, Thu
  packerMortTrigger: 0.2, // weekly % (packer contract)
  henDayBasis: "total", // total | saleable
  sheetBy: "11:00", waterAlertPct: 10, spikeMult: 3, spikeMin: 10, layBelowDays: 3, layDropPts: 5,
  miteAction: 2.0, miteDay: 3, featherEveryDays: 30, weighEveryDays: 28, storeMax: 20, packerDiffPct: 0.5,
  smallFlock: false, gradeOnFarm: false, farmGate: false, rspca: false, organic: false,
  vetPhone: "", daeraPhone: "0300 200 7840", // DAERA helpline (same default as Pigs), editable
  lat: 54.79, lng: -6.62, // Gulladuff area by default; dusk times only
  storeTempDaily: true, alarmEveryDays: 7, controllerMap: null, refPrice: null, collectGapDays: 3,
  uniformityTarget: 80,
};
export function layerSettings(ledger, meta = {}) {
  const s = { ...DEFAULTS, ...(meta || {}) };
  const o = ledger?.settings || {};
  if (!s.producerCode && o.registerNo) s.establishmentNo = s.establishmentNo || o.registerNo;
  s.system = o.layerSystem || null;
  return s;
}
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
