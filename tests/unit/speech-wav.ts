import { readFileSync } from "node:fs";

/** Reads a 16-bit PCM WAV (the speech fixtures) as mono float samples. Test helper. */
export function readWav16(path: string): { rate: number; x: Float32Array } {
  const b = readFileSync(path);
  let p = 12;
  let rate = 0;
  let channels = 1;
  while (p < b.length) {
    const id = b.toString("ascii", p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === "fmt ") {
      channels = b.readUInt16LE(p + 10);
      rate = b.readUInt32LE(p + 12);
      if (b.readUInt16LE(p + 22) !== 16) throw new Error("16-bit WAV only");
    }
    if (id === "data") {
      const n = size / 2 / channels;
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += b.readInt16LE(p + 8 + (i * channels + c) * 2);
        x[i] = s / channels / 32_768;
      }
      return { rate, x };
    }
    p += 8 + size + (size & 1);
  }
  throw new Error("No data chunk");
}

export const segmentsOf = (path: string) =>
  (JSON.parse(readFileSync(path, "utf8")) as { segments: { start: number; end: number }[] })
    .segments;
