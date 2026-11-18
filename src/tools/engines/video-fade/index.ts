/**
 * Fade a video in and out: the picture ramps from a colour (black or white) over the first seconds
 * and back to it over the last, on the per-frame filter runner (../video-filter/run). The sound can
 * fade over the same seconds, which re-encodes it once to AAC; otherwise it is copied. Always a
 * re-encode of the picture. Files only ffmpeg can read go through ../video-filter/ffmpeg on the page.
 */
import { AudioSample } from "mediabunny";
import { canEncodeAvc, pictureDecodes } from "../mediabunny/shared";
import type { Engine } from "../types";
import { IDENTITY, withFade } from "../video-filter/color";
import { FADE_RGB, FadeOptions, fadeAmount, fadeIsNoop, fitFades } from "../video-filter/options";
import { pictureSize } from "../video-filter/plan";
import { noVideoError, runFilter } from "../video-filter/run";
import { fadeFilters, fadeWhat } from "./math";

export const videoFadeEngine: Engine<FadeOptions> = {
  id: "video-fade",
  backends: ["webcodecs", "ffmpeg-wasm"],
  optionsSchema: FadeOptions,
  async supports(backend, input) {
    if (backend !== "webcodecs") return false;
    if (!pictureDecodes(input.info)) return false;
    const info = input.info;
    if (!info?.video) return false;
    const size = pictureSize(info);
    return canEncodeAvc(size.width, size.height);
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    const info = input?.info;
    if (!input || !info?.video) throw noVideoError();
    const duration = info.durationSec;
    const { fadeIn, fadeOut } = fitFades(options, duration);
    const color = FADE_RGB[options.color];
    const filters = fadeFilters(options, duration);
    const hasAudio = !!info.audio?.length;
    const fadeSound = options.audio && hasAudio && !fadeIsNoop(options);
    return runFilter({
      file: input.file,
      info,
      transformAt: (t) => withFade(IDENTITY, fadeAmount(t, duration, fadeIn, fadeOut), color),
      sound: fadeSound
        ? {
            process: (sample) => {
              const frames = sample.numberOfFrames;
              const channels = sample.numberOfChannels;
              const rate = sample.sampleRate;
              const data = new Float32Array(frames * channels);
              for (let c = 0; c < channels; c++)
                sample.copyTo(data.subarray(c * frames, (c + 1) * frames), {
                  planeIndex: c,
                  format: "f32-planar",
                });
              for (let i = 0; i < frames; i++) {
                const g = fadeAmount(sample.timestamp + i / rate, duration, fadeIn, fadeOut);
                if (g >= 1) continue;
                for (let c = 0; c < channels; c++)
                  data[c * frames + i] = (data[c * frames + i] ?? 0) * g;
              }
              return new AudioSample({
                data,
                format: "f32-planar",
                numberOfChannels: channels,
                sampleRate: rate,
                timestamp: sample.timestamp,
              });
            },
          }
        : "keep",
      suffix: "faded",
      what: fadeWhat(options, duration),
      vf: filters.vf,
      af: fadeSound ? filters.af : undefined,
      ctx,
    });
  },
};

export { FadeOptions };
