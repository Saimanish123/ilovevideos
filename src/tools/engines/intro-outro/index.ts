/**
 * Add an intro and outro (feature G11), the worker half. One pass writes the whole result: the
 * intro (a clip read in step by ../overlay/follow, a still, or a title card from ./title) fitted to
 * the main video's frame and drawn on its frame grid, the main video's own frames each in the
 * nearest free slot of that grid, then the outro; a crossfade draws the incoming part over the outgoing one. The sound
 * follows the same timeline: the main video's and any clip's sound brought to one rate (windowed
 * sinc, ADR-0091) and layout (the merge engine's channel mix), silence under stills and cards,
 * equal-power crossfades. Both go through the time and layout tools' writer (../compose/encode,
 * ADR-0075): H.264 near the main video's bitrate (ADR-0060), Baseline where High fails, AAC (Opus
 * where AAC is missing) with its priming signalled, large outputs streamed to disk. A plain join of
 * clips stays on merge videos. Runs in the engine worker; no network access apart from our own font
 * file.
 */
import { AudioSampleSink, VideoSample, VideoSampleSink } from "mediabunny";
import { baseName, formatDimensions, formatDuration } from "@/lib/format";
import { GEIST_FONTS, loadFontFile } from "@/tools/workers/assets";
import { encodeComposed } from "../compose/encode";
import { geometryBitrate } from "../crop/plan";
import { classifyError, EngineError } from "../errors";
import { canEncodeAvc, openInput, pictureDecodes } from "../mediabunny/shared";
import { mixChannels } from "../merge/resample";
import { compositeSupported } from "../overlay/composite";
import { FrameFollower } from "../overlay/follow";
import { loadWorkerFonts } from "../overlay/text";
import { SincResampler } from "../sound/dsp/resample";
import type { Engine } from "../types";
import {
  type Card,
  crossGains,
  fadeShare,
  fitRect,
  gridTimes,
  IntroOutroOptions,
  introOutroCommand,
  outputSize,
  type Size,
  timeline,
} from "./options";
import { drawTitle } from "./title";

export { IntroOutroOptions };

const FAMILY = 'Geist, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

type Ctx2D = OffscreenCanvasRenderingContext2D;

const cancelled = () => new EngineError("cancelled", "Cancelled.");

/** A card ready to draw: a finished frame (title, still) or a clip read in step. */
interface Drawable {
  draw(ctx: Ctx2D, localT: number, alpha: number): Promise<void>;
  dispose(): Promise<void>;
}

async function prepareCard(
  card: Card,
  size: Size,
  o: IntroOutroOptions,
  role: "intro" | "outro",
): Promise<Drawable> {
  if (card.kind === "clip") {
    const f = new FrameFollower(card.file, card.name);
    if (!(await f.open().catch(() => false))) {
      await f.dispose();
      throw new EngineError(
        "unsupported-input",
        `The ${role} clip ${card.name} has no picture this browser can decode.`,
        "Convert it to MP4 with the video converter first, or use another clip.",
      );
    }
    return {
      async draw(ctx, t, alpha) {
        const s = await f.frameAt(Math.max(0, Math.min(t, card.durationSec)));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = o.bars;
        ctx.fillRect(0, 0, size.width, size.height);
        if (s) {
          const r = fitRect({ width: s.displayWidth, height: s.displayHeight }, size, o.fit);
          s.draw(ctx, r.x, r.y, r.width, r.height);
        }
        ctx.globalAlpha = 1;
      },
      dispose: () => f.dispose(),
    };
  }
  const canvas = new OffscreenCanvas(size.width, size.height);
  const c = canvas.getContext("2d", { alpha: false });
  if (!c) throw new EngineError("internal", "Could not draw the card.", "Try again.");
  if (card.kind === "title") {
    drawTitle(c, size, card, FAMILY);
  } else {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(card.file);
    } catch {
      throw new EngineError(
        "unsupported-input",
        `The ${role} picture ${card.name} could not be read.`,
        "Use a PNG, JPEG or WebP picture.",
      );
    }
    c.fillStyle = o.bars;
    c.fillRect(0, 0, size.width, size.height);
    const r = fitRect({ width: bitmap.width, height: bitmap.height }, size, o.fit);
    c.imageSmoothingQuality = "high";
    c.drawImage(bitmap, r.x, r.y, r.width, r.height);
    bitmap.close();
  }
  return {
    async draw(ctx, _t, alpha) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(canvas, 0, 0);
      ctx.globalAlpha = 1;
    },
    async dispose() {},
  };
}

/** The rate and layout the sound is mixed at; the writer encodes it (AAC, or Opus). */
interface AudioPlan {
  sampleRate: number;
  channels: number;
}

/**
 * The sound of a file from its start, at the plan's rate and layout, in chunks. Sound before the
 * file's start (AAC priming shown before zero) is dropped; the rest is taken as one run.
 */
async function* soundOf(
  file: Blob,
  name: string,
  plan: AudioPlan,
  startSec: number,
  signal: AbortSignal,
): AsyncGenerator<Float32Array[]> {
  const input = openInput(file instanceof File ? file : new File([file], name));
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return;
    const sink = new AudioSampleSink(track);
    // Windowed-sinc resampling where the rates differ (ADR-0091).
    const resampler =
      track.sampleRate !== plan.sampleRate
        ? new SincResampler(track.sampleRate / plan.sampleRate, plan.channels)
        : null;
    for await (const sample of sink.samples()) {
      if (signal.aborted) {
        sample.close();
        throw cancelled();
      }
      let s = sample;
      const before = Math.round((startSec - sample.timestamp) * sample.sampleRate);
      if (before >= sample.numberOfFrames) {
        sample.close();
        continue;
      }
      if (before > 0) {
        s = sample.trim(before);
        sample.close();
      }
      const planes = Array.from({ length: s.numberOfChannels }, (_, c) => {
        const p = new Float32Array(s.numberOfFrames);
        s.copyTo(p, { planeIndex: c, format: "f32-planar" });
        return p;
      });
      s.close();
      const mixed = mixChannels(planes, plan.channels);
      yield resampler ? resampler.process(mixed) : mixed;
    }
    if (resampler) yield resampler.flush();
  } finally {
    input.dispose();
  }
}

/** A card's whole sound at the plan's rate: the clip's, or silence; exactly its length. */
async function cardSound(
  card: Card | undefined,
  plan: AudioPlan,
  signal: AbortSignal,
): Promise<Float32Array[]> {
  const n = card ? Math.round(card.durationSec * plan.sampleRate) : 0;
  const out = Array.from({ length: plan.channels }, () => new Float32Array(n));
  if (card?.kind !== "clip" || !card.hasAudio) return out;
  let at = 0;
  for await (const planes of soundOf(card.file, card.name, plan, 0, signal)) {
    const len = Math.min(planes[0]?.length ?? 0, n - at);
    if (len <= 0) break;
    planes.forEach((p, c) => {
      out[c]?.set(p.subarray(0, len), at);
    });
    at += len;
  }
  return out;
}

async function clipHasSound(file: Blob, name: string): Promise<boolean> {
  const input = openInput(file instanceof File ? file : new File([file], name));
  try {
    const t = await input.getPrimaryAudioTrack();
    return !!t && (await t.canDecode());
  } catch {
    return false;
  } finally {
    input.dispose();
  }
}

export const introOutroEngine: Engine<IntroOutroOptions> = {
  id: "intro-outro",
  backends: ["webcodecs"],
  optionsSchema: IntroOutroOptions,
  async supports(backend, input) {
    return backend === "webcodecs" && pictureDecodes(input.info) && compositeSupported(input.info);
  },
  async run(_backend, inputs, o, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v)
      throw new EngineError(
        "unsupported-input",
        "This file has no video track to add an intro or outro to.",
        "Choose a video file.",
      );
    if (!o.intro && !o.outro)
      throw new EngineError(
        "internal",
        "There is no intro or outro yet.",
        "Add one, then try again.",
      );
    const size = outputSize(v);
    if (!(await canEncodeAvc(size.width, size.height)))
      throw new EngineError(
        "unsupported-output",
        `This browser's H.264 encoder cannot make a ${formatDimensions(size.width, size.height)} video.`,
        "Make the video smaller with compress video first, or try desktop Chrome, Edge or Safari.",
      );
    const fps = v.fps > 0 && Number.isFinite(v.fps) ? v.fps : 30;
    const D = info.durationSec;
    const tl = timeline(o, D);
    const startSec = info.startSec ?? 0;
    const bitrate = geometryBitrate(size, fps, v);
    const outputName = `${baseName(input.file.name)}-with-intro.mp4`;
    const mainSound = (info.audio?.length ?? 0) > 0 && info.audio?.[0]?.decodable !== false;
    // Which clips carry sound is read here, from the files themselves.
    for (const c of [o.intro, o.outro])
      if (c?.kind === "clip") c.hasAudio = await clipHasSound(c.file, c.name);
    const cardsSound = [o.intro, o.outro].some((c) => c?.kind === "clip" && c.hasAudio);
    const withSound = mainSound || cardsSound;

    if ([o.intro, o.outro].some((c) => c?.kind === "title")) {
      ctx.onProgress({ phase: "loading", ratio: 0, detail: "Loading the title font" });
      const bold = GEIST_FONTS.find((f) => f.weight === "700" && f.style === "normal");
      const fonts = bold
        ? await loadFontFile(bold.file)
            .then((bytes) => [{ bytes, weight: bold.weight, style: bold.style }])
            .catch(() => [])
        : [];
      await loadWorkerFonts(fonts);
    }

    const intro = o.intro ? await prepareCard(o.intro, size, o, "intro") : undefined;
    const outro = o.outro
      ? await prepareCard(o.outro, size, o, "outro").catch(async (e) => {
          await intro?.dispose();
          throw e;
        })
      : undefined;
    const mainFile = input.file;
    const main = openInput(mainFile);
    const plan: AudioPlan | undefined = withSound
      ? {
          sampleRate: (mainSound ? info.audio?.[0]?.sampleRate : undefined) ?? 48_000,
          channels: Math.min(
            2,
            Math.max(
              mainSound ? (info.audio?.[0]?.channels ?? 2) : 1,
              ...[o.intro, o.outro].map((c) => (c?.kind === "clip" && c.hasAudio ? 2 : 1)),
            ),
          ),
        }
      : undefined;
    const canvas = new OffscreenCanvas(size.width, size.height);
    const c2d = canvas.getContext("2d", { alpha: false });
    if (!c2d) throw new EngineError("internal", "Could not draw the frame.", "Try again.");
    const frameSec = 1 / fps;
    // The writer snaps times to the main video's rate (ADR-0075); each frame takes its own slot on
    // that grid, so a variable-rate video never puts two frames at one time.
    let lastSlot = -1;
    const stamp = (t: number) => {
      const slot = Math.max(lastSlot + 1, Math.round(t * fps));
      lastSlot = slot;
      return new VideoSample(canvas, { timestamp: slot / fps, duration: frameSec });
    };

    /** The whole picture, frame by frame on the grid: intro, the video, outro. */
    async function* frames(signal: AbortSignal): AsyncGenerator<VideoSample> {
      if (intro)
        for (const t of gridTimes(0, tl.mainStart, fps)) {
          if (signal.aborted) throw cancelled();
          await intro.draw(c2d as Ctx2D, t, 1);
          yield stamp(t);
        }
      const track = await main.getPrimaryVideoTrack();
      if (!track)
        throw new EngineError(
          "unsupported-input",
          "This file has no video track.",
          "Choose a video file.",
        );
      let shown = 0;
      for await (const sample of new VideoSampleSink(track).samples()) {
        try {
          if (signal.aborted) throw cancelled();
          const tm = sample.timestamp - startSec;
          if (tm < -1e-6) continue;
          if (tm >= D - 1e-6) break;
          const t = tl.mainStart + tm;
          const ctx2 = c2d as Ctx2D;
          if (intro && tl.fadeIn > 0 && t < tl.mainStart + tl.fadeIn) {
            await intro.draw(ctx2, t, 1);
            ctx2.globalAlpha = fadeShare(t, tl.mainStart, tl.fadeIn);
          }
          sample.draw(ctx2, 0, 0, v?.width ?? size.width, v?.height ?? size.height);
          ctx2.globalAlpha = 1;
          if (outro && t >= tl.outroStart - 1e-6)
            await outro.draw(ctx2, t - tl.outroStart, fadeShare(t, tl.outroStart, tl.fadeOut));
          shown++;
          yield stamp(t);
        } finally {
          sample.close();
        }
      }
      if (shown === 0)
        throw new EngineError(
          "unsupported-input",
          "This video has no frames this browser can decode.",
          "Convert it to MP4 first, or try desktop Chrome.",
        );
      if (outro)
        for (const t of gridTimes(tl.mainEnd, tl.total, fps)) {
          if (signal.aborted) throw cancelled();
          await outro.draw(c2d as Ctx2D, t - tl.outroStart, 1);
          yield stamp(t);
        }
    }

    /** The whole sound: intro, the video's sound mixed with both fades, the rest of the outro. */
    async function* blocks(signal: AbortSignal): AsyncGenerator<Float32Array[]> {
      if (!plan) return;
      const { sampleRate: rate, channels } = plan;
      const introPcm = await cardSound(o.intro, plan, signal);
      const outroPcm = await cardSound(o.outro, plan, signal);
      const mainFrom = Math.round(tl.mainStart * rate);
      const mainLen = Math.round(D * rate);
      const fadeIn = Math.round(tl.fadeIn * rate);
      const fadeOut = Math.round(tl.fadeOut * rate);
      const outFrom = mainLen - fadeOut;
      yield introPcm.map((p) => p.subarray(0, mainFrom));
      let j = 0;
      const mix = (planes: Float32Array[]) => {
        const n = Math.min(planes[0]?.length ?? 0, mainLen - j);
        const out = Array.from({ length: channels }, (_, c) =>
          (planes[c] ?? new Float32Array(n)).slice(0, Math.max(0, n)),
        );
        for (let k = 0; k < n; k++) {
          const at = j + k;
          if (at < fadeIn) {
            const [g0, g1] = crossGains((at + 0.5) / fadeIn);
            for (let c = 0; c < channels; c++) {
              const p = out[c] as Float32Array;
              p[k] = (p[k] ?? 0) * g1 + (introPcm[c]?.[mainFrom + at] ?? 0) * g0;
            }
          }
          if (fadeOut > 0 && at >= outFrom) {
            const [g0, g1] = crossGains((at - outFrom + 0.5) / fadeOut);
            for (let c = 0; c < channels; c++) {
              const p = out[c] as Float32Array;
              p[k] = (p[k] ?? 0) * g0 + (outroPcm[c]?.[at - outFrom] ?? 0) * g1;
            }
          }
        }
        j += Math.max(0, n);
        return out;
      };
      if (mainSound)
        for await (const planes of soundOf(mainFile, mainFile.name, plan, startSec, signal)) {
          if (j >= mainLen) break;
          yield mix(planes);
        }
      // Silence for a video without sound, or the rest of one whose sound ends early.
      while (j < mainLen) {
        if (signal.aborted) throw cancelled();
        yield mix(
          Array.from({ length: channels }, () => new Float32Array(Math.min(rate, mainLen - j))),
        );
      }
      yield outroPcm.map((p) => p.subarray(fadeOut));
    }

    let done: Awaited<ReturnType<typeof encodeComposed>>;
    try {
      done = await encodeComposed({
        size,
        fps,
        bitrate,
        durationSec: tl.total,
        frames,
        sound: plan ? { ...plan, blocks } : undefined,
        expectedBytes: Math.round((bitrate / 8) * tl.total * 1.1),
        label: "Encoding",
        ctx,
      });
    } catch (e) {
      if (ctx.signal.aborted) throw cancelled();
      throw e instanceof EngineError ? e : classifyError(e);
    } finally {
      await intro?.dispose();
      await outro?.dispose();
      main.dispose();
    }
    return {
      blob: done.blob,
      filename: outputName,
      ffmpegCommand: introOutroCommand(
        o,
        { name: input.file.name, size: v, fps, durationSec: D, hasAudio: mainSound },
        outputName,
        Math.round(bitrate / 1000),
      ),
      meta: `${formatDimensions(size.width, size.height)} · ${formatDuration(tl.total)} · H.264${done.profile === "baseline" ? " Baseline" : ""}, re-encoded · ${done.soundCodec ? `sound in ${done.soundCodec === "aac" ? "AAC" : "Opus"}` : "no sound"}`,
    };
  },
};
