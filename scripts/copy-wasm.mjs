// Copies the ffmpeg.wasm multithreaded core from node_modules into public/wasm so it is served
// from our origin (privacy: no third-party requests; COEP: same-origin CORP). Runs on postinstall.
// The files are ~32 MB and are not committed; CI runs this before `next build`.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@ffmpeg/core-mt/dist/esm");
const version = JSON.parse(
  readFileSync(join(root, "node_modules/@ffmpeg/core-mt/package.json"), "utf8"),
).version;
const dest = join(root, "public/wasm/ffmpeg", version);
if (!existsSync(src)) {
  console.error("copy-wasm: @ffmpeg/core-mt is not installed");
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const f of ["ffmpeg-core.js", "ffmpeg-core.wasm", "ffmpeg-core.worker.js"]) {
  copyFileSync(join(src, f), join(dest, f));
}
// The @ffmpeg/ffmpeg class library is served from our origin too and imported at runtime, because
// bundlers cannot statically analyse its `new Worker(new URL(...))` (Turbopack: "too dynamic").
const libSrc = join(root, "node_modules/@ffmpeg/ffmpeg/dist/esm");
const libVersion = JSON.parse(
  readFileSync(join(root, "node_modules/@ffmpeg/ffmpeg/package.json"), "utf8"),
).version;
const libDest = join(root, "public/wasm/ffmpeg/lib", libVersion);
mkdirSync(libDest, { recursive: true });
for (const f of readdirSync(libSrc).filter((n) => n.endsWith(".js") || n.endsWith(".mjs"))) {
  copyFileSync(join(libSrc, f), join(libDest, f));
}
// Geist Sans (SIL Open Font License 1.1, already a dependency) for burned-in subtitles: libass in the
// ffmpeg core has no fontconfig, so it only draws with fonts handed to it through `fontsdir`, and the
// canvas renderer uses the same files so both paths look alike. The OFL travels with the fonts.
const fontSrc = join(root, "node_modules/geist/dist/fonts/geist-sans");
const fontDest = join(root, "public/wasm/fonts");
mkdirSync(fontDest, { recursive: true });
for (const f of [
  "Geist-Regular.ttf",
  "Geist-Bold.ttf",
  "Geist-Italic.ttf",
  "Geist-BoldItalic.ttf",
]) {
  copyFileSync(join(fontSrc, f), join(fontDest, f));
}
copyFileSync(join(root, "node_modules/geist/LICENSE.txt"), join(fontDest, "OFL.txt"));
console.log(
  `copy-wasm: ffmpeg core ${version} → public/wasm/ffmpeg/${version}; class lib ${libVersion} → public/wasm/ffmpeg/lib/${libVersion}`,
);
