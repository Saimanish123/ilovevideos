import { spawnSync } from "node:child_process";

/**
 * How a player hears a downloaded file's first sound track, read with the local ffmpeg (test-only;
 * never in production paths): where it starts, how many seconds it decodes to once the edit list is
 * applied, when it first gets loud (a fixture's tone starts at 0 s), and its bitrate.
 * Null when ffmpeg is not installed, so the specs fall back to their mediabunny checks.
 */
export function soundCheck(path: string) {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=start_time,sample_rate,bit_rate",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8" },
  );
  if (probe.error || probe.status !== 0) return null;
  const stream = JSON.parse(probe.stdout).streams?.[0] as
    | { start_time: string; sample_rate: string; bit_rate?: string }
    | undefined;
  if (!stream) return null;
  const pcm = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-map", "0:a:0", "-ac", "1", "-f", "s16le", "-"],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  if (pcm.error || pcm.status !== 0) return null;
  const rate = Number(stream.sample_rate);
  const samples = new Int16Array(
    pcm.stdout.buffer,
    pcm.stdout.byteOffset,
    Math.floor(pcm.stdout.length / 2),
  );
  // The fixtures' 440 Hz tone peaks at an eighth of full scale; a twentieth is clearly sound.
  const loud = samples.findIndex((v) => Math.abs(v) > 1600);
  return {
    start: Number(stream.start_time),
    seconds: samples.length / rate,
    onset: loud < 0 ? Number.NaN : loud / rate,
    bitrate: Number(stream.bit_rate ?? Number.NaN),
  };
}

/**
 * The clicks fixture as a player hears it (sample-clicks.mp4: a 32-sample burst at 0.6 every 100 ms
 * from 0 s): how many samples the first sound track decodes to, the first click's peak (0 when the
 * first frame is decoded attenuated) and how far the worst click is from where the source puts it,
 * from each burst's energy centre. Null without ffmpeg.
 */
export function clickCheck(path: string, offsetSec = 0) {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=sample_rate",
      "-of",
      "csv=p=0",
      path,
    ],
    { encoding: "utf8" },
  );
  if (probe.error || probe.status !== 0) return null;
  const rate = Number(probe.stdout.trim());
  const pcm = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-map", "0:a:0", "-ac", "1", "-f", "f32le", "-"],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  if (pcm.error || pcm.status !== 0) return null;
  const x = new Float32Array(pcm.stdout.buffer, pcm.stdout.byteOffset, pcm.stdout.length / 4);
  let firstPeak = 0;
  for (let i = 0; i < Math.min(x.length, rate * 0.003); i++)
    firstPeak = Math.max(firstPeak, Math.abs(x[i] ?? 0));
  // A burst's centre: 15.5 source samples (44.1 kHz) after its start.
  const centre = 15.5 / 44_100;
  let worst = 0;
  for (let k = 0; (k * 0.1 + 0.006) * rate < x.length; k++) {
    const at = Math.round((k * 0.1 - (offsetSec % 0.1)) * rate);
    if (at < 0) continue;
    let w = 0;
    let s = 0;
    for (let i = Math.max(0, at - Math.round(rate * 0.004)); i < at + rate * 0.006; i++) {
      const e = (x[i] ?? 0) ** 2;
      w += e;
      s += e * i;
    }
    if (w > 0) worst = Math.max(worst, Math.abs(s / w / rate - (at / rate + centre)));
  }
  return { rate, samples: x.length, firstPeak, worstMs: worst * 1000 };
}
