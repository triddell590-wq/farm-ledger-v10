// Live screen helper: paints from the ledger snapshot on every change, keeps scroll, wires
// data-flow buttons. paint(snap) returns a Node or html template.
import { html } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { liveSnap } from "./data.js";
import { wireFlows } from "./boards.js";

export async function liveScreen(ctx, { title, tab = null, depth = 1, paint, after }) {
  const body = el(html`<div class="sheep-page"></div>`); let cur = null;
  wireFlows(body, () => cur);
  const { first, stop } = liveSnap(ctx.ledger, async (snap) => {
    cur = snap; const y = window.scrollY;
    const out = await paint(snap); const node = out instanceof Node ? out : el(out);
    body.replaceChildren(node); if (y) window.scrollTo(0, y);
    after && after(node, snap);
  });
  await first;
  return { el: body, title, destroy: stop, tab, depth };
}
