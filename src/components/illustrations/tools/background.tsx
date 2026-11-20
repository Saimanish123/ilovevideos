import type { SVGProps } from "react";

/**
 * Illustrations for the background tools without a green screen (blur or replace the background),
 * in the same system as ./index.tsx (README.md#design-system §7.1, ADR-0008): 240×160 canvas, 4px
 * grid, 1.5 monoline strokes, round joins, `currentColor` for the subject, fg-muted for context,
 * bg-raised flat fills. Static and decorative (`aria-hidden`). Kept apart so the shared index only
 * gains entries.
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

/** Blur the background: a person sharp in front of a room drawn soft (a dashed window and shelf). */
export function BackgroundBlurIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="28" y="24" width="184" height="112" rx="6" fill={RAISED} />
      <rect x="44" y="40" width="44" height="48" rx="4" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M66 40v48M44 64h44" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M156 56h40M156 80h40" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M164 56v-12h8v12M180 80v-16h8v16" stroke={MUTED} strokeDasharray="2 4" />
      <circle cx="120" cy="76" r="16" fill={RAISED} />
      <path d="M92 136c0-24 12-36 28-36s28 12 28 36" fill={RAISED} />
    </Frame>
  );
}

/**
 * Remove the background: an ordinary room (window, shelves) with the person found in it as a dashed
 * outline, the house arrow, then the same person alone on a plain block. No screen anywhere: that
 * is what tells it apart from the green screen's picture.
 */
export function BackgroundReplaceIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="40" width="80" height="80" rx="6" stroke={MUTED} />
      <rect x="32" y="48" width="20" height="24" rx="2" stroke={MUTED} />
      <path d="M42 48v24M32 60h20" stroke={MUTED} />
      <path d="M80 56h16M80 72h16M84 56v-8h4v8M88 72v-8h4v8" stroke={MUTED} />
      <circle cx="64" cy="84" r="8" strokeDasharray="3 3" />
      <path d="M48 120c0-16 6-24 16-24s16 8 16 24" strokeDasharray="3 3" />
      <path d="M112 80h16M122 72l8 8-8 8" />
      <rect x="136" y="40" width="80" height="80" rx="6" fill={RAISED} />
      <circle cx="176" cy="84" r="8" fill={RAISED} />
      <path d="M160 120c0-16 6-24 16-24s16 8 16 24" fill={RAISED} />
    </Frame>
  );
}

export const backgroundIllustrations = {
  "background-blur": BackgroundBlurIllustration,
  "background-replace": BackgroundReplaceIllustration,
} as const;
