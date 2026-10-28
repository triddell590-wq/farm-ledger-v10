// Session state shared by screens: the signed-in user, their profile, and the ledgers they
// belong to (with role), grouped into farms. Screens read from here instead of re-querying.
import { auth } from "../core/auth.js";
import { emit } from "../core/bus.js";
import { listMine, groupByFarm } from "./ledgers.js";
import { ensureProfile } from "./profile.js";
import { SECTORS } from "../core/policy.js";

const S = { user: null, profile: null, ledgers: null, farmId: null, loading: null };
const LS_FARM = "fl10-farm"; const LS_PLACE = "fl10-place";

export const session = {
  get user() { return auth.user; },
  get profile() { return S.profile; },
  get ledgers() { return S.ledgers || []; },
  get loaded() { return S.ledgers !== null; },
  /** sector ledgers only (no farm spaces), sector order */
  sectorLedgers(farmId = session.farmId) { return session.ledgers.filter((l) => l.type !== "farm" && (!farmId || l.farmId === farmId)).sort(bySector); },
  farms() { return groupByFarm(session.ledgers); },
  get farmId() {
    const farms = session.farms();
    if (S.farmId && farms.some((f) => f.farmId === S.farmId)) return S.farmId;
    let saved = null; try { saved = localStorage.getItem(LS_FARM); } catch (e) { /* blocked */ }
    if (saved && farms.some((f) => f.farmId === saved)) return (S.farmId = saved);
    return (S.farmId = farms[0]?.farmId || null);
  },
  setFarm(id) { S.farmId = id; try { localStorage.setItem(LS_FARM, id); } catch (e) { /* blocked */ } emit("session:farm", id); },
  farm() { return session.farms().find((f) => f.farmId === session.farmId) || null; },
  ledger(id) { return session.ledgers.find((l) => l.id === id) || null; },
  roleIn(id) { return session.ledger(id)?.role || null; },
  async load(force = false) {
    if (!auth.user) { S.ledgers = null; S.profile = null; return; }
    if (S.loading && !force) return S.loading;
    S.loading = (async () => {
      try { S.profile = await ensureProfile(); } catch (e) { console.warn("profile", e); }
      try { S.ledgers = await listMine(); } catch (e) { console.warn("ledgers", e); S.ledgers = S.ledgers || []; }
      emit("session:ledgers", S.ledgers);
    })();
    try { await S.loading; } finally { S.loading = null; }
  },
  reset() { S.ledgers = null; S.profile = null; S.farmId = null; },
  /** Server-side use (build/notify/send.mjs): set one person's ledgers so sector loaders find their farm space. */
  useLedgers(list) { S.ledgers = list || []; S.farmId = null; },
  setProfileLocal(p) { S.profile = { ...(S.profile || {}), ...p }; },
  rememberPlace(path) { try { localStorage.setItem(LS_PLACE, JSON.stringify({ path, at: Date.now() })); } catch (e) { /* blocked */ } },
  lastPlace(maxAge) { try { const p = JSON.parse(localStorage.getItem(LS_PLACE) || "null"); return p && Date.now() - p.at < maxAge ? p.path : null; } catch (e) { return null; } },
};
function bySector(a, b) { return SECTORS.indexOf(a.type) - SECTORS.indexOf(b.type) || String(a.name).localeCompare(b.name); }
