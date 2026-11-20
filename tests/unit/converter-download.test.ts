import { describe, expect, it, vi } from "vitest";
import { downloadWhole, lengthProblem } from "@/tools/workers/converter-download";

describe("converter download length", () => {
  it("accepts exactly the size kept with the files", () => {
    expect(lengthProblem(32_718_323, 32_718_323, 32_718_323)).toBeUndefined();
    expect(lengthProblem(32_718_323, 32_718_323, undefined)).toBeUndefined();
  });
  it("calls a cut-off body short, as measured (27.4 of 32.7 MB)", () => {
    expect(lengthProblem(27_375_357, 32_718_323, 32_718_323)).toBe("short");
    expect(lengthProblem(27_375_357, 32_718_323, undefined)).toBe("short");
  });
  it("trusts the bytes against a Content-Length that disagrees", () => {
    expect(lengthProblem(100, 100, 120)).toBe("short");
    expect(lengthProblem(130, 130, 120)).toBe("long");
  });
  it("calls a different file long or short against the kept size", () => {
    expect(lengthProblem(120, 100, 120)).toBe("long");
    expect(lengthProblem(80, 100, 80)).toBe("short");
  });
});

describe("converter download retry", () => {
  const whole = { bytes: new Uint8Array(10), contentLength: 10, partial: false };
  const cut = { bytes: new Uint8Array(6), contentLength: 10, partial: false };
  const rest = { bytes: new Uint8Array(4), contentLength: 4, partial: true };
  const get = (
    fetchOnce: Parameters<typeof downloadWhole>[4],
    drop: Parameters<typeof downloadWhole>[5] = vi.fn().mockResolvedValue(undefined),
  ) => downloadWhole("/wasm/x.wasm", 10, "application/wasm", () => {}, fetchOnce, drop);

  it("continues a cut-off body from where it stopped, after dropping the cached copy", async () => {
    const fetchOnce = vi.fn().mockResolvedValueOnce(cut).mockResolvedValueOnce(rest);
    const drop = vi.fn().mockResolvedValue(undefined);
    const blob = await get(fetchOnce, drop);
    expect(blob.size).toBe(10);
    // The second request asks past the HTTP cache for the bytes from 6 on.
    expect(fetchOnce.mock.calls[1]?.slice(2)).toEqual([true, 6]);
    expect(drop).toHaveBeenCalledTimes(1);
  });

  it("starts over when the server ignores the range", async () => {
    const fetchOnce = vi.fn().mockResolvedValueOnce(cut).mockResolvedValueOnce(whole);
    expect((await get(fetchOnce)).size).toBe(10);
  });

  it("says the download did not finish after three short tries, and leaves nothing cached", async () => {
    const fetchOnce = vi.fn().mockResolvedValue(cut);
    const drop = vi.fn().mockResolvedValue(undefined);
    await expect(get(fetchOnce, drop)).rejects.toMatchObject({
      code: "resource",
      message: "The converter did not finish downloading.",
      hint: "Check the connection and try again.",
    });
    expect(fetchOnce).toHaveBeenCalledTimes(3);
    expect(drop).toHaveBeenCalledTimes(3);
  });

  it("treats a dropped connection like a short body", async () => {
    const fetchOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(whole);
    expect((await get(fetchOnce)).size).toBe(10);
  });

  it("reports progress across the pieces against the whole file", async () => {
    const seen: number[] = [];
    const fetchOnce = vi.fn(
      async (_u: string, progress: (n: number) => void, _f: boolean, from = 0) => {
        progress(from === 0 ? 6 : 4);
        return from === 0 ? cut : rest;
      },
    );
    await downloadWhole(
      "/wasm/x.wasm",
      10,
      "application/wasm",
      (p) => seen.push(p.received),
      fetchOnce,
      async () => undefined,
    );
    expect(seen).toEqual([6, 10]);
  });
});
