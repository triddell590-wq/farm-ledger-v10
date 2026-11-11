// "Tools for this" (Tom, 5 Nov): the More → Tools calculators offered on the screens they belong to,
// as well as in More. One map for every sector; the ledger screen adds the strip under the page.
// Beef places its own (sectors/beef/ui.js toolLinks) because its strips sit inside the screens.
// Key = the route after #/l/<lid>/ (or the tab id). Item = [tool, label, icon, money?, href?].
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { canRead } from "../core/policy.js";

const $ = true; // money tools: only for people who can see the money
const MAP = {
  sheep: [
    [/^(flock)?$/, [["flock", "Flock size planner", "people"]]],
    [/^(mobs|mob\/[^/]+)$/, [["dose", "Dose calculator", "syringe"], ["grass", "Ewes per hectare", "map"]]],
    [/^year$/, [["raddle", "Lambing dates from raddle", "today"], ["ram", "Ewes per ram", "sheep"], ["meal", "Late-pregnancy meal planner", "feed"], ["growth", "8-week growth", "scale"], ["draft", "Draft value", "money", $]]],
    [/^year\/tupping$/, [["raddle", "Lambing dates from raddle", "today"], ["ram", "Ewes per ram", "sheep"]]],
    [/^year\/scanning$/, [["meal", "Late-pregnancy meal planner", "feed"]]],
    [/^year\/lambing$/, [["raddle", "Lambing dates from raddle", "today"], ["meal", "Late-pregnancy meal planner", "feed"]]],
    [/^year\/grazing$/, [["grass", "Ewes per hectare", "map"], ["growth", "8-week growth", "scale"]]],
    [/^year\/weaning$/, [["growth", "8-week growth", "scale"], ["draft", "Draft value", "money", $]]],
    [/^worms$/, [["dose", "Dose calculator", "syringe"]]],
    [/^shed$/, [["fym", "Manure storage", "water"], ["meal", "Late-pregnancy meal planner", "feed"]]],
    [/^money$/, [["draft", "Draft value", "money", $], ["flock", "Flock size planner", "people"]]],
  ],
  dairy: [
    [/^(milking)?$/, [["conc", "Concentrate per litre", "feed"]]],
    [/^cows$/, [["cull", "Cull ranking", "grid"], ["sdct", "Selective dry cow therapy list", "water"], ["tape", "Weigh tape", "scale"]]],
    [/^(fertility|fertility\/[a-z]+)$/, [["dates", "Calving, PD and dry-off dates", "birth"]]],
    [/^(milk|milk\/cheques)$/, [["cheque", "Milk cheque check", "money", $], ["mopf", "Margin over purchased feed", "money", $]]],
    [/^milk\/mastitis$/, [["sdct", "Selective dry cow therapy list", "water"]]],
    [/^money$/, [["cheque", "Milk cheque check", "money", $], ["mopf", "Margin over purchased feed", "money", $]]],
    [/^feed$/, [["conc", "Concentrate per litre", "feed"], ["mopf", "Margin over purchased feed", "money", $]]],
    [/^slurry$/, [["slurry", "Slurry storage (22 weeks)", "water"]]],
    [/^calves$/, [["mixing", "Calf mixing sheet", "birth"], ["growth", "Heifer growth", "scale"], ["tape", "Weigh tape", "scale"]]],
    [/^paperwork$/, [["disease", "Report a disease suspicion", "alert"]]],
  ],
  pigs: [
    [/^(rooms|room\/[^/]+)$/, [["space", "Space per pen", "grid"]]],
    [/^(sows|service)$/, [["dates", "Gestation and dates", "today"], ["planner", "Batch farrowing planner", "chart"]]],
    [/^litters$/, [["dates", "Gestation and dates", "today"]]],
    [/^(week)?$/, [["bins", "Feed bins", "feed"]]],
    [/^(batches|batch\/[^/]+)$/, [["margin", "Margin per pig", "money", $], ["cop", "Cost of production", "money", $]]],
    [/^sales$/, [["bins", "Feed bins", "feed"], ["margin", "Margin per pig", "money", $]]],
    [/^(pigs-money|money)$/, [["cop", "Cost of production", "money", $], ["margin", "Margin per pig", "money", $]]],
    [/^(pigs-paperwork|paperwork)$/, [["pcu", "mg/PCU estimate", "syringe", false, "emb"]]],
  ],
  layers: [
    [/^(houses|house\/[^/]+)?$/, [["sheet", "Daily sheet maths", "today"], ["water", "Water alarm", "water"], ["spike", "Mortality spike", "alert"], ["space", "Space check", "house"]]],
    [/^(flock|flock\/[^/]+|curve\/[^/]+)$/, [["uniformity", "Uniformity", "scale"], ["depop", "Depop decision", "truck", $]]],
    [/^samples\/[^/]+\/weights$/, [["uniformity", "Uniformity", "scale"]]],
    [/^(eggs|eggs\/[a-z-]+)$/, [["dozen", "Feed per dozen and margin", "money", $]]],
    [/^(health|health\/mortality)$/, [["spike", "Mortality spike", "alert"]]],
    [/^range(\/biosecurity)?$/, [["dusk", "Pop-hole dusk time", "sun"], ["space", "Space check", "house"]]],
    [/^lighting$/, [["dusk", "Pop-hole dusk time", "sun"]]],
    [/^(layers-money|money)$/, [["dozen", "Feed per dozen and margin", "money", $], ["depop", "Depop decision", "truck", $]]],
  ],
  broilers: [
    [/^(crop)?$/, [["legal", "Legal mortality line", "alert"], ["dates", "Feed-off, FCI and Salmonella dates", "clock"], ["workdays", "Working days counter", "today"]]],
    [/^(growth|growth\/[^/]+|weigh\/[^/]+)$/, [["projection", "Weight projection", "scale"], ["uniformity", "Uniformity", "scale"]]],
    [/^density\/[^/]+$/, [["density", "Density and thin calculator", "chart"]]],
    [/^thin\/[^/]+\/[^/]+$/, [["density", "Density and thin calculator", "chart"], ["dates", "Feed-off, FCI and Salmonella dates", "clock"], ["workdays", "Working days counter", "today"]]],
    [/^(crops|crop-result\/[^/]+)$/, [["epef", "EPEF", "broilers"], ["income", "Income per m² per year", "money", $]]],
    [/^(contract|money)$/, [["payment", "Payment estimate", "money", $], ["energy", "Energy per crop", "fuel", $], ["income", "Income per m² per year", "money", $]]],
    [/^paperwork(\/[a-z]+)?$/, [["workdays", "Working days counter", "today"]]],
  ],
};

/** The tools for a screen: [[tool, label, icon, money, href]] the person may use. */
export function toolsHere(type, where, role) {
  const rows = MAP[type]; if (!rows) return [];
  const hit = rows.find(([re]) => re.test(where || "")); if (!hit) return [];
  if (["viewer", "accountant"].includes(role) && !hit[1].some((t) => t[3])) return [];
  return hit[1].filter((t) => (t[3] ? canRead(role, "finance") : !["accountant"].includes(role)));
}

/** The strip: chips that open each tool; the tool's back link returns here. */
export function toolStrip(lid, where, back, items) {
  if (!items.length) return null;
  const q = `?from=${encodeURIComponent(`/l/${lid}${where ? "/" + where : ""}`)}&back=${encodeURIComponent(back || "Back")}`;
  return el(html`<div class="tool-links"><h2 class="group-label"><span>Tools for this</span></h2><div class="chips">${items.map(([k, label, ic, , href]) => html`<a class="chip" href="#/l/${lid}/${href ? href + q : `tools/${k}${q}`}">${raw(icon(ic || "grid", { size: 18 }))}${label}</a>`)}</div></div>`);
}

/** Back link target for a tool opened from a screen's strip: { href, label } or null. */
export function toolCameFrom(ctx) {
  const q = ctx?.params?.query || {};
  return /^\/l\/[^/]+(\/[A-Za-z0-9/-]*)?$/.test(q.from || "") ? { href: `#${q.from}`, label: q.back || "Back" } : null;
}
