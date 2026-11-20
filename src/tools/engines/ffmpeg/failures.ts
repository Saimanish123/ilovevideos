/**
 * Turns an ffmpeg.wasm log into a failure that says what went wrong. ffmpeg exits with code 1 for
 * everything; the reason is in the lines before "Conversion failed!". Raw ffmpeg text is never the
 * message: known patterns get a sentence of their own, anything else a plain sentence that quotes
 * the one log line that names the problem. Pure; unit-tested on logs captured from ffmpeg.wasm 0.12.10
 * (FFmpeg 5.1, libavformat 59.27).
 */
import { codecDisplayNames } from "../convert-video/plan";
import { EngineError } from "../errors";

/** Lines ffmpeg prints on every failure (or every exit) that say nothing about the cause. */
const NOISE =
  /^(Conversion failed!|Aborted\(\)|Exiting normally.*|size=|frame=|video:\d|\[out#|Press \[q\]|\s*$)/;

/** ffmpeg codec ids in its log ("vorbis (libvorbis)", "flac") as the names the site uses. */
const LOG_NAMES: Record<string, string> = {
  ...codecDisplayNames,
  vorbis: "Vorbis",
  libvorbis: "Vorbis",
  libx264: "H.264",
  libvpx: "VP8",
  ac3: "AC-3",
  truehd: "TrueHD",
  ffv1: "FFV1",
};
const named = (id: string | undefined) =>
  id ? (LOG_NAMES[id] ?? id.replace(/^lib/, "").toUpperCase()) : undefined;

/** The source's sound as ffmpeg describes it: "96 kHz, stereo". */
function soundFacts(log: string): string | undefined {
  const m = /Stream #0:\d+.*?: Audio: [^,]+(?:,[^,]*)*?, (\d+) Hz, ([^,\n]+)/.exec(log);
  if (!m) return undefined;
  const khz = Number(m[1]) / 1000;
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz, ${m[2]?.trim()}`;
}

/** The last log line that is not ffmpeg's closing noise, for the fallback message. */
export function lastMeaningfulLine(lines: string[]): string | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = (lines[i] ?? "").trim();
    if (!NOISE.test(l)) return l.replace(/^\[[^\]]+ @ 0x[0-9a-f]+\]\s*/, "");
  }
  return undefined;
}

/**
 * The failure for a non-zero ffmpeg exit, from its log. `container` is the output's display name
 * ("MP4"); `hint` is what the page suggests when nothing more specific applies.
 */
export function ffmpegFailure(
  lines: string[],
  code: number,
  opts: { container?: string; hint: string },
): EngineError {
  const log = lines.join("\n");
  const where = opts.container ?? "this format";

  if (/moov atom not found/i.test(log))
    return new EngineError(
      "unsupported-input",
      "This file is missing its index (the moov box), which happens when a recording was cut off before it finished.",
      "Without the index the picture and sound cannot be found. If the camera or app that made it offers a repair, use that first.",
    );
  if (/Invalid data found when processing input|could not find codec parameters/i.test(log))
    return new EngineError(
      "unsupported-input",
      "The converter could not read this file: its contents are damaged or are not a video or audio format it knows.",
      "Check that the file plays in a media player. A file that was cut off while copying is often the cause.",
    );
  const experimental = /(\w+) in MP4 support is experimental/i.exec(log);
  if (experimental)
    return new EngineError(
      "unsupported-output",
      `This version of the converter will not write ${named(experimental[1]?.toLowerCase())} sound into ${where}.`,
      "Choose MKV to keep the sound as it is, or another format to re-encode it.",
    );
  const odd = /(width|height) not divisible by 2 \((\d+x\d+)\)/.exec(log);
  if (odd)
    return new EngineError(
      "unsupported-input",
      `This picture is ${odd[2]?.replace("x", "×")}, and H.264 needs an even width and height.`,
      "Crop or resize it by one pixel first.",
    );
  const encoder =
    /Stream #0:\d+ -> #0:\d+ \(.*?-> (\w+)(?: \((\w+)\))?\)[\s\S]*?(?:encoder setup failed|Error while opening encoder)/i.exec(
      log,
    );
  if (encoder || /encoder setup failed|Error while opening encoder/i.test(log)) {
    const name = named(encoder?.[2] ?? encoder?.[1]);
    const facts = soundFacts(log);
    return new EngineError(
      "unsupported-output",
      `This ${facts ? `sound (${facts})` : "stream"} cannot be written${name ? ` as ${name}` : ""} with these settings.`,
      facts
        ? "Choose another format, or change the sample rate to 48 kHz first."
        : "Choose another format or a lower setting.",
    );
  }
  const decoder =
    /Decoder \(codec (\w+)\) not found|Unsupported codec with id \d+ for input stream \d+|Unknown decoder '(\w+)'/i.exec(
      log,
    );
  if (decoder)
    return new EngineError(
      "unsupported-input",
      `The converter has no decoder for ${named(decoder[1] ?? decoder[2]) ?? "a stream in this file"}.`,
      "Convert the file with desktop software first, or choose another file.",
    );
  const cannotHold =
    /codec not currently supported in container|Could not find tag for codec (\w+)|Could not write header for output file/i.exec(
      log,
    );
  if (cannotHold)
    return new EngineError(
      "unsupported-output",
      `${where} cannot hold ${cannotHold[1] ? `${named(cannotHold[1])} ` : "one of the streams in this file "}as it is.`,
      "Choose MKV, which holds almost any stream, or another format that re-encodes it.",
    );
  if (/Output file (?:#0 )?does not contain any stream|Output file is empty/i.test(log))
    return new EngineError(
      "unsupported-input",
      "The file has no stream of the kind this output needs.",
      "Check that the file has video or sound in it.",
    );
  if (/Cannot allocate memory|out of memory|memory access out of bounds|OOM/i.test(log))
    return new EngineError(
      "resource",
      "The converter ran out of memory on this file.",
      "Try a shorter part of it, close other tabs, or use desktop Chrome.",
    );
  const line = lastMeaningfulLine(lines);
  return new EngineError(
    "internal",
    line
      ? `The converter stopped on this file (exit code ${code}). Its last message: "${line}".`
      : `The converter stopped on this file (exit code ${code}).`,
    opts.hint,
  );
}
