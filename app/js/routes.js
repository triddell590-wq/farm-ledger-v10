// Route table and the sign-in guard (design/01 §0 map).
import { define } from "./core/router.js";
import { auth } from "./core/auth.js";
import { session } from "./services/session.js";
import { REMEMBER_PLACE_MS } from "./config.js";

const S = (name) => () => import(`./screens/${name}.js`);

export function defineRoutes() {
  define(/^\/welcome$/, S("welcome"));
  define(/^\/verify$/, S("verify"));
  define(/^\/onboard\/(?<step>[123])$/, S("onboard"));
  define(/^\/add-ledger(?:\/(?<step>numbers))?$/, S("onboard"));
  define(/^\/farm\/(?<tab>today|money|map|people|more)$/, S("overview"));
  define(/^\/farm\/(?<kind>medicines|documents|contacts)$/, S("farm-records"));
  define(/^\/farm\/photos$/, S("photos"));
  define(/^\/l\/(?<lid>[^/]+)\/more\/people$/, S("people"));
  define(/^\/l\/(?<lid>[^/]+)\/more\/settings$/, S("ledger-settings"));
  define(/^\/l\/(?<lid>[^/]+)\/more\/photos$/, S("photos"));
  define(/^\/l\/(?<lid>[^/]+)(?:\/(?<rest>.*))?$/, S("ledger"));
  define(/^\/invite\/(?<code>[A-Za-z0-9-]+)$/, S("invite"));
  define(/^\/settings$/, S("settings"));
  define(/^\/settings\/(?<page>profile|farm|appearance|units|tax|reminders|storage|ledgers)$/, S("settings-page"));
  define(/^\/settings\/notifications$/, S("notify-settings"));
  define(/^\/notifications$/, S("notify-centre"));
  define(/^\/settings\/data$/, S("export"));
  define(/^\/settings\/delete$/, S("delete-account"));
  define(/^\/legal\/(?<doc>privacy|terms)$/, S("legal"));
  define(/^\/deleted$/, S("deleted"));
  define(/^\/help$/, S("help"));
  define(/^\/404$/, S("not-found"));
}

const PUBLIC = /^\/(welcome|invite\/|legal\/|deleted|404)/;
const NO_LEDGER_OK = /^\/(onboard|verify|invite|legal|settings|deleted|add-ledger|help|404)/;

export function homePath() {
  if (!session.ledgers.length) return "/onboard/1";
  const last = session.lastPlace(REMEMBER_PLACE_MS);
  if (last && !/^\/(welcome|onboard|verify|invite|deleted)/.test(last)) {
    const m = /^\/l\/([^/?]+)/.exec(last);
    if (!m || session.ledger(m[1])) return last;
  }
  return "/farm/today";
}

export async function guard(path) {
  const p = path.split("?")[0];
  if (!auth.user) return PUBLIC.test(p) ? null : "/welcome";
  if (!session.loaded) await session.load();
  if (p === "/" || p === "" || p === "/welcome") return homePath();
  if (!session.ledgers.length && !NO_LEDGER_OK.test(p)) return "/onboard/1";
  return null;
}
