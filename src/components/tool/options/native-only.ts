import { needsFfmpeg, sourceName } from "@/tools/engines/crop/plan";
import type { MediaInfo } from "@/tools/engines/types";
import { undecodablePicture } from "./decodable";
import type { Blocked } from "./types";

/**
 * Before a run, for pages whose engine decodes and draws every frame in the browser and has no
 * ffmpeg.wasm route (freeze frame, zoom, layouts, clips): a file only ffmpeg can read (AVI, WMV,
 * FLV, MPEG-2) or a picture this browser cannot decode is refused with the way out, the converter.
 */
export function nativeOnly(info: MediaInfo, what = "this file"): Blocked | undefined {
  const undecodable = undecodablePicture(info);
  if (undecodable) return undecodable;
  if (needsFfmpeg(info, sourceName(info)))
    return {
      reason: `This browser cannot read the ${info.container} format of ${what} frame by frame.`,
      action: { slug: "video-converter", label: "Convert it to MP4 first" },
    };
  return undefined;
}
