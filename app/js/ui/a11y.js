// Accessible names for inputs in per-animal tables (review A #37): "Dead weight, 0112 4", never
// a code id like "deadKg for 0112 4". Labels come from the same word list the records use.
import { fieldLabel } from "../content/record-kinds.js";

const EXTRA = { pricePerKg: "Price per kg", price: "Price", liveKg: "Live weight", deadKg: "Dead weight", kg: "Weight", dose: "Dose", lot: "Lot", grade: "Grade" };
/** "deadKg", "0112 4" -> "Dead weight, 0112 4" */
export function fieldName(key, who = "") {
  const label = EXTRA[key] || fieldLabel(key).replace(/\s*\([^)]*\)\s*$/, "");
  return who ? `${label}, ${who}` : label;
}
