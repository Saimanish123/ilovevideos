import { describe, expect, it } from "vitest";
import { platforms } from "@/content/platforms";
import {
  AUDIO_BITRATE,
  autoHeight,
  estimateBytes,
  MB,
  MIN_TARGET_VIDEO_BITRATE,
  outputDimensions,
  planTarget,
  retryVideoBitrate,
  videoBitrateForPreset,
  videoBitrateForTarget,
} from "@/tools/engines/compress/math";
import { tools } from "@/tools/registry";

const phone = { width: 1920, height: 1080, fps: 30, hasAudio: true };

describe("compress math", () => {
  it("keeps dimensions when the cap is above the source", () => {
    expect(outputDimensions(1920, 1080, 2160)).toEqual({ width: 1920, height: 1080 });
    expect(outputDimensions(1920, 1080, "original")).toEqual({ width: 1920, height: 1080 });
  });
  it("scales to the cap and keeps even dimensions", () => {
    expect(outputDimensions(3840, 2160, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(outputDimensions(1080, 1920, 720)).toEqual({ width: 406, height: 720 });
  });
  it("orders presets by bitrate", () => {
    const s = videoBitrateForPreset("smaller", 1920, 1080, 30);
    const b = videoBitrateForPreset("balanced", 1920, 1080, 30);
    const q = videoBitrateForPreset("best", 1920, 1080, 30);
    expect(s).toBeLessThan(b);
    expect(b).toBeLessThan(q);
  });
  it("hits a target size with margin", () => {
    const target = 25 * 1_048_576;
    const bitrate = videoBitrateForTarget(target, 60);
    const est = estimateBytes(bitrate, 60, AUDIO_BITRATE);
    expect(est).toBeLessThanOrEqual(target);
    expect(est).toBeGreaterThan(target * 0.9);
  });
  it("never goes below the floor for very small targets", () => {
    expect(videoBitrateForTarget(1000, 600)).toBe(250_000);
  });
});

describe("target-size planning", () => {
  it("plans under the decimal limit with a margin", () => {
    for (const mb of [8, 10, 16, 25, 50, 100]) {
      for (const d of [10, 30, 60, 120]) {
        const p = planTarget(mb * MB, { ...phone, durationSec: d }, "auto");
        if (!p.ok) continue;
        expect(p.estimatedBytes).toBeLessThanOrEqual(mb * MB * 0.95);
        // Short clips at large sizes hit the 40 Mbps ceiling and land well under; that is fine.
        if (p.videoBitrate < 40_000_000) expect(p.estimatedBytes).toBeGreaterThan(mb * MB * 0.9);
      }
    }
  });
  it("steps audio down from 128 to 96 to 64 kbps as the budget shrinks", () => {
    const at = (d: number) => planTarget(10 * MB, { ...phone, durationSec: d }, "auto");
    const a = at(30);
    const b = at(120);
    const c = at(180);
    expect(a.ok && a.audioBitrate).toBe(128_000);
    expect(b.ok && b.audioBitrate).toBe(96_000);
    expect(c.ok && c.audioBitrate).toBe(64_000);
  });
  it("spends no audio budget on a silent clip", () => {
    const p = planTarget(10 * MB, { ...phone, hasAudio: false, durationSec: 60 }, "auto");
    expect(p.ok && p.audioBitrate).toBe(0);
  });
  it("lowers the resolution only when the bitrate cannot carry the frame", () => {
    const short = planTarget(10 * MB, { ...phone, durationSec: 15 }, "auto");
    const minute = planTarget(10 * MB, { ...phone, durationSec: 60 }, "auto");
    const three = planTarget(10 * MB, { ...phone, durationSec: 180 }, "auto");
    expect(short.ok && short.height).toBe("original");
    expect(minute.ok && minute.outHeight).toBe(720);
    expect(three.ok && three.outHeight).toBe(360);
  });
  it("respects an explicit resolution instead of auto", () => {
    const p = planTarget(10 * MB, { ...phone, durationSec: 15 }, 480);
    expect(p.ok && p.outHeight).toBe(480);
  });
  it("refuses honestly when even the quality floor does not fit", () => {
    const p = planTarget(10 * MB, { ...phone, durationSec: 600 }, "auto");
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.reason).toBe("too-long");
    expect(p.minBytes).toBeGreaterThan(10 * MB);
    // The longest clip that fits: 10 MB at 200 + 64 kbps with the margin is about 4:45.
    expect(Math.round(p.maxDurationSec)).toBe(285);
  });
  it("refuses a file with no duration", () => {
    const p = planTarget(10 * MB, { ...phone, durationSec: 0 }, "auto");
    expect(p.ok === false && p.reason).toBe("no-duration");
  });
  it("brings a 4K clip down to a frame the bitrate can fill", () => {
    expect(autoHeight(4_000_000, { width: 3840, height: 2160, fps: 30 })).toBe(1080);
    expect(autoHeight(100_000_000, { width: 3840, height: 2160, fps: 30 })).toBe("original");
    expect(autoHeight(100_000, { width: 640, height: 360, fps: 30 })).toBe("original");
  });
});

describe("second pass", () => {
  it("corrects the video bitrate by the overshoot so the retry lands under the target", () => {
    const target = 10 * MB;
    const audio = 128_000;
    const d = 30;
    const first = 2_379_000;
    // The encoder came out 12% over its own estimate.
    const actual = estimateBytes(first, d, audio) * 1.12;
    const next = retryVideoBitrate(first, audio, d, target, actual);
    expect(next).toBeLessThan(first);
    // With the same 12% overshoot on the video share, the retry fits.
    const retried = ((next * 1.12 + audio) * d) / 8;
    expect(retried).toBeLessThanOrEqual(target);
  });
  it("never plans below the floor", () => {
    expect(retryVideoBitrate(210_000, 64_000, 300, 10 * MB, 30 * MB)).toBe(
      MIN_TARGET_VIDEO_BITRATE,
    );
  });
});

describe("compress families", () => {
  const family = tools.filter(
    (t) => t.engine === "compress" && t.presetOptions.preset === "target",
  );
  it("generates the platform and size pages", () => {
    expect(family.length).toBeGreaterThanOrEqual(10);
  });
  it("defaults every page to a size target that fits the page's promise", () => {
    for (const t of family) {
      const p = t.presetOptions;
      expect(typeof p.targetMb).toBe("number");
      const platform = typeof p.platform === "string" ? platforms[p.platform as "discord"] : null;
      if (platform) {
        // The default is the platform's own safe tier, and it is one of the offered tiers.
        expect(p.targetMb).toBe(platform.defaultMb);
        expect(platform.tiers.map((x) => x.mb)).toContain(p.targetMb);
      } else {
        expect(t.slug).toBe(`compress-video-under-${p.targetMb}mb`);
      }
    }
  });
  it("dates and sources every platform limit", () => {
    for (const p of Object.values(platforms)) {
      expect(p.sources.length).toBeGreaterThan(0);
      for (const s of p.sources) {
        expect(s.url).toMatch(/^https:\/\//);
        expect(s.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});

/**
 * The page copy quotes these figures by hand (compress-sizes.ts, compress-platforms.ts). If the planner
 * changes, this fails and the copy must be updated with it.
 */
describe("figures quoted in the family copy", () => {
  const at = (mb: number, d: number) => planTarget(mb * MB, { ...phone, durationSec: d }, "auto");
  const mmss = (s: number) => {
    const r = Math.round(s);
    return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
  };
  const longest = (mb: number) => {
    const p = at(mb, 1e9);
    return p.ok ? "" : mmss(p.maxDurationSec);
  };
  it("longest clip that fits each size", () => {
    expect(longest(8)).toBe("3:48");
    expect(longest(10)).toBe("4:45");
    expect(longest(16)).toBe("7:36");
    expect(longest(20)).toBe("9:30");
    expect(longest(25)).toBe("11:52");
    expect(longest(50)).toBe("23:44");
    expect(longest(100)).toBe("47:28");
  });
  it("resolution and bitrate claims", () => {
    const res = (mb: number, d: number) => {
      const p = at(mb, d);
      return p.ok ? (p.height === "original" ? 1080 : p.outHeight) : 0;
    };
    const mbps = (mb: number, d: number) => {
      const p = at(mb, d);
      return p.ok ? Math.round(p.videoBitrate / 100_000) / 10 : 0;
    };
    // 8 MB: full 1080p up to about 20 seconds, 480p at a minute (under 1 Mbps).
    expect(res(8, 20)).toBe(1080);
    expect(res(8, 25)).toBeLessThan(1080);
    expect(res(8, 60)).toBe(480);
    expect(mbps(8, 60)).toBeLessThan(1);
    // 10 MB (and the Discord page): 15 s keeps 1080p, a minute is 720p at about 1.1 Mbps.
    expect(res(10, 15)).toBe(1080);
    expect(res(10, 60)).toBe(720);
    expect(mbps(10, 60)).toBe(1.1);
    // 16 MB: 30 s at 1080p, a minute at 720p, two minutes at 480p.
    expect(res(16, 30)).toBe(1080);
    expect(res(16, 60)).toBe(720);
    expect(res(16, 120)).toBe(480);
    // 20 MB: two minutes keep 720p at a little over 1 Mbps; past two and a half minutes 480p.
    expect(res(20, 120)).toBe(720);
    expect(mbps(20, 120)).toBe(1.1);
    expect(res(20, 180)).toBe(480);
    // 25 MB: a minute keeps 1080p at about 3 Mbps.
    expect(res(25, 60)).toBe(1080);
    expect(mbps(25, 60)).toBe(3);
    // 50 MB: two minutes at 1080p (about 3 Mbps), five minutes at 720p.
    expect(res(50, 120)).toBe(1080);
    expect(mbps(50, 120)).toBe(3);
    expect(res(50, 300)).toBe(720);
    // 100 MB: three minutes at 1080p (about 4 Mbps), five at 720p (about 2.4), twenty at 480p.
    expect(res(100, 180)).toBe(1080);
    expect(mbps(100, 180)).toBe(4);
    expect(res(100, 300)).toBe(720);
    expect(mbps(100, 300)).toBe(2.4);
    expect(res(100, 1200)).toBe(480);
  });
});
