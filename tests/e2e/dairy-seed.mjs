// A realistic Dairy ledger for e2e tests and screenshots (NI all-year Holstein herd, ~50 cows +
// heifers + calves), written through the app's own services on the in-memory backend. Dates are
// relative to today, so the home always has cows withheld, heats, PDs, dry-offs and calvings.
// The seed itself lives in app/js/demo/dairy.js (it also fills the demo farm); this runs it in the page.
export async function seedDairy(page) {
  return page.evaluate(async () => (await import("./js/demo/dairy.js")).seedDairy());
}
