import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSafetensors, SileroVad, VAD_CHUNK } from "@/tools/engines/sound/dsp/silero-vad";
import { SPEECH_MODELS } from "@/tools/workers/speech-models";
import { readWav16 } from "./speech-wav";

const modelBytes = readFileSync(`public${SPEECH_MODELS.vad.path}`);

/**
 * Parity of our forward pass with the official Silero VAD 6.2.3 ONNX model (onnxruntime, run offline;
 * tests/fixtures/speech/vad-16k.onnx.json) on 16 kHz input: a voice over music, then over a fan.
 */
describe("Silero VAD forward pass", () => {
  it("ships the expected model file", () => {
    expect(modelBytes.length).toBe(SPEECH_MODELS.vad.bytes);
    expect(createHash("sha256").update(modelBytes).digest("hex")).toBe(SPEECH_MODELS.vad.sha256);
  });

  it("matches the official ONNX model frame by frame", () => {
    const vad = new SileroVad(readSafetensors(new Uint8Array(modelBytes)));
    const { rate, x } = readWav16("tests/fixtures/speech/vad-16k.wav");
    expect(rate).toBe(16_000);
    const ref = (
      JSON.parse(readFileSync("tests/fixtures/speech/vad-16k.onnx.json", "utf8")) as {
        probs: number[];
      }
    ).probs;
    const chunk = new Float32Array(VAD_CHUNK);
    const n = Math.ceil(x.length / VAD_CHUNK);
    expect(n).toBe(ref.length);
    let agree = 0;
    let maxErr = 0;
    for (let i = 0; i < n; i++) {
      chunk.fill(0);
      chunk.set(x.subarray(i * VAD_CHUNK, (i + 1) * VAD_CHUNK));
      const p = vad.process(chunk);
      const r = ref[i] as number;
      maxErr = Math.max(maxErr, Math.abs(p - r));
      if (p >= 0.5 === r >= 0.5) agree++;
    }
    // Weights stored as float16: within 0.02 of the float32 model, decisions the same on ≥ 99.5%.
    expect(maxErr).toBeLessThan(0.02);
    expect(agree / n).toBeGreaterThanOrEqual(0.995);
  });

  it("resets to the state of a new file", () => {
    const vad = new SileroVad(readSafetensors(new Uint8Array(modelBytes)));
    const { x } = readWav16("tests/fixtures/speech/vad-16k.wav");
    const run = () => {
      vad.reset();
      const out: number[] = [];
      for (let i = 0; i < 40; i++)
        out.push(vad.process(x.slice(i * VAD_CHUNK, (i + 1) * VAD_CHUNK)));
      return out;
    };
    expect(run()).toEqual(run());
  });

  it("refuses a file that is not the model", () => {
    expect(() => readSafetensors(new Uint8Array(16))).toThrow();
    const weights = readSafetensors(new Uint8Array(modelBytes));
    delete weights["lstm_cell.weight_ih"];
    expect(() => new SileroVad(weights)).toThrow(/not the expected one/);
  });
});
