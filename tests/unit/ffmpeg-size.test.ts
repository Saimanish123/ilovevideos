import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FFMPEG_CORE_BYTES, FFMPEG_WASM_BYTES } from "@/tools/engines/ffmpeg/size";

const dir = "public/wasm/ffmpeg/0.12.10";
const files = ["ffmpeg-core.wasm", "ffmpeg-core.js", "ffmpeg-core.worker.js"];

describe("ffmpeg download size", () => {
  it.skipIf(!existsSync(`${dir}/ffmpeg-core.wasm`))("matches the copied core files", () => {
    const total = files.reduce((sum, f) => sum + statSync(`${dir}/${f}`).size, 0);
    expect(FFMPEG_CORE_BYTES).toBe(total);
    expect(FFMPEG_WASM_BYTES).toBe(statSync(`${dir}/ffmpeg-core.wasm`).size);
  });
});
