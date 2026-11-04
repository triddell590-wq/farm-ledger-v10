// Beef → Ledger settings → Morning Board (owner only). Tom's personal Morning Board reads a
// summary the app writes to boardFeed/<token>. v10 started clean, so the key from the v9 farm
// document has to be connected to this Beef ledger once — by the owner tapping the button (the
// key is a secret, so nothing copies it silently).
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { store } from "../../core/store.js";
import { toast } from "../../ui/toast.js";
import { backLink, largeTitle } from "../../screens/common.js";

export const V9_FARM = "farms/tomsfarm65748392";
/** The v9 key, if this person can read it (only Tom's account can). */
export async function v9Token() { try { const d = await store.get(V9_FARM); return d && d.boardFeedToken && d.boardFeedToken.length >= 40 ? d.boardFeedToken : null; } catch (e) { return null; } }

export default async function morningBoard(ctx) {
  const lid = ctx.ledger.id; const path = `ledgers/${lid}/private/boardFeed`;
  const body = el(html`<div class="beef-page">${backLink(`#/l/${lid}/more/settings`, "Ledger settings")}${largeTitle("Morning Board", "Your herd summary for the Morning Board")}<div data-b><p class="hint">Checking…</p></div></div>`);
  const box = body.querySelector("[data-b]");
  const paint = async () => {
    let cur = null; try { cur = await store.get(path); } catch (e) { cur = null; }
    const tok = await v9Token();
    if (cur && cur.token) { box.replaceChildren(el(html`<div class="info-card">${raw(icon("check"))}<span>Connected. This ledger keeps your Morning Board up to date whenever the app is open (at most once an hour). The old v9 app no longer needs to be opened.</span></div>`)); return; }
    if (!tok) { box.replaceChildren(el(html`<div class="info-card">${raw(icon("info"))}<span>No Morning Board key found for this account.</span></div>`)); return; }
    box.replaceChildren(el(html`<div><div class="info-card">${raw(icon("info"))}<span>Your Morning Board is still fed by the old v9 app. Connect it here and this Beef ledger takes over — it will show v10's herd, medicines and money (a clean start).</span></div>
      <div class="section"><button type="button" class="btn" data-go>Connect Morning Board</button></div></div>`));
    box.querySelector("[data-go]").onclick = async (e) => {
      e.target.disabled = true;
      try { await store.set(path, { token: tok, connectedAt: new Date() }); toast("Morning Board connected — it updates within a minute"); setTimeout(() => location.reload(), 1500); }
      catch (err) { toast(navigator.onLine ? "Couldn't connect. Try again." : "Connecting needs a signal."); e.target.disabled = false; }
    };
  };
  paint();
  return { el: body, title: "Morning Board", depth: 2, tab: "more" };
}
