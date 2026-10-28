import { html } from "../core/html.js";
import { el } from "../ui/dom.js";
import { auth } from "../core/auth.js";
import { makeScreen, largeTitle, emptyState } from "./common.js";
export default async function notFound() {
  const body = el(html`<div style="padding-top:24px">${largeTitle("Page not found")}${emptyState({ iconName: "map", title: "That page doesn't exist", body: "The link may be old or typed wrong.", action: "Go to your farm", href: "#/" })}</div>`);
  return makeScreen({ body, title: "Not found", area: auth.user ? "farm" : "auth", depth: 1, chrome: { rail: !!auth.user } });
}
