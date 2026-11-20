import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compressSpec } from "@/components/tool/options/compress";
import { between, z } from "@/components/tool/options/remember-schema";
import type { OptionsSpec } from "@/components/tool/options/types";
import {
  applyKept,
  deletePreset,
  PRESET_MAX,
  persistSettings,
  presetNameProblem,
  readPresets,
  readRemembered,
  resetKept,
  savePreset,
  settingsKey,
  startOptions,
  subsetOf,
  validSubset,
} from "@/components/tool/remember";
import type { MediaInfo } from "@/tools/engines/types";

/** A Storage in memory, so the browser code runs under node. */
class MemoryStorage {
  private m = new Map<string, string>();
  blocked = false;
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    if (this.blocked) throw new Error("SecurityError");
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.blocked) throw new Error("QuotaExceededError");
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

let store: MemoryStorage;
beforeEach(() => {
  store = new MemoryStorage();
  (globalThis as unknown as { window: unknown }).window = { localStorage: store };
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

interface Opts {
  quality: "low" | "high";
  level: number;
  start: number;
  end: number;
}
const spec: OptionsSpec<Opts> = {
  verb: "Run",
  Panel: () => null,
  defaults: (info) => ({ quality: "high", level: 5, start: 0, end: info.durationSec }),
  remember: { schema: z.object({ quality: z.enum(["low", "high"]), level: between(0, 10) }) },
};
const info = { container: "mp4", durationSec: 12, sizeBytes: 1000 } as MediaInfo;

describe("remembered settings", () => {
  it("keeps only the named, file-independent keys", () => {
    const v = { quality: "low", level: 3, start: 4, end: 9 } as Opts;
    expect(subsetOf(spec, v)).toEqual({ quality: "low", level: 3 });
  });

  it("restores them over the defaults for the next file, leaving file values to the file", () => {
    persistSettings(
      spec,
      "t",
      { quality: "low", level: 3, start: 4, end: 9 },
      spec.defaults(info, {}),
      {},
    );
    const s = startOptions(spec, "t", { ...info, durationSec: 30 }, {});
    expect(s.options).toEqual({ quality: "low", level: 3, start: 0, end: 30 });
    expect(s.restored).toBe(true);
    expect(s.defaults).toEqual({ quality: "high", level: 5, start: 0, end: 30 });
  });

  it("stores nothing when the settings match the defaults", () => {
    persistSettings(
      spec,
      "t",
      { quality: "low", level: 3, start: 0, end: 1 },
      spec.defaults(info, {}),
      {},
    );
    persistSettings(spec, "t", spec.defaults(info, {}), spec.defaults(info, {}), {});
    expect(store.getItem(settingsKey("t"))).toBeNull();
    expect(startOptions(spec, "t", info, {}).restored).toBe(false);
  });

  it("drops a stale or edited value key by key", () => {
    store.setItem(
      settingsKey("t"),
      JSON.stringify({ v: 1, values: { quality: "ultra", level: 7, extra: 1 } }),
    );
    expect(readRemembered(spec, "t")).toEqual({ level: 7 });
    store.setItem(settingsKey("t"), "{not json");
    expect(readRemembered(spec, "t")).toEqual({});
    store.setItem(settingsKey("t"), JSON.stringify({ v: 1, values: [1, 2] }));
    expect(startOptions(spec, "t", info, {}).options).toEqual(spec.defaults(info, {}));
  });

  it("never restores or saves a key the page preset sets", () => {
    persistSettings(
      spec,
      "t",
      { quality: "low", level: 3, start: 0, end: 1 },
      spec.defaults(info, {}),
      {},
    );
    const s = startOptions(spec, "t", info, { quality: "high" });
    expect(s.options.quality).toBe("high");
    expect(s.options.level).toBe(3);
    expect(subsetOf(spec, s.options, { quality: "high" })).toEqual({ level: 3 });
  });

  it("works with storage blocked: defaults, and no throw", () => {
    store.blocked = true;
    expect(() =>
      persistSettings(
        spec,
        "t",
        { quality: "low", level: 3, start: 0, end: 1 },
        spec.defaults(info, {}),
        {},
      ),
    ).not.toThrow();
    expect(startOptions(spec, "t", info, {}).options).toEqual(spec.defaults(info, {}));
    expect(savePreset(spec, "t", "Mine", { level: 1 })).toBe(false);
    expect(readPresets(spec, "t")).toEqual([]);
  });

  it("resets to the page's defaults and applies a saved entry", () => {
    const now: Opts = { quality: "low", level: 9, start: 2, end: 3 };
    expect(resetKept(spec, now, spec.defaults(info, {}), {})).toEqual({
      quality: "high",
      level: 5,
      start: 2,
      end: 3,
    });
    expect(applyKept(spec, now, { level: 1 })).toEqual({ ...now, level: 1 });
  });

  it("validates real page schemas (compress)", () => {
    const kept = validSubset(compressSpec, {
      preset: "best",
      maxHeight: 720,
      targetMb: 0,
      junk: 1,
    });
    expect(kept).toEqual({ preset: "best", maxHeight: 720 });
    // A size page fixes the target and its preset: only the height is kept there.
    expect(
      validSubset(
        compressSpec,
        { preset: "best", maxHeight: 720 },
        { preset: "target", targetMb: 10 },
      ),
    ).toEqual({
      maxHeight: 720,
    });
  });
});

describe("saved settings", () => {
  it("saves, replaces by name, lists and deletes", () => {
    expect(savePreset(spec, "t", " Podcast ", { quality: "low", level: 2 })).toBe(true);
    expect(savePreset(spec, "t", "podcast", { quality: "low", level: 4 })).toBe(true);
    expect(savePreset(spec, "t", "Loud", { level: 9 })).toBe(true);
    expect(readPresets(spec, "t")).toEqual([
      { name: "podcast", values: { quality: "low", level: 4 } },
      { name: "Loud", values: { level: 9 } },
    ]);
    deletePreset(spec, "t", "podcast");
    expect(readPresets(spec, "t").map((p) => p.name)).toEqual(["Loud"]);
    deletePreset(spec, "t", "Loud");
    expect(store.getItem("presets:t")).toBeNull();
  });

  it("names a problem before saving", () => {
    expect(presetNameProblem("  ", 0, false)).toBe("Type a name first.");
    expect(presetNameProblem("x".repeat(41), 0, false)).toMatch(/40 characters/);
    expect(presetNameProblem("New", PRESET_MAX, false)).toMatch(/delete one/);
    expect(presetNameProblem("Old", PRESET_MAX, true)).toBeUndefined();
  });

  it("drops entries that no longer validate", () => {
    store.setItem(
      "presets:t",
      JSON.stringify({
        v: 1,
        items: [
          { name: "Bad", values: { quality: "x" } },
          { name: 3 },
          { name: "Ok", values: { level: 1 } },
        ],
      }),
    );
    expect(readPresets(spec, "t")).toEqual([{ name: "Ok", values: { level: 1 } }]);
  });
});
