// "Look around a demo farm" (review A #46): the whole app on the in-memory backend with a
// realistic farm (beef, sheep and dairy, from the same seeds the tests use). Nothing is saved:
// no Firebase is loaded, the memory store has no persist key, and leaving reloads to Welcome.
import { auth } from "../core/auth.js";
import { createFarm, createLedger } from "../services/ledgers.js";
import { session } from "../services/session.js";
import { SECTOR_NAMES } from "../core/policy.js";
import { addRecord } from "../services/records.js";
import { areaAcres } from "../screens/map-geo.js";

export const DEMO_FARM = "Drumlin Farm (demo)";
export const isDemo = () => document.documentElement.classList.contains("demo");

/** The current address without ?demo (keeps test flags like backend=memory&sw=0). */
export function exitUrl(extra = "") {
  const q = new URLSearchParams(location.search); q.delete("demo"); q.delete("signup");
  if (extra) for (const [k, v] of new URLSearchParams(extra)) q.set(k, v);
  const s = q.toString();
  return `${location.pathname}${s ? "?" + s : ""}#/welcome`;
}
export function demoUrl() {
  const q = new URLSearchParams(location.search); q.set("demo", "1");
  return `${location.pathname}?${q.toString()}#/farm/today`;
}

/** Sign in a demo farmer and fill the farm. memAuth: the memory auth backend (for addUser). */
export async function startDemo(memAuth) {
  memAuth.addUser("demo@farm-ledger.invalid", "demo-farm-only", "Demo farmer", "uDemoFarmer", true);
  await auth.signIn("demo@farm-ledger.invalid", "demo-farm-only");
  const farmId = await createFarm({ farmName: DEMO_FARM });
  for (const type of ["beef", "sheep", "dairy"]) await createLedger({ type, farmId, farmName: DEMO_FARM, name: SECTOR_NAMES[type], settings: type === "dairy" ? { herdNo: "223344", milkingSystem: "Parlour", calvingPattern: "All year" } : type === "beef" ? { herdNo: "123456", calvingSeason: "Spring", beefTypes: ["Suckler", "Pedigree"] } : { flockNo: "654321", ewes: 216 } });
  await session.load(true);
  session.setFarm(farmId);
  const [{ seedBeef }, { seedSheep }, { seedDairy }] = await Promise.all([import("./beef.js"), import("./sheep.js"), import("./dairy.js")]);
  await seedBeef(); await seedSheep(); await seedDairy();
  demoMap(farmId);
  await session.load(true);
}

/** The band at the top of every screen while in the demo. */
export function mountDemoBanner() {
  document.documentElement.classList.add("demo");
  const b = document.createElement("div");
  b.className = "demo-banner"; b.setAttribute("role", "region"); b.setAttribute("aria-label", "Demo farm");
  b.innerHTML = `<span><b>Demo farm</b> — nothing here is saved</span><a class="demo-signup" href="${exitUrl("signup=1")}">Sign up</a><a class="demo-exit" href="${exitUrl()}" aria-label="Leave the demo">Leave</a>`;
  document.body.prepend(b);
}

/** A yard and three fields near Gulladuff, so the map has something to show (groups and mobs
 *  name these fields, so head counts appear on them). */
function demoMap(farmId) {
  const c = { lat: 54.8235, lng: -6.6402 };
  addRecord(farmId, "places", { name: "Farm", kind: "farm", lat: c.lat, lng: c.lng, zoom: 16, source: "demo" }, "farm");
  const box = (dLat, dLng, h, w) => [[0, 0], [0, w], [h, w * 0.92], [h * 1.05, 0]].map(([a, b]) => ({ lat: +(c.lat + dLat + a).toFixed(6), lng: +(c.lng + dLng + b).toFixed(6) }));
  for (const [name, type, poly] of [["Far Hill", "Grazing", box(0.0012, -0.0062, 0.0021, 0.0048)], ["Long field", "Grazing", box(-0.0031, 0.0012, 0.0016, 0.0066)], ["Low field", "Silage", box(-0.0008, -0.0058, 0.0015, 0.004)]]) {
    addRecord(farmId, "fields", { name, type, polygon: poly, acreage: Math.round(areaAcres(poly) * 10) / 10 });
  }
}
