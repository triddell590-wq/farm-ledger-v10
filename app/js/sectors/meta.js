// Per-sector words used by the platform screens (design/01 §6.2, §6.3, §7.1, §8). Ledger
// screens themselves live in sectors/<type>/ (Phase 3).
export const META = {
  beef: { short: "Beef", desc: "Sucklers, stores and finishers", unit: "cattle", numberLabel: "Herd number", numberHelp: "NI herd no. (DAERA), e.g. 123456" },
  sheep: { short: "Sheep", desc: "Ewes, lambs, rams", unit: "ewes", numberLabel: "Flock number", numberHelp: "DAERA flock number" },
  dairy: { short: "Dairy", desc: "Milking cows and youngstock", unit: "cows", numberLabel: "Herd number", numberHelp: "NI herd no. (DAERA)" },
  pigs: { short: "Pigs", desc: "Sows, weaners, finishers", unit: "pigs", numberLabel: "Herd mark", numberHelp: "Pig herd mark (DAERA)" },
  layers: { short: "Layers", desc: "Laying hens, eggs", unit: "eggs", numberLabel: "Poultry register no.", numberHelp: "DAERA Bird Register number" },
  broilers: { short: "Broilers", desc: "Meat birds, crop by crop", unit: "birds", numberLabel: "Poultry register no.", numberHelp: "DAERA Bird Register number" },
};
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => ({ value: String(i + 1), label: m }));
// Onboarding step 3 fields per sector (design/01 §6.3). kind: number|stepper|chips|chip|month|text
export const SETUP_FIELDS = {
  beef: [
    { key: "herdNo", label: "Herd number", kind: "text", inputmode: "numeric" },
    { key: "headCount", label: "Cattle on the farm", kind: "stepper", value: 0, step: 1 },
    { key: "beefTypes", label: "Mainly", kind: "chips", options: ["Suckler", "Store", "Finishing", "Pedigree"] },
    { key: "calvingSeason", label: "Calving season", kind: "chip", options: ["Spring", "Autumn", "All year"] },
  ],
  sheep: [
    { key: "flockNo", label: "Flock number", kind: "text", inputmode: "numeric" },
    { key: "ewes", label: "Breeding ewes", kind: "stepper", value: 0, step: 10 },
    { key: "lambingMonth", label: "Lambing starts", kind: "month", options: months, value: "3" },
    { key: "terrain", label: "Land", kind: "chip", options: ["Lowland", "Hill"] },
  ],
  dairy: [
    { key: "herdNo", label: "Herd number", kind: "text", inputmode: "numeric" },
    { key: "cowsInMilk", label: "Cows in milk", kind: "stepper", value: 0, step: 5 },
    { key: "dryCows", label: "Dry cows", kind: "stepper", value: 0, step: 1 },
    { key: "milkingSystem", label: "Milking", kind: "chip", options: ["Parlour", "Robot"] },
    { key: "calvingPattern", label: "Calving", kind: "chip", options: ["Spring block", "Autumn block", "All year"] },
    { key: "milkBuyer", label: "Milk buyer", kind: "text" },
  ],
  pigs: [
    { key: "herdMark", label: "Herd mark", kind: "text" },
    { key: "sows", label: "Sows", kind: "stepper", value: 0, step: 5 },
    { key: "finisherPlaces", label: "Finisher places", kind: "stepper", value: 0, step: 50 },
    { key: "pigSystem", label: "System", kind: "chip", options: ["Breeding", "Farrow-to-finish", "Finishing only"] },
    { key: "batchInterval", label: "Batches", kind: "chip", options: ["Weekly", "3-weekly", "4-weekly"] },
  ],
  layers: [
    { key: "registerNo", label: "Poultry register no.", kind: "text" },
    { key: "houses", label: "Houses", kind: "stepper", value: 1, step: 1, min: 1 },
    { key: "birdsPerHouse", label: "Birds per house", kind: "text", inputmode: "numeric" },
    { key: "layerSystem", label: "System", kind: "chip", options: ["Free range", "Barn", "Colony", "Organic"] },
  ],
  broilers: [
    { key: "registerNo", label: "Poultry register no.", kind: "text" },
    { key: "houses", label: "Houses", kind: "stepper", value: 1, step: 1, min: 1 },
    { key: "birdsPerCrop", label: "Birds placed per crop", kind: "text", inputmode: "numeric" },
    { key: "processor", label: "Processor", kind: "text" },
    { key: "breed", label: "Breed", kind: "chip", options: ["Ross 308", "Cobb 500", "Other"] },
  ],
};
