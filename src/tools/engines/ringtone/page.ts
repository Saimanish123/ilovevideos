/**
 * Page runner of the ringtone maker. iPhone ringtones are AAC written by the engine worker when this
 * browser encodes AAC; otherwise, and for Android's MP3 and Ogg Vorbis (no WebCodecs encoder), the
 * worker writes the shaped part as float WAV and ffmpeg.wasm encodes it on the page with the source's
 * tags. With "Make it louder" the result is measured, so the line states the file's real loudness.
 * Page thread. No network access to user data; the ffmpeg core is our own static asset.
 */
import { shellQuote } from "@/lib/format";
import { EngineError } from "../errors";
import { formatLevel } from "../sound/dsp/loudness";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import { fitPart, RINGTONE_KBPS, RingtoneOptions, ringtoneFormat, ringtoneName } from "./options";

interface Facts {
  seconds: number;
  gainDb?: number;
  limitedDb: number;
  codec: string;
  layout: string;
}

async function canEncodeAac(rate: number, channels: number): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  for (const [r, ch] of [
    [rate, Math.min(2, channels)],
    [48_000, Math.min(2, channels)],
  ] as const) {
    try {
      const s = await AudioEncoder.isConfigSupported({
        codec: "mp4a.40.2",
        sampleRate: r,
        numberOfChannels: ch,
        bitrate: RINGTONE_KBPS * 1000,
      });
      if (s.supported) return true;
    } catch {
      // Unknown configurations throw in some browsers; try the next.
    }
  }
  return false;
}

/** Whether this run needs ffmpeg.wasm here (Android formats, or no AAC encoder for iPhone). */
export async function ringtoneUsesFfmpeg(o: RingtoneOptions, info: MediaInfo): Promise<boolean> {
  if (o.phone !== "iphone") return true;
  const a = info.audio?.[0];
  return !(await canEncodeAac(a?.sampleRate ?? 48_000, a?.channels ?? 2));
}

/** How long a cancelled job's worker may take to clean up before it is ended. */
const CANCEL_GRACE_MS = 1000;

export async function runRingtone(
  file: File,
  info: MediaInfo,
  raw: unknown,
  ctx: EngineContext,
): Promise<EngineResult> {
  const o = RingtoneOptions.parse(raw);
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
    const fmt = ringtoneFormat(o);
    const viaFfmpeg = await ringtoneUsesFfmpeg(o, info);
    const filename = ringtoneName(file.name, fmt.extension);
    const r = await client.run(
      "ringtone",
      file,
      { ...o, output: viaFfmpeg ? "wav" : "auto" },
      {
        info,
        signal: ctx.signal,
        onProgress: (p) => ctx.onProgress({ ...p, ratio: p.ratio * (viaFfmpeg ? 0.6 : 0.9) }),
      },
    );
    const facts = JSON.parse(r.meta ?? "{}") as Facts;
    let blob = r.blob;
    let codec = facts.codec;
    if (viaFfmpeg) {
      const { encodeFromWav } = await import("../sound/ffmpeg");
      blob = await encodeFromWav(
        r.blob,
        file,
        { kind: "audio", format: fmt.spec, ffmpegDecode: false, bitrateKbps: RINGTONE_KBPS },
        ctx,
        [0.6, 0.9],
        undefined,
        !info.video,
      );
      codec = `${fmt.spec.id === "m4a" ? "AAC" : fmt.spec.id === "mp3" ? "MP3" : "Vorbis"} ${RINGTONE_KBPS} kbps`;
    }
    const typed = new Blob([blob], {
      type: fmt.spec.id === "m4a" ? "audio/mp4" : fmt.spec.mime,
    });
    // The real loudness of the file, read back (Vorbis may not decode in every browser: then omitted).
    let level = "";
    // Only "Make it louder" sets a level; without it the line has nothing to say about loudness.
    if (o.normalize)
      try {
        const { analyzeInWorker } = await import("@/tools/workers/sound-analysis-client");
        ctx.onProgress({ phase: "finishing", ratio: 0.92, detail: "Measuring the result" });
        const after = await analyzeInWorker(typed, `ringtone.${fmt.spec.extension}`, {
          signal: ctx.signal,
        });
        level = formatLevel(after.loudness.integrated, "LUFS");
      } catch {
        level = "";
      }
    const part = fitPart(o, info.durationSec);
    const seconds = Math.round((part.end - part.start) * 10) / 10;
    const command = `ffmpeg -ss ${part.start.toFixed(2)} -to ${part.end.toFixed(2)} -i ${shellQuote(file.name)} -map 0:a:0${r.ffmpegCommand ? ` -af "${r.ffmpegCommand}"` : ""} -c:a ${fmt.spec.encode.ffmpeg} -b:a ${RINGTONE_KBPS}k -f ${fmt.spec.ffmpegFormat} ${shellQuote(filename)}`;
    return {
      blob: typed,
      filename,
      ffmpegCommand: command,
      meta: [
        `${seconds.toFixed(1)} s`,
        `${codec}, ${facts.layout}`,
        level ? `measured ${level}` : "",
        facts.limitedDb >= 0.1 ? `peaks limited by up to ${facts.limitedDb.toFixed(1)} dB` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
}
