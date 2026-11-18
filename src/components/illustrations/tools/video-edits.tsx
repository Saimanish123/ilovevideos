import type { SVGProps } from "react";

/**
 * Illustrations for the Phase 2 video edits, in the same system as ./index (ADR-0008): canvas
 * 240×160, 4px grid, 1.5 monoline strokes, round joins, `currentColor` for the subject,
 * `var(--color-fg-muted)` for context, `var(--color-bg-raised)` for flat fills. Static, decorative.
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

/** Frame rate: a strip of six frames where every other one is dropped (dashed), the rest kept. */
export function FramerateIllustration(props: Props) {
  const xs = [24, 60, 96, 132, 168, 204];
  return (
    <Frame {...props}>
      {xs.map((x, i) =>
        i % 2 === 0 ? (
          <rect key={x} x={x - 4} y="56" width="32" height="48" rx="4" fill={RAISED} />
        ) : (
          <rect
            key={x}
            x={x - 4}
            y="56"
            width="32"
            height="48"
            rx="4"
            stroke={MUTED}
            strokeDasharray="4 6"
          />
        ),
      )}
      {xs.map((x, i) => (i % 2 === 0 ? <g key={`p${x}`}>{play(x + 8, 72)}</g> : null))}
      <path d="M20 124h200" stroke={MUTED} />
      {xs.map((x) => (
        <path key={`t${x}`} d={`M${x + 12} 120v8`} stroke={MUTED} />
      ))}
      <path d="M20 40h200" stroke={MUTED} strokeDasharray="4 6" />
    </Frame>
  );
}

/** Codec: the same picture moves from a large block of bits to a smaller one. */
export function CodecIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="20" y="36" width="88" height="88" rx="6" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M36 100h56M36 108h56M36 116h40" stroke={MUTED} />
      <path d="M52 56v24l20-12z" stroke={MUTED} />
      <path d="M116 80h16M126 74l6 6-6 6" />
      <rect x="148" y="52" width="72" height="72" rx="6" fill={RAISED} />
      <path d="M164 108h40M164 116h24" />
      {play(176, 68, 20)}
    </Frame>
  );
}

/** Fast start: the index block moves from the end of the file to its front. */
export function FaststartIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="44" width="152" height="24" rx="4" stroke={MUTED} strokeDasharray="4 6" />
      <rect x="184" y="44" width="32" height="24" rx="4" stroke={MUTED} />
      <path d="M200 76c0 16-12 20-28 20H52c-16 0-24 4-24 12" />
      <path d="M22 102l6 6 6-6" />
      <rect x="24" y="116" width="32" height="24" rx="4" fill="currentColor" stroke="none" />
      <rect x="64" y="116" width="152" height="24" rx="4" fill={RAISED} />
    </Frame>
  );
}

/** Loop: three plays of one clip in a row, joined back to the start by a return arrow. */
export function LoopIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="20" y="64" width="56" height="44" rx="4" fill={RAISED} />
      {play(40, 78)}
      <rect x="92" y="64" width="56" height="44" rx="4" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M112 78v16l12-8z" stroke={MUTED} />
      <rect x="164" y="64" width="56" height="44" rx="4" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M184 78v16l12-8z" stroke={MUTED} />
      <path d="M192 56V44c0-8-4-12-12-12H60c-8 0-12 4-12 12v12" />
      <path d="M42 50l6 6 6-6" />
    </Frame>
  );
}

/** Reverse: a strip of frames with a play triangle pointing backwards and a rewind mark. */
export function ReverseIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M24 52h192v56H24z" stroke={MUTED} />
      {[32, 64, 96, 128, 160, 192].map((x) => (
        <rect key={`t${x}`} x={x} y="56" width="16" height="6" rx="1" stroke={MUTED} />
      ))}
      {[32, 64, 96, 128, 160, 192].map((x) => (
        <rect key={`b${x}`} x={x} y="98" width="16" height="6" rx="1" stroke={MUTED} />
      ))}
      <rect x="92" y="68" width="56" height="24" rx="4" fill={RAISED} />
      <path d="M132 72v16l-16-8z" fill="currentColor" stroke="none" />
      <path d="M76 128l-12 8 12 8M92 128l-12 8 12 8" />
      <path d="M100 136h72" />
    </Frame>
  );
}

/** Border: a picture set inside an even band, the outer frame drawn solid. */
export function BorderIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="48" y="28" width="144" height="104" rx="6" />
      <rect x="64" y="44" width="112" height="72" rx="2" fill={RAISED} stroke={MUTED} />
      {play(112, 68, 24)}
      <path d="M48 20h144" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M40 28v104" stroke={MUTED} strokeDasharray="4 6" />
    </Frame>
  );
}

/** Blurred background: an upright picture in a wide frame whose sides are soft blurred shapes. */
export function BlurPadIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="20" y="32" width="200" height="112" rx="6" />
      <circle cx="52" cy="72" r="16" stroke={MUTED} strokeDasharray="2 4" />
      <circle cx="44" cy="112" r="12" stroke={MUTED} strokeDasharray="2 4" />
      <circle cx="188" cy="64" r="12" stroke={MUTED} strokeDasharray="2 4" />
      <circle cx="192" cy="108" r="16" stroke={MUTED} strokeDasharray="2 4" />
      <rect x="92" y="32" width="56" height="112" rx="2" fill={RAISED} />
      {play(112, 80)}
      <path d="M20 20h200" stroke={MUTED} strokeDasharray="4 6" />
    </Frame>
  );
}

/** Filter: one picture split by a handle, before (hatched, muted) on the left, after (flat) on the right. */
export function FilterIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="120" y="32" width="96" height="96" rx="6" fill={RAISED} />
      <rect x="24" y="32" width="192" height="96" rx="6" />
      {[44, 60, 76, 92, 108].map((x) => (
        <path key={x} d={`M${x} 36l-16 16`} stroke={MUTED} />
      ))}
      <path d="M28 124l88-88M48 124l68-68M68 124l48-48M88 124l28-28" stroke={MUTED} />
      <path d="M120 24v112" />
      <circle cx="120" cy="80" r="8" fill={RAISED} />
      <path d="M117 77l-3 3 3 3M123 77l3 3-3 3" />
      {play(160, 68, 24)}
    </Frame>
  );
}

/** Fade: a picture over a ramp that rises at the start, holds, and falls at the end. */
export function FadeIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="72" y="24" width="96" height="64" rx="6" fill={RAISED} />
      {play(112, 44, 24)}
      <path d="M24 136h192" stroke={MUTED} />
      <path d="M24 136l48-32h96l48 32" />
      <path d="M72 104v32M168 104v32" stroke={MUTED} strokeDasharray="4 6" />
    </Frame>
  );
}

export const videoEditIllustrations = {
  framerate: FramerateIllustration,
  codec: CodecIllustration,
  faststart: FaststartIllustration,
  loop: LoopIllustration,
  reverse: ReverseIllustration,
  border: BorderIllustration,
  "blur-pad": BlurPadIllustration,
  filter: FilterIllustration,
  fade: FadeIllustration,
} as const;
