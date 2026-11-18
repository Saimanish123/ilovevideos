"use client";

import { useEffect } from "react";
import { formatDimensions } from "@/lib/format";
import { codecName } from "@/tools/engines/convert-video/plan";
import { formatBitrate, formatChannels } from "@/tools/engines/inspect/report";
import type { MuteOptions } from "@/tools/engines/mute";
import type { MediaInfo } from "@/tools/engines/types";
import { NextStep } from "../result-card";
import { PLAY_SHORTCUT } from "../shortcuts";
import type { OptionsPanelProps, OptionsSpec } from "./types";

const tracks = (info: MediaInfo) => info.audio ?? [];

/** "AAC · stereo · 128 kbps · en" for one audio track. */
const trackFacts = (a: NonNullable<MediaInfo["audio"]>[number]) =>
  [
    a.codec.startsWith("pcm") ? "PCM" : (codecName(a.codec) ?? a.codec),
    formatChannels(a.channels),
    formatBitrate(a.bitrate),
    a.language,
  ]
    .filter(Boolean)
    .join(" · ");

const countWords = (n: number) => (n === 1 ? "one audio track" : `${n} audio tracks`);

export const muteSpec: OptionsSpec<MuteOptions> = {
  verb: "Remove audio",
  defaults: () => ({}),
  previewResult: true,
  shortcuts: [PLAY_SHORTCUT],
  // A video without sound is already what this page makes: say so where the button would be.
  blocked: (_o, info) =>
    tracks(info).length === 0
      ? {
          reason: "Already silent: this video has no audio track, so there is nothing to remove.",
          settled: true,
          action: { slug: "add-audio-to-video", label: "Add sound to it instead" },
        }
      : undefined,
  summary: (_o, info) =>
    tracks(info).length > 0
      ? `Removes ${countWords(tracks(info).length)}. The video is copied bit for bit, so nothing is re-encoded.`
      : undefined,
  result: (_o, info) => ({
    title: `Sound removed: ${countWords(tracks(info).length)}`,
    detail: "The video was copied bit for bit. The preview plays the silent result.",
    next: { slug: "add-audio-to-video", label: "Add new sound to it" },
  }),
  Panel: MutePanel,
};

/**
 * What goes (every audio track, with its facts) and what stays (the picture, copied). The preview
 * plays muted meanwhile, so it already sounds like the result. For people who wanted the opposite,
 * one link hands the same file to extract audio.
 */
function MutePanel({ info, media }: OptionsPanelProps<MuteOptions>) {
  useMutedPreview(media.video);
  const audio = tracks(info);
  const v = info.video;
  const subs = info.subtitles?.length ?? 0;
  if (audio.length === 0) return null;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-medium text-sm">Will be removed</p>
        <ul className="mt-2 flex flex-col divide-y divide-border rounded-md border border-border text-sm">
          {audio.map((a, i) => (
            <li
              key={`${i.toString()}-${a.codec}`}
              className="flex min-h-11 items-center justify-between gap-3 px-3 py-2"
            >
              <span>{audio.length > 1 ? `Audio track ${i + 1}` : "Audio"}</span>
              <span className="tabular truncate text-fg-muted">{trackFacts(a)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-medium text-sm">Kept as it is</p>
        <p className="tabular mt-2 text-fg-muted text-sm">
          {v
            ? `Video: ${codecName(v.codec) ?? v.codec}, ${formatDimensions(v.width, v.height)}, copied bit for bit.`
            : "The file's other streams, copied."}
          {subs > 0 &&
            ` ${subs === 1 ? "The subtitle track stays" : `${subs} subtitle tracks stay`}.`}
        </p>
        {!media.batch && (
          <p className="mt-2 text-fg-muted text-xs">The preview plays muted, as the result will.</p>
        )}
      </div>
      <div className="flex flex-col">
        <p className="text-fg-muted text-sm">Want the sound instead?</p>
        <NextStep slug="extract-audio-from-video" label="Extract the audio" file={media.file} />
      </div>
    </div>
  );
}

/** Mutes the preview while the panel is shown; the result (a new element) plays as it is. */
function useMutedPreview(video: React.RefObject<HTMLVideoElement | null>) {
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    const apply = () => {
      const el = video.current;
      if (el) el.muted = true;
      else if (tries++ < 120) raf = requestAnimationFrame(apply);
    };
    apply();
    return () => {
      cancelAnimationFrame(raf);
      if (video.current) video.current.muted = false;
    };
  }, [video]);
}
