import type { FormatId } from "./index";

/**
 * Each video format's name as the world writes it: the one definition, which the profiles in
 * ./index.ts and ./video-profiles.ts take their `name` from. Apart from the profiles so a page's first
 * load (the converter's drop prompt, ADR-0140) can name a format without carrying every profile's prose.
 */
export const formatNames: Record<FormatId, string> = {
  mp4: "MP4",
  mov: "MOV",
  webm: "WebM",
  mkv: "MKV",
  avi: "AVI",
  wmv: "WMV",
  flv: "FLV",
  mpeg: "MPEG",
  ts: "TS",
  mts: "MTS",
  "3gp": "3GP",
  vob: "VOB",
  ogv: "OGV",
  m4v: "M4V",
};
