import { describe, expect, it } from "vitest";
import {
  countTags,
  describeTags,
  parseIso6709,
  parseLoci,
  readTagValues,
} from "@/tools/engines/strip-metadata/tags";

describe("strip-metadata tag description", () => {
  it("returns nothing for a clean file", () => {
    expect(describeTags(undefined)).toEqual({ lines: [], other: 0 });
    expect(countTags(undefined)).toBe(0);
  });
  it("names known MP4 and QuickTime keys and counts the rest", () => {
    const r = describeTags({
      title: "Holiday",
      comment: "shot on the beach",
      date: "2026-08-01T10:00:00.000Z",
      rawKeys: ["©nam", "©cmt", "©day", "©xyz", "com.apple.quicktime.make", "©too", "zzzz"],
    });
    // Where, on what and when first; software and descriptive text after.
    expect(r.lines.map((l) => l.label)).toEqual([
      "Location (GPS)",
      "Device make",
      "Creation date",
      "Encoding software",
      "Title",
      "Comment",
    ]);
    expect(r.lines.map((l) => l.sensitive)).toEqual([true, true, true, false, false, false]);
    expect(r.lines[4]?.value).toBe("Holiday");
    expect(r.lines[2]?.value).toBe("2026-08-01");
    expect(r.other).toBe(1);
  });
  it("counts raw keys when present, else the normalised fields", () => {
    expect(countTags({ rawKeys: ["a", "b", "c"] })).toBe(3);
    expect(countTags({ title: "x", comment: "y" })).toBe(2);
  });
});

describe("3GPP location and the movie-header time", () => {
  it("names loci as the location and lists the header time as the creation date", () => {
    const { lines, other } = describeTags({
      title: "Holiday clip",
      recordedAt: "2026-08-01T10:00:00.000Z",
      rawKeys: ["©nam", "©too", "©cmt", "loci"],
    });
    expect(lines.map((l) => l.label).sort()).toEqual(
      ["Comment", "Creation date", "Encoding software", "Location (GPS)", "Title"].sort(),
    );
    expect(lines.find((l) => l.label === "Creation date")?.value).toBe("2026-08-01");
    expect(other).toBe(0);
    expect(countTags({ recordedAt: "2026-08-01T10:00:00.000Z", rawKeys: ["loci"] })).toBe(2);
  });
});

describe("tag values for display", () => {
  it("reads ISO 6709 points as phones and ffmpeg write them", () => {
    expect(parseIso6709("+48.8584+002.2945/")).toBe("48.8584° N, 2.2945° E");
    expect(parseIso6709("+37.3349-122.0090+010.000/")).toBe("37.3349° N, 122.009° W");
    expect(parseIso6709("nowhere")).toBeUndefined();
  });
  it("reads a 3GPP loci payload (the tagged fixture's bytes)", () => {
    const bytes = Uint8Array.from(
      Buffer.from("000000000000000000024b640030dbc00000000065617274680000", "hex"),
    );
    expect(parseLoci(bytes)).toBe("48.8584° N, 2.2945° E");
    expect(parseLoci(new Uint8Array(6))).toBeUndefined();
  });
  it("takes location, device and software from the raw map and lists location with its value", () => {
    const values = readTagValues({
      "com.apple.quicktime.location.ISO6709": "+37.3349-122.0090+010.000/",
      "com.apple.quicktime.make": "Apple",
      "com.apple.quicktime.model": "iPhone 15",
      "©too": "Lavf63.1.101",
      covr: new Uint8Array(4),
    });
    expect(values).toEqual({
      location: "37.3349° N, 122.009° W",
      make: "Apple",
      model: "iPhone 15",
      software: "Lavf63.1.101",
    });
    const { lines } = describeTags({
      ...values,
      rawKeys: ["com.apple.quicktime.location.ISO6709", "com.apple.quicktime.make"],
    });
    expect(lines[0]).toEqual({
      label: "Location (GPS)",
      value: "37.3349° N, 122.009° W",
      sensitive: true,
    });
  });
});
