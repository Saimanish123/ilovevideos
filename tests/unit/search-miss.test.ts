// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/search-miss/route";
import {
  MAX_QUERY,
  missPayload,
  missQuery,
  reportSearchMiss,
  resetSearchMissSession,
  SEARCH_MISS_URL,
} from "@/lib/search-miss";
import { D1_SCHEMA, type D1Like, d1Store, daysFromRows } from "@/lib/search-miss/d1";
import { MAX_BODY_BYTES, searchMissSchema } from "@/lib/search-miss/schema";
import {
  addDays,
  dayOf,
  fileStore,
  KEEP_DAYS,
  MAX_QUERIES_PER_DAY,
  memoryStore,
  type SearchMissStore,
  setSearchMissStore,
} from "@/lib/search-miss/store";

describe("missQuery: the query as counted", () => {
  it("normalises the way search reads it", () => {
    expect(missQuery("  Make it VERTICAL!! ")).toBe("make it vertical");
    expect(missQuery("Video won’t play on my TV")).toBe("video wont play on my tv");
    expect(missQuery("Compress to 8MB")).toBe("compress to 8 mb");
    expect(missQuery("convert H.264 → WebVTT")).toBe("convert h264 vtt");
    expect(missQuery("Vidéo")).toBe("video");
  });

  it("caps the length at a word boundary", () => {
    const long = "make this video much smaller please ".repeat(6);
    const q = missQuery(long) ?? "";
    expect(q.length).toBeLessThanOrEqual(MAX_QUERY);
    expect(long.toLowerCase().startsWith(q)).toBe(true);
    expect(q.endsWith(" ")).toBe(false);
    // The last word kept is whole.
    expect(["make", "this", "video", "much", "smaller", "please"]).toContain(q.split(" ").at(-1));
    // One word longer than the cap is cut at the cap.
    expect(missQuery("a".repeat(200))).toBe("a".repeat(MAX_QUERY));
  });

  it("sends nothing for one letter, an address, a path or a long number", () => {
    expect(missQuery("")).toBeUndefined();
    expect(missQuery("  ")).toBeUndefined();
    expect(missQuery("x")).toBeUndefined();
    expect(missQuery("?!")).toBeUndefined();
    expect(missQuery("send to me@example.com")).toBeUndefined();
    expect(missQuery("https://example.com/video")).toBeUndefined();
    expect(missQuery("www.example.com")).toBeUndefined();
    expect(missQuery("C:\\Users\\me\\clip.mov")).toBeUndefined();
    expect(missQuery("IMG_20241119_101010.mov")).toBeUndefined();
    expect(missQuery("call 5551234567")).toBeUndefined();
    // Ordinary numbers stay: sizes, resolutions, frame rates.
    expect(missQuery("1920x1080 60fps under 25 mb")).toBe("1920x1080 60fps under 25 mb");
  });
});

describe("missPayload", () => {
  it("is exactly four fields", () => {
    expect(missPayload("blorp", 0)).toEqual({ q: "blorp", results: 0, opened: false, zero: true });
    expect(missPayload("make smaller", 6)).toEqual({
      q: "make smaller",
      results: 6,
      opened: false,
      zero: false,
    });
  });
  it("clamps the count and passes the schema", () => {
    for (const [raw, n] of [
      ["blorp", 0],
      ["shrink", 8],
      ["x y z", 999],
      ["a b", -3],
    ] as const) {
      const body = missPayload(raw, n);
      expect(body).toBeDefined();
      expect(searchMissSchema.safeParse(body).success).toBe(true);
    }
  });
  it("stays far under the body cap at its longest", () => {
    const body = JSON.stringify(missPayload("w".repeat(500), 50));
    expect(new TextEncoder().encode(body).byteLength).toBeLessThan(MAX_BODY_BYTES / 2);
  });
});

describe("reportSearchMiss: once per query per session", () => {
  beforeEach(() => resetSearchMissSession());

  it("sends one beacon per query, to this site", () => {
    const sent: [string, string][] = [];
    const send = (url: string, body: string) => {
      sent.push([url, body]);
    };
    expect(reportSearchMiss("Blorp", 0, send)).toBe(true);
    expect(reportSearchMiss("blorp ", 0, send)).toBe(false);
    expect(reportSearchMiss("BLORP", 3, send)).toBe(false);
    expect(reportSearchMiss("make it pop", 2, send)).toBe(true);
    expect(reportSearchMiss("x", 0, send)).toBe(false);
    expect(sent).toEqual([
      [SEARCH_MISS_URL, '{"q":"blorp","results":0,"opened":false,"zero":true}'],
      [SEARCH_MISS_URL, '{"q":"make it pop","results":2,"opened":false,"zero":false}'],
    ]);
  });

  it("a failing transport breaks nothing", () => {
    expect(
      reportSearchMiss("blorp", 0, () => {
        throw new Error("offline");
      }),
    ).toBe(true);
  });
});

describe("schema: only the palette's body is accepted", () => {
  const ok = { q: "blorp", results: 0, opened: false, zero: true };
  it.each([
    ["extra key", { ...ok, file: "holiday.mov" }],
    ["opened true", { ...ok, opened: true }],
    ["zero disagrees", { ...ok, results: 3 }],
    ["upper case", { ...ok, q: "Blorp" }],
    ["punctuation", { ...ok, q: "blorp!" }],
    ["double space", { ...ok, q: "a  b" }],
    ["too long", { ...ok, q: "a".repeat(MAX_QUERY + 1) }],
    ["one letter", { ...ok, q: "a" }],
    ["long number", { ...ok, q: "call 5551234567" }],
    ["fraction", { ...ok, results: 1.5, zero: false }],
    ["negative", { ...ok, results: -1 }],
    ["missing field", { q: "blorp", results: 0, zero: true }],
    ["not an object", ["blorp"]],
  ])("refuses %s", (_, body) => {
    expect(searchMissSchema.safeParse(body).success).toBe(false);
  });
  it("accepts the real thing", () => {
    expect(searchMissSchema.safeParse(ok).success).toBe(true);
  });
});

describe("POST /api/search-miss", () => {
  let store: SearchMissStore;
  beforeEach(() => {
    store = memoryStore();
    setSearchMissStore(store);
  });
  afterEach(() => setSearchMissStore(undefined));

  const post = (body: string, headers: Record<string, string> = {}) =>
    POST(
      new Request("http://localhost/api/search-miss", {
        method: "POST",
        body,
        headers: { "content-type": "text/plain;charset=UTF-8", ...headers },
      }),
    );
  const today = () => store.read(dayOf(), dayOf());

  it("counts a valid miss and answers 204 with no body and no cookie", async () => {
    const res = await post('{"q":"blorp","results":0,"opened":false,"zero":true}');
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
    await post('{"q":"blorp","results":0,"opened":false,"zero":true}');
    await post('{"q":"make smaller","results":5,"opened":false,"zero":false}');
    expect(await today()).toEqual([
      { day: dayOf(), missed: { "make smaller": 1 }, zero: { blorp: 2 } },
    ]);
  });

  it("refuses anything else and stores nothing", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post("")).status).toBe(400);
    expect((await post('{"q":"Blorp","results":0,"opened":false,"zero":true}')).status).toBe(400);
    expect(
      (await post('{"q":"blorp","results":0,"opened":false,"zero":true,"name":"a.mov"}')).status,
    ).toBe(400);
    expect((await post(`{"q":"${"a".repeat(600)}"}`)).status).toBe(413);
    expect(
      (
        await post('{"q":"blorp","results":0,"opened":false,"zero":true}', {
          "sec-fetch-site": "cross-site",
        })
      ).status,
    ).toBe(403);
    expect(await today()).toEqual([]);
  });

  it("answers 503 when the store fails", async () => {
    setSearchMissStore({
      record: () => Promise.reject(new Error("disk full")),
      read: async () => [],
    });
    expect((await post('{"q":"blorp","results":0,"opened":false,"zero":true}')).status).toBe(503);
  });
});

describe("stores", () => {
  it("memory: caps new queries per day, keeps counting known ones", async () => {
    const s = memoryStore();
    for (let i = 0; i < MAX_QUERIES_PER_DAY + 10; i++) await s.record("2026-11-19", `q${i}`, true);
    await s.record("2026-11-19", "q0", true);
    const [day] = await s.read("2026-11-19", "2026-11-19");
    expect(Object.keys(day?.zero ?? {})).toHaveLength(MAX_QUERIES_PER_DAY);
    expect(day?.zero.q0).toBe(2);
    expect(day?.zero[`q${MAX_QUERIES_PER_DAY + 5}`]).toBeUndefined();
  });

  it("file: writes one JSON file, reads a range, drops old days", async () => {
    const dir = mkdtempSync(join(tmpdir(), "search-miss-"));
    try {
      const path = join(dir, "nested", "misses.json");
      const s = fileStore(path);
      expect(await s.read("2000-01-01", "2100-01-01")).toEqual([]);
      const old = addDays("2026-11-19", -(KEEP_DAYS + 1));
      await s.record(old, "ancient", true);
      // Writes in parallel are serialised: none is lost.
      await Promise.all([
        s.record("2026-11-18", "blorp", true),
        s.record("2026-11-19", "blorp", true),
        s.record("2026-11-19", "blorp", true),
        s.record("2026-11-19", "make it pop", false),
      ]);
      expect(await s.read("2026-11-19", "2026-11-19")).toEqual([
        { day: "2026-11-19", missed: { "make it pop": 1 }, zero: { blorp: 2 } },
      ]);
      expect((await s.read("2000-01-01", "2100-01-01")).map((d) => d.day)).toEqual([
        "2026-11-18",
        "2026-11-19",
      ]);
      // Only queries and counts are in the file.
      const raw = JSON.parse(readFileSync(path, "utf8"));
      expect(Object.keys(raw)).toEqual(["version", "days"]);
      // A second store on the same file (another process) adds to it rather than overwriting.
      await fileStore(path).record("2026-11-19", "blorp", true);
      expect((await s.read("2026-11-19", "2026-11-19"))[0]?.zero.blorp).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("D1: the adapter's SQL runs on SQLite and upserts counts", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(D1_SCHEMA);
    // The subset of D1's API the adapter uses, over node:sqlite.
    const d1: D1Like = {
      prepare(sql) {
        const stmt = db.prepare(sql);
        let values: unknown[] = [];
        const bound = {
          bind(...v: unknown[]) {
            values = v;
            return bound;
          },
          async run() {
            return stmt.run(...(values as never[]));
          },
          async all<T>() {
            return { results: stmt.all(...(values as never[])) as T[] };
          },
        };
        return bound;
      },
    };
    const s = d1Store(d1);
    await s.record("2026-11-19", "blorp", true);
    await s.record("2026-11-19", "blorp", true);
    await s.record("2026-11-19", "blorp", false);
    await s.record("2026-11-20", "make it pop", false);
    await s.record("2026-12-01", "outside", true);
    expect(await s.read("2026-11-19", "2026-11-30")).toEqual([
      { day: "2026-11-19", missed: { blorp: 1 }, zero: { blorp: 2 } },
      { day: "2026-11-20", missed: { "make it pop": 1 }, zero: {} },
    ]);
  });

  it("daysFromRows reads wrangler's JSON rows", () => {
    expect(
      daysFromRows([
        { day: "2026-11-20", q: "a b", zero: 0, n: 2 },
        { day: "2026-11-19", q: "c d", zero: 1, n: 3 },
      ]),
    ).toEqual([
      { day: "2026-11-19", missed: {}, zero: { "c d": 3 } },
      { day: "2026-11-20", missed: { "a b": 2 }, zero: {} },
    ]);
  });
});
