// Playwright harness for node:test: static server for build/app, pages on the in-memory backend,
// console-error capture, small helpers for the common flows. Never touches Firebase.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export const APP = fileURLToPath(new URL("../../app/", import.meta.url));
export const SCREENS = fileURLToPath(new URL("../../screens/", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain" };

async function loadPlaywright() {
  try { return await import("playwright"); } catch (e) { return await import("/opt/npm-tools/node_modules/playwright/index.mjs"); }
}
export async function startServer() {
  const srv = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const file = normalize(join(APP, p)); if (!file.startsWith(APP)) throw new Error("outside");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" }); res.end(body);
    } catch (e) { res.writeHead(404); res.end("not found"); }
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { url: `http://localhost:${srv.address().port}/`, close: () => new Promise((r) => srv.close(r)) };
}

export async function setup() {
  const pw = await loadPlaywright();
  const browser = await pw.chromium.launch();
  const server = await startServer();
  return { browser, server, close: async () => { await browser.close(); await server.close(); } };
}

/** New phone-sized page on the memory backend. opts: { dark, reduced, hash, query, offline } */
export async function phone(env, { dark = false, reduced = false, hash = "/welcome", query = "", verified = false, context } = {}) {
  const ctx = context || await env.browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: dark ? "dark" : "light", reducedMotion: reduced ? "reduce" : "no-preference", hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  await page.goto(`${env.server.url}index.html?backend=memory&sw=0${verified ? "&verified=1" : ""}${query}#${hash}`);
  await page.waitForFunction(() => !document.getElementById("splash"), null, { timeout: 8000 });
  page.ctx = ctx;
  return page;
}
export const settle = (page, ms = 450) => page.waitForTimeout(ms);
export async function go(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await settle(page, 600); }

export async function signUp(page, { name = "Tom Riddell", email = "tom@example.com", password = "three wet ewes" } = {}) {
  await page.getByRole("button", { name: "Create an account" }).first().click();
  await settle(page);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("checkbox", { name: /I agree/ }).click();
  await page.locator(".sheet .sheet-foot .btn").click();
  await settle(page, 700);
}
/** Onboard a farm with the given sector types (sector keys). */
export async function onboard(page, { farmName = "Drumlin Farm", types = ["beef"], numbers = {} } = {}) {
  if (!(await page.evaluate(() => location.hash)).startsWith("#/onboard/1")) await go(page, "/onboard/1");
  await page.getByLabel("Farm name").fill(farmName);
  await page.getByRole("button", { name: "Continue" }).click(); await settle(page, 600);
  for (const t of types) await page.locator(`.type-tile[data-type=${t}]`).click();
  await page.locator("[data-next]").click(); await settle(page, 600);
  for (const [k, v] of Object.entries(numbers)) await page.locator(`[name="${k}"]`).fill(String(v));
  await page.locator("[data-finish]").click();
  await page.waitForFunction(() => location.hash.startsWith("#/farm/today"), null, { timeout: 5000 });
  await settle(page, 700);
}
export async function shot(page, name) {
  await settle(page, 500);
  await page.screenshot({ path: SCREENS + name + ".png" });
}
/** Seed users straight into the memory auth (test hook). */
export async function addUser(page, email, password, name, verified = true) {
  return page.evaluate(([e, p, n, v]) => window.__fl.auth.addUser(e, p, n, undefined, v), [email, password, name, verified]);
}
