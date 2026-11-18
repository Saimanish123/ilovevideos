import type { SVGProps } from "react";

/**
 * Illustrations for the text and time tools (progress bar, timer, intro and outro), in the same
 * system as ./index.tsx (README.md#design-system §7.1, ADR-0008): 240×160 canvas, 4px grid, 1.5
 * monoline strokes, round joins, `currentColor` for the subject, fg-muted for context, bg-raised flat
 * fills. Static and decorative (`aria-hidden`). Kept apart so the shared index only gains entries.
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

/** Progress bar: a frame with a scene, a track along the bottom edge filled two thirds of the way. */
export function ProgressBarIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="28" y="24" width="184" height="112" rx="6" fill={RAISED} />
      <path d="M44 108l36-36 24 24 16-16 32 28" stroke={MUTED} />
      <circle cx="168" cy="56" r="12" stroke={MUTED} />
      <path d="M36 124h168" stroke={MUTED} strokeWidth={4} />
      <path d="M36 124h108" strokeWidth={4} />
    </Frame>
  );
}

/** Timer: a frame with digits in the top right corner and a stopwatch face in the middle. */
export function TimerIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="28" y="24" width="184" height="112" rx="6" stroke={MUTED} />
      <rect x="148" y="36" width="52" height="20" rx="4" fill={RAISED} />
      <path d="M156 42v8M164 42h4v8h-4M180 42h6v4h-6v4h6M192 42h4v8h-4z" />
      <circle cx="104" cy="88" r="24" />
      <path d="M104 88V74M104 88l10 6M98 56h12M104 56v8" />
    </Frame>
  );
}

/** Intro and outro: a title card, the main clip and an end card in a row, joined by arrows. */
export function IntroOutroIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="60" width="40" height="40" rx="4" fill={RAISED} />
      <path d="M32 76h24M36 84h16" />
      <rect x="84" y="44" width="72" height="72" rx="6" />
      <path d="M96 100l16-16 12 12 8-8 16 16" stroke={MUTED} />
      <rect x="176" y="60" width="40" height="40" rx="4" fill={RAISED} />
      <path d="M184 80h24" />
      <path d="M68 80h12m-4-4 4 4-4 4M160 80h12m-4-4 4 4-4 4" stroke={MUTED} />
    </Frame>
  );
}

export const textTimeIllustrations = {
  "progress-bar": ProgressBarIllustration,
  timer: TimerIllustration,
  "intro-outro": IntroOutroIllustration,
} as const;
