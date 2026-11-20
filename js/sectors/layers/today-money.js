// Layers Today margin card (Tom, 10 Nov): feed a dozen and margin a bird a week for each flock laying.
import { canRead } from "../../core/policy.js";
import { moneyCard, moneyPrompt } from "../money-card.js";
import { sortedHouses, flockIn } from "./model/flock.js";
import { flockMoney } from "./model/eggs.js";
import { PRICE_PROFILE_ID } from "./data.js";

export function layersMoneyCard(snap) {
  if (!canRead(snap.role, "finance")) return "";
  const href = `#/l/${snap.lid}/layers-money`; const c = snap.c;
  const fin = (snap.data.finance || []).filter((r) => r.id !== PRICE_PROFILE_ID && r.kind !== "prices" && !r.deleted);
  const live = sortedHouses(c).map((h) => ({ h, f: flockIn(c, h.id) })).filter((x) => x.f);
  if (!live.length) return "";
  if (!fin.length) return moneyPrompt("Feed a dozen and margin", "Add packer statements and feed bills in Money to see feed a dozen and the margin a bird.", href);
  const lines = [];
  for (const { h, f } of live.slice(0, 3)) {
    const m = flockMoney(c, f, fin); const name = live.length > 1 ? `${h.name}: ` : "";
    lines.push([`${name}feed a dozen`, m.feedPerDozen == null ? "—" : `${m.feedPerDozen.toFixed(1)}p`]);
    lines.push([`${name}margin a bird a week`, m.marginPerBirdWeek == null ? "—" : `${(m.marginPerBirdWeek * 100).toFixed(1)}p`, m.marginPerBirdWeek == null ? "" : m.marginPerBirdWeek >= 0 ? "ok" : "late"]);
  }
  return moneyCard({ title: "Feed a dozen and margin over feed", href, open: "Money per dozen", lines });
}
