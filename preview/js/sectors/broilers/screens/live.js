// Live Broilers screen helper: paints from the ledger snapshot on every change, keeps the scroll
// position and wires buttons that start an entry flow:
//   <button data-flow="pm" data-arg='{"houseId":"…"}'> runs FLOWS.pm(snap, arg)
// Push screens get the design/15 §21 bottom padding so nothing sits under the + or the tab bar.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { liveSnap } from "../data.js";
import { FLOWS } from "../quick-add.js";
import { wireFormulas } from "../ui.js";

export function wireFlows(root, getSnap) {
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-flow]"); if (!b || !root.contains(b)) return;
    const f = FLOWS[b.dataset.flow]; if (!f) return;
    e.preventDefault();
    let arg = {}; try { arg = b.dataset.arg ? JSON.parse(b.dataset.arg) : {}; } catch (err) { arg = {}; }
    f.run(getSnap(), arg);
  });
}
export const flowArg = (o) => JSON.stringify(o);

/** paint(snap) -> Node | html; after(node, snap, repaint) wires extra behaviour. */
export async function liveScreen(ctx, { title, tab = null, depth = 1, paint, after, mounted }) {
  const body = el(html`<div class="br-page${depth ? " push" : ""}"></div>`); let cur = null;
  wireFlows(body, () => cur);
  const draw = async (snap) => {
    cur = snap; const y = window.scrollY;
    const out = await paint(snap); const node = out instanceof Node ? out : el(out);
    body.replaceChildren(node); if (y) window.scrollTo(0, y);
    wireFormulas(node);
    after && after(node, snap, () => draw(cur));
  };
  const { first, stop } = liveSnap(ctx.ledger, draw);
  await first;
  return { el: body, title: typeof title === "function" ? title(cur) : title, destroy: stop, tab, depth, mounted: mounted ? () => mounted(cur) : undefined };
}
