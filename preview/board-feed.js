/* =====================================================================
   board-feed.js (v10) — REQUIRED BY TOM'S MORNING BOARD. DO NOT REMOVE.
   Writes the same small read-only summary as v9 to boardFeed/<token>,
   now built from Tom's Beef ledger (one document per record) instead of
   the old single farm document. Output shape is byte-for-byte the v9
   summary() shape: { writtenAt, build, herd, withdrawals, money,
   unpricedPurchases } — tested in tests/unit/board-feed.test.mjs.

   The token lives in ledgers/<beef>/private/boardFeed (owner-only),
   copied there from v9's farm document by the migration. Firestore rules
   only let Tom's UID write boardFeed/*, so for everyone else this is a
   no-op. It runs only for a ledger that has a board token.
   ===================================================================== */
const HOUR = 3600000;

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return String(h); }
const onFarm = (a) => !a.offDate && !a.dateOff && a.status !== "gone" && !a.deleted;

/** v9's summary(), from v9-shaped state { herd, medicine, finance, purchases }. */
export function boardSummary(st, build, today = new Date().toISOString().slice(0, 10)) {
  const inc = {}, exp = {}; let income = 0, spend = 0, since = null;
  (st.finance || []).forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (!since || e.date < since) since = e.date;
    if (e.kind === "revenue") { income += amt; inc[e.category] = (inc[e.category] || 0) + amt; }
    else { spend += amt; exp[e.category] = (exp[e.category] || 0) + amt; }
  });
  return {
    build,
    herd: (st.herd || []).filter((a) => !a.offDate).map((a) => ({ tag: String(a.tag || ""), sex: a.sex || "", breed: a.breed || "", dob: a.dob || "" })),
    withdrawals: (st.medicine || [])
      .filter((m) => m.withdrawalEndDateMeat && m.withdrawalEndDateMeat >= today && !m.notUsed)
      .map((m) => ({ product: m.productName || "", tags: (m.animalTags || []).map(String), until: m.withdrawalEndDateMeat })),
    money: { income, spend, since: since || "", spendByCategory: exp, incomeByCategory: inc },
    unpricedPurchases: (st.purchases || []).filter((p) => p.cost == null || p.cost === "").length,
  };
}

/** v10 Beef records -> the v9-shaped state the summary reads (order kept: migrated records by
 * their v9 index, then new ones by creation time). Animals that left (v10 dateOff/status) count
 * as off the farm, like v9's offDate. */
export function stateFromRecords({ animals = [], medicines = [], finance = [], purchases = [] }) {
  // £ values live only in finance (design/01 §15): v9 prices come back from the finance doc
  // the migration wrote (kind "prices"); a v10 purchase's cost is its linked finance entry.
  const prices = finance.find((e) => e.kind === "prices" && e.source === "v9") || {};
  finance = finance.filter((e) => e.kind !== "prices");
  purchases = purchases.map((p) => {
    const kept = prices.purchases?.[p.id];
    if (kept && "cost" in kept) return { ...p, cost: kept.cost };
    const f = finance.find((e) => !e.deleted && e.purchaseId && e.purchaseId === p.id);
    return f && p.cost == null ? { ...p, cost: f.amount } : p;
  });
  const order = (list) => list.filter((r) => !r.deleted).map((r, n) => ({ r, n }))
    .sort((a, b) => (a.r._v9?.index ?? 1e9 + a.n) - (b.r._v9?.index ?? 1e9 + b.n)).map(({ r }) => r);
  return {
    herd: order(animals).map((a) => (onFarm(a) ? a : { ...a, offDate: a.offDate || a.dateOff || "gone" })),
    medicine: order(medicines), finance: order(finance), purchases: order(purchases),
  };
}

/**
 * Start feeding the board from a ledger. store = core/store.js; build = app build id.
 * Returns stop(). Pushes 3s after data changes, at most hourly when nothing changed.
 */
export function startBoardFeed(store, ledgerId, build) {
  const S = { token: null, lastHash: null, lastWrite: 0, timer: null, data: { animals: [], medicines: [], finance: [], purchases: [] }, status: "starting" };
  const subs = [];
  store.get(`ledgers/${ledgerId}/private/boardFeed`).then((d) => {
    if (!d || !d.token) { S.status = "off"; return; }
    S.token = d.token;
    for (const c of ["animals", "medicines", "finance", "purchases"]) {
      subs.push(store.watchQuery(`ledgers/${ledgerId}/${c}`, {}, (list) => { S.data[c] = list; schedule(); }, () => {}));
    }
  }).catch(() => { S.status = "off"; });
  function schedule() { clearTimeout(S.timer); S.timer = setTimeout(() => push(false), 3000); }
  async function push(force) {
    if (!S.token) return;
    try {
      const body = boardSummary(stateFromRecords(S.data), build);
      const h = hash(JSON.stringify(body));
      if (!force && h === S.lastHash && Date.now() - S.lastWrite < HOUR) return;
      await store.set(`boardFeed/${S.token}`, Object.assign({ writtenAt: new Date().toISOString() }, body));
      S.lastHash = h; S.lastWrite = Date.now(); S.status = "ok";
    } catch (e) { S.status = "error"; console.warn("Board feed failed", e && (e.code || e.message)); }
  }
  return { stop() { clearTimeout(S.timer); subs.forEach((u) => u()); }, push: () => push(true), status: () => S.status };
}
