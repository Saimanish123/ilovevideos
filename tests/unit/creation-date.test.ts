import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readEditable, writeEdited } from "@/tools/engines/edit-metadata";
import {
  describeShift,
  formatQtDate,
  headerTimes,
  MP4_EPOCH,
  movieCreation,
  newHeaderTime,
  newKeyDate,
  parseQtDate,
  retimeHeaders,
  setInstant,
} from "@/tools/engines/edit-metadata/dates";

const blob = (name: string) => new Blob([readFileSync(`tests/fixtures/${name}`)]);
const join = async (parts: BlobPart[]) => new Blob(parts);

describe("creation date math", () => {
  it("reads and writes Apple's creation date text with its zone", () => {
    const q = parseQtDate("2023-06-01T12:34:56+0200");
    expect(q).toEqual({ utcMs: Date.UTC(2023, 5, 1, 10, 34, 56), offsetMin: 120 });
    expect(parseQtDate("2023-06-01T12:34:56-05:30")?.offsetMin).toBe(-330);
    expect(parseQtDate("2023-06-01T12:34:56Z")?.offsetMin).toBe(0);
    expect(parseQtDate("2023-06-01 12:34")?.offsetMin).toBeUndefined();
    expect(parseQtDate("June 1")).toBeUndefined();
    expect(formatQtDate(Date.UTC(2023, 5, 1, 10, 34, 56), 120)).toBe("2023-06-01T12:34:56+0200");
    expect(formatQtDate(Date.UTC(2023, 5, 1, 10, 34, 56), -330)).toBe("2023-06-01T05:04:56-0530");
  });

  it("sets from local time and zone, and shifts while keeping the key's own zone", () => {
    const set = { mode: "set" as const, local: "2024-05-04T10:20:30", offsetMin: 120 };
    expect(setInstant(set)).toBe(Date.UTC(2024, 4, 4, 8, 20, 30));
    expect(newHeaderTime(123, set)).toBe(Date.UTC(2024, 4, 4, 8, 20, 30) / 1000 + MP4_EPOCH);
    expect(newKeyDate("2023-06-01T12:34:56+0200", set)).toBe("2024-05-04T10:20:30+0200");
    const shift = { mode: "shift" as const, seconds: 3600 };
    expect(newHeaderTime(1000, shift)).toBe(4600);
    // An unset time (0) stays unset.
    expect(newHeaderTime(0, shift)).toBe(0);
    expect(newKeyDate("2023-06-01T23:34:56-0700", shift)).toBe("2023-06-02T00:34:56-0700");
    expect(newKeyDate("2023-06-01T10:34:56.000000Z", shift)).toBe("2023-06-01T11:34:56.000000Z");
    expect(newKeyDate("2023-06-01T10:34:56Z", set)).toBe("2024-05-04T08:20:30Z");
    expect(describeShift(-(86400 + 3600 + 60))).toBe("−1 d 1 h 1 min");
  });
});

describe("creation date on files", () => {
  it("finds every header and rewrites them in place", async () => {
    const f = blob("sample.mp4");
    const bytes = new Uint8Array(await f.arrayBuffer());
    const moovAt = bytes.findIndex(
      (_, i) => String.fromCharCode(...bytes.subarray(i + 4, i + 8)) === "moov",
    );
    const size = new DataView(bytes.buffer).getUint32(moovAt);
    const moov = bytes.slice(moovAt, moovAt + size);
    const kinds = headerTimes(moov).map((h) => h.box);
    expect(kinds[0]).toBe("mvhd");
    expect(kinds.filter((k) => k === "tkhd").length).toBe(2);
    expect(kinds.filter((k) => k === "mdhd").length).toBe(2);
    const set = { mode: "set" as const, local: "2021-01-02T03:04:05", offsetMin: 0 };
    expect(retimeHeaders(moov, set)).toBe(5);
    expect(movieCreation(moov)).toBe(Date.UTC(2021, 0, 2, 3, 4, 5) / 1000 + MP4_EPOCH);
    expect(() =>
      retimeHeaders(moov.slice(), { mode: "set", local: "2041-01-01T00:00", offsetMin: 0 }),
    ).toThrow(RangeError);
  });

  it("shifts a MOV's headers and its Apple creation date key, media bytes untouched", async () => {
    const f = blob("sample-dated.mov");
    const before = await readEditable(f);
    expect(before.recorded?.key).toBe("2023-06-01T12:34:56+0200");
    expect(before.recorded?.header).toBe(Date.UTC(2023, 5, 1, 10, 34, 56) / 1000 + MP4_EPOCH);
    const r = await writeEdited(f, { set: {}, dates: { mode: "shift", seconds: -3600 } });
    expect(r.datesChanged).toBe(7);
    const out = await join(r.parts);
    expect(out.size).toBe(f.size);
    const after = await readEditable(out);
    expect(after.recorded?.key).toBe("2023-06-01T11:34:56+0200");
    expect(after.recorded?.header).toBe(Date.UTC(2023, 5, 1, 9, 34, 56) / 1000 + MP4_EPOCH);
    // The media data is the same bytes.
    const a = new Uint8Array(await f.arrayBuffer());
    const b = new Uint8Array(await out.arrayBuffer());
    const mdat = a.findIndex((_, i) => String.fromCharCode(...a.subarray(i + 4, i + 8)) === "mdat");
    expect(
      Buffer.from(b.subarray(mdat, mdat + 60000)).equals(
        Buffer.from(a.subarray(mdat, mdat + 60000)),
      ),
    ).toBe(true);
  });

  it("refuses dates on formats without a movie header", async () => {
    await expect(
      writeEdited(blob("sample.mp3"), { set: {}, dates: { mode: "shift", seconds: 60 } }),
    ).rejects.toThrow(/no recording date/);
  });
});
