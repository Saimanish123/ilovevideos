/**
 * Page runner of merge audio. The worker joins the files and writes M4A (AAC) or WAV itself, and
 * MP3s that match are joined frame for frame there too; for an MP3 or FLAC result it writes float
 * WAV, which ffmpeg.wasm encodes here with the first file's tags (no WebCodecs encoder for MP3, and
 * FLAC's is missing in most browsers). AAC falls back to ffmpeg where the browser has no encoder.
 * Page thread. No network access to user data; the ffmpeg core is our own static asset.
 */
import { formatDuration, withUnit } from "@/lib/format";
import { EngineError } from "../errors";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import { JOIN_KBPS, JoinAudioOptions, joinedName, planJoin } from "./options";

interface Facts {
  seconds: number;
  files: number;
  codec: string;
  layout: string;
  gains: number[];
  limitedDb: number;
}

const CANCEL_GRACE_MS = 1000;

const signedDb = (g: number) => `${g < 0 ? "\u2212" : "+"}${Math.abs(g).toFixed(1)}\u00a0dB`;

async function aacHere(rate: number, channels: number): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  try {
    const s = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate: rate,
      numberOfChannels: channels,
      bitrate: JOIN_KBPS * 1000,
    });
    return s.supported === true;
  } catch {
    return false;
  }
}

export async function joinAudioOnPage(
  inputs: { file: File; info: MediaInfo }[],
  raw: unknown,
  ctx: EngineContext,
): Promise<EngineResult> {
  const o = JoinAudioOptions.parse(raw);
  const plan = planJoin(
    inputs.map((i) => ({ name: i.file.name, info: i.info })),
    o,
  );
  const { EngineClient } = await import("@/tools/workers/client");
  const client = new EngineClient();
  const cancelled = new Promise<never>((_, reject) => {
    const stop = () => {
      setTimeout(() => client.dispose(), CANCEL_GRACE_MS);
      reject(new EngineError("cancelled", "Cancelled."));
    };
    if (ctx.signal.aborted) stop();
    else ctx.signal.addEventListener("abort", stop, { once: true });
  });
  cancelled.catch(() => undefined);
  try {
    return await Promise.race([run(), cancelled]);
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    const err = e as { code?: string; message?: string; hint?: string };
    if (err && typeof err === "object" && err.code && !(e instanceof EngineError))
      throw new EngineError(
        err.code as EngineError["code"],
        err.message ?? "Something went wrong.",
        err.hint,
      );
    throw e;
  } finally {
    if (!ctx.signal.aborted) client.dispose();
  }

  async function run(): Promise<EngineResult> {
    const ffmpeg =
      !plan.copy &&
      (plan.format.id === "mp3" ||
        plan.format.id === "flac" ||
        (plan.format.id === "m4a" && !(await aacHere(plan.sampleRate, plan.channels))));
    const share = ffmpeg ? 0.65 : 1;
    const r = await client.runMany(
      "join-audio",
      inputs,
      { ...o, output: ffmpeg ? "wav" : "auto" },
      {
        signal: ctx.signal,
        onProgress: (p) => ctx.onProgress({ ...p, ratio: p.ratio * share }),
      },
    );
    // A frame copy states its own result line.
    if (!r.meta?.startsWith("{"))
      return { blob: r.blob, filename: r.filename, ffmpegCommand: r.ffmpegCommand, meta: r.meta };
    const facts = JSON.parse(r.meta) as Facts;
    let blob = r.blob;
    let codec = facts.codec;
    const filename = joinedName(inputs[0]?.file.name ?? "audio", plan.format.extension);
    if (ffmpeg) {
      const { encodeFromWav } = await import("../sound/ffmpeg");
      const first = inputs[0]?.file as File;
      const lossless = plan.format.lossless;
      blob = await encodeFromWav(
        blob,
        first,
        {
          kind: "audio",
          format: {
            ...plan.format,
            encode: {
              ...plan.format.encode,
              args:
                plan.format.id === "flac"
                  ? plan.bits === 24
                    ? ["-sample_fmt", "s32", "-bits_per_raw_sample", "24"]
                    : ["-sample_fmt", "s16"]
                  : plan.format.encode.args,
            },
          },
          ffmpegDecode: false,
          bitrateKbps: lossless ? undefined : JOIN_KBPS,
        },
        ctx,
        [share, 1],
        undefined,
        !inputs[0]?.info.video,
      );
      codec =
        plan.format.id === "flac"
          ? `FLAC ${plan.bits ?? 16}-bit`
          : `${plan.format.id === "mp3" ? "MP3" : "AAC"} ${withUnit(JOIN_KBPS, "kbps")}`;
    }
    const evened = facts.gains.some((g) => Math.abs(g) >= 0.05);
    return {
      blob: new Blob([blob], { type: plan.format.mime }),
      filename,
      ffmpegCommand: r.ffmpegCommand,
      meta: [
        formatDuration(facts.seconds),
        `${codec}, ${facts.layout}`,
        evened
          ? `levels evened by ${signedDb(Math.min(...facts.gains))} to ${signedDb(Math.max(...facts.gains))}`
          : "",
        facts.limitedDb >= 0.1 ? `peaks limited by up to ${facts.limitedDb.toFixed(1)} dB` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
}
