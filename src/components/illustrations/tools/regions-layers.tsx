import type { SVGProps } from "react";

/**
 * Illustrations for the region and layer tools (blur part of a video, add an image, green screen),
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

/** Blur: a frame with a person; the head sits under a dashed oval filled with soft hatching. */
export function BlurIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="28" y="24" width="184" height="112" rx="6" fill={RAISED} />
      <path d="M92 136c0-24 12-36 28-36s28 12 28 36" stroke={MUTED} />
      <ellipse cx="120" cy="68" rx="28" ry="32" strokeDasharray="4 5" />
      <path d="M104 56h32M100 68h40M104 80h32" stroke={MUTED} strokeDasharray="2 4" />
      <path d="M152 44h36M152 52h24" stroke={MUTED} />
    </Frame>
  );
}

/** Add image: a frame with a sticker turned on a corner, a second one faint behind it. */
export function ImageOverlayIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="28" y="24" width="184" height="112" rx="6" stroke={MUTED} />
      <path d="M40 120l36-36 24 24 16-16 28 28" stroke={MUTED} />
      <rect x="132" y="36" width="56" height="44" rx="4" stroke={MUTED} strokeDasharray="4 5" />
      <g transform="rotate(-8 148 76)">
        <rect x="124" y="52" width="56" height="48" rx="4" fill={RAISED} />
        <circle cx="140" cy="68" r="6" />
        <path d="M128 96l16-14 10 8 10-10 16 16" />
      </g>
    </Frame>
  );
}

/** Green screen: a subject on a hatched backdrop (muted), an arrow, the same subject on a new scene. */
export function GreenScreenIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="40" width="80" height="80" rx="6" stroke={MUTED} strokeDasharray="4 6" />
      <path
        d="M32 56l16-12M32 72l36-28M32 88l56-44M36 104l60-48M52 112l44-36M72 112l24-20"
        stroke={MUTED}
        strokeDasharray="2 4"
      />
      <circle cx="64" cy="72" r="10" fill={RAISED} stroke={MUTED} />
      <path d="M48 120c0-16 6-24 16-24s16 8 16 24" fill={RAISED} stroke={MUTED} />
      <path d="M112 80h16M122 72l8 8-8 8" />
      <rect x="136" y="40" width="80" height="80" rx="6" fill={RAISED} />
      <path d="M144 108l20-24 12 12 12-16 20 24" stroke={MUTED} />
      <circle cx="176" cy="72" r="10" />
      <path d="M160 120c0-16 6-24 16-24s16 8 16 24" />
    </Frame>
  );
}

export const regionsLayersIllustrations = {
  blur: BlurIllustration,
  "image-overlay": ImageOverlayIllustration,
  "green-screen": GreenScreenIllustration,
} as const;
