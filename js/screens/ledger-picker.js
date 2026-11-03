// The "Farm ▾ / Beef herd ▾" picker (review B #11, #16, drastic idea 6): one button in the top bar
// opens this sheet, which lists the farm overview and every herd, flock or poultry unit with its
// most pressing alert (or its headline count), then "Add cattle, sheep, pigs or poultry".
// Works for any number of ledgers and never scrolls sideways.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { openSheet } from "../ui/sheet.js";
import { session } from "../services/session.js";
import { sectorModule } from "../sectors/ui.js";
import { ADD_LEDGER } from "../sectors/meta.js";
import { canEditLedger } from "../core/policy.js";
import { alertLevel } from "../services/today-rules.js";
import { todayStr } from "../core/dates.js";
import { go } from "../core/router.js";
import { openFarmPicker } from "./farm-picker.js";

const RANK = { late: 0, due: 1 };

/** One short line for a ledger: its top late/due alert, else its headline ("214 in milk · …"). */
export async function ledgerStatus(l, today = todayStr()) {
  if (l.role === "accountant") return { text: "Money only", level: "" };
  const mod = await sectorModule(l.type);
  const alerts = mod.alerts ? await mod.alerts(l, l.role).catch(() => []) : [];
  const top = alerts.map((a) => ({ ...a, level: alertLevel(a, today) })).filter((a) => a.level in RANK)
    .sort((a, b) => RANK[a.level] - RANK[b.level] || (b.legal ? 1 : 0) - (a.legal ? 1 : 0))[0];
  if (top) return { text: top.title, level: top.level };
  const h = mod.headline ? await mod.headline(l).catch(() => ({})) : {};
  const count = h.value ? `${h.value} ${h.unit || ""}`.trim() : "";
  return { text: [count, h.line].filter(Boolean).join(" · "), level: "" };
}

/** Can this person add herds and flocks to the current farm? */
export function canAddHere() {
  const farm = session.farm(); if (!farm) return false;
  return farm.space ? canEditLedger(farm.space.role) : session.sectorLedgers().some((l) => l.role === "owner");
}

/** cur: the open ledger's id, or null on the farm overview. */
export function openLedgerPicker(cur = null) {
  const farm = session.farm();
  const ledgers = session.sectorLedgers();
  const multiFarm = session.farms().length > 1;
  const body = el(html`<div class="lp">
    <p class="sheet-title-sm">${farm?.farmName || "Your farm"}</p>
    <div class="list">
      <a class="row" href="#/farm/today" data-go="farm" ${raw(cur ? "" : 'aria-current="page"')}>
        <span class="tile neutral">${raw(icon("farm"))}</span>
        <span class="main"><span class="primary">Farm overview</span><span class="secondary">Today, money, map and people</span></span>
        ${cur ? raw(`<span class="chev">${icon("chevron")}</span>`) : html`<span class="lp-here">${raw(icon("check", { size: 20 }))}</span>`}</a>
      ${ledgers.map((l) => html`<a class="row" href="#/l/${l.id}" data-sector="${l.type}" data-lp="${l.id}" ${raw(l.id === cur ? 'aria-current="page"' : "")}>
        <span class="tile">${raw(icon(l.type))}</span>
        <span class="main"><span class="primary">${l.name}</span><span class="secondary lp-status" data-status>&nbsp;</span></span>
        ${l.id === cur ? html`<span class="lp-here">${raw(icon("check", { size: 20 }))}</span>` : raw(`<span class="chev">${icon("chevron")}</span>`)}</a>`)}
    </div>
    ${canAddHere() || multiFarm ? html`<div class="list" style="margin-top:12px">
      ${canAddHere() ? html`<a class="row" href="#/add-ledger" data-add><span class="tile neutral">${raw(icon("plus"))}</span><span class="main"><span class="primary">${ADD_LEDGER}</span></span></a>` : ""}
      ${multiFarm ? html`<button type="button" class="row" data-farms><span class="tile neutral">${raw(icon("farm"))}</span><span class="main"><span class="primary">Switch farm</span><span class="secondary">${session.farms().length} farms</span></span><span class="chev">${raw(icon("chevron"))}</span></button>` : ""}
    </div>` : ""}
  </div>`);
  const sh = openSheet({ size: "small", body, label: "Go to", auto: true });
  body.addEventListener("click", (e) => {
    const f = e.target.closest("[data-farms]");
    if (f) { sh.close(undefined, { force: true }); setTimeout(openFarmPicker, 220); return; }
    const a = e.target.closest("a[href]");
    if (a) { e.preventDefault(); sh.close(undefined, { force: true }); go(a.getAttribute("href").slice(1)); }
  });
  // status lines fill in as each ledger answers (they read from the phone's copy, so this is quick)
  for (const l of ledgers) {
    ledgerStatus(l).then((s) => {
      const n = body.querySelector(`[data-lp="${l.id}"] [data-status]`); if (!n) return;
      n.textContent = s.text || "";
      if (s.level) n.dataset.level = s.level;
      const row = n.closest("[data-lp]"); row.setAttribute("aria-label", `${l.name}${s.text ? ", " + s.text : ""}${l.id === cur ? ", open now" : ""}`);
    }).catch(() => {});
  }
  return sh;
}
