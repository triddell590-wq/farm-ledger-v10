// Download my data (design/01 §11.1, review A #10): pick herds/flocks, money, people & history.
// "Records for inspection or your accountant" = readable CSVs per register (services/
// readable-export.js) in a zip, or the same as a printable page; "Full backup" = everything
// exactly as stored, as JSON (UK GDPR portability).
// Only what the person may see under their role is included. Needs a confirmed email.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { auth } from "../core/auth.js";
import { session } from "../services/session.js";
import { exportLedger, jsonText, photoFiles } from "../services/export.js";
import { chipGroup, checkRow, radioGroup, wireForm, guardButton, fieldError } from "../ui/form.js";
import { readableFiles, readMe, readable } from "../services/readable-export.js";
import { makeLookup, fieldsOf, recordTitle, collHeading } from "../content/record-kinds.js";
import { makeZip } from "../ui/zip.js";
import { download } from "../ui/download.js";
import { toast } from "../ui/toast.js";
import { esc } from "../core/html.js";
import { META } from "../sectors/meta.js";
import { resendVerification } from "./verify.js";
import { makeScreen, largeTitle, backLink, farmTabs } from "./common.js";

const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const folderOf = (x) => (x.ledger.type === "farm" ? "Whole farm" : String(x.ledger.name || x.ledger.type).replace(/[\\/:*?"<>|]+/g, " ").trim());

export default async function exportScreen() {
  const u = auth.user; const ledgers = session.ledgers;
  const body = el(html`<div>${backLink("#/settings", "Settings")}${largeTitle("Download my data", "Choose what to download.")}<div data-out></div></div>`);
  const out = body.querySelector("[data-out]");
  if (!u.emailVerified) {
    out.append(el(html`<div><div class="info-card">${raw(icon("mail"))}<span>Confirm your email first, so only you can download your records.</span></div><div class="section"><button type="button" class="btn" data-r>Send the link again</button></div></div>`));
    out.querySelector("[data-r]").onclick = async () => { try { await resendVerification(); toast("Sent. Check your spam folder too."); } catch (e) { toast(e.friendly || "Couldn't send"); } };
  } else {
    const sect = ledgers.filter((l) => l.type !== "farm");
    out.append(el(html`<form novalidate>
      <div class="card pad">${chipGroup("ledgers", sect.map((l) => ({ value: l.id, label: l.name, sector: l.type })), sect.map((l) => l.id))}</div>
      <div class="form-group" style="margin-top:16px">${checkRow("money", "Money (whole farm)", true)}${checkRow("people", "People and history", true)}</div>
      <h2 class="group-label" style="margin-top:24px">What for?</h2>
      ${radioGroup("format", [
        { value: "csv", label: "Records for inspection or your accountant", help: "Spreadsheets, one per register: plain headings, names not codes, dates as 02/11/2026, money in £." },
        { value: "pdf", label: "Printable records", help: "The same registers as a page to print or save as PDF." },
        { value: "json", label: "Full backup", help: "Everything exactly as stored, in one file (JSON) — for moving to another app, not for reading." },
      ], "csv")}
      <div data-err></div>
      <div class="section"><button type="button" class="btn" data-go>Download</button></div></form>`));
    const f = wireForm(out); const btn = out.querySelector("[data-go]");
    const miss = () => { const v = f.values(); return v.ledgers.length || v.money ? null : "Pick something to download"; };
    f.onChange(() => guardButton(btn, "Download", miss)); guardButton(btn, "Download", miss);
    btn.onclick = async () => {
      if (!navigator.onLine) { out.querySelector("[data-err]").replaceChildren(el(fieldError("Downloading needs a signal, so it includes everything on the farm's online copy."))); return; }
      const v = f.values(); btn.disabled = true; btn.textContent = "Getting your records…";
      try {
        const chosen = ledgers.filter((l) => v.ledgers.includes(l.id) || (v.money && l.type === "farm"));
        const data = [];
        for (const l of chosen) {
          const x = await exportLedger(l);
          if (!v.money) { delete x.collections.finance; if (Array.isArray(x.collections.photos)) x.collections.photos = x.collections.photos.filter((p) => !p.money); }
          if (!v.people) { x.members = []; Object.values(x.collections).forEach((list) => Array.isArray(list) && list.forEach((r) => delete r.history)); }
          data.push(x);
        }
        const day = new Date().toISOString().slice(0, 10);
        if (v.format === "json") for (const x of data) for (const f of await photoFiles(x)) f.photo.image = `data:image/jpeg;base64,${b64(f.bytes)}`;
        if (v.format === "json") download(`farm-ledger-${day}.json`, jsonText({ exportedAt: new Date().toISOString(), app: "Farm Ledger 10", account: { email: u.email, displayName: u.displayName }, profile: session.profile, ledgers: data }), "application/json");
        else if (v.format === "csv") {
          const files = [];
          for (const x of data) files.push(...readableFiles(x, folderOf(x)));
          for (const x of data) for (const f of await photoFiles(x)) files.push({ name: `${folderOf(x)}/${f.name}`, bytes: f.bytes });
          if (files.length) files.unshift({ name: "Read me.txt", text: readMe(session.farm()?.farmName, day) });
          if (!files.length) { toast("Nothing to download yet"); return; }
          const blob = makeZip(files); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `farm-ledger-${day}.zip`; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 500);
        } else printable(data);
        toast("Download ready");
      } catch (e) { console.error(e); out.querySelector("[data-err]").replaceChildren(el(fieldError("Couldn't make the download. Try again."))); }
      finally { guardButton(btn, "Download", miss); }
    };
  }
  return makeScreen({ body, title: "Download my data", area: "farm", tab: "more", depth: 2, chrome: { tabs: farmTabs(), tab: "more" } });
}

function printable(data) {
  const day = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  // the same readable registers as the spreadsheets: labels, names, dd/mm/yyyy, £
  const tables = data.map((x) => {
    const all = {}; for (const [c, l] of Object.entries(x.collections)) if (Array.isArray(l)) all[c] = l;
    const L = makeLookup(x.ledger.type, all); const name = x.ledger.type === "farm" ? "Whole farm" : x.ledger.name;
    return Object.entries(all).filter(([c, l]) => !["photos", "tasks", "imports", "events"].includes(c) && l.some((r) => !r.deleted)).map(([c, list]) => {
      const rows = list.filter((r) => !r.deleted && !(c === "finance" && r.kind === "prices"));
      if (!rows.length) return "";
      const keys = []; const labels = new Map();
      for (const r of rows) for (const f of fieldsOf(x.ledger.type, c, r, L)) if (!labels.has(f.key)) { keys.push(f.key); labels.set(f.key, f.label); }
      const ks = keys.slice(0, 11);
      return `<h2>${esc(name)} — ${esc(collHeading(c))}</h2><table><tr><th>Record</th>${ks.map((k) => `<th>${esc(labels.get(k))}</th>`).join("")}</tr>${rows.map((r) => `<tr><td>${esc(recordTitle(x.ledger.type, c, r, L))}</td>${ks.map((k) => `<td>${esc(readable(k, r[k], L))}</td>`).join("")}</tr>`).join("")}</table>`;
    }).join("");
  }).join("");
  const w = window.open("", "_blank");
  if (!w) { toast("Allow pop-ups to open the printable page"); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Farm Ledger records</title><style>body{font:13px/1.35 system-ui,sans-serif;margin:16px}table{border-collapse:collapse;width:100%;margin-bottom:16px}th,td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eee}h1{font-size:18px}h2{font-size:15px;margin-top:20px}@page{size:A4 landscape;margin:12mm}</style><h1>${esc(session.farm()?.farmName || "Farm")} — records</h1>${tables}<p>Printed from Farm Ledger on ${day}</p><script>print()<\/script>`);
  w.document.close();
}
export { META };
