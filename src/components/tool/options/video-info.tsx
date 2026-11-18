"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatBytes, formatDimensions, formatDuration, withUnit } from "@/lib/format";
import { codecName } from "@/tools/engines/convert-video/plan";
import type { InspectOptions } from "@/tools/engines/inspect";
import { formatChannels, infoReport, infoSections } from "@/tools/engines/inspect/report";
import type { MediaInfo } from "@/tools/engines/types";
import { NextStep } from "../result-card";
import { PLAY_SHORTCUT } from "../shortcuts";
import type { NextStepLink, OptionsSpec } from "./types";

/** Over this a file is heavy to send by mail or chat; the page offers compression. */
const LARGE = 25_000_000;

/** What a video codec means for playback, in plain words. Hedged where support varies by device. */
const codecNote: Record<string, string> = {
  avc: "H.264 plays on almost every phone, computer, TV and editor.",
  hevc: "HEVC is smaller than H.264 at the same quality, but whether it plays depends on the device and the app: Apple devices play it, many browsers, PCs and older TVs do not.",
  vp9: "VP9 is the web's codec: browsers and Android play it, but many editors and some Apple apps do not open it.",
  av1: "AV1 is the newest and most efficient of these; older phones and computers may not play it, or only slowly.",
  vp8: "VP8 is an older web codec; browsers play it, most editors and phones' galleries do not.",
};

/** The file in one sentence: container, length, size, picture and sound. */
function overview(info: MediaInfo): { headline: string; sentence: string } {
  const v = info.video;
  const a = info.audio?.[0];
  const container = info.container;
  const pieces = [
    formatDuration(info.durationSec),
    v && formatDimensions(v.width, v.height),
    v && v.fps > 0 && Number.isFinite(v.fps) && withUnit(Math.round(v.fps * 100) / 100, "fps"),
    formatBytes(info.sizeBytes),
  ].filter(Boolean);
  const picture = v ? `${codecName(v.codec) ?? v.codec} video` : "No video track";
  const sound = a
    ? ` with ${formatChannels(a.channels)} ${a.codec.startsWith("pcm") ? "PCM" : (codecName(a.codec) ?? a.codec)} sound${(info.audio?.length ?? 0) > 1 ? ` (${info.audio?.length} audio tracks)` : ""}`
    : v
      ? " with no sound"
      : "";
  return {
    headline: pieces.join(" · "),
    sentence: `${picture}${sound}, in ${article(container)} file.`,
  };
}

/**
 * "an MP4", "an MKV", "a MOV", "a Matroska", "an Ogg": initialisms are read letter by letter (an F, an
 * M), words by their first sound. MOV is said as a word.
 */
const article = (name: string) => {
  const initialism = /^[A-Z0-9-]+$/.test(name) && name !== "MOV";
  const vowelSound = initialism ? /^[AEFHILMNORSX]/.test(name) : /^[aeiou]/i.test(name);
  return vowelSound ? `an ${name}` : `a ${name}`;
};

/** Next steps the facts call for, most pressing first. Each hands this file on. */
function nextSteps(info: MediaInfo): (NextStepLink & { why: string })[] {
  const out: (NextStepLink & { why: string })[] = [];
  const v = info.video;
  // Compressing is for videos; a large audio file has nothing to compress here.
  if (v && info.sizeBytes > LARGE)
    out.push({
      slug: "compress-video",
      label: "Compress video",
      why: `At ${formatBytes(info.sizeBytes)} it is too big for many mail and chat limits.`,
    });
  if (v && ["hevc", "vp9", "av1"].includes(v.codec))
    out.push(
      info.container.toLowerCase().includes("webm")
        ? {
            slug: "webm-to-mp4",
            label: "Convert WebM to MP4",
            why: `${codecName(v.codec)} does not play everywhere; this writes H.264, which does.`,
          }
        : {
            slug: "video-converter",
            label: "Convert to H.264",
            why: `${codecName(v.codec)} does not play everywhere. In the converter, choose H.264 as the video codec.`,
          },
    );
  const r = (((v?.rotation ?? 0) % 360) + 360) % 360;
  if (v && r !== 0)
    out.push({
      slug: "rotate-video",
      label: "Rotate video",
      why: `It carries a ${r}° rotation flag, as phones write for video filmed upright. To turn it another way, rotate it; on MP4 and MOV only the flag is rewritten.`,
    });
  if (v && (info.audio?.length ?? 0) === 0)
    out.push({
      slug: "add-audio-to-video",
      label: "Add audio to video",
      why: "It has no sound track.",
    });
  return out;
}

/**
 * Video info: the panel is the result. Everything the inspector read, as a definition list, plus a
 * plain-text copy. Nothing runs, so the spec sets `noAction` and the stage draws no primary button.
 */
export const videoInfoSpec: OptionsSpec<InspectOptions> = {
  verb: "Inspect",
  noAction: true,
  // Subtitle tracks are read from the container here (the inspector skips them), so the facts and
  // "Copy as text" list them too.
  inspect: async (file) => {
    const [{ withSubtitleTracks }, { EngineClient }] = await Promise.all([
      import("@/tools/engines/inspect/subtitles"),
      import("@/tools/workers/client"),
    ]);
    const client = new EngineClient();
    try {
      return await withSubtitleTracks(file, await client.inspect(file));
    } finally {
      client.dispose();
    }
  },
  shortcuts: [PLAY_SHORTCUT],
  defaults: () => ({}),
  Panel({ info, media }) {
    const sections = infoSections(info);
    const o = overview(info);
    const v = info.video;
    const note = v ? codecNote[v.codec] : undefined;
    const next = nextSteps(info);
    return (
      <div className="flex flex-col gap-6" data-testid="video-info">
        <section aria-labelledby="info-overview" data-testid="info-overview">
          <h2 id="info-overview" className="sr-only">
            Overview
          </h2>
          <p className="tabular text-h3">{o.headline}</p>
          <p className="mt-1 text-sm">{o.sentence}</p>
          {note && <p className="mt-2 text-fg-muted text-sm">{note}</p>}
        </section>
        {next.length > 0 && (
          <section aria-labelledby="info-next" data-testid="info-next">
            <h2 id="info-next" className="font-medium text-fg-muted text-sm">
              What you might do next
            </h2>
            <ul className="mt-1 flex flex-col">
              {next.map((n) => (
                <li key={n.slug} className="flex flex-col">
                  <NextStep slug={n.slug} label={n.label} file={media.file} />
                  <span className="-mt-2 text-fg-muted text-xs">{n.why}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {sections.map((s) => (
          <section key={s.title} aria-labelledby={`info-${slug(s.title)}`}>
            <h2 id={`info-${slug(s.title)}`} className="font-medium text-fg-muted text-sm">
              {s.title}
            </h2>
            <dl className="mt-2 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
              {s.rows.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="text-fg-muted">{r.label}</dt>
                  <dd className="tabular min-w-0 break-words text-fg">{r.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <CopyButton text={() => infoReport(info, media.file.name)} />
        <p className="text-fg-muted text-xs">
          The container is the box the file comes in (MP4, MOV, MKV) and says how the streams are
          packed. The codec is how each stream inside is compressed (H.264, HEVC, AAC). A player has
          to understand both.
        </p>
      </div>
    );
  },
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/**
 * Ghost button whose label swaps to "Copied" for 1.5 s with a small vertical text slide, then back
 * (design system §6.4, signature moment 4). Keyboard-initiated presses still show the swap because
 * it confirms a real event; reduced motion collapses the slide to a fade.
 */
function CopyButton({ text }: { text: () => string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    const value = text();
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      ok = legacyCopy(value);
    }
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1500);
  };

  const label =
    state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : "Copy as text";
  return (
    <div className="flex">
      <Button variant="ghost" size="md" onClick={copy} className="-ml-4 overflow-hidden">
        <span className="sr-only">{label}</span>
        <span aria-hidden className="grid text-left">
          <SwapLabel active={state === "idle"}>Copy as text</SwapLabel>
          <SwapLabel active={state === "copied"}>Copied</SwapLabel>
          <SwapLabel active={state === "failed"}>Could not copy</SwapLabel>
        </span>
      </Button>
      {/* The label swap is not announced on its own: say the outcome once. */}
      <p className="sr-only" role="status" aria-live="polite">
        {state === "copied"
          ? "The report is on the clipboard."
          : state === "failed"
            ? "Could not copy the report."
            : ""}
      </p>
    </div>
  );
}

function SwapLabel({ active, children }: { active: boolean; children: string }) {
  return (
    <span
      className={cn(
        "col-start-1 row-start-1 block whitespace-nowrap transition-[transform,opacity] duration-(--duration-base) ease-(--ease-out) motion-reduce:transition-opacity motion-reduce:duration-(--duration-fast)",
        active
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0 motion-reduce:translate-y-0",
      )}
    >
      {children}
    </span>
  );
}

function legacyCopy(value: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.className = "sr-only";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
