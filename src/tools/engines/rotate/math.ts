/** Pure helpers for the rotate/flip engine. Unit-tested. */
import { shellQuote } from "@/lib/format";

export type Rotation = 0 | 90 | 180 | 270;
export type Flip = "none" | "horizontal" | "vertical";
export const rotations: readonly Rotation[] = [0, 90, 180, 270];

/** Adds a quarter turn (clockwise for +90, anticlockwise for −90) and wraps into 0–270. */
export function addRotation(current: Rotation, delta: 90 | -90): Rotation {
  return ((((current + delta) % 360) + 360) % 360) as Rotation;
}

/** Output dimensions: a quarter turn swaps width and height; a flip never changes them. */
export function rotatedDimensions(
  width: number,
  height: number,
  rotate: Rotation,
): { width: number; height: number } {
  return rotate % 180 === 0 ? { width, height } : { width: height, height: width };
}

/** True when nothing changes: no rotation and no flip. */
export const isIdentity = (rotate: Rotation, flip: Flip) => rotate === 0 && flip === "none";

/**
 * Whether the run is a lossless metadata rotation: only MP4 and MOV carry a rotation matrix in the
 * track header; WebM and MKV do not, and a flip always needs the pixels rewritten.
 */
export function isMetadataRotation(container: "mp4" | "mov" | "webm" | "mkv", flip: Flip): boolean {
  return flip === "none" && (container === "mp4" || container === "mov");
}

/** ffmpeg filter chain for the same result: rotation first (transpose), then the flip. */
export function rotateFilter(rotate: Rotation, flip: Flip): string {
  const parts: string[] = [];
  if (rotate === 90) parts.push("transpose=1");
  if (rotate === 180) parts.push("transpose=1,transpose=1");
  if (rotate === 270) parts.push("transpose=2");
  if (flip === "horizontal") parts.push("hflip");
  if (flip === "vertical") parts.push("vflip");
  return parts.join(",");
}

export function rotateCommand(
  inputName: string,
  outputName: string,
  rotate: Rotation,
  flip: Flip,
  metadataOnly: boolean,
  /** ffmpeg filter that cuts an odd edge before the turn ("crop=640:360:0:0"), when H.264 needs it. */
  cut = "",
): string {
  if (metadataOnly) {
    // Angle is anticlockwise in ffmpeg's rotate display matrix; -c copy keeps every stream as is.
    const angle = rotate === 0 ? 0 : 360 - rotate;
    return `ffmpeg -i ${shellQuote(inputName)} -c copy -metadata:s:v rotate=${angle} ${shellQuote(outputName)}`;
  }
  const vf = [cut, rotateFilter(rotate, flip)].filter(Boolean).join(",");
  return `ffmpeg -i ${shellQuote(inputName)} -vf ${vf} -c:a copy ${shellQuote(outputName)}`;
}
