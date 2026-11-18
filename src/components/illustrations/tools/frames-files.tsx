import type { SVGProps } from "react";

/**
 * Illustrations for animated images, thumbnails, the sharpest frame, creation dates and repair, in
 * the same system as ./index.tsx (README.md#design-system §7.1, ADR-0008): 240×160 canvas, 4px grid,
 * 1.5 monoline strokes, round joins, `currentColor` for the subject, fg-muted for context, bg-raised
 * flat fills. Static and decorative (`aria-hidden`). Kept apart so the shared index only gains entries.
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

/** Animated image: a muted clip, the house arrow, then a stack of frames with a loop under it. */
export function AnimatedImageIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="52" width="72" height="56" rx="6" stroke={MUTED} />
      <path d="M52 68v24l20-12z" stroke={MUTED} />
      <path d="M104 80h16M112 72l8 8-8 8" />
      <rect x="144" y="40" width="72" height="56" rx="6" stroke={MUTED} />
      <rect x="136" y="48" width="72" height="56" rx="6" fill={RAISED} />
      <path d="M152 88l12-16 12 12 8-8 12 12" />
      <circle cx="192" cy="64" r="4" />
      <path d="M152 120a20 12 0 0 0 40 0" />
      <path d="M152 120l4-8M152 120l8 4" />
    </Frame>
  );
}

/** Thumbnail maker: a film strip with one frame lifted out into a framed 16:9 still. */
export function ThumbnailIllustration(props: Props) {
  const xs = [28, 64, 100, 136, 172];
  return (
    <Frame {...props}>
      <path d="M24 112h192M24 136h192" stroke={MUTED} />
      {xs.map((x) => (
        <rect key={x} x={x} y="116" width="32" height="16" rx="2" stroke={MUTED} />
      ))}
      <rect x="64" y="24" width="112" height="64" rx="6" fill={RAISED} />
      <path d="M80 72l20-24 16 16 12-12 32 20" />
      <circle cx="148" cy="40" r="4" />
      <path d="M120 108V92M112 100l8-8 8 8" />
    </Frame>
  );
}

/** Sharpest frame: three frames, two blurred in muted strokes, the middle one crisp. */
export function SharpestFrameIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="52" width="56" height="56" rx="6" stroke={MUTED} />
      <path d="M36 92c8-12 16-12 24 0M36 96c8-12 16-12 24 0" stroke={MUTED} />
      <rect x="160" y="52" width="56" height="56" rx="6" stroke={MUTED} />
      <path d="M172 92c8-12 16-12 24 0M172 96c8-12 16-12 24 0" stroke={MUTED} />
      <rect x="88" y="40" width="64" height="80" rx="6" fill={RAISED} />
      <path d="M100 100c12-20 28-20 40 0" />
      <circle cx="120" cy="64" r="8" />
    </Frame>
  );
}

/** Creation date: a muted video frame behind a calendar sheet with a clock. */
export function CreationDateIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="36" width="112" height="76" rx="6" stroke={MUTED} />
      <path d="M72 64v24l20-12z" stroke={MUTED} />
      <rect x="112" y="56" width="104" height="80" rx="6" fill={RAISED} />
      <path d="M112 76h104M136 48v16M192 48v16" />
      <circle cx="164" cy="108" r="16" />
      <path d="M164 96v12l8 8" />
    </Frame>
  );
}

/** Repair: a muted frame with a torn edge, the house arrow, then a shorter, clean-edged frame. */
export function RepairIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path
        d="M32 44h76l-8 12 8 12-8 12 8 12-8 12 8 12H32a8 8 0 0 1-8-8V52a8 8 0 0 1 8-8z"
        stroke={MUTED}
      />
      <path d="M56 68v24l20-12z" stroke={MUTED} />
      <path d="M120 80h16M128 72l8 8-8 8" />
      <rect x="148" y="52" width="68" height="56" rx="6" fill={RAISED} />
      <path d="M172 68v24l20-12z" />
    </Frame>
  );
}

export const framesFilesIllustrations = {
  "animated-image": AnimatedImageIllustration,
  thumbnail: ThumbnailIllustration,
  "sharpest-frame": SharpestFrameIllustration,
  "creation-date": CreationDateIllustration,
  repair: RepairIllustration,
} as const;
