// Deaths (quick add, design/14 §2.2, §4.2): which house → cause chips with counts → added to that
// house's sheet for today (the mortality-at-inspection record). A spike shows on Houses at once.
import { toast } from "../../../ui/toast.js";
import { chooseHouse } from "./common.js";
import { causesSheet } from "./sheet.js";
import { addDeaths, undoAdd } from "../actions.js";

export async function deathsFlow(snap, { houseId = null } = {}) {
  const pick = await chooseHouse(snap, { title: "Deaths — which house?", houseId });
  if (!pick) return null;
  const r = await causesSheet([], {});
  if (!r || !r.length) return null;
  const id = addDeaths(snap, pick.h, pick.f, snap.today, r);
  const n = r.reduce((t, x) => t + +x.n, 0);
  toast(`${n} added to ${pick.h.name} today`, typeof id === "string" ? { action: "Undo", onAction: () => undoAdd(snap.lid, "days", id) } : {});
  return id;
}
