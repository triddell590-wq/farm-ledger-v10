// Controller import (design/15 §4: Maximus etc.). Paste or open the controller's CSV export; the
// app reads date, time, temperature, humidity, NH₃, CO₂, water and feed by column name and keeps
// them as readings. The next AM/PM check for that house pre-fills from them with a "from
// controller" label — the grower still confirms deaths and culls.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { toast } from "../../../ui/toast.js";
import { addRecord } from "../../../services/records.js";
import { entrySheet, chipsField, lawNote } from "./common.js";
import { me } from "../actions.js";

const COLS = { date: /^date|datum/i, time: /^time|tijd/i, tempC: /temp/i, rh: /hum|rh/i, nh3: /nh3|ammon/i, co2: /co2/i, waterL: /water/i, feedKg: /feed/i };
const toIso = (s) => { const m = String(s).match(/(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/); if (!m) return null; let [, a, b, c] = m; if (a.length === 4) return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`; if (c.length === 2) c = `20${c}`; return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`; };
/** Parse a controller CSV (comma, semicolon or tab separated, with a header row). */
export function parseController(text) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim()); if (lines.length < 2) return [];
  const sep = [";", "\t", ","].find((c) => lines[0].includes(c)) || ",";
  const head = lines[0].split(sep).map((h) => h.trim());
  const idx = {}; for (const [k, re] of Object.entries(COLS)) { const i = head.findIndex((h) => re.test(h)); if (i >= 0) idx[k] = i; }
  if (idx.date == null) return [];
  return lines.slice(1).map((l) => { const c = l.split(sep).map((x) => x.trim()); const r = { date: toIso(c[idx.date]), time: idx.time != null ? (c[idx.time] || "").slice(0, 5) : "" };
    for (const k of ["tempC", "rh", "nh3", "co2", "waterL", "feedKg"]) if (idx[k] != null && c[idx[k]] !== "" && !Number.isNaN(+String(c[idx[k]]).replace(",", "."))) r[k] = +String(c[idx[k]]).replace(",", ".");
    return r; }).filter((r) => r.date);
}
export function controllerFlow(snap) {
  if (!snap.ix.houses.length) { toast("Add a house first."); return; }
  const body = el(html`<form novalidate>
    <div class="form-group">${chipsField("houseId", "House", snap.ix.houses.map((h) => [h.id, h.name]), snap.ix.houses[0].id)}
      <div class="field stacked"><label>Paste the controller export (CSV with a header row)</label><textarea name="csv" rows="7" placeholder="Date;Time;Temp;Humidity;NH3;CO2;Water;Feed"></textarea></div>
      <div class="field"><label>Or open the file</label><input type="file" accept=".csv,.txt" data-file></div></div>
    <div class="br-sum" data-sum>Columns are found by name: date, time, temperature, humidity, NH₃, CO₂, water, feed.</div>
    ${lawNote("Readings pre-fill the AM/PM check for that house and day. Deaths and culls are always counted by you.")}
  </form>`);
  const es = entrySheet({ title: "Controller import", body, label: "Import readings", size: "large",
    missing: (v) => (!v.houseId ? "Choose the house" : !parseController(v.csv).length ? "Paste the export to import" : null),
    save(v, sh) { const rows = parseController(v.csv); for (const r of rows) addRecord(snap.lid, "controllerReadings", { ...r, houseId: v.houseId, source: "controller", byName: me() }); sh.close(true, { force: true }); toast(`${rows.length} reading${rows.length === 1 ? "" : "s"} imported`); } });
  const paint = () => { const rows = parseController(es.form.values().csv); if (rows.length) body.querySelector("[data-sum]").textContent = `${rows.length} row${rows.length === 1 ? "" : "s"} found · ${rows[0].date}${rows.length > 1 ? ` to ${rows[rows.length - 1].date}` : ""} · ${Object.keys(rows[0]).filter((k) => !["date", "time"].includes(k)).join(", ") || "no readings"}`; };
  body.querySelector("[data-file]").onchange = async (e) => { const f = e.target.files?.[0]; if (!f) return; body.querySelector("[name=csv]").value = await f.text(); paint(); es.refresh(); };
  es.form.onChange(paint);
  return es.sheet.done;
}
