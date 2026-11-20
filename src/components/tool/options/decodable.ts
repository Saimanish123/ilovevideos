import { codecName } from "@/tools/engines/convert-video/plan";
import type { MediaInfo } from "@/tools/engines/types";
import type { Blocked } from "./types";

/**
 * Before a run, for pages that re-encode the picture natively: a picture this browser cannot decode
 * (ProRes; HEVC without platform support) would be dropped, so say so and offer the converter, which
 * can use the ffmpeg engine (`MediaInfo.video.decodable`, probed at inspection; ADR-0054).
 */
export function undecodablePicture(...infos: (MediaInfo | undefined)[]): Blocked | undefined {
  const bad = infos.find((i) => i?.video?.decodable === false)?.video;
  if (!bad) return undefined;
  const name = codecName(bad.codec) ?? bad.codec;
  return {
    reason: `This browser cannot decode the ${name} video in this file, so this page cannot work on it.`,
    action: { slug: "video-converter", label: "Convert it to H.264 MP4 first" },
    fixable: false,
  };
}
