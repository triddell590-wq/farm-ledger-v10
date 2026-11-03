// A realistic Sheep ledger for e2e tests and screenshots (NI lowland flock, ~240 ewes), written
// through the app's own services on the in-memory backend. Rams went in 17 days ago, so the home
// is on day 18 of tupping whatever day the tests run; last year's crop fills the funnel.
// The seed itself lives in app/js/demo/sheep.js (it also fills the demo farm); this runs it in the page.
export async function seedSheep(page) {
  return page.evaluate(async () => (await import("./js/demo/sheep.js")).seedSheep());
}
