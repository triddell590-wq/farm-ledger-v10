// The test app is this same build published under /preview/ on the live site (Tom, 4 Nov). It keeps
// its own sign-in and offline data (a separately named Firebase app) so a phone with both installed
// never mixes a test account with the real farm.
export const PREVIEW = typeof location !== "undefined" && /\/preview\//.test(location.pathname);

export function fbApp(firebase, config) {
  const name = PREVIEW ? "preview" : "[DEFAULT]";
  return firebase.apps.find((a) => a.name === name) || firebase.initializeApp(config, name);
}

export function mountPreviewBanner() {
  document.documentElement.classList.add("preview");
  document.title = "Farm Ledger TEST";
  const b = document.createElement("div");
  b.className = "demo-banner"; b.setAttribute("role", "region"); b.setAttribute("aria-label", "Test app");
  b.innerHTML = "<span><b>TEST APP</b> — dummy farms only, not the live app</span>";
  document.body.prepend(b);
}
