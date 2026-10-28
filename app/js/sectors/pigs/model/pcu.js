// mg/PCU ESTIMATE (design/13 §8.5). eMB-Pigs calculates the official figure; this is a guide.
// PCU = number of pigs produced × standard weight. The standard weights below are the ESVAC
// convention as Builder understands it (GUESS — design gap: take the exact table from the
// AHDB/VMD eMB method paper and replace these): finishers 65 kg, sows 240 kg, weaners 12 kg.
export const PCU_KG = { finisher: 65, sow: 240, weaner: 12 };
export const PCU_NOTE = "Estimate only — eMB calculates the official figure. Standard weights are a guess until checked against the eMB method.";
export const UK_2024 = { value: 86, label: "UK pig average 2024: 86 mg/PCU (AHDB)" };

/** mgActive: total mg of antibiotic active ingredient in the period; produced: { finishers, sows, weaners }. */
export function mgPerPcu(mgActive, produced) {
  const pcu = (produced.finishers || 0) * PCU_KG.finisher + (produced.sows || 0) * PCU_KG.sow + (produced.weaners || 0) * PCU_KG.weaner;
  return pcu > 0 ? mgActive / pcu : null;
}
