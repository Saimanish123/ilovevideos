import { MAX_BODY_BYTES, searchMissSchema } from "@/lib/search-miss/schema";
import { dayOf, getSearchMissStore } from "@/lib/search-miss/store";

/**
 * Counts a search that found no tool or was left without opening one (ADR-0150). The site's only
 * server code. It receives search text and nothing else: the body is four fields (`q`, `results`,
 * `opened`, `zero`; `lib/search-miss/schema.ts`), and what is kept is one count per query per day.
 *
 * It does not read the client's address, user agent, cookies or any other header except the body's
 * length and the browser's same-site marker; it logs nothing; its responses set no cookie and carry
 * no body. Files never reach it: the palette sends only what was typed, and the body is capped at
 * 512 bytes. POST only (Next answers 405 to the rest); `robots.txt` disallows `/api/`.
 *
 * 204 counted (or counting is off), 400 not the expected body, 403 sent from another site, 413 too
 * large, 503 the store failed. The browser ignores every answer.
 */
export const dynamic = "force-dynamic";

const reply = (status: number) =>
  new Response(null, { status, headers: { "Cache-Control": "no-store" } });

/** The body as text, or undefined once it passes `max` bytes (stops reading there). */
async function readCapped(request: Request, max: number): Promise<string | undefined> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export async function POST(request: Request): Promise<Response> {
  // A page on another site cannot add counts from its visitors' browsers.
  if (request.headers.get("sec-fetch-site") === "cross-site") return reply(403);
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) return reply(413);
  const text = await readCapped(request, MAX_BODY_BYTES);
  if (text === undefined) return reply(413);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return reply(400);
  }
  const parsed = searchMissSchema.safeParse(json);
  if (!parsed.success) return reply(400);

  try {
    await getSearchMissStore().record(dayOf(), parsed.data.q, parsed.data.zero);
  } catch {
    return reply(503);
  }
  return reply(204);
}
