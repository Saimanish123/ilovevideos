/**
 * Select audio tracks (E10): keeps the chosen sound tracks of a multi-track video and drops the
 * rest, copying the picture and every kept track packet for packet (../mediabunny/packet-copy, the
 * same copy as remux). The main track is written first and marked default, so players start with
 * it; each track keeps its language and title. Subtitle tracks, chapters and attachments are not
 * carried over: mediabunny reads and writes only picture and sound here (the page says so).
 * Runs in the engine worker (and in Node for the tests). No network access.
 */
import { baseName, formatDuration } from "@/lib/format";
import { syncContainer } from "../audio-sync";
import { codecName } from "../convert-video/plan";
import { classifyError, EngineError } from "../errors";
import { copyTracks } from "../mediabunny/packet-copy";
import { containers, openInput } from "../mediabunny/shared";
import type { Engine } from "../types";
import { AudioTracksOptions, outputOrder, tracksCommand } from "./options";

export { AudioTracksOptions };

export const audioTracksEngine: Engine<AudioTracksOptions> = {
  id: "audio-tracks",
  backends: ["webcodecs"],
  optionsSchema: AudioTracksOptions,
  // A packet copy needs no codec support: any file mediabunny reads and writes works.
  async supports(backend, input) {
    return backend === "webcodecs" && (input.info?.audio?.length ?? 0) > 0;
  },
  async run(_backend, inputs, o, ctx) {
    const src = inputs[0];
    if (!src) throw new EngineError("internal", "No input file.");
    const { file } = src;
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the tracks" });
    const input = openInput(file);
    try {
      const video = await input.getPrimaryVideoTrack();
      const audios = await input.getAudioTracks();
      const order = outputOrder(o).filter((i) => i < audios.length);
      const chosen = order.flatMap((i) => (audios[i] ? [audios[i]] : []));
      if (chosen.length === 0)
        throw new EngineError(
          "unsupported-input",
          "None of the chosen sound tracks is in this file.",
        );
      const to = syncContainer(
        (await input.getFormat()).name,
        file.name,
        video?.codec ?? undefined,
      );
      const supported = containers[to].format().getSupportedCodecs() as string[];
      const misfit = [video, ...chosen].find((t) => t && !supported.includes(t.codec ?? ""));
      if (misfit)
        throw new EngineError(
          "unsupported-output",
          `${to.toUpperCase()} cannot hold the ${codecName(misfit.codec ?? undefined) ?? "track"} as it is.`,
          "Convert the video to MKV first, which holds almost any codec.",
        );
      let tags: Awaited<ReturnType<typeof input.getMetadataTags>> | undefined;
      try {
        tags = await input.getMetadataTags();
      } catch {
        // Tags are a convenience.
      }
      const duration = (await input.getDurationFromMetadata()) ?? 0;
      const parts = await copyTracks({
        input,
        tracks: video ? [video, ...chosen] : chosen,
        to,
        tags,
        defaultAudio: chosen[0],
        ctx,
        onProgress: (ratio) =>
          ctx.onProgress({
            phase: "processing",
            ratio,
            detail:
              duration > 0
                ? `${formatDuration(ratio * duration)} of ${formatDuration(duration)} copied`
                : "Copying",
          }),
      });
      ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
      const outputName = `${baseName(file.name) || "video"}-tracks.${to}`;
      const dropped = audios.length - chosen.length;
      return {
        blob: new Blob(parts, { type: containers[to].mime }),
        filename: outputName,
        ffmpegCommand: tracksCommand(file.name, outputName, o),
        meta: [
          `${chosen.length} of ${audios.length} sound ${audios.length === 1 ? "track" : "tracks"} kept`,
          dropped > 0 ? `${dropped} removed` : "",
          "copied, nothing re-encoded",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    } catch (e) {
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
      throw classifyError(e);
    } finally {
      input.dispose();
    }
  },
};
