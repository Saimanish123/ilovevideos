// Writes a strict Content Security Policy into every prerendered page (README.md#system-design-and-production-principles, Security posture).
//
// Pages are static, so a per-request nonce is impossible without rendering each page on every request.
// Instead this runs after `next build`: for each prerendered HTML file it hashes every inline
// executable <script> (Next's bootstrap and flight data, the theme script) and inserts, as the first
// element of <head>, a <meta http-equiv="Content-Security-Policy"> whose script-src lists 'self' and
// those hashes, without 'unsafe-inline'. The header CSP from next.config.ts still applies; a browser
// enforces both, so only same-origin files and these exact inline scripts can run. JSON-LD blocks are
// data, not scripts, and are skipped. The other directives are copied from the header, which is read
// from the build's routes manifest so the policy has one source.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = process.env.NEXT_DIST_DIR ?? ".next";
const manifest = JSON.parse(readFileSync(join(dist, "routes-manifest.json"), "utf8"));
const header = manifest.headers
  .flatMap((h) => h.headers)
  .find((h) => h.key.toLowerCase() === "content-security-policy")?.value;
if (!header) {
  console.error("csp-hashes: no Content-Security-Policy header in next.config.ts");
  process.exit(1);
}
// frame-ancestors and sandbox are ignored in <meta>; they stay in the header only.
const base = header
  .split(";")
  .map((d) => d.trim())
  .filter((d) => d && !/^(frame-ancestors|sandbox|report-uri|report-to)\b/.test(d));

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".html")) files.push(p);
  }
};
walk(join(dist, "server/app"));

const scriptRx = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
let pages = 0;
for (const file of files) {
  let html = readFileSync(file, "utf8");
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "");
  const hashes = new Set();
  for (const [, attrs, body] of html.matchAll(scriptRx)) {
    if (/\bsrc=/.test(attrs)) continue;
    const type = /\btype="([^"]*)"/.exec(attrs)?.[1];
    if (type && !/^(text|application)\/javascript$|^module$/.test(type)) continue;
    hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }
  const policy = base
    .map((d) => {
      if (!d.startsWith("script-src")) return d;
      const sources = d
        .split(/\s+/)
        .slice(1)
        .filter((s) => s !== "'unsafe-inline'");
      return ["script-src", ...sources, ...hashes].join(" ");
    })
    .join("; ");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}"/>`;
  if (!html.includes("<head>")) continue;
  writeFileSync(file, html.replace("<head>", `<head>${meta}`));
  pages++;
}
console.log(`csp-hashes: strict script policy written into ${pages} prerendered pages`);
