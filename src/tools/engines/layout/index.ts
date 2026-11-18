/**
 * Two videos in one frame (C10): picture in picture, side by side and stacked (./options). Both
 * pictures are decoded at once, each frame of the output is drawn on an OffscreenCanvas from the
 * frame each clip shows at that moment (./options `placement`, `secondTime`), and the result is
 * encoded once to H.264 (../compose/encode). The sound is the main clip's, the second's (placed at
 * its offset), or both summed and kept under −1 dBTP by the look-ahead limiter
 * (../sound/dsp/limiter), encoded to AAC. Runs in the engine worker. No network access.
 */
import { type Input, type VideoSample, VideoSampleSink } from "mediabunny";
import { baseName } from "@/lib/format";
import { encodeComposed } from "../compose/encode";
import { exactSpan, mixInto, silenceBlocks } from "../compose/sound";
import { FrameCanvas, openPicture, type Picture } from "../compose/source";
import { classifyError, EngineError } from "../errors";
import { canEncodeAvc, openInput, pictureDecodes } from "../mediabunny/shared";
import { LinearResampler, mixChannels } from "../merge/resample";
import { Limiter } from "../sound/dsp/limiter";
import { openSound, type SoundSource } from "../sound/reader";
import type { Engine, EngineContext, MediaInput } from "../types";
import {
  type Box,
  frameSize,
  LayoutOptions,
  layoutBitrate,
  layoutCommand,
  mainVisible,
  outputLength,
  placeIn,
  placement,
  secondTime,
} from "./options";

export { LayoutOptions };

const MAX_FPS = 60;

/**
 * A clip's frames, read in order: `at(t)` gives the frame shown at clip time `t` (the last one
 * starting at or before it), keeping it until a later one replaces it. Times only move forward.
 */
class FrameCursor {
  private readonly it: AsyncIterator<VideoSample>;
  private current: VideoSample | null = null;
  private next: VideoSample | null = null;
  private done = false;
  constructor(
    track: Picture["track"],
    private readonly t0: number,
  ) {
    this.it = new VideoSampleSink(track).samples()[Symbol.asyncIterator]();
  }
  private async pull(): Promise<VideoSample | null> {
    if (this.done) return null;
    const r = await this.it.next();
    if (r.done) {
      this.done = true;
      return null;
    }
    return r.value;
  }
  async at(t: number): Promise<VideoSample | null> {
    if (!this.current) {
      this.current = await this.pull();
      this.next = await this.pull();
    }
    while (this.next && this.next.timestamp - this.t0 <= t + 1e-6) {
      this.current?.close();
      this.current = this.next;
      this.next = await this.pull();
    }
    return this.current;
  }
  async close() {
    this.current?.close();
    this.next?.close();
    this.current = null;
    this.next = null;
    await this.it.return?.(undefined).catch(() => undefined);
  }
}

/** Draws `sample` into `cell` of the canvas, cut to fill or whole, clipped to a rounded box. */
function drawCell(
  c: OffscreenCanvasRenderingContext2D,
  sample: VideoSample,
  display: { width: number; height: number },
  cell: Box,
  fit: LayoutOptions["fit"],
  radius = 0,
) {
  const { from, to } = placeIn(display, cell, fit);
  // Display (rotated, square-pixel) coordinates to the sample's own display space.
  const kx = sample.displayWidth / display.width;
  const ky = sample.displayHeight / display.height;
  c.save();
  if (radius > 0) {
    c.beginPath();
    c.roundRect(cell.x, cell.y, cell.width, cell.height, radius);
    c.clip();
  }
  sample.draw(
    c,
    from.x * kx,
    from.y * ky,
    from.width * kx,
    from.height * ky,
    to.x,
    to.y,
    to.width,
    to.height,
  );
  c.restore();
}

/** The sound of one clip as blocks at `rate` and `channels`, placed from output time `start`. */
async function* placedSound(
  src: SoundSource,
  shift: number,
  from: number,
  to: number,
  start: number,
  rate: number,
  channels: number,
  signal: AbortSignal,
): AsyncGenerator<Float32Array[]> {
  const resampler =
    src.sampleRate !== rate ? new LinearResampler(src.sampleRate, rate, src.channels) : null;
  for (const s of silenceBlocks(Math.max(0, start) * src.sampleRate, src.channels)) {
    const planes = resampler ? resampler.process(s) : s;
    yield mixChannels(planes, channels);
  }
  for await (const block of exactSpan(src, from, to, shift, { in: from > 0, out: false }, signal)) {
    const planes = resampler ? resampler.process(block) : block;
    yield mixChannels(planes, channels);
  }
}

/** Reads exactly `n` frames at a time from blocks, silence after they end. */
class BlockReader {
  private buf: Float32Array[] = [];
  private fill = 0;
  private ended = false;
  constructor(
    private readonly it: AsyncIterator<Float32Array[]>,
    private readonly channels: number,
  ) {}
  async read(n: number): Promise<Float32Array[]> {
    while (this.fill < n && !this.ended) {
      const r = await this.it.next();
      if (r.done) {
        this.ended = true;
        break;
      }
      const m = r.value[0]?.length ?? 0;
      this.buf = Array.from({ length: this.channels }, (_, c) => {
        const out = new Float32Array(this.fill + m);
        out.set((this.buf[c] ?? new Float32Array(0)).subarray(0, this.fill));
        out.set(r.value[c] ?? r.value[0] ?? new Float32Array(m), this.fill);
        return out;
      });
      this.fill += m;
    }
    const take = Math.min(n, this.fill);
    const out = Array.from({ length: this.channels }, (_, c) => {
      const p = new Float32Array(n);
      p.set((this.buf[c] ?? new Float32Array(0)).subarray(0, take));
      return p;
    });
    this.buf = this.buf.map((p) => p.slice(take));
    this.fill -= take;
    return out;
  }
}

const describeInput = (i: number) => (i === 0 ? "The first video" : "The second video");

export const layoutEngine: Engine<LayoutOptions> = {
  id: "layout",
  backends: ["webcodecs"],
  optionsSchema: LayoutOptions,
  async supports(backend, input, options, inputs) {
    if (backend !== "webcodecs") return false;
    const all = inputs ?? [input];
    if (all.length < 2) return false;
    if (!all.every((i) => i.info?.video && pictureDecodes(i.info))) return false;
    const [a, b] = options.swap ? [all[1], all[0]] : [all[0], all[1]];
    const va = a?.info?.video;
    const vb = b?.info?.video;
    if (!va || !vb) return false;
    const f = frameSize(options, va, vb);
    return canEncodeAvc(f.width, f.height);
  },
  async run(_backend, inputs, options, ctx) {
    if (inputs.length < 2)
      throw new EngineError("unsupported-input", "Add a second video first.", "Drop two videos.");
    const ordered = options.swap ? [inputs[1], inputs[0]] : [inputs[0], inputs[1]];
    return runLayout(ordered as [MediaInput, MediaInput], options, ctx);
  },
};

async function runLayout([a, b]: [MediaInput, MediaInput], o: LayoutOptions, ctx: EngineContext) {
  const ia = a.info;
  const ib = b.info;
  if (!ia?.video || !ib?.video)
    throw new EngineError("unsupported-input", "Both files need a picture.", "Choose two videos.");
  const inA: Input = openInput(a.file);
  const inB: Input = openInput(b.file);
  const cursors: FrameCursor[] = [];
  try {
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Opening both videos" });
    const pa = await openPicture(inA, describeInput(o.swap ? 1 : 0));
    const pb = await openPicture(inB, describeInput(o.swap ? 0 : 1));
    const place = placement(o, pa.display, pb.display);
    const { frame } = place;
    const durA = ia.durationSec;
    const durB = ib.durationSec;
    const outSec = outputLength(o, durA, durB);
    if (!(outSec > 0))
      throw new EngineError(
        "unsupported-input",
        "The videos have no length to lay out.",
        "Check the start offset.",
      );
    const fps = Math.min(MAX_FPS, Math.max(ia.video.fps || 30, ib.video.fps || 30));
    const bitrate = layoutBitrate(
      o,
      { ...ia.video, ...pa.display },
      { ...ib.video, ...pb.display },
      fps,
    );

    // Sound: the clips that are asked for and have sound this browser decodes.
    const sa = await openSound(inA, a.file);
    const sb = await openSound(inB, b.file);
    const okA = !!sa && (await sa.track.canDecode());
    const okB = !!sb && (await sb.track.canDecode());
    const wantA =
      (o.sound === "main" || o.sound === "both" || (o.sound === "second" && !okB)) && okA;
    const wantB =
      (o.sound === "second" || o.sound === "both" || (o.sound === "main" && !okA)) && okB;
    const rate = wantA && sa ? sa.sampleRate : wantB && sb ? sb.sampleRate : 48_000;
    const channels = Math.max(
      wantA && sa ? Math.min(2, sa.channels) : 1,
      wantB && sb ? Math.min(2, sb.channels) : 1,
    );
    const totalFrames = Math.round(outSec * rate);

    const frames = async function* (signal: AbortSignal): AsyncGenerator<VideoSample> {
      const ca = new FrameCursor(pa.track, ia.startSec ?? 0);
      const cb = new FrameCursor(pb.track, ib.startSec ?? 0);
      cursors.push(ca, cb);
      const canvas = new FrameCanvas(frame.width, frame.height);
      const g = canvas.ctx;
      const n = Math.max(1, Math.round(outSec * fps));
      for (let k = 0; k < n; k++) {
        if (signal.aborted) return;
        const t = k / fps;
        g.fillStyle = "#000";
        g.fillRect(0, 0, frame.width, frame.height);
        if (mainVisible(o, t, durA)) {
          const s = await ca.at(Math.min(t, durA));
          if (s) drawCell(g, s, pa.display, place.main, o.layout === "pip" ? "cover" : o.fit);
        }
        const st = secondTime(o, t, durB);
        if (st.visible) {
          const s = await cb.at(st.time);
          if (s) {
            if (o.layout === "pip" && place.border > 0) {
              const r = place.second;
              const bw = place.border;
              g.fillStyle = o.borderColor === "white" ? "#fff" : "#000";
              g.beginPath();
              g.roundRect(
                r.x - bw,
                r.y - bw,
                r.width + 2 * bw,
                r.height + 2 * bw,
                place.radius > 0 ? place.radius + bw : 0,
              );
              g.fill();
            }
            drawCell(
              g,
              s,
              pb.display,
              place.second,
              o.layout === "pip" ? "cover" : o.fit,
              place.radius,
            );
          }
        }
        if (o.layout !== "pip" && place.border > 0) {
          g.fillStyle = o.borderColor === "white" ? "#fff" : "#000";
          if (o.layout === "side")
            g.fillRect(
              place.main.x + place.main.width,
              0,
              place.second.x - place.main.x - place.main.width,
              frame.height,
            );
          else
            g.fillRect(
              0,
              place.main.y + place.main.height,
              frame.width,
              place.second.y - place.main.y - place.main.height,
            );
        }
        yield canvas.sample(t, 1 / fps);
      }
    };

    const sound =
      wantA || wantB
        ? {
            sampleRate: rate,
            channels,
            blocks: async function* (signal: AbortSignal): AsyncGenerator<Float32Array[]> {
              const shiftA = (ia.startSec ?? 0) + (sa?.delay ?? 0);
              const shiftB = (ib.startSec ?? 0) + (sb?.delay ?? 0);
              const ra =
                wantA && sa
                  ? new BlockReader(
                      placedSound(sa, shiftA, 0, Math.min(durA, outSec), 0, rate, channels, signal)[
                        Symbol.asyncIterator
                      ](),
                      channels,
                    )
                  : null;
              const bFrom = Math.max(0, -o.offset);
              const bTo = Math.min(durB, outSec - o.offset);
              const rb =
                wantB && sb && bTo > bFrom
                  ? new BlockReader(
                      placedSound(
                        sb,
                        shiftB,
                        bFrom,
                        bTo,
                        Math.max(0, o.offset),
                        rate,
                        channels,
                        signal,
                      )[Symbol.asyncIterator](),
                      channels,
                    )
                  : null;
              const both = !!ra && !!rb;
              const limiter = both ? new Limiter(channels, rate, 10 ** (-1 / 20)) : null;
              const BLOCK = 4096;
              for (let pos = 0; pos < totalFrames; pos += BLOCK) {
                if (signal.aborted) return;
                const n = Math.min(BLOCK, totalFrames - pos);
                const x = ra ? await ra.read(n) : null;
                const y = rb ? await rb.read(n) : null;
                const mixed = x && y ? mixInto(x, 1, y, 1) : (x ?? y);
                if (!mixed) return;
                yield limiter ? limiter.process(mixed, n) : mixed;
              }
              if (limiter) yield limiter.flush();
            },
          }
        : undefined;

    const outputName = `${baseName(a.file.name)}-${o.layout === "pip" ? "pip" : o.layout === "side" ? "side-by-side" : "stacked"}.mp4`;
    const r = await encodeComposed({
      size: frame,
      fps,
      bitrate,
      durationSec: outSec,
      frames,
      ...(sound ? { sound } : {}),
      expectedBytes: Math.round(((bitrate + 192_000) * outSec) / 8) + 1_000_000,
      tags: await inA.getMetadataTags().catch(() => undefined),
      label: "Composing",
      span: [0.02, 1],
      ctx,
    });
    const soundWords = !sound
      ? "no sound"
      : wantA && wantB
        ? "both sounds mixed"
        : wantA
          ? `sound from ${baseName(a.file.name)}`
          : `sound from ${baseName(b.file.name)}`;
    return {
      blob: r.blob,
      filename: outputName,
      ffmpegCommand: layoutCommand({
        options: o,
        mainName: a.file.name,
        secondName: b.file.name,
        output: outputName,
        place,
        fps,
        kbps: Math.round(bitrate / 1000),
        durationSec: outSec,
        sound: { main: wantA, second: wantB },
      }),
      meta: `${frame.width}×${frame.height} at ${Number(fps.toFixed(2))} fps · H.264 · ${soundWords}${sound ? ` (${r.soundCodec === "opus" ? "Opus" : "AAC"})` : ""}`,
    };
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    for (const c of cursors) await c.close().catch(() => undefined);
    inA.dispose();
    inB.dispose();
  }
}
