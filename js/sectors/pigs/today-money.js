// Pigs Today margin card (Tom, 10 Nov): margin a pig, margin over feed, cost of production — last 12 months.
import { canRead } from "../../core/policy.js";
import { moneyText } from "../../ui/format.js";
import { addDays } from "../../core/dates.js";
import { moneyCard, moneyPrompt } from "../money-card.js";
import { moneyFigures } from "./model/money.js";

export function pigsMoneyCard(snap) {
  if (!canRead(snap.role, "finance")) return "";
  const href = `#/l/${snap.lid}/pigs-money`; const from = addDays(snap.today, -365);
  const rows = (snap.data.finance || []).filter((f) => !f.deleted && f.date > from);
  const contract = snap.s.contract?.on ? snap.s.contract : null;
  const m = moneyFigures(rows, { contract });
  if (contract && contract.integratorOwns) {
    if (!m.contractIncome && !m.ownCosts) return moneyPrompt("Money · last 12 months", "Add contract payments and your own costs in Money.", href);
    return moneyCard({ title: "Money · last 12 months", href, open: "Money", lines: [["Contract payments", moneyText(m.contractIncome)], ["Your own costs", moneyText(m.ownCosts)], ["Left over", moneyText(m.contractIncome - m.ownCosts), m.contractIncome - m.ownCosts >= 0 ? "ok" : "late"]] });
  }
  if (!m.pigsSold) return moneyPrompt("Margin a pig", "Add kill sheets and feed bills in Money to see the margin a pig.", href);
  return moneyCard({ title: "Margin a pig · last 12 months", href, open: "Money per pig",
    lines: [["Margin a pig", m.marginPerPig == null ? "—" : moneyText(m.marginPerPig, true), m.marginPerPig == null ? "" : m.marginPerPig >= 0 ? "ok" : "late"],
      ["Margin over feed a pig", m.marginOverFeed == null ? "—" : moneyText(m.marginOverFeed, true)],
      ["Cost of production", m.copPpk == null ? "—" : `${m.copPpk.toFixed(1)}p a kg`]] });
}
