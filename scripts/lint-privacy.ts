/**
 * Enforces README.md#privacy-and-processing §2: no network call may touch user data in engine
 * or worker code. Banned: fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource, importScripts
 * with a remote URL. The only exception is loading our own static WASM/model assets, which must be
 * marked on the same line with `// privacy-allow: <reason>` and live under src/tools/workers/.
 */
import { globSync, readFileSync } from "node:fs";

const banned: Array<[RegExp, string]> = [
  [/\bfetch\s*\(/, "fetch()"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bsendBeacon\s*\(/, "navigator.sendBeacon()"],
  [/\bnew\s+WebSocket\s*\(/, "WebSocket"],
  [/\bnew\s+EventSource\s*\(/, "EventSource"],
  [/\bimportScripts\s*\(\s*["'`]https?:/, "remote importScripts()"],
  [/["'`]https?:\/\/(?!localhost)/, "absolute remote URL"],
];

const files = [
  ...globSync("src/tools/engines/**/*.{ts,tsx}"),
  ...globSync("src/tools/workers/**/*.{ts,tsx}"),
].filter((f) => !/\.(test|spec)\.tsx?$/.test(f));

let failed = false;
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    const t = line.trimStart();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    for (const [rx, label] of banned) {
      if (!rx.test(line)) continue;
      const allowed = /\/\/\s*privacy-allow:\s*\S/.test(line) && f.startsWith("src/tools/workers/");
      if (allowed) continue;
      failed = true;
      console.error(`✗ ${f}:${i + 1}: ${label} is not allowed in engine/worker code`);
    }
  });
}
console.log(failed ? "Privacy lint failed" : `✓ privacy lint passed (${files.length} files)`);
process.exit(failed ? 1 : 0);
