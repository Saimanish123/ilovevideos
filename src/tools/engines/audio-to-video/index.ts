/**
 * Audio to video (feature B9): one still picture (a picked image, or a plain title card) over a
 * sound file, as an MP4 that video sites and players take. The picture is encoded once per second
 * with WebCodecs H.264 (it does not move); AAC sound is copied as it is, anything else is encoded
 * once to AAC, or Opus where there is no AAC encoder (./mux). The still arrives as a PNG the page drew (./still). Runs in the engine worker.
 */
import { baseName, formatDimensions, formatDuration, withUnit } from "@/lib/format";
import { EngineError } from "../errors";
import { canEncodeAvc } from "../mediabunny/shared";
import { soundCodecName, soundEncoders, videoSoundCodec } from "../sound-codec";
import type { Engine } from "../types";
import { SOUND_KBPS, soundInfo, writeVideo } from "./mux";
import {
  AudioToVideoOptions,
  audioToVideoCommand,
  STILL_BITRATE,
  STILL_FPS,
  STILL_KEY_INTERVAL,
  sizeOf,
} from "./options";

export { AudioToVideoOptions };

export const audioToVideoEngine: Engine<AudioToVideoOptions> = {
  id: "audio-to-video",
  backends: ["webcodecs"],
  optionsSchema: AudioToVideoOptions,
  async supports(backend, input, o) {
    if (backend !== "webcodecs" || typeof OffscreenCanvas === "undefined") return false;
    const { width, height } = sizeOf(o);
    if (!(await canEncodeAvc(width, height))) return false;
    // AAC is copied; anything else is encoded to AAC, or Opus where there is no AAC encoder.
    const aac = input.info?.audio?.[0]?.codec === "aac";
    return aac || videoSoundCodec("mp4", await soundEncoders()) !== undefined;
  },
  async run(_backend, inputs, o, ctx) {
    const input = inputs[0];
    if (!input) throw new EngineError("internal", "No file was given.", "Choose an audio file.");
    if (!o.still)
      throw new EngineError("internal", "The picture was not drawn yet.", "Try again in a moment.");
    const { width, height } = sizeOf(o);
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the sound" });
    const sound = await soundInfo(input.file);
    if (!sound.codec)
      throw new EngineError(
        "unsupported-input",
        "This file has no sound track.",
        "Choose an audio file, such as MP3, M4A, WAV or FLAC.",
      );
    if (!(sound.durationSec > 0))
      throw new EngineError(
        "unsupported-input",
        "This sound has no length.",
        "Check that it plays.",
      );
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(o.still);
    } catch {
      throw new EngineError("internal", "The picture could not be read.", "Try again.");
    }
    try {
      const r = await writeVideo(
        {
          width,
          height,
          fps: STILL_FPS,
          durationSec: sound.durationSec,
          keyFrameInterval: STILL_KEY_INTERVAL,
          bitrate: STILL_BITRATE,
          contentHint: "detail",
          draw: (c, _t, i) => {
            if (i === 0) c.drawImage(bitmap, 0, 0, width, height);
            return i === 0;
          },
        },
        { file: input.file },
        ctx,
      );
      const filename = `${baseName(input.file.name)}.mp4`;
      return {
        blob: r.blob,
        filename,
        ffmpegCommand: audioToVideoCommand(input.file.name, filename, o, r.soundCopied),
        meta: `${formatDimensions(width, height)} · ${formatDuration(r.soundSec)} · H.264 still · ${r.soundCopied ? "sound copied" : `sound in ${soundCodecName(r.soundCodec)} ${withUnit(SOUND_KBPS, "kbps")}`}`,
      };
    } finally {
      bitmap.close();
    }
  },
};
