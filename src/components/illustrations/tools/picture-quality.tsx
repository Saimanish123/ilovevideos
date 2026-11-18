import type { SVGProps } from "react";

/**
 * Illustrations for the picture-quality tools (stabilize, sharpen, denoise, remove black bars,
 * change bitrate), in the system of ./index (ADR-0008): canvas 240×160, 4px grid, 1.5 monoline
 * strokes, round joins, `currentColor` for the subject, `var(--color-fg-muted)` for context,
 * `var(--color-bg-raised)` for flat fills. Static, decorative.
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

/** Stabilize: two tilted, offset outlines (the shake) behind one level frame. */
export function StabilizeIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect
        x="44"
        y="36"
        width="144"
        height="88"
        rx="8"
        stroke={MUTED}
        transform="rotate(-4 116 80)"
      />
      <rect
        x="52"
        y="40"
        width="144"
        height="88"
        rx="8"
        stroke={MUTED}
        transform="rotate(3 124 84)"
      />
      <rect x="48" y="36" width="144" height="88" rx="8" fill={RAISED} />
      <path d="M72 108l28-32 20 20 16-12 32 24" />
      <path d="M88 136h64" />
    </Frame>
  );
}

/** Sharpen: a soft edge (muted, doubled) beside the same edge drawn crisp. */
export function SharpenIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="32" width="192" height="96" rx="8" stroke={MUTED} />
      <path d="M120 32v96" stroke={MUTED} strokeDasharray="3 5" />
      <path d="M40 112l24-40 20 28 16-16" stroke={MUTED} />
      <path d="M44 112l24-40 20 28 16-16" stroke={MUTED} />
      <path d="M136 112l24-40 20 28 16-16" />
      <circle cx="196" cy="52" r="8" fill={RAISED} />
    </Frame>
  );
}

/** Denoise: a frame speckled on the left half, clean on the right. */
export function DenoiseIllustration(props: Props) {
  const dots = [
    [36, 48],
    [52, 60],
    [44, 76],
    [64, 44],
    [76, 68],
    [40, 100],
    [60, 92],
    [84, 52],
    [96, 84],
    [72, 108],
    [100, 104],
    [88, 40],
    [56, 120],
    [104, 60],
  ];
  return (
    <Frame {...props}>
      <rect x="24" y="32" width="192" height="96" rx="8" stroke={MUTED} />
      <path d="M120 32v96" stroke={MUTED} strokeDasharray="3 5" />
      {dots.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill={MUTED} stroke="none" />
      ))}
      <rect x="132" y="44" width="72" height="72" rx="6" fill={RAISED} />
      <path d="M144 104l20-28 16 20 12-12" />
    </Frame>
  );
}

/** Remove black bars: a wide picture between two filled bars at the top and bottom of the frame. */
export function BlackBarsIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="24" width="192" height="112" rx="8" stroke={MUTED} />
      <path d="M24 48h192M24 112h192" stroke={MUTED} />
      <rect x="28" y="28" width="184" height="16" rx="4" fill="currentColor" stroke="none" />
      <rect x="28" y="116" width="184" height="16" rx="4" fill="currentColor" stroke="none" />
      <rect x="40" y="56" width="160" height="48" rx="4" fill={RAISED} />
      <path d="M64 96l24-24 16 16 12-8 24 16" />
    </Frame>
  );
}

/** Change bitrate: a frame with a level meter beside it, the level set part way. */
export function BitrateIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="36" width="136" height="88" rx="8" fill={RAISED} />
      <path d="M48 108l28-32 20 20 16-12 24 24" />
      <rect x="180" y="36" width="24" height="88" rx="4" stroke={MUTED} />
      <path d="M184 92h16M184 100h16M184 108h16M184 116h16" />
      <path d="M176 84h32" />
      <path d="M184 44h16M184 52h16M184 60h16M184 68h16M184 76h16" stroke={MUTED} />
    </Frame>
  );
}

export const pictureQualityIllustrations = {
  stabilize: StabilizeIllustration,
  sharpen: SharpenIllustration,
  denoise: DenoiseIllustration,
  "black-bars": BlackBarsIllustration,
  bitrate: BitrateIllustration,
} as const;
