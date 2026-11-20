// Sheep Today margin card (Tom, 10 Nov): gross margin a ewe, price a lamb, cost a kg — this year so far.
import { canRead } from "../../core/policy.js";
import { moneyText } from "../../ui/format.js";
import { moneyCard, moneyPrompt } from "../money-card.js";
import { ewesToRam } from "./model/mobs.js";
import { sheepMoney } from "./money.js";

export function sheepMoneyCard(snap) {
  if (!canRead(snap.role, "finance")) return "";
  const year = Number(snap.today.slice(0, 4)); const href = `#/l/${snap.lid}/money`;
  const ewes = ewesToRam(snap.data, snap.cy) || snap.totals?.ewes || +snap.ledger?.settings?.ewes || 0;
  const m = sheepMoney(snap.data.finance || [], year, ewes);
  if (!m.income && !m.costs) return moneyPrompt("Money this year", "Add lamb sales and costs in Money to see the margin a ewe.", href);
  return moneyCard({ title: `Money · ${year} so far`, href, open: "Margins in Money",
    lines: [["Gross margin a ewe", m.perEwe == null ? "—" : moneyText(m.perEwe), m.perEwe == null ? "" : m.perEwe >= 0 ? "ok" : "late"],
      ["Price a lamb", m.perLamb == null ? "no lambs sold yet" : moneyText(m.perLamb, true)],
      ["Cost a kg carcase", m.costPerKg == null ? "—" : `£${m.costPerKg.toFixed(2)}`]] });
}
