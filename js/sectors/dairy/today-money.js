// Dairy Today margin card (Tom, 10 Nov): margin over purchased feed for the latest milk month.
import { canRead } from "../../core/policy.js";
import { moneyText } from "../../ui/format.js";
import { moneyCard, moneyPrompt } from "../money-card.js";
import { mopf } from "./model/money.js";
import { onFarm, groupOf } from "./model/cows.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function dairyMoneyCard(snap) {
  if (!canRead(snap.role, "finance")) return "";
  const href = `#/l/${snap.lid}/money`; const fin = (snap.data.finance || []).filter((r) => !r.deleted);
  const monthOf = (r) => r.cheque?.month || String(r.date).slice(0, 7);
  const month = [...new Set(fin.filter((r) => r.kind === "revenue" && r.category === "Milk").map(monthOf))].sort().pop();
  if (!month) return moneyPrompt("Milk margin", "Add a milk statement and feed bills in Money to see the margin over purchased feed.", href);
  const cheque = fin.find((r) => r.cheque && monthOf(r) === month);
  const cows = cheque?.cheque?.cows || snap.data.animals.filter((a) => onFarm(a) && groupOf(snap.ix, a, snap.today) === "milking").length;
  const mp = mopf(fin.map((r) => (r.cheque?.month ? { ...r, date: `${r.cheque.month}-15` } : r)), month, cows);
  return moneyCard({ title: `Milk margin · ${MONTHS[+month.slice(5, 7) - 1]}`, href, open: "Milk money",
    lines: [["Margin over purchased feed", moneyText(mp.margin), mp.margin >= 0 ? "ok" : "late"],
      ["A cow a day", mp.perCowDay == null ? "—" : `£${mp.perCowDay.toFixed(2)}`],
      ["A litre", mp.ppl == null ? "—" : `${mp.ppl.toFixed(2)}p`],
      ["Concentrate a litre", mp.concPerLitre == null ? "add kg to feed bills" : `${mp.concPerLitre.toFixed(2)} kg`]] });
}
