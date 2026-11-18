/*
 * Service worker (ADR-0102). Makes the site installable and usable offline for the tools already
 * visited, and receives files shared to the installed app.
 *
 * - Pages: network first, so a deploy shows up on the next visit with no prompt; each page that
 *   loads is kept, and served from the cache when the network is gone. A page never visited shows
 *   a short offline note instead.
 * - Built files under /_next/static/ (hashed, immutable) and the ffmpeg core under /wasm/: cache
 *   first, stored the first time a page asks for them, never ahead. A tool's engine is therefore
 *   available offline once it has been used once.
 * - Share target: a POST to /share-target carries the shared files; they are put in a local cache
 *   and the browser is sent to /share, which offers the tools that open them and hands one on.
 *   The files never leave the device.
 *
 * Same-origin requests only; every other request is left to the browser. Nothing is sent anywhere.
 */
const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;
const INBOX = "share-inbox";
const KEEP = new Set([PAGES, STATIC, INBOX]);
const MAX_PAGES = 80;
const MAX_STATIC = 400;

// Cross-origin isolation (ADR-0005) and the header policy apply to responses made here too.
const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
};

self.addEventListener("install", (event) => {
  // The home page is the shell: the one page available offline before any other was visited.
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.add(new Request("/", { cache: "reload" })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!KEEP.has(key)) await caches.delete(key);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

/** Keeps a cache to its most recent entries (insertion order). */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

const offline = () =>
  new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#121e18;background:#f8f7f2"><h1 style="font-size:1.5rem;font-weight:600">This page is not saved on this device</h1><p>You are offline. Tools you have opened before work without a connection; this one has not been opened here yet.</p><p><a href="/" style="color:inherit">Open the home page</a></p></body></html>`,
    { status: 503, headers: HEADERS },
  );

async function page(event) {
  const cache = await caches.open(PAGES);
  try {
    const response = (await event.preloadResponse) || (await fetch(event.request));
    if (response.ok && response.type === "basic" && !response.redirected) {
      const copy = response.clone();
      event.waitUntil(cache.put(event.request, copy).then(() => trim(PAGES, MAX_PAGES)));
    }
    return response;
  } catch {
    const url = new URL(event.request.url);
    url.search = "";
    return (
      (await cache.match(event.request, { ignoreSearch: true })) ||
      (await cache.match(url.pathname.replace(/\/$/, "") || "/")) ||
      offline()
    );
  }
}

/**
 * A worker's location is the URL of the response that starts it, and a cached response keeps the
 * URL it was first fetched with. Turbopack starts every worker from one bootstrap file and names each
 * worker's chunks in its URL's fragment (`turbopack-worker-<hash>.js#params=...`), which the cache
 * ignores; returned as it is, the first worker's cached response made every later worker load the
 * first one's chunks and run its code (ADR-0092: the loudness, waveform and second engine workers
 * ran the engine worker and never did their job). A response made here has no URL, so the worker
 * keeps the URL it was asked for.
 */
function forRequest(hit, request) {
  if (request.destination !== "worker" && request.destination !== "sharedworker") return hit;
  return new Response(hit.body, {
    status: hit.status,
    statusText: hit.statusText,
    headers: hit.headers,
  });
}

async function immutable(event) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(event.request);
  if (hit) return forRequest(hit, event.request);
  const response = await fetch(event.request);
  // Whole responses only: a range request's 206 would be a fragment.
  if (response.status === 200 && response.type === "basic") {
    const copy = response.clone();
    event.waitUntil(cache.put(event.request, copy).then(() => trim(STATIC, MAX_STATIC)));
  }
  return response;
}

// The chooser's kinds (components/share/share-chooser.tsx `kindOf`), so /share renders the right
// list at first paint.
const SUBTITLE = /\.(srt|vtt|ass|ssa|sbv)$/i;
const VIDEO_EXT = /\.(mkv|m2ts|mts|ts|mov|mp4|webm|avi|wmv|flv|3gp|m4v|mpg|mpeg|vob|ogv)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|flac|ogg|opus|aiff?|wma)$/i;
function kindOf(f) {
  const t = (f.type || "").toLowerCase();
  const n = f.name || "";
  if (t === "image/gif" || /\.gif$/i.test(n)) return "gif";
  if (t.startsWith("video/") || VIDEO_EXT.test(n)) return "video";
  if (t.startsWith("audio/") || AUDIO_EXT.test(n)) return "audio";
  if (SUBTITLE.test(n) || t === "text/vtt" || t === "application/x-subrip") return "subtitle";
  if (t.startsWith("image/")) return "image";
  return undefined;
}

async function share(event) {
  const data = await event.request.formData();
  const files = data.getAll("media").filter((f) => typeof f === "object" && "size" in f);
  const inbox = await caches.open(INBOX);
  for (const key of await inbox.keys()) await inbox.delete(key);
  await Promise.all(
    files.map((f, i) =>
      inbox.put(
        `/share-inbox/${i}`,
        new Response(f, {
          headers: {
            "Content-Type": f.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(f.name || `shared-${i + 1}`),
          },
        }),
      ),
    ),
  );
  // The chooser lists tools for the first file's kind, for as many files of that kind as were shared.
  const kind = files.map(kindOf).find(Boolean);
  const count = kind ? files.filter((f) => kindOf(f) === kind).length : files.length;
  return Response.redirect(`/share?files=${count}${kind ? `&kind=${kind}` : ""}`, 303);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(share(event));
    return;
  }
  if (request.method !== "GET" || request.headers.has("range")) return;
  if (request.mode === "navigate") {
    event.respondWith(page(event));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/wasm/")) {
    event.respondWith(immutable(event));
  }
});
