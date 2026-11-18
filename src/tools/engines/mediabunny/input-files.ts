/**
 * The file each mediabunny Input was opened from (by `openInput`), for the few facts mediabunny does
 * not read itself (a Matroska CodecDelay, an Opus source's end trimming). No network access.
 */
import type { Input } from "mediabunny";

const opened = new WeakMap<Input, File>();

export const rememberFile = (input: Input, file: File) => {
  opened.set(input, file);
};

/** The file `input` was opened from, when it was opened by `openInput`. */
export const fileOfInput = (input: Input): File | undefined => opened.get(input);
