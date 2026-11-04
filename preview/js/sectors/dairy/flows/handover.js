// Note / handover (design/12 §3.1): one note per shift, visible to every milker; replies thread.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { toast } from "../../../ui/toast.js";
import { entrySheet } from "./common.js";
import { addHandover, replyHandover } from "../actions.js";

export default function handoverSheet(snap, { reply = null } = {}) {
  const body = el(html`<form novalidate>${reply ? html`<div class="note-card" style="margin-bottom:12px"><q>${reply.text}</q><div class="by">${reply.byName || ""}</div></div>` : ""}
    <div class="form-group"><div class="field stacked"><label for="ho-t">${reply ? "Reply" : "Note for the next milker"}</label><textarea id="ho-t" name="text" placeholder="214 treated RF last night, red leg band. 3 to fetch from the back paddock."></textarea></div></div></form>`);
  return entrySheet({ title: reply ? "Reply" : "Handover note", body, label: reply ? "Send reply" : "Save note", missing: (v) => (v.text ? null : "Write the note to save"),
    save(v, sh) { reply ? replyHandover(snap.lid, reply, v.text) : addHandover(snap.lid, v.text); sh.close(true, { force: true }); toast(reply ? "Reply added" : "Handover note saved — every milker sees it on Milking"); } }).sheet.done;
}
