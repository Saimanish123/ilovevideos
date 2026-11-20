/**
 * Writes the browser support matrix into README.md#feature-catalog ("Browser support"), between the
 * capability-matrix markers, from the facts tests/e2e/capabilities.spec.ts measured
 * (src/lib/browser-support/measured/*.json), the engines' needs (src/lib/browser-support/needs.ts)
 * and the documented Firefox data (scripts/capability-matrix-data.ts). ADR-0145.
 *
 *   E2E_PORT=3418 CAPABILITIES_OUT=1 pnpm exec playwright test tests/e2e/capabilities.spec.ts
 *   pnpm tsx scripts/capability-matrix.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  engineNeeds,
  type Need,
  needIds,
  provides,
  verdictFor,
} from "../src/lib/browser-support/needs";
import type { SupportFacts } from "../src/lib/browser-support/probe";
import { CANIUSE_LITE, engineNote, firefoxDocumented, needLabel } from "./capability-matrix-data";

interface Measured {
  project: string;
  browser: string;
  measured: string;
  window: SupportFacts;
  worker: SupportFacts;
}

const projects = [
  ["chromium", "Chromium (desktop)"],
  ["mobile-chrome", "Chrome, Pixel 7 emulation"],
  ["mobile-safari", "Safari, iPhone 14 emulation"],
] as const;

const dir = "src/lib/browser-support/measured";
const measured = projects
  .map(([id, label]) => {
    const path = `${dir}/${id}.json`;
    return existsSync(path)
      ? { label, data: JSON.parse(readFileSync(path, "utf8")) as Measured }
      : undefined;
  })
  .filter((m): m is { label: (typeof projects)[number][1]; data: Measured } => !!m);

const yes = (b: boolean) => (b ? "yes" : "no");
const cell = (need: Need, m: Measured): string => {
  const w = m.worker;
  if (need === "h264-encode") {
    if (w.encode.avc === "yes") return "yes";
    if (w.encodeAvcBaseline === "yes")
      return `Baseline only (High ${w.encode.avc === "config" ? "stalls" : "refused"})`;
    return w.encode.avc === "config" ? "stalls" : "no";
  }
  return yes(provides(need, w, m.window));
};

const lines: string[] = [];
lines.push(
  `Measured with \`tests/e2e/capabilities.spec.ts\` on ${measured[0]?.data.measured ?? "(not measured)"} in Playwright's browsers (${measured
    .map((m) => `${m.label}: ${m.data.browser}`)
    .join(
      "; ",
    )}). Firefox is documented from the bundled caniuse-lite ${CANIUSE_LITE} and not run here (ADR-0144). Every page asks its engine the same question before the user starts and says when this browser cannot do the job (ADR-0147). Regenerate: \`pnpm tsx scripts/capability-matrix.ts\`.`,
  "",
  `| Capability | ${measured.map((m) => m.label).join(" | ")} | Firefox desktop (documented, not run here) | Firefox for Android (documented, not run here) |`,
  `|---|${measured.map(() => "---").join("|")}|---|---|`,
);
for (const need of needIds) {
  const f = firefoxDocumented[need];
  lines.push(
    `| ${needLabel[need]} | ${measured.map((m) => cell(need, m.data)).join(" | ")} | ${f.desktop} | ${f.android} |`,
  );
}
const extra: [string, (m: Measured) => string][] = [
  ["HEVC decode", (m) => yes(m.worker.decode.hevc)],
  ["AV1 encode", (m) => (m.worker.encode.av1 === "yes" ? "yes" : "no")],
  ["OPFS (large outputs stream to disk)", (m) => yes(m.worker.opfs)],
  ["MediaRecorder MP4", (m) => yes(m.window.mediaRecorder?.mp4 === true)],
];
for (const [label, f] of extra)
  lines.push(`| ${label} | ${measured.map((m) => f(m.data)).join(" | ")} | unknown | unknown |`);

lines.push(
  "",
  "What each engine needs with its page's defaults, and what a page on it does: **works**, takes its **slower path** (the same file through ffmpeg.wasm, ADR-0147), or **says so** before the user starts, naming what is missing.",
  "",
  `| Engine | Needs | ${measured.map((m) => m.label).join(" | ")} | Firefox for Android (documented) |`,
  `|---|---|${measured.map(() => "---").join("|")}|---|`,
);
const noWebCodecs = new Set<Need>([
  "video-decode",
  "audio-decode",
  "h264-encode",
  "vp9-encode",
  "hevc-encode",
  "aac-encode",
  "opus-encode",
]);
for (const [engine, n] of Object.entries(engineNeeds)) {
  if (!n) continue;
  const needs = n.needs.length ? n.needs.join(", ") : "nothing beyond reading the file";
  const cells = measured.map((m) => {
    const v = verdictFor(n, m.data.worker, m.data.window);
    return v.verdict === "works" ? "works" : `${v.verdict} (${v.missing.join(", ")})`;
  });
  const androidMissing = n.needs.filter((x) => noWebCodecs.has(x));
  const android =
    androidMissing.length === 0
      ? "works"
      : n.fallback
        ? "slower path"
        : `says so (${androidMissing.join(", ")})`;
  lines.push(
    `| ${engine}${n.fallback ? " ¹" : ""} | ${needs}${engineNote[engine] ? `; ${engineNote[engine]}` : ""} | ${cells.join(" | ")} | ${android} |`,
  );
}
lines.push(
  "",
  "¹ Has an ffmpeg.wasm path that makes the same file where the browser's own encoder is missing (`src/tools/engines/fallbacks.ts`).",
);

const start = "<!-- capability-matrix:start -->";
const end = "<!-- capability-matrix:end -->";
const readme = readFileSync("README.md", "utf8");
const a = readme.indexOf(start);
const b = readme.indexOf(end);
if (a < 0 || b < 0) throw new Error("README.md has no capability-matrix markers");
writeFileSync(
  "README.md",
  `${readme.slice(0, a + start.length)}\n${lines.join("\n")}\n${readme.slice(b)}`,
);
console.log(
  `capability matrix: ${measured.length} measured browsers, ${Object.keys(engineNeeds).length} engines`,
);
