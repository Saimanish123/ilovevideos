// Writes src/app/favicon.ico from src/app/icon.svg (browsers request /favicon.ico on their own, and a
// missing file answered with the HTML 404). Chromium renders the SVG at 16, 32 and 48 px; the ICO
// holds those PNGs as they are, which every current browser reads. Re-run after changing icon.svg:
//   node scripts/make-favicon.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync("src/app/icon.svg", "utf8");
const sizes = [16, 32, 48];
const browser = await chromium.launch();
const pngs = [];
for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  pngs.push(await page.screenshot({ omitBackground: true, type: "png" }));
}
await browser.close();

// ICONDIR (6 bytes), one ICONDIRENTRY (16 bytes) per image, then the PNG data.
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(size, e);
  header.writeUInt8(size, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...pngs]));
console.log(`favicon.ico: ${sizes.join(", ")} px, ${offset} bytes`);
