// A realistic Beef ledger for e2e tests and screenshots (Tom-like: pedigree Charolais sucklers
// plus finishers), written through the app's own services on the in-memory backend. Every date
// is relative to the day the test runs, so the season mode and deadlines stay meaningful.
// The seed itself lives in app/js/demo/beef.js (it also fills the demo farm); this runs it in the page.
export async function seedBeef(page, { pedigree = true } = {}) {
  return page.evaluate(async (o) => (await import("./js/demo/beef.js")).seedBeef(o), { pedigree });
}
