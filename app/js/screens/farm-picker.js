// "Choose farm" sheet for people on ledgers at more than one farm (design/01 §8.1).
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { openSheet } from "../ui/sheet.js";
import { icon } from "../ui/icons.js";
import { session } from "../services/session.js";
import { ROLE_DISPLAY } from "./roles.js";
import { META } from "../sectors/meta.js";
import { go } from "../core/router.js";

export function openFarmPicker() {
  const cur = session.farmId;
  const body = el(html`<div><p class="sheet-title-sm">Choose farm</p><div class="list">${session.farms().map((f) => {
    const n = f.ledgers.length;
    const line = n === 1 ? `${META[f.ledgers[0].type]?.short || ""} · ${ROLE_DISPLAY[f.ledgers[0].role]}` : `${n} ledgers`;
    return html`<button type="button" class="row" data-farm="${f.farmId}">
      <span class="tile ${f.farmId === cur ? "ok" : "neutral"}">${raw(icon(f.farmId === cur ? "check" : "farm"))}</span>
      <span class="main"><span class="primary">${f.farmName || "Farm"}</span></span><span class="ink-2 t-callout">${line}</span></button>`;
  })}</div></div>`);
  const sh = openSheet({ size: "small", body, label: "Choose farm", auto: true });
  body.addEventListener("click", (e) => { const b = e.target.closest("[data-farm]"); if (!b) return; session.setFarm(b.dataset.farm); sh.close(); go("/farm/today", { replace: true }); });
}
