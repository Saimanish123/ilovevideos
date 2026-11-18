"use client";

import type { ReactNode, RefObject } from "react";
import { AudioHero } from "../audio/audio-hero";
import type { HeroProps } from "../options/types";
import { VideoPreview } from "../video-preview";
import { WaveStrip } from "./wave-strip";

/** Whether the hero is showing a video (its picture, then the sound under it) or an audio file. */
export const isVideoFile = (file: File, info: HeroProps<unknown>["info"]) =>
  info ? !!info.video : file.type.startsWith("video/");

/**
 * The hero of the sound tools. An audio file gets the waveform player; a video keeps its picture
 * with native controls and shows its sound as a strip underneath. Either way `layer` is drawn over
 * the waveform (a fade envelope, cut marks) and the element that plays is the stage's preview, so
 * the panel's live preview and Space drive it.
 */
export function SoundHero<O>(
  props: HeroProps<O> & {
    layer?: (duration: number) => ReactNode;
    /** What the strip under a video shows, for screen readers. */
    stripLabel?: string;
    /** No strip under a video (the page's own timeline shows the sound). */
    noStrip?: boolean;
  },
) {
  const { file, info, media, layer, stripLabel, noStrip } = props;
  if (!isVideoFile(file, info))
    return (
      <AudioHero
        file={file}
        info={info}
        phase={props.phase}
        progress={props.progress}
        showing={props.showing}
        media={media}
        layer={layer}
      />
    );
  const duration = info?.durationSec ?? 0;
  if (noStrip)
    return (
      <VideoPreview
        file={file}
        info={info}
        videoRef={media as RefObject<HTMLVideoElement | null> | undefined}
      />
    );
  return (
    <div className="flex flex-col gap-3">
      <VideoPreview
        file={file}
        info={info}
        videoRef={media as RefObject<HTMLVideoElement | null> | undefined}
      />
      <WaveStrip
        file={file}
        media={media}
        duration={duration}
        label={stripLabel ?? "The video's sound"}
        layer={layer && duration > 0 ? layer(duration) : undefined}
      />
    </div>
  );
}
