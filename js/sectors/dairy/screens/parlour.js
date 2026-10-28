// Parlour sheet (design/12 §3.2): full screen, always light, cow numbers 56px, sorted by cow
// number, marks and quarters; share to WhatsApp, print for the parlour wall; robots get an
// "AMS divert list" (cow IDs). No money anywhere, so relief milkers (Worker role) can use it.
import { html } from "../../../core/html.js";
import { el, reduceMotion } from "../../../ui/dom.js";
import { toast } from "../../../ui/toast.js";
import { download } from "../../../ui/download.js";
import { canWrite } from "../../../core/policy.js";
import { cowLabel, printDoc } from "../ui.js";
import { quartersText, timePart, nowStr } from "../model/milking.js";
import { add } from "../actions.js";

export function parlourText(snap) {
  const w = snap.brd.withheld;
  if (!w.length) return "All cows' milk can go in the tank.";
  return `Milk out of the tank (${snap.ledger.name}, ${nowStr().replace("T", " ")}):\n` + w.map((x) => `${cowLabel(x.cow)}${x.cow.name ? " " + x.cow.name : ""} — ${quartersText(x.w.quarters) || "All four"}${x.w.marks?.length ? " · " + x.w.marks.join(", ") : ""} — OK from ${x.label}`).join("\n");
}

export function openParlour(snap) {
  const w = snap.brd.withheld;
  const node = el(html`<div class="parlour" role="dialog" aria-modal="true" aria-label="Parlour sheet">
    <div class="top"><button type="button" class="text-btn" data-done>Done</button><span style="font-weight:700">Parlour sheet</span><button type="button" class="text-btn" data-share>Share</button></div>
    <h2>Milk out of the tank</h2><p class="sub">${w.length} cow${w.length === 1 ? "" : "s"} · updated ${timePart(snap.now)} · sorted by cow number</p>
    <div class="rows">${w.length ? w.map((x) => html`<div class="prow"><span class="pno">${cowLabel(x.cow)}</span><div><div class="pq">${quartersText(x.w.quarters) || "All four"}${x.w.marks?.length ? html`<span style="font-weight:400"> · ${x.w.marks.join(", ")}</span>` : ""}</div><div class="pd">OK from ${x.label}</div>${x.cow.name ? html`<div class="pd" style="color:#56635A">${x.cow.name}</div>` : ""}</div></div>`) : html`<p class="empty-ok">✓ All cows' milk can go in the tank.</p>`}</div>
    <div style="display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #E3E6E0"><button type="button" class="btn secondary" data-print style="background:#fff;color:#1B221D">Print</button>${snap.s.robot ? html`<button type="button" class="btn secondary" data-ams style="background:#fff;color:#1B221D">AMS divert list</button>` : ""}</div>
  </div>`);
  document.body.appendChild(node);
  if (!reduceMotion()) node.animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: 340, easing: "cubic-bezier(.22,1,.36,1)" });
  const shared = () => { if (canWrite(snap.role, "events")) add(snap.lid, "events", { type: "parlourShared", date: snap.today, at: nowStr() }); };
  const close = () => { const a = reduceMotion() ? null : node.animate([{ transform: "none" }, { transform: "translateY(100%)" }], { duration: 240, easing: "cubic-bezier(.4,0,1,1)" }); if (a) a.onfinish = () => node.remove(); else node.remove(); removeEventListener("keydown", esc); };
  const esc = (e) => { if (e.key === "Escape") close(); };
  addEventListener("keydown", esc);
  node.querySelector("[data-done]").onclick = close;
  node.querySelector("[data-share]").onclick = async () => {
    const text = parlourText(snap); shared();
    try { if (navigator.share) { await navigator.share({ title: "Parlour sheet", text }); return; } } catch (e) { if (e.name === "AbortError") return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener"); toast("Opening WhatsApp with the list");
  };
  node.querySelector("[data-print]").onclick = () => { shared(); printDoc({ title: "Milk out of the tank — parlour sheet", top: [["Ledger", snap.ledger.name], ["Updated", nowStr().replace("T", " ")]], headers: ["Cow", "Name", "Quarters", "Marked with", "Milk OK from"], rows: w.map((x) => [cowLabel(x.cow), x.cow.name || "", quartersText(x.w.quarters) || "All four", (x.w.marks || []).join(", "), x.label]), note: "Keep withheld milk out of the tank until the time shown." }); };
  const ams = node.querySelector("[data-ams]");
  if (ams) ams.onclick = () => { download("ams-divert-list.csv", ["cow_number,tag,ok_from", ...w.map((x) => `${cowLabel(x.cow)},${x.cow.tag || ""},${x.okFrom}`)].join("\n"), "text/csv"); shared(); toast("AMS divert list saved — import it in your robot software"); };
  node.querySelector("[data-done]").focus();
  return node;
}
