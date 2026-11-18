/**
 * The colour space a re-encoded picture declares. Pure; unit-tested; safe on the page.
 *
 * A re-encode carries the source's own tags. An untagged source is read as its kind usually is:
 * standard definition (576 lines or fewer) as BT.601 (smpte170m), anything larger as BT.709. Chromium
 * decodes every untagged picture as BT.709 and its encoder copies that tag, so an untagged SD clip came
 * out tagged BT.709 with BT.601 pixels: players that honour tags (ffmpeg, mpv, VLC) then show it
 * shifted (measured 30.3 dB RGB against the source, 47.6 dB once tagged smpte170m).
 */

export interface ColorTags {
  primaries?: string | null;
  transfer?: string | null;
  matrix?: string | null;
  fullRange?: boolean | null;
}

type Triple = { primaries: string; transfer: string; matrix: string };

const SD: Triple = {
  primaries: "smpte170m",
  transfer: "smpte170m",
  matrix: "smpte170m",
};
const HD: Triple = {
  primaries: "bt709",
  transfer: "bt709",
  matrix: "bt709",
};

/** Lines at or below which an untagged picture is read as standard definition. */
export const SD_MAX_LINES = 576;

/** What the output should declare for a source with these tags and this many coded lines. */
export function targetColorTags(
  source: ColorTags | undefined,
  lines: number,
): { primaries: string; transfer: string; matrix: string; fullRange: boolean } {
  const d = lines <= SD_MAX_LINES ? SD : HD;
  return {
    primaries: source?.primaries || d.primaries,
    transfer: source?.transfer || d.transfer,
    matrix: source?.matrix || d.matrix,
    fullRange: source?.fullRange ?? false,
  };
}

/** True when the source names its matrix, primaries and transfer (nothing is assumed). */
export const fullyTagged = (source: ColorTags | undefined) =>
  !!source?.matrix && !!source.primaries && !!source.transfer;

/** True when a decoded frame already declares what the output should. */
export const sameColorTags = (a: ColorTags, b: ColorTags) =>
  a.matrix === b.matrix &&
  a.primaries === b.primaries &&
  a.transfer === b.transfer &&
  !!a.fullRange === !!b.fullRange;

/** Luma weights (Kr, Kb) of the matrices a decoder may read a picture with. */
const WEIGHTS: Record<string, [number, number]> = {
  bt709: [0.2126, 0.0722],
  smpte170m: [0.299, 0.114],
  bt470bg: [0.299, 0.114],
};

/** Y′CbCr → R′G′B′ for a matrix, row-major 3×3 (Y′ 0–1, Cb and Cr −0.5–0.5). */
function toRgb([kr, kb]: [number, number]): number[] {
  const kg = 1 - kr - kb;
  return [
    1,
    0,
    2 * (1 - kr),
    1,
    (-2 * kb * (1 - kb)) / kg,
    (-2 * kr * (1 - kr)) / kg,
    1,
    2 * (1 - kb),
    0,
  ];
}

/** R′G′B′ → Y′CbCr for a matrix, row-major 3×3. */
function toYcc([kr, kb]: [number, number]): number[] {
  const kg = 1 - kr - kb;
  return [
    kr,
    kg,
    kb,
    -kr / (2 * (1 - kb)),
    -kg / (2 * (1 - kb)),
    0.5,
    0.5,
    -kg / (2 * (1 - kr)),
    -kb / (2 * (1 - kr)),
  ];
}

const mul3 = (a: number[], b: number[]) =>
  Array.from({ length: 9 }, (_, i) => {
    const r = Math.floor(i / 3);
    const c = i % 3;
    return (
      (a[r * 3] ?? 0) * (b[c] ?? 0) +
      (a[r * 3 + 1] ?? 0) * (b[3 + c] ?? 0) +
      (a[r * 3 + 2] ?? 0) * (b[6 + c] ?? 0)
    );
  });

/**
 * The R′G′B′ correction for a picture drawn with the wrong matrix: colours a decoder made reading
 * Y′CbCr as `read` are turned into those `meant` gives (both on the same range, so it is linear).
 * Row-major 3×4 with zero offsets, the shape ./color transforms use. Identity when they agree or
 * either is unknown.
 */
export function matrixCorrection(read: string, meant: string): number[] {
  const a = WEIGHTS[read];
  const b = WEIGHTS[meant];
  const m = a && b && a !== b ? mul3(toRgb(b), toYcc(a)) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return [m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0] as number[];
}
