// Ledger More → "Edit or delete records" (#/l/<lid>/more/records) and its "Recently deleted"
// view (#/l/<lid>/more/records/bin). One place where anything ever added to a ledger can be
// found and deleted, whatever screen it was added from. Deleting is a soft delete (kept 30 days
// in Recently deleted, restorable); legal records get a stronger warning first.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { session } from "../services/session.js";
import { sectorModule } from "../sectors/ui.js";
import { collectionsFor } from "../sectors/registry.js";
import { canRead, canWrite, canHardDelete } from "../core/policy.js";
import { listRecords, softDelete, restore, hardDelete } from "../services/records.js";
import { confirmSheet } from "../ui/sheet.js";
import { toast } from "../ui/toast.js";
import { makeScreen, largeTitle, groupLabel, emptyState } from "./common.js";
import { ledgerTabs } from "./ledger.js";

// Records the law (DAERA / APHA / assurance) expects to be kept — deleting asks twice as hard.
export const LEGAL = new Set(["animals", "sheep", "sows", "medicines", "medStock", "movements", "moves", "purchases", "sales", "deaths", "calvings", "lambings", "tbTests", "vetOps", "feedRecords", "visitors", "alarmTests", "salmSamples", "birdRegisterReturns", "killSheets", "milkWithhold", "inventories", "birdMoves"]);
const LABELS = { tbTests: "TB tests", vetOps: "Castration & disbudding", medProducts: "Medicine products", medStock: "Medicine stock", feedGroups: "Feed groups", feedAdjust: "Feed changes", pds: "PD results", dryOffs: "Dry-offs", fci: "FCI forms", salmSamples: "Salmonella samples", birdRegisterReturns: "Bird Register returns", killSheets: "Kill sheets", roomChecks: "Room checks", alarmTests: "Alarm tests", tailBites: "Tail bites", pm2Months: "PM2 months", embUploads: "eMB uploads", finance: "Money", tasks: "Jobs" };
export const collLabel = (c) => LABELS[c] || (c.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase()).toLowerCase().replace(/^./, (x) => x.toUpperCase()));
const BIN_DAYS = 30;

const pick = (r, keys) => { for (const k of keys) { const v = r[k]; if (v != null && v !== "" && typeof v !== "object") return String(v); } return ""; };
export function summary(r) {
  const what = pick(r, ["tag", "name", "eartag", "product", "productName", "title", "label", "text", "reason", "kind", "supplier", "buyer", "description", "note", "category", "item"]);
  const tags = Array.isArray(r.animalTags) ? r.animalTags.slice(0, 3).join(", ") : Array.isArray(r.tags) ? r.tags.slice(0, 3).join(", ") : "";
  const amt = typeof r.amount === "number" ? `£${r.amount.toFixed(2)}` : "";
  return [what, tags, amt].filter(Boolean).join(" · ").slice(0, 90) || "Record";
}
const dateOf = (r) => {
  const d = pick(r, ["date", "dateOn", "treatedOn", "dob", "eventDate", "placedDate", "movedOn"]);
  if (d) return d;
  const c = r.createdAt instanceof Date ? r.createdAt : r.createdAt?.toDate ? r.createdAt.toDate() : null;
  return c ? c.toISOString().slice(0, 10) : "";
};
const asDate = (d) => (d instanceof Date ? d : d?.toDate ? d.toDate() : d ? new Date(d) : null);
const nice = (s) => { if (!s) return ""; const d = new Date(s + (s.length === 10 ? "T12:00:00" : "")); return isNaN(d) ? s : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };

export default async function recordsBrowser({ params }) {
  const ledger = session.ledger(params.lid);
  const bin = params.view === "bin";
  const mod = await sectorModule(ledger.type);
  const colls = collectionsFor(ledger.type).filter((c) => c !== "photos" && canRead(ledger.role, c) && canWrite(ledger.role, c));
  const body = el(html`<div>
    <a class="back-link" href="#/l/${ledger.id}/more">${raw(icon("back"))}More</a>
    ${largeTitle(bin ? "Recently deleted" : "Edit or delete records", bin ? `Deleted records stay here for ${BIN_DAYS} days, then go for good.` : `Everything added to ${ledger.name}. Tap a record to delete it.`)}
    ${bin ? "" : html`<div class="section"><div class="list"><a class="row" href="#/l/${ledger.id}/more/records/bin"><span class="tile neutral">${raw(icon("trash"))}</span><span class="main"><span class="primary">Recently deleted</span><span class="secondary">Bring back something deleted by mistake</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div></div>`}
    <div class="form-group" style="margin-top:16px"><div class="field"><label for="rb-q">Search</label><input id="rb-q" type="search" placeholder="Tag, product, name…" autocomplete="off" style="text-align:left"></div></div>
    <div data-list><p class="hint" style="margin-top:16px">Loading…</p></div>
  </div>`);
  const box = body.querySelector("[data-list]"); const q = body.querySelector("#rb-q");
  let groups = [];
  const load = async () => {
    const now = Date.now();
    groups = (await Promise.all(colls.map(async (c) => {
      let recs = [];
      try { recs = await listRecords(ledger.id, c, { includeDeleted: true }); } catch (e) { return null; }
      recs = recs.filter((r) => (bin ? r.deleted : !r.deleted));
      if (bin) recs = recs.filter((r) => { const d = asDate(r.deletedAt); return !d || now - d.getTime() < BIN_DAYS * 864e5; });
      return recs.length ? { c, recs: recs.sort((a, b) => String(dateOf(b)).localeCompare(String(dateOf(a)))) } : null;
    }))).filter(Boolean);
    paint();
  };
  const paint = () => {
    const term = q.value.trim().toLowerCase();
    const shown = groups.map((g) => ({ ...g, recs: term ? g.recs.filter((r) => summary(r).toLowerCase().includes(term) || collLabel(g.c).toLowerCase().includes(term)) : g.recs })).filter((g) => g.recs.length);
    if (!shown.length) { box.replaceChildren(el(emptyState({ iconName: bin ? "trash" : "records", title: bin ? "Nothing deleted" : term ? "Nothing matches" : "No records yet", body: bin ? "Anything you delete shows here for 30 days." : "" }))); return; }
    box.replaceChildren(el(html`<div>${shown.map((g) => html`<div class="section">${groupLabel(`${collLabel(g.c)} (${g.recs.length})`)}<div class="list">${g.recs.slice(0, 60).map((r) => html`
      <button type="button" class="row" data-c="${g.c}" data-id="${r.id}"><span class="main"><span class="primary">${summary(r)}</span><span class="secondary">${nice(dateOf(r))}${LEGAL.has(g.c) ? " · legal record" : ""}</span></span>
      <span class="tile ${bin ? "neutral" : "late"}" aria-label="${bin ? "Restore" : "Delete"}">${raw(icon(bin ? "refresh" : "trash"))}</span></button>`)}</div>
      ${g.recs.length > 60 ? html`<p class="hint">Showing the newest 60 — search to find older ones.</p>` : ""}</div>`)}</div>`));
  };
  q.addEventListener("input", paint);
  box.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-id]"); if (!b) return;
    const c = b.dataset.c; const r = groups.find((g) => g.c === c)?.recs.find((x) => x.id === b.dataset.id); if (!r) return;
    if (bin) {
      const choice = await restoreOrPurge(ledger, c, r);
      if (choice) await load();
      return;
    }
    const ok = await confirmSheet({
      title: `Delete this ${collLabel(c).toLowerCase().replace(/s$/, "")}?`,
      body: LEGAL.has(c) ? `${summary(r)}. This is a legal record — DAERA and assurance inspectors can ask to see it for years. It goes to Recently deleted for ${BIN_DAYS} days first.` : `${summary(r)}. You can bring it back from Recently deleted for ${BIN_DAYS} days.`,
      confirm: "Delete", danger: true,
    });
    if (!ok) return;
    softDelete(ledger.id, c, r.id);
    toast("Deleted", { action: "Undo", duration: 6000, onAction: () => { restore(ledger.id, c, r.id); setTimeout(load, 100); } });
    setTimeout(load, 100);
  });
  load();
  return makeScreen({ body, title: bin ? "Recently deleted" : "Edit or delete records", area: `ledger:${ledger.id}`, sector: ledger.type, depth: bin ? 3 : 2, chrome: { tabs: ledgerTabs(ledger, mod), tab: "more" } });
}

async function restoreOrPurge(ledger, c, r) {
  const purge = canHardDelete(ledger.role, c);
  const b = el(html`<div><p class="sheet-title-sm">${summary(r)}</p><div class="btn-col">
    <button type="button" class="btn" data-restore>Restore</button>
    ${purge ? html`<button type="button" class="btn danger" data-purge>Delete for good</button>` : ""}
    <button type="button" class="btn secondary" data-cancel>Cancel</button></div></div>`);
  const { openSheet } = await import("../ui/sheet.js");
  const sh = openSheet({ size: "small", body: b, label: "Deleted record", auto: true });
  b.querySelector("[data-restore]").onclick = () => { restore(ledger.id, c, r.id); toast("Restored"); sh.close("restore", { force: true }); };
  const p = b.querySelector("[data-purge]");
  if (p) p.onclick = async () => {
    sh.close(null, { force: true });
    if (await confirmSheet({ title: "Delete for good?", body: "This can't be undone.", confirm: "Delete for good", danger: true })) { hardDelete(ledger.id, c, r.id); toast("Deleted for good"); }
  };
  b.querySelector("[data-cancel]").onclick = () => sh.close(null, { force: true });
  return sh.done;
}
