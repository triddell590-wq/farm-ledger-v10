// Rasterises app/icons/logo.svg into PWA icons (any + maskable) and apple-touch-icon.
// Run: node build/tools/make-icons.mjs   (uses the sharp package available in the build sandbox)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/opt/npm-tools/node_modules/");
const sharp = require("sharp");
const dir = new URL("../app/icons/", import.meta.url).pathname;
const logo = readFileSync(dir + "logo.svg", "utf8");
// Maskable: tile fills the whole square (no radius), artwork scaled to 80% in the centre.
const inner = logo.replace(/<\?xml[^>]*>/, "").replace(/<title>.*?<\/title>/, "").replace('<rect width="64" height="64" rx="15" fill="#2F5D3A"/>', "")
  .replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2F5D3A"/><g transform="translate(6.4 6.4) scale(.8)">${inner}</g></svg>`;
const out = [
  [logo, 192, "icon-192.png"], [logo, 512, "icon-512.png"], [logo, 32, "favicon-32.png"],
  [maskable, 192, "maskable-192.png"], [maskable, 512, "maskable-512.png"], [maskable, 180, "apple-touch-icon.png"],
];
for (const [svg, size, name] of out) await sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toFile(dir + name);
console.log("icons written:", out.map((o) => o[2]).join(", "));
