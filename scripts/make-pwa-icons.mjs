// Writes the installed app's icons into public/icons/ from the same mark as src/app/icon.svg (ADR-0102):
// 192 and 512 px with the rounded square, and a 512 px maskable icon whose play symbol sits inside
// the central 80 % safe zone on a full-bleed ink square (launchers crop it to their own shape).
// Chromium renders them, as for the favicon. Re-run after changing the mark:
//   node scripts/make-pwa-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const mark = readFileSync("src/app/icon.svg", "utf8");
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="oklch(22% 0.02 165)"/><path d="M13.6 11.6v8.8l7.2-4.4z" fill="oklch(100% 0 0)"/></svg>`;
const jobs = [
  { file: "icon-192.png", size: 192, svg: mark },
  { file: "icon-512.png", size: 512, svg: mark },
  { file: "icon-maskable-512.png", size: 512, svg: maskable },
];
mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch();
for (const { file, size, svg } of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  writeFileSync(
    `public/icons/${file}`,
    await page.screenshot({ omitBackground: true, type: "png" }),
  );
}
await browser.close();
console.log(`icons: ${jobs.map((j) => j.file).join(", ")}`);
