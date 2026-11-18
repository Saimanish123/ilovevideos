import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readMovieHeaderTime } from "@/tools/engines/mediabunny/movie-header";

const blob = (path: string) => new Blob([readFileSync(path)]);

describe("readMovieHeaderTime", () => {
  it("reads the capture time ffmpeg wrote into mvhd", async () => {
    expect(await readMovieHeaderTime(blob("tests/fixtures/sample-tagged.mp4"))).toBe(
      "2026-08-01T10:00:00.000Z",
    );
  });

  it("returns undefined for a file that is not ISO BMFF", async () => {
    expect(await readMovieHeaderTime(blob("tests/fixtures/sample.webm"))).toBeUndefined();
  });

  it("returns undefined when mvhd carries no time", async () => {
    expect(await readMovieHeaderTime(blob("tests/fixtures/sample.mp4"))).toBeUndefined();
  });
});
