// Small herd → Litters (design/13 §2.1, §3.3): plain words, no week numbers or batch numbers.
// Each sow by name with what's next for her, then every litter. Same records underneath.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { addDays, daysBetween } from "../model/dates.js";
import { largeTitle, groupLabel, emptyState } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { dm, d2, plural } from "../ui.js";
import { cycles } from "../model/week.js";
import { aliveNow } from "../model/litters.js";
import { onFarm } from "../model/sows.js";

export default async function litters(ctx) {
  return liveScreen(ctx, { title: "Litters", depth: 0, paint: (snap) => {
    const lid = snap.lid; const can = canWrite(snap.role, "litters");
    const cy = cycles(snap.c).filter((x) => x.sow.type !== "boar");
    if (!snap.data.sows.filter(onFarm).length) return html`<div>${largeTitle("Litters")}${emptyState({ sector: "pigs", title: "No sows yet", body: "Add your sows with their names or numbers.", action: can ? "Add a sow" : null, actAttr: 'data-flow="sow"' })}</div>`;
    const word = ({ sow, c }) => {
      if (c.status === "suckling") return `${plural(aliveNow(c.last), "piglet")}, ${daysBetween(c.last.farrowedAt.slice(0, 10), snap.today)} days old · wean ${dm(addDays(c.last.farrowedAt.slice(0, 10), snap.s.lactation))}`;
      if (c.dates && ["served", "inpig", "farrowing"].includes(c.status)) return `Due to farrow ${dm(c.dates.due)}${c.status === "served" && c.days >= snap.s.returnFrom && c.days <= snap.s.returnTo ? " · watch for her coming back on heat" : ""}`;
      if (c.status === "weaned") return `Weaned ${d2(c.weaned)} — ready to serve`;
      if (c.status === "empty") return "Not in pig — serve her again";
      return sow.type === "gilt" ? "Gilt — not served yet" : "—";
    };
    const all = snap.data.litters.slice().sort((a, b) => b.farrowedAt.localeCompare(a.farrowedAt));
    const name = (id) => { const s = snap.ix.byId.get(id); return s ? s.name || s.sowNo : "?"; };
    return html`<div>${largeTitle("Litters", `${plural(cy.length, "sow")} · ${plural(all.filter((l) => !l.weaned).length, "litter")} on the sow`)}
      <div class="section">${groupLabel("Sows")}<div class="list">${cy.map((x) => html`<a class="row" href="#/l/${lid}/sow/${x.sow.id}"><span class="tile">${raw(icon("pigs"))}</span><span class="main"><span class="primary">${x.sow.name || x.sow.sowNo}${x.sow.name ? html` <span class="ink-3" style="font-weight:500">${x.sow.sowNo}</span>` : ""}</span><span class="secondary">${word(x)}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>
      ${can ? html`<div class="pg-acts"><button type="button" class="btn secondary" data-flow="litter">${raw(icon("birth"))}Litter born</button><button type="button" class="btn secondary" data-flow="served">${raw(icon("pigs"))}Served</button></div><div class="pg-acts"><button type="button" class="btn secondary" data-flow="weaned">${raw(icon("scale"))}Weaned</button><button type="button" class="btn secondary" data-flow="sow">${raw(icon("plus"))}Add a sow</button></div>` : ""}
      <div class="section">${groupLabel("Litters", all.length || "")}<div class="list">${all.length ? all.slice(0, 30).map((l) => html`<div class="row no-lead"><span class="main"><span class="primary">${name(l.sowId)} · ${d2(l.farrowedAt.slice(0, 10))} ${l.farrowedAt.slice(0, 4)}</span><span class="secondary">${l.bornAlive} born alive${l.stillborn ? `, ${l.stillborn} stillborn` : ""}${l.weaned ? ` · ${l.weaned.n} weaned ${d2(l.weaned.date)}` : ` · ${aliveNow(l)} alive now`}</span></span></div>`) : html`<div class="row no-lead"><span class="main"><span class="secondary">No litters yet.</span></span></div>`}</div></div></div>`;
  } });
}
export { flowArg };
