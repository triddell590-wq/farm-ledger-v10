// Sector list (fixed order everywhere) and the record collections each ledger type uses.
// The collection lists matter beyond the screens: export and delete-ledger walk them, because
// a Firestore client cannot list a document's sub-collections. Every collection a sector
// writes MUST be listed here. Phase 3 adds each sector's own collections from its design file.
import { SECTORS, SECTOR_NAMES } from "../core/policy.js";

// Used by every ledger type (including the farm space).
export const COMMON_COLLECTIONS = ["tasks", "events", "notes", "photos", "documents"];
// Sub-collections under a record (collection -> [sub names]); deleted with their parent.
export const SUBCOLLECTIONS = { photos: ["chunks"] };

const TYPES = {
  // Farm space: farm-wide records shared by all ledgers on the farm.
  farm: { name: "Farm", collections: ["finance", "medProducts", "medStock", "purchases", "fields", "places", "contacts"], meta: ["keeper", "settings"] },
  beef: { collections: ["animals", "calvings", "services", "scans", "heats", "weighings", "medicines", "movements", "sales", "purchases", "deaths", "tbTests", "vetOps", "groups", "feedGroups", "feedAdjust", "finance", "medProducts", "fields"], meta: ["keeper", "fqa", "silage", "settings", "places", "tbDay", "calfChecks", "v9extra"] },
  sheep: { collections: ["mobs", "sheep", "groups", "animals", "lambings", "lambCrops", "scans", "weighings", "medicines", "movements", "sales", "purchases", "inventories", "deaths", "diseaseReports", "vetOps", "feedRecords", "finance"], meta: ["keeper", "settings", "fqa"] },
  dairy: { collections: ["animals", "calvings", "services", "heats", "pds", "straws", "medicines", "medProducts", "milkWithhold", "mastitis", "dryOffs", "tankLog", "milkQuality", "recordings", "scoreSessions", "footTrims", "parlourService", "freshChecks", "calfFeeds", "handover", "imports", "movements", "deaths", "tbTests", "vetOps", "groups", "training", "abFailures", "weighings", "sales", "purchases", "finance"], meta: ["keeper", "settings", "rtChecklist", "silage", "slurry"] },
  pigs: { collections: ["sows", "services", "scans", "litters", "batches", "rooms", "roomChecks", "readings", "bins", "feedDeliveries", "deaths", "moves", "killSheets", "alarmTests", "vetVisits", "visitors", "tailBites", "enrichment", "semen", "medicines", "siteChecks", "plans", "embUploads", "inventories", "pm2Months", "finance"], meta: ["keeper", "settings", "rtChecklist"] },
  layers: { collections: ["houses", "flocks", "days", "eggDeliveries", "packerStatements", "storeTemps", "salmSamples", "miteScores", "samples", "vaccinations", "housing", "birdMoves", "lightPlans", "medicines", "feedDeliveries", "alarmTests", "visitors", "biosecurity", "manure", "farmGate", "birdRegisterReturns", "rodentVisits", "healthPlans", "imports", "finance"], meta: ["keeper", "settings", "lion"] },
  broilers: { collections: ["houses", "crops", "checks", "brooding", "weighs", "thins", "fci", "salmSamples", "turnarounds", "energy", "feedDeliveries", "medicines", "alarmTests", "visitors", "waterTests", "training", "birdRegisterReturns", "controllerReadings", "finance"], meta: ["keeper", "settings", "checklist"] },
};

export function sectorName(type) { return type === "farm" ? "Farm" : SECTOR_NAMES[type] || type; }
export function collectionsFor(type) { return [...new Set([...(TYPES[type]?.collections || []), ...COMMON_COLLECTIONS])]; }
export function metaFor(type) { return TYPES[type]?.meta || []; }
export { SECTORS };
