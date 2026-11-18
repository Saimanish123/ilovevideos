import type { SVGProps } from "react";

/**
 * Illustrations for the time and layout tools (freeze frame, picture in picture, side by side, zoom,
 * clips for short-video platforms), in the system of ./index (ADR-0008): canvas 240×160, 4px grid,
 * 1.5 monoline strokes, round joins, `currentColor` for the subject, `var(--color-fg-muted)` for
 * context, `var(--color-bg-raised)` for flat fills. Static, decorative.
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

const play = (x: number, y: number, h = 16) => (
  <path d={`M${x} ${y}v${h}l${h * 0.75} ${-h / 2}z`} fill="currentColor" stroke="none" />
);

/** Freeze frame: a strip where one frame repeats three times (solid), the rest muted, and a bracket under the hold. */
export function FreezeFrameIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M24 136h192" stroke={MUTED} />
      <rect x="24" y="52" width="36" height="56" rx="6" stroke={MUTED} />
      <rect x="64" y="52" width="36" height="56" rx="6" fill={RAISED} />
      <rect x="104" y="52" width="36" height="56" rx="6" fill={RAISED} />
      <rect x="144" y="52" width="36" height="56" rx="6" fill={RAISED} />
      <rect x="184" y="52" width="32" height="56" rx="6" stroke={MUTED} />
      {[64, 104, 144].map((x) => (
        <path key={x} d={`M${x + 10} 92l8-12 6 8 4-4 8 8`} />
      ))}
      <path d="M64 124h116" />
      <path d="M64 120v8M180 120v8" />
    </Frame>
  );
}

/** Picture in picture: a large frame with a small framed inset in the lower right. */
export function PictureInPictureIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="24" width="192" height="112" rx="8" stroke={MUTED} />
      {play(60, 64, 24)}
      <rect x="140" y="84" width="64" height="40" rx="6" fill={RAISED} />
      {play(164, 96, 16)}
      <path d="M128 76l8 4M128 76l4 8" stroke={MUTED} />
    </Frame>
  );
}

/** Side by side: two frames sharing one outline, with a thin divider. */
export function SideBySideIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="36" width="192" height="88" rx="8" stroke={MUTED} />
      <rect x="28" y="40" width="88" height="80" rx="6" fill={RAISED} />
      <rect x="124" y="40" width="88" height="80" rx="6" fill={RAISED} />
      {play(64, 72, 16)}
      {play(160, 72, 16)}
    </Frame>
  );
}

/** Zoom: a frame with a smaller window inside and arrows reaching out to the frame's corners. */
export function ZoomIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="24" width="192" height="112" rx="8" stroke={MUTED} />
      <rect x="92" y="60" width="72" height="40" rx="6" fill={RAISED} />
      {play(120, 72, 16)}
      <path
        d="M92 60L40 36M164 60l36-24M92 100l-52 24M164 100l36 24"
        stroke={MUTED}
        strokeDasharray="3 5"
      />
      <path d="M40 36h8M40 36v8M200 36h-8M200 36v8M40 124h8M40 124v-8M200 124h-8M200 124v-8" />
    </Frame>
  );
}

/** Clips for short-video platforms: a long strip cut into three tall frames. */
export function ShortsClipsIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M24 32h192v24H24z" stroke={MUTED} />
      <path d="M88 28v32M152 28v32" strokeDasharray="3 5" />
      {[44, 104, 164].map((x) => (
        <g key={x}>
          <rect x={x} y="72" width="36" height="64" rx="6" fill={RAISED} />
          {play(x + 12, 96, 16)}
        </g>
      ))}
    </Frame>
  );
}

export const timeLayoutIllustrations = {
  "freeze-frame": FreezeFrameIllustration,
  "picture-in-picture": PictureInPictureIllustration,
  "side-by-side": SideBySideIllustration,
  zoom: ZoomIllustration,
  "shorts-clips": ShortsClipsIllustration,
} as const;
