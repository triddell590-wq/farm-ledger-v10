// Simple dated logs that share one list + entry screen (design/14 §8, §9.1): alarm tests,
// visitors, rodent control, feed deliveries, bird movements, vet health plan, manure, housing
// periods, biosecurity checks. Field kinds: date, time, text, number, chips(options), house, check.
import { AI_CHECKS } from "./content.js";

export const LOGS = {
  alarm: { coll: "alarmTests", title: "Alarm tests", one: "alarm test", sub: "Ventilation alarm and generator, at least every 7 days (legal)", legal: true,
    fields: [["date", "Date", "date"], ["houseId", "House", "house", { all: true }], ["what", "Tested", "chips", { options: ["Alarm", "Alarm and generator", "Generator"], value: "Alarm" }], ["result", "Result", "chips", { options: ["Working", "Fault found"], value: "Working" }], ["action", "Action taken", "text", { optional: true }]],
    cols: [["Date", "date"], ["House", "house"], ["Tested", "what"], ["Result", "result"], ["Action", "action"], ["By", "byName"]] },
  visitors: { coll: "visitors", title: "Visitors", one: "visitor", sub: "Poultry unit visitor log (Lion; AI biosecurity)",
    fields: [["date", "Date", "date"], ["name", "Name", "text"], ["company", "Company", "text", { optional: true }], ["reason", "Reason", "text"], ["timeIn", "Time in", "time"], ["lastPoultry", "Last contact with other poultry", "chips", { options: ["Over 72 hours", "Within 72 hours", "Never"], value: "Over 72 hours" }], ["disinfected", "Boots and vehicle disinfected", "check"]],
    cols: [["Date", "date"], ["Name", "name"], ["Company", "company"], ["Reason", "reason"], ["In", "timeIn"], ["Other poultry", "lastPoultry"], ["Disinfected", "disinfected"]] },
  rodent: { coll: "rodentVisits", title: "Rodent control", one: "rodent visit", sub: "Qualified controller's visits and site risk assessment (Lion)",
    fields: [["date", "Date", "date"], ["controller", "Controller", "text"], ["findings", "Findings", "chips", { options: ["No activity", "Some activity", "Heavy activity"], value: "No activity" }], ["report", "Report reference", "text", { optional: true }]],
    cols: [["Date", "date"], ["Controller", "controller"], ["Findings", "findings"], ["Report", "report"]] },
  feed: { coll: "feedDeliveries", title: "Feed deliveries", one: "feed delivery", sub: "UFAS feed, tickets and retained samples (Lion)",
    fields: [["date", "Date", "date"], ["houseId", "Into the bin for", "house"], ["kg", "Kilograms delivered", "number"], ["mill", "Mill", "text", { optional: true }], ["ration", "Ration", "text", { optional: true, placeholder: "Layers phase 2" }], ["ticket", "Ticket no.", "text", { optional: true }], ["ufas", "UFAS-assured feed", "check", { value: true }], ["sample", "Sample retained", "check", { value: true }]],
    cols: [["Date", "date"], ["House", "house"], ["kg", "kg"], ["Mill", "mill"], ["Ration", "ration"], ["Ticket", "ticket"], ["UFAS", "ufas"], ["Sample kept", "sample"]] },
  moves: { coll: "birdMoves", title: "Bird movements", one: "movement", sub: "Pullets in, spent hens out, any other moves",
    fields: [["date", "Date", "date"], ["houseId", "House", "house"], ["direction", "Direction", "chips", { options: [["in", "Into the house"], ["out", "Out of the house"]], value: "out" }], ["n", "Number of birds", "number"], ["kind", "What", "chips", { options: [["other", "Other"], ["spent", "Spent hens"], ["pullets", "Pullets"]], value: "other" }], ["est", "From / to establishment no.", "text", { optional: true }], ["fci", "Food chain information sent (Salmonella result)", "check"]],
    cols: [["Date", "date"], ["House", "house"], ["In/out", "direction"], ["Birds", "n"], ["What", "kind"], ["Establishment", "est"], ["FCI", "fci"]] },
  healthPlan: { coll: "healthPlans", title: "Vet health and welfare plan", one: "plan review", sub: "Per flock, reviewed every year with your vet (Lion)",
    fields: [["date", "Date reviewed", "date"], ["houseId", "House", "house", { all: true }], ["vet", "Vet", "text"], ["next", "Next review", "date", { optional: true }], ["note", "Notes", "text", { optional: true }]],
    cols: [["Reviewed", "date"], ["House", "house"], ["Vet", "vet"], ["Next review", "next"], ["Notes", "note"]] },
  manure: { coll: "manure", title: "Manure and litter", one: "manure export", sub: "Tonnes out, where to, form reference (farm N & P balance)",
    fields: [["date", "Date", "date"], ["houseId", "House", "house", { all: true }], ["tonnes", "Tonnes", "number"], ["destination", "Destination", "chips", { options: ["Own land", "AD plant", "Mushroom compost", "Export to another farm"], value: "Own land" }], ["ref", "Form / docket ref", "text", { optional: true }], ["heapCovered", "Field heap covered within 24 hours", "check"]],
    cols: [["Date", "date"], ["House", "house"], ["Tonnes", "tonnes"], ["Destination", "destination"], ["Ref", "ref"], ["Heap covered", "heapCovered"]] },
  housing: { coll: "housing", title: "Housing periods", one: "housing period", sub: "When birds were kept in, and why",
    fields: [["from", "From", "date"], ["to", "To", "date", { optional: true }], ["houseId", "House", "house", { all: true }], ["reason", "Reason", "chips", { options: ["AI housing order", "Weather", "Vet advice", "Other"], value: "AI housing order" }]],
    cols: [["From", "from"], ["To", "to"], ["House", "house"], ["Reason", "reason"]] },
  biosecurity: { coll: "biosecurity", title: "Biosecurity checks", one: "biosecurity check", sub: "Daily while a housing order or AIPZ is in force",
    fields: [["date", "Date", "date"], ...AI_CHECKS.map((c, i) => [`c${i}`, c, "check", { value: true }]), ["note", "Notes", "text", { optional: true }]],
    cols: [["Date", "date"], ...AI_CHECKS.map((c, i) => [c, `c${i}`]), ["By", "byName"]] },
};

/** Row cells for a print/CSV table. houseName(id) maps house ids. */
export function logRows(kind, list, houseName) {
  const L = LOGS[kind];
  return [...list].sort((a, b) => String(b.date || b.from).localeCompare(String(a.date || a.from))).map((r) => L.cols.map(([, k]) => {
    if (k === "house") return r.houseId ? houseName(r.houseId) : "All houses";
    const v = r[k]; if (v === true) return "Yes"; if (v === false) return "No"; return v == null ? "" : String(v);
  }));
}
