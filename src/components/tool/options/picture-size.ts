import type { MediaInfo } from "@/tools/engines/types";
import {
  pictureSize as encodedPictureSize,
  pictureSizeNote,
} from "@/tools/engines/video-filter/plan";

/** The size an H.264 re-encode writes: the source's, less an odd edge (ADR-0060). */
export const pictureSize = (info: MediaInfo) => encodedPictureSize(info);

/** " 641×361 becomes 640×360: H.264 needs even edges." with a leading space, or "" for even sources. */
export const sizeNote = (info: MediaInfo) => {
  const note = pictureSizeNote(info);
  return note ? ` ${note}` : "";
};
