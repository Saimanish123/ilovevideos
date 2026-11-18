/** Hand-written types for gifenc 1.0 (MIT), which ships no declarations. */
declare module "gifenc" {
  export type PixelFormat = "rgb565" | "rgb444" | "rgba4444";
  /** Array of [r, g, b] or [r, g, b, a] byte triples/quads, at most 256 entries. */
  export type Palette = number[][];

  export interface QuantizeOptions {
    format?: PixelFormat;
    oneBitAlpha?: boolean | number;
    clearAlpha?: boolean;
    clearAlphaThreshold?: number;
    clearAlphaColor?: number;
  }

  export interface FrameOptions {
    palette?: Palette;
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    /** Frame delay in milliseconds (stored in hundredths of a second). */
    delay?: number;
    /** -1 plays once, 0 loops forever, N repeats N times. Written with the first frame only. */
    repeat?: number;
    dispose?: number;
  }

  export interface GIFEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: FrameOptions): void;
    writeHeader(): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(opts?: {
    auto?: boolean;
    initialCapacity?: number;
  }): GIFEncoderInstance;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): Palette;
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: PixelFormat,
  ): Uint8Array;
  export function nearestColorIndex(palette: Palette, pixel: number[]): number;
}
