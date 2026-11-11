// "Is this the right animal?" before an entry that can't be taken back (death, sale, off the
// farm) when the search that picked it matched more than one animal (review A #1). The
// farmer sees the number, name and full tag of exactly what is about to be recorded.
import { confirmSheet } from "./sheet.js";

/** One line per animal: "0105 Peggy (UK 9 012345 0403 1)". */
export const pickLine = ({ short, tag }) => (short && tag && short !== tag ? `${short} (${tag})` : short || tag || "this animal");

/**
 * what: "Record a death" | "Record a sale" | "Record leaving the farm"; items: [{ short, tag }].
 * Resolves true when the farmer confirms.
 */
export function confirmPicked(what, items) {
  if (!items.length) return Promise.resolve(true);
  const one = items.length === 1;
  return confirmSheet({
    title: one ? `${what} for ${pickLine(items[0])}?` : `${what} for these ${items.length}?`,
    body: `${one ? "" : items.map(pickLine).join(", ") + ". "}Your search matched more than one animal, so check ${one ? "it's" : "they're"} the right ${one ? "one" : "ones"} — this can't be undone from here.`,
    confirm: one ? "Yes, that's the one" : "Yes, these are right",
    cancel: "No, go back",
  });
}
