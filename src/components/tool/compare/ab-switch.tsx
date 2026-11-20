"use client";

import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import type { CompareSource } from "./context";
import type { ABHandle, Side } from "./sound-ab";

type SoundAB = typeof import("./sound-ab");

const SIDES: { value: Side; label: string }[] = [
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
];

/**
 * Before/After for a sound result (ADR-0136): two radios that switch what is heard at the same
 * position. Nothing of the source is read until Before is first chosen; the switching code loads
 * while the result shows, so the first choice still counts as the gesture that starts the sound.
 * `tone` is "stage" on the dark audio hero and "page" under a video's playback bar.
 */
export function ABSwitch({
  media,
  compare,
  tone,
}: {
  media: RefObject<HTMLMediaElement | null>;
  compare: CompareSource;
  tone: "stage" | "page";
}) {
  const [side, setSide] = useState<Side>("after");
  const [failed, setFailed] = useState(false);
  const mod = useRef<SoundAB | undefined>(undefined);
  const handle = useRef<ABHandle | undefined>(undefined);
  const host = useRef<HTMLDivElement>(null);
  const name = useId();
  useEffect(() => {
    let live = true;
    void import("./sound-ab").then((m) => {
      if (live) mod.current = m;
    });
    return () => {
      live = false;
      handle.current?.dispose();
      handle.current = undefined;
    };
  }, []);

  const start = (m: SoundAB) => {
    const el = media.current;
    if (!el || !host.current) return undefined;
    handle.current ??= m.startAB(el, compare, host.current, () => {
      handle.current?.dispose();
      handle.current = undefined;
      setFailed(true);
      setSide("after");
    });
    return handle.current;
  };
  const choose = (next: Side) => {
    setSide(next);
    const m = mod.current;
    if (m) start(m)?.set(next);
    else void import("./sound-ab").then((loaded) => start(loaded)?.set(next));
  };

  if (failed)
    return (
      <p
        role="status"
        className={cn("text-sm", tone === "stage" ? "text-gray-400" : "text-fg-muted")}
      >
        The original does not play in this browser.
      </p>
    );
  return (
    <div data-testid="ab-switch" className="sm:min-w-40">
      {/* The hidden source element lives here while the switch does. */}
      <div ref={host} hidden />
      <Segmented
        name={name}
        value={side}
        onChange={choose}
        options={SIDES}
        tone={tone === "stage" ? "stage" : "page"}
        aria-label="Listen to"
      />
    </div>
  );
}
