// Draws the still pictures the region and layer fixtures are built from (text plates, a sticker,
// a background), with Playwright's Chromium, because the local ffmpeg has no text renderer.
// Run by scripts/make-fixtures.sh; writes PNGs into tests/fixtures/overlay/. Never used in production.
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = "tests/fixtures/overlay";
const browser = await chromium.launch();
const page = await browser.newPage();
const draw = async (name, w, h, fn) => {
  const data = await page.evaluate(
    ({ w, h, src }) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      new Function("g", "w", "h", src)(g, w, h);
      return c.toDataURL("image/png").split(",")[1];
    },
    { w, h, src: fn },
  );
  writeFileSync(`${out}/${name}`, Buffer.from(data, "base64"));
};
// Number plates: black text on white, 220×64, the same size and weight, different letters.
for (const [name, text] of [
  ["plate-a.png", "KD52 XRW"],
  ["plate-b.png", "MT18 PLA"],
]) {
  await draw(
    name,
    220,
    64,
    `g.fillStyle="#f4f4f0";g.fillRect(0,0,w,h);g.strokeStyle="#222";g.lineWidth=3;g.strokeRect(1.5,1.5,w-3,h-3);
     g.fillStyle="#111";g.font="bold 40px Helvetica, Arial, sans-serif";g.textAlign="center";g.textBaseline="middle";
     g.fillText(${JSON.stringify(text)}, w/2, h/2+2);`,
  );
}
// A sticker with transparency: a dark ring with a light centre, 120×120.
await draw(
  "sticker.png",
  120,
  120,
  `g.clearRect(0,0,w,h);g.beginPath();g.arc(60,60,54,0,Math.PI*2);g.fillStyle="#101010";g.fill();
   g.beginPath();g.arc(60,60,30,0,Math.PI*2);g.fillStyle="#f0f0f0";g.fill();`,
);
await browser.close();
