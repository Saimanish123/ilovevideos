import { describe, expect, it } from "vitest";
import { canZip, crc32, makeZip, uniqueNames } from "@/lib/zip";

describe("zip", () => {
  it("computes the standard CRC-32 check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes stored entries a zip reader can walk", async () => {
    const a = new Blob([new Uint8Array([1, 2, 3])]);
    const b = new Blob(["hello"]);
    const zip = await makeZip(
      [
        { name: "clip-part-01.mp4", blob: a },
        { name: "clip-part-02.mp4", blob: b },
      ],
      { date: new Date(2026, 8, 30, 12, 0, 0) },
    );
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(zip.type).toBe("application/zip");
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // End of central directory: two entries, and it points at the first central record.
    const eocd = bytes.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
    const cdOffset = view.getUint32(eocd + 16, true);
    expect(view.getUint32(cdOffset, true)).toBe(0x02014b50);
    // Stored data sits right after the 30-byte header and the name.
    const nameLen = view.getUint16(26, true);
    expect(Array.from(bytes.slice(30 + nameLen, 33 + nameLen))).toEqual([1, 2, 3]);
    expect(view.getUint32(14, true)).toBe(crc32(new Uint8Array([1, 2, 3])));
  });

  it("refuses what classic zip cannot hold", () => {
    expect(canZip([])).toBe(false);
    expect(canZip([{ name: "a", blob: new Blob(["x"]) }])).toBe(true);
  });

  it("keeps names unique inside one archive, extension last", () => {
    expect(uniqueNames(["clip.mp4", "b.mp4", "clip.mp4", "CLIP.mp4", "clip (2).mp4"])).toEqual([
      "clip.mp4",
      "b.mp4",
      "clip (2).mp4",
      "CLIP (3).mp4",
      "clip (2) (2).mp4",
    ]);
  });
});
