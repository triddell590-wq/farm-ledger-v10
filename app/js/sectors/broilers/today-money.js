// Broilers Today margin card (Tom, 10 Nov): income a m² a year and the last crop's payment.
import { canRead } from "../../core/policy.js";
import { moneyText } from "../../ui/format.js";
import { moneyCard, moneyPrompt } from "../money-card.js";
import { incomePerM2, cropResults } from "./model/results.js";

export function broilersMoneyCard(snap) {
  if (!canRead(snap.role, "finance")) return "";
  const { ix, today } = snap; const href = `#/l/${snap.lid}/contract`;
  const settles = (snap.finance || []).filter((f) => f.source === "settlement" && !f.deleted).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!settles.length) return moneyPrompt("Money per crop", "Add your crop settlements in Contract and payment to see income a m² and per bird.", href);
  const area = ix.houses.reduce((t, h) => t + (+h.usableM2 || 0), 0);
  const perM2 = area ? incomePerM2(settles, area, today) : null;
  const last = settles[0]; const crop = last.cropId && ix.crops.find((c) => c.id === last.cropId);
  const r = crop ? cropResults(ix, crop) : null; const birds = r?.sold || +crop?.placed || 0;
  return moneyCard({ title: "Money per crop", href, open: "Contract and payment",
    lines: [["Income a m² a year", perM2 == null ? "add house areas" : moneyText(perM2, true)],
      ["Last crop paid", moneyText(+last.amount || 0)],
      ["A bird", birds ? moneyText((+last.amount || 0) / birds, true) : "—"]] });
}
