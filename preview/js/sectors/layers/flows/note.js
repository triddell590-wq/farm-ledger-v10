// Note (quick add): a dated note, optionally for one house; shows on the house screen.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { toast } from "../../../ui/toast.js";
import { entrySheet, chipsField, liveHouses } from "./common.js";
import { saveNote } from "../actions.js";

export function noteSheet(snap, { houseId = null } = {}) {
  const hs = liveHouses(snap).map((x) => x.h);
  const body = el(html`<form novalidate><div class="form-group"><div class="field stacked"><label>Note</label><textarea name="text" placeholder="e.g. Feeder chain on House 2 sticking at the back"></textarea></div>
    ${hs.length > 1 ? chipsField("houseId", "House", [["", "Whole unit"], ...hs.map((h) => [h.id, h.name])], houseId || "") : ""}</div></form>`);
  entrySheet({ title: "Note", body, label: "Save note", missing: (v) => (!v.text ? "Write the note to save" : null),
    save(v, sh) { saveNote(snap, { text: v.text, houseId: v.houseId || houseId || undefined }); sh.close(true, { force: true }); toast("Note saved"); } });
}
