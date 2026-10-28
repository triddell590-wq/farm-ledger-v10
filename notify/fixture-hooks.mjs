// Node module hook used only by the --dry-run fixtures: the e2e seed files (tests/e2e/*-seed.mjs)
// import app modules as "./js/..." because they run inside the browser page. In Node we point
// those imports at build/app/js so the very same seeds fill the in-memory store.
const APP_JS = new URL("../app/js/", import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("./js/") && context.parentURL && context.parentURL.includes("/tests/e2e/")) {
    return next(APP_JS + specifier.slice(5), context);
  }
  return next(specifier, context);
}
