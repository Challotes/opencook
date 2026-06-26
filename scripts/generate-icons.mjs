/**
 * Run once to generate PWA icons from icon.svg
 * Usage: node scripts/generate-icons.mjs
 *
 * Requires: npm install -D sharp
 * Or run: npx sharp-cli --input public/icon.svg --output public/icon-192.png --resize 192
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgBuffer = readFileSync(join(root, "public/icon.svg"));

await sharp(svgBuffer).resize(192, 192).png().toFile(join(root, "public/icon-192.png"));
console.log("icon-192.png generated");

await sharp(svgBuffer).resize(512, 512).png().toFile(join(root, "public/icon-512.png"));
console.log("icon-512.png generated");

// favicon.ico (browser tab) — kept in sync with icon.svg here so it's no longer a
// separate manual png-to-ico step. Source the 256px render, let png-to-ico pack it.
const faviconPng = await sharp(svgBuffer).resize(256, 256).png().toBuffer();
const ico = await pngToIco([faviconPng]);
writeFileSync(join(root, "src/app/favicon.ico"), ico);
console.log("src/app/favicon.ico generated");
