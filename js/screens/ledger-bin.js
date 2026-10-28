// Account → Recently deleted ledgers (#/settings/bin). A deleted ledger is hidden from everyone
// on it for 30 days (services/ledgers.js binLedger); the owner can restore it or delete it for good.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { session } from "../services/session.js";
import { listBinned, restoreLedger, deleteLedger } from "../services/ledgers.js";
import { confirmSheet } from "../ui/sheet.js";
import { toast } from "../ui/toast.js";
import { makeScreen, largeTitle, backLink, emptyState, farmTabs, sectorTile } from "./common.js";

const day = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
export default async function ledgerBin() {
  const body = el(html`<div>${backLink("#/settings", "Settings")}${largeTitle("Recently deleted ledgers", "Restore a ledger, or delete it for good. After 30 days it goes by itself.")}<div data-list><p class="hint">Loading…</p></div></div>`);
  const box = body.querySelector("[data-list]");
  const paint = async () => {
    let list = [];
    try { list = await listBinned(); } catch (e) { box.replaceChildren(el(html`<p class="hint">Couldn't load this list. Check your signal and try again.</p>`)); return; }
    if (!list.length) { box.replaceChildren(el(emptyState({ iconName: "trash", title: "Nothing here", body: "Ledgers you delete stay here for 30 days." }))); return; }
    box.replaceChildren(el(html`<div class="list">${list.map((l) => html`<div class="row" data-sector="${l.type}">${sectorTile(l.type)}<span class="main"><span class="primary">${l.name}</span><span class="secondary">Deleted ${day(l.deletedAt)} · gone for good ${day(l.purgeOn)}</span></span>
      <span style="display:flex;gap:8px"><button type="button" class="btn small secondary" data-restore="${l.id}">Restore</button><button type="button" class="btn small danger" data-purge="${l.id}" aria-label="Delete ${l.name} for good">${raw(icon("trash"))}</button></span></div>`)}</div>`));
    box.onclick = async (e) => {
      const r = e.target.closest("[data-restore]"); const p = e.target.closest("[data-purge]");
      const l = list.find((x) => x.id === (r || p)?.dataset[r ? "restore" : "purge"]); if (!l) return;
      if (r) { await restoreLedger(l.id); await session.load(true); toast(`${l.name} restored`); paint(); return; }
      if (!navigator.onLine) { toast("Deleting for good needs a signal."); return; }
      if (!(await confirmSheet({ title: `Delete ${l.name} for good?`, body: "Every record in it is removed for everyone. This can't be undone.", confirm: "Delete for good", danger: true }))) return;
      p.disabled = true; try { await deleteLedger(l.id); toast(`${l.name} deleted for good`); } catch (err) { toast("Couldn't finish. Try again."); } paint();
    };
  };
  paint();
  return makeScreen({ body, title: "Recently deleted ledgers", area: "farm", depth: 2, chrome: { tabs: farmTabs(), tab: "more" } });
}
