// "Take a photo or paste the text" sheet used for mart dockets, kill sheets and herd lists.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";

export function readTextSheet({ title, hint, onPhoto }) {
  const body = el(html`<div><p class="hint" style="margin-top:0">${hint}</p>
    <button type="button" class="btn secondary" data-photo>${raw(icon("camera"))}Take or choose a photo</button>
    <p class="hint" data-status></p>
    <div class="form-group" style="margin-top:12px"><div class="field stacked"><label for="rt-text">Or paste the text</label><textarea id="rt-text" rows="8" data-text></textarea></div></div></div>`);
  const btn = el(html`<button type="button" class="btn">Read it</button>`);
  const sh = openSheet({ title, body, footer: btn });
  btn.onclick = () => sh.close(body.querySelector("[data-text]").value, { force: true });
  body.querySelector("[data-photo]").onclick = async () => {
    const st = body.querySelector("[data-status]");
    const { choosePhoto, readPhoto } = await import("../ocr.js");
    const f = await choosePhoto(); if (!f) return;
    if (onPhoto) onPhoto(f); // the record keeps the photo too (ui/photo-strip.js)
    st.textContent = "Reading the photo… this takes a few seconds.";
    try { const text = await readPhoto(f); body.querySelector("[data-text]").value = text; st.textContent = "Read. Check the text, then tap Read it."; }
    catch (e) { st.textContent = "The photo reader isn't available on this phone yet. Paste or type the details instead."; }
  };
  return sh.done.then((r) => (typeof r === "string" && r.trim() ? r : null));
}
