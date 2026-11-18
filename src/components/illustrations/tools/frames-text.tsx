import type { SVGProps } from "react";

/**
 * Illustrations for the frames, stills, slideshow, metadata and text tools, in the same system as
 * ./index.tsx (README.md#design-system §7.1, ADR-0008): 240×160 canvas, 4px grid, 1.5 monoline
 * strokes, round joins, `currentColor` for the subject, fg-muted for context, bg-raised flat fills.
 * Static and decorative (`aria-hidden`). Kept apart so the shared index only gains entries.
 */

const MUTED = "var(--color-fg-muted)";
const RAISED = "var(--color-bg-raised)";

type Props = SVGProps<SVGSVGElement>;

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

/** Contact sheet: one sheet with a header line over a three-by-three grid of frames. */
export function ContactSheetIllustration(props: Props) {
  const cols = [60, 102, 144];
  const rows = [56, 84, 112];
  return (
    <Frame {...props}>
      <rect x="48" y="20" width="144" height="124" rx="6" fill={RAISED} />
      <path d="M60 32h64" />
      <path d="M60 40h40" stroke={MUTED} />
      {rows.flatMap((y) =>
        cols.map((x) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="36"
            height="24"
            rx="2"
            stroke={x === 102 && y === 84 ? "currentColor" : MUTED}
          />
        )),
      )}
      <path d="M128 104h8" />
    </Frame>
  );
}

/** Image sequence: a film strip on the left becomes a fanned stack of separate stills on the right. */
export function ImageSequenceIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M20 56h72v48H20z" stroke={MUTED} />
      {[28, 44, 60, 76].map((x) => (
        <rect key={`t${x}`} x={x} y="60" width="8" height="6" rx="1" stroke={MUTED} />
      ))}
      {[28, 44, 60, 76].map((x) => (
        <rect key={`b${x}`} x={x} y="94" width="8" height="6" rx="1" stroke={MUTED} />
      ))}
      <path d="M104 80h20M116 72l8 8-8 8" />
      <rect x="152" y="32" width="64" height="44" rx="4" stroke={MUTED} />
      <rect x="144" y="52" width="64" height="44" rx="4" stroke={MUTED} fill={RAISED} />
      <rect x="136" y="72" width="64" height="44" rx="4" fill={RAISED} />
      <path d="M144 108l16-16 12 12 8-8 12 12" />
      <circle cx="184" cy="84" r="4" />
    </Frame>
  );
}

/** Images to video: a stack of photos on the left, an arrow, and a playing frame on the right. */
export function SlideshowIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="36" y="36" width="64" height="48" rx="4" stroke={MUTED} />
      <rect x="28" y="48" width="64" height="48" rx="4" stroke={MUTED} fill={RAISED} />
      <rect x="20" y="60" width="64" height="48" rx="4" fill={RAISED} />
      <path d="M28 100l16-16 12 12 8-8 12 12" />
      <circle cx="64" cy="72" r="4" />
      <path d="M112 80h20M124 72l8 8-8 8" />
      <rect x="144" y="44" width="76" height="72" rx="6" fill={RAISED} />
      <path d="M176 68v24l20-12z" fill="currentColor" stroke="none" />
      <path d="M144 124h76" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M144 124h28" />
    </Frame>
  );
}

/** Audio to video: a sound wave in muted strokes rises into a still picture with a play mark. */
export function AudioToVideoIllustration(props: Props) {
  const bars = [
    [24, 12],
    [32, 24],
    [40, 36],
    [48, 20],
    [56, 44],
    [64, 28],
    [72, 16],
    [80, 32],
    [88, 20],
  ] as const;
  return (
    <Frame {...props}>
      {bars.map(([x, h]) => (
        <path key={`w${x}`} d={`M${x} ${80 - h / 2}v${h}`} stroke={MUTED} />
      ))}
      <path d="M104 80h20M116 72l8 8-8 8" />
      <rect x="136" y="36" width="84" height="88" rx="6" fill={RAISED} />
      <path d="M148 108l20-24 16 16 12-12 16 20" />
      <circle cx="196" cy="60" r="6" />
    </Frame>
  );
}

/** Edit metadata: a frame beside its tag lines, one of them being rewritten with a pen. */
export function EditMetadataIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="44" width="104" height="72" rx="6" fill={RAISED} />
      <path d="M68 68v24l20-12z" fill="currentColor" stroke="none" />
      <path d="M148 56h64M148 72h48M148 104h40" stroke={MUTED} />
      <path d="M148 88h32" />
      <path d="M188 100l24-24 8 8-24 24h-8z" fill={RAISED} />
      <path d="M204 84l8 8" />
    </Frame>
  );
}

/** Extract subtitles: the text lines under a picture leave it and land in a separate file. */
export function ExtractSubtitlesIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="20" y="36" width="112" height="88" rx="6" fill={RAISED} />
      <path d="M68 60v20l16-10z" stroke={MUTED} />
      <path d="M40 100h72M52 108h48" strokeDasharray="4 6" />
      <path d="M140 80h16M148 72l8 8-8 8" />
      <path d="M168 40h32l12 12v68h-44z" fill={RAISED} />
      <path d="M200 40v12h12" />
      <path d="M176 68h8M188 68h16M176 80h28M176 96h8M188 96h16M176 108h20" />
    </Frame>
  );
}

/** Add text: a frame with a line of text in a dashed placement box and a large letter T. */
export function TextOverlayIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="28" width="192" height="104" rx="6" fill={RAISED} />
      <path d="M112 52v24l20-12z" stroke={MUTED} />
      <rect x="60" y="92" width="120" height="28" rx="2" stroke={MUTED} strokeDasharray="3 5" />
      <path d="M72 100h16M80 100v12" />
      <path d="M96 108h72" />
      <rect x="176" y="116" width="8" height="8" rx="1" fill={RAISED} />
    </Frame>
  );
}

/** Spread into the shared `illustrations` map (./index.tsx). */
export const framesTextIllustrations = {
  "contact-sheet": ContactSheetIllustration,
  "image-sequence": ImageSequenceIllustration,
  slideshow: SlideshowIllustration,
  "audio-to-video": AudioToVideoIllustration,
  "edit-metadata": EditMetadataIllustration,
  "extract-subtitles": ExtractSubtitlesIllustration,
  "text-overlay": TextOverlayIllustration,
} as const;
