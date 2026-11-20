import type { SVGProps } from "react";
import { labelCentered } from "./glyphs";

/**
 * Family illustrations for audio format pairs (`audio-pair:<from>:<to>`) and subtitle format pairs (`subtitle-pair:<from>:<to>`).
 * Same system as ./index (ADR-0008): canvas 240×160, 4px grid, 1.5 monoline strokes, round joins,
 * `currentColor` for the subject, `var(--color-fg-muted)` for context, `var(--color-bg-raised)` for
 * flat fills; labels drawn with the stroke alphabet in ./glyphs. Static, decorative.
 */

const MUTED = "var(--color-fg-muted)";
const RAISED = "var(--color-bg-raised)";

type Props = SVGProps<SVGSVGElement>;
type FamilyProps = Props & { args: string[] };

function Frame({ children, ...props }: Props) {
  return (
    <svg
      viewBox="0 0 240 160"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

const ARROW = "M112 80h16M122 72l8 8-8 8";

/** Formats whose audio is stored without loss; m4a counts as lossy because it is nearly always AAC. */
const LOSSLESS = new Set(["wav", "flac", "aiff"]);

/** Half-heights of one waveform envelope, sampled every 4 units; a lossy wave keeps every other bar. */
const ENVELOPE = [4, 12, 20, 8, 16, 24, 12, 20, 8, 16, 24, 12, 16, 8, 4];

function wave(left: number, dense: boolean): string {
  return ENVELOPE.map((h, i) =>
    dense || i % 2 === 0 ? `M${left + i * 4} ${92 - h}v${h * 2}` : "",
  ).join("");
}

/**
 * Audio pair: a labelled muted source with its waveform becomes a labelled solid file on a raised
 * fill. Bar density shows detail: a lossless wave is dense, a lossy one keeps every other bar, and
 * the target is only dense when both ends are lossless, since a conversion never restores detail.
 */
function AudioPairIllustration({ args, ...props }: FamilyProps) {
  const [from = "", to = ""] = args;
  const sourceDense = LOSSLESS.has(from);
  const targetDense = sourceDense && LOSSLESS.has(to);
  return (
    <Frame {...props}>
      <rect x="24" y="32" width="80" height="96" rx="6" stroke={MUTED} strokeDasharray="4 6" />
      <path d={labelCentered(from, 64, 44)} stroke={MUTED} />
      <path d={wave(36, sourceDense)} stroke={MUTED} />
      <path d={ARROW} />
      <rect x="136" y="32" width="80" height="96" rx="6" fill={RAISED} />
      <path d={labelCentered(to, 176, 44)} />
      <path d={wave(148, targetDense)} />
    </Frame>
  );
}

/** Cue lines inside a page: a short time stub then the words; a transcript keeps only the words. */
function cues(left: number, words: boolean): string {
  const rows: [number, number][] = [
    [72, 24],
    [84, 36],
    [100, 24],
    [112, 28],
  ];
  return rows
    .map(([y, w], i) =>
      words
        ? `M${left} ${y}h${i % 2 === 0 ? 40 : w}`
        : i % 2 === 0
          ? `M${left} ${y}h12M${left + 16} ${y}h${w}`
          : `M${left} ${y}h${w}`,
    )
    .join("");
}

/**
 * Subtitle pair: the cues of a labelled muted file move into a labelled solid file of the target
 * format. A plain text target drops the time stubs, so a transcript reads as words only.
 */
function SubtitlePairIllustration({ args, ...props }: FamilyProps) {
  const [from = "", to = ""] = args;
  return (
    <Frame {...props}>
      <path d="M28 32h48l16 16v80H28z" stroke={MUTED} strokeDasharray="4 6" />
      <path d={labelCentered(from, 56, 44)} stroke={MUTED} />
      <path d={cues(40, false)} stroke={MUTED} />
      <path d={ARROW} />
      <path d="M148 32h48l16 16v80h-64z" fill={RAISED} />
      <path d="M196 32v16h16" />
      <path d={labelCentered(to, 176, 44)} />
      <path d={cues(160, to === "txt")} />
    </Frame>
  );
}

export const soundPairIllustrations: Record<string, (p: FamilyProps) => React.ReactNode> = {
  "audio-pair": AudioPairIllustration,
  "subtitle-pair": SubtitlePairIllustration,
};
