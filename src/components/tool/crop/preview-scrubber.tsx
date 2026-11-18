"use client";

import { useState } from "react";
import { FrameScrubber } from "@/components/tool/timeline/frame-scrubber";
import type { MediaInfo } from "@/tools/engines/types";

/**
 * Filmstrip under a preview whose native controls are hidden by an overlay (the crop frame). It only
 * chooses which moment the preview shows, so the frame can be checked against a moving subject; the
 * time is not an option and never reaches the engine.
 */
export function PreviewScrubber({
  file,
  video,
  info,
  disabled,
}: {
  file: File;
  video: React.RefObject<HTMLVideoElement | null>;
  info: MediaInfo;
  disabled?: boolean;
}) {
  const [time, setTime] = useState(0);
  return (
    <FrameScrubber
      disabled={disabled}
      file={file}
      video={video}
      duration={info.durationSec}
      fps={info.video?.fps ?? 30}
      value={time}
      onChange={setTime}
    />
  );
}
