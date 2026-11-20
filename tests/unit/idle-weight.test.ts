import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { undecodablePicture } from "@/components/tool/options/decodable";
import { idle as aspectRatio } from "@/components/tool/options/idle/aspect-ratio";
import { idle as convertAudio } from "@/components/tool/options/idle/convert-audio";
import { idle as convertVideo } from "@/components/tool/options/idle/convert-video";
import { idle as videoToAudio } from "@/components/tool/options/idle/video-to-audio";
import { blockOf, unfixable } from "@/components/tool/options/types";
import { formats } from "@/content/formats";
import { audioFormatById, audioSources } from "@/content/formats/audio";
import { getPlatform } from "@/content/platforms";
import { framePlatforms } from "@/content/platforms/frames";
import type { MediaInfo } from "@/tools/engines/types";
import { tools } from "@/tools/registry";

/**
 * Every tool page loads every engine's idle module in one chunk (ADR-0104, ADR-0140), so they name
 * formats and platforms from the light name tables and load their heavier parts on use.
 */
describe("idle modules stay light", () => {
  const dir = "src/components/tool/options/idle";
  // Tables with prose, specs or geometry, and UI that belongs in a lazy part.
  const heavy = [
    '"@/content/formats"',
    '"@/content/formats/audio"',
    '"@/content/formats/containers"',
    '"@/content/platforms"',
    '"@/content/platforms/frames"',
    '"@/tools/engines/crop/math"',
    '"@/components/tool/crop/idle"',
    '"@/components/tool/crop/platform-idle"',
    '"@/components/ui/segmented"',
  ];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
    it(`${file} imports no heavy module`, () => {
      const src = readFileSync(join(dir, file), "utf8");
      const imports = src
        .split("\n")
        .filter((l) => /^import (?!type )/.test(l) || /^} from/.test(l));
      for (const h of heavy) expect(imports.join("\n"), `${file} imports ${h}`).not.toContain(h);
    });
  }

  it("drop prompts name every pair's formats as the profiles do", () => {
    for (const t of tools) {
      const p = t.presetOptions ?? {};
      if (t.engine === "convert-video" && typeof p.from === "string") {
        const name = formats[p.from as keyof typeof formats]?.name;
        expect(name, t.slug).toBeDefined();
        expect(convertVideo.dropPrompt?.(p), t.slug).toContain(` ${name} file`);
      }
      if (t.engine === "convert-audio" && typeof p.from === "string" && typeof p.to === "string") {
        const from = audioSources.find((s) => s.id === p.from)?.name;
        const to = audioFormatById.get(p.to as never)?.name;
        expect(convertAudio.dropPrompt?.(p), t.slug).toMatch(
          new RegExp(` ${from} file to convert it to ${to?.replace(/[()]/g, "\\$&")}$`),
        );
      }
      if (t.engine === "video-to-audio" && typeof p.to === "string" && typeof p.from === "string") {
        const to = audioFormatById.get(p.to as never)?.name;
        expect(videoToAudio.dropPrompt?.(p), t.slug).toContain(`save its sound as ${to}`);
      }
      // The compress idle loads the tier picker for any string `platform`: it must be a real one.
      if (t.engine === "compress" && p.platform !== undefined)
        expect(getPlatform(p.platform), t.slug).toBeDefined();
      if (t.engine === "aspect-ratio" && typeof p.platform === "string") {
        const name = framePlatforms[p.platform as keyof typeof framePlatforms]?.name;
        expect(aspectRatio.dropPrompt?.(p), t.slug).toBe(`Drop a video to resize it for ${name}`);
      }
    }
  });

  it("plain pages keep their plain prompts", () => {
    expect(convertVideo.dropPrompt?.({})).toBe("Drop a video to convert it");
    expect(convertVideo.dropPrompt?.({ from: "mov" })).toBe("Drop a MOV file");
    expect(convertVideo.dropPrompt?.({ from: "avi" })).toBe("Drop an AVI file");
    expect(aspectRatio.dropPrompt?.({ ratio: "9:16" })).toBe("Drop a video to make it 9:16");
    expect(aspectRatio.dropPrompt?.({ ratio: "2:1" })).toBe("Drop a video to reshape it");
    expect(convertAudio.dropPrompt?.({ from: "flac", to: "mp3" })).toBe(
      "Drop a FLAC file to convert it to MP3",
    );
  });
});

describe("blocks no option can clear (ADR-0141)", () => {
  it("a plain reason can be cleared on the page; unfixable says it cannot", () => {
    expect(blockOf("Choose a rotation first.")?.fixable).toBeUndefined();
    expect(unfixable("This file has no video track.")).toEqual({
      reason: "This file has no video track.",
      fixable: false,
    });
    const action = { slug: "video-converter", label: "Convert to MP4" };
    expect(unfixable("No.", action)).toEqual({ reason: "No.", action, fixable: false });
  });

  it("a picture this browser cannot decode is unfixable, with the converter as the way out", () => {
    const info = { video: { codec: "prores", decodable: false } } as unknown as MediaInfo;
    const b = undecodablePicture(info);
    expect(b?.fixable).toBe(false);
    expect(b?.action?.slug).toBe("video-converter");
    expect(undecodablePicture({ video: { codec: "avc" } } as unknown as MediaInfo)).toBeUndefined();
  });
});
