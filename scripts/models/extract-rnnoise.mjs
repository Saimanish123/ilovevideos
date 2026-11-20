// Reproduces public/models/rnnoise/rnnoise-0.2.wasm (ADR-0108). Dev-only; nothing here ships.
//
// The WebAssembly module of RNNoise 0.2 is inlined (base64) in `dist/rnnoise-sync.js` of the npm
// package @jitsi/rnnoise-wasm 0.2.1 (Apache-2.0 wrapper; RNNoise itself BSD-3-Clause). This writes it
// out byte for byte and checks the SHA-256 the site expects, so the minified export names our loader
// relies on (src/tools/engines/sound/dsp/rnnoise.ts) are the ones in that build.
//
//   npm pack @jitsi/rnnoise-wasm@0.2.1 && tar xzf jitsi-rnnoise-wasm-0.2.1.tgz
//   node scripts/models/extract-rnnoise.mjs package/dist/rnnoise-sync.js public/models/rnnoise/rnnoise-0.2.wasm
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const EXPECTED = "4f513a50613de74378331237886138eab52fa2650e8b1a41eb587d932d9b8850";
const [from, to] = process.argv.slice(2);
if (!from || !to) throw new Error("usage: extract-rnnoise.mjs <rnnoise-sync.js> <out.wasm>");
const m = readFileSync(from, "utf8").match(
  /data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/,
);
if (!m?.[1]) throw new Error("No inlined WebAssembly module found.");
const bytes = Buffer.from(m[1], "base64");
const hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== EXPECTED) throw new Error(`Unexpected module: sha256 ${hash}`);
writeFileSync(to, bytes);
console.log(`extract-rnnoise: ${bytes.length} bytes, sha256 ${hash} → ${to}`);
