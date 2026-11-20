import type { SVGProps } from "react";

/**
 * Illustrations for the round-4 speech tools (remove background noise), in the system of ./index
 * (ADR-0008): canvas 240×160, 4px grid, 1.5 monoline strokes, round joins, `currentColor` for the
 * subject, `var(--color-fg-muted)` for context. Static, decorative.
 */

const MUTED = "var(--color-fg-muted)";

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

/** Words (bars, half-heights on the 4px grid, at most 16 so rows stay inside the margins). */
const WORDS = [
  { x: 40, h: [8, 16, 12, 16] },
  { x: 100, h: [12, 16, 16, 8, 12] },
  { x: 172, h: [16, 8, 12] },
];

function speech(y: number) {
  return WORDS.flatMap((w) =>
    w.h.map((h, i) => <path key={`${w.x}-${i}`} d={`M${w.x + i * 8} ${y - h}v${2 * h}`} />),
  );
}

/** Remove background noise: words in a bed of noise above; the same words on a quiet line below. */
export function SpeechDenoiseIllustration(props: Props) {
  // Noise: strokes of 8 or 16 (half-heights 4 or 8) all along the top row.
  const noise: string[] = [];
  for (let x = 28; x <= 212; x += 4) {
    const h = (x / 4) % 3 === 0 ? 8 : 4;
    noise.push(`M${x} ${48 - h}v${2 * h}`);
  }
  return (
    <Frame {...props}>
      <path d={noise.join("")} stroke={MUTED} />
      {speech(48)}
      <path d="M120 72v16M112 80l8 8 8-8" stroke={MUTED} />
      <path d="M28 112h184" stroke={MUTED} />
      {speech(112)}
    </Frame>
  );
}

export const speechIllustrations = {
  "speech-denoise": SpeechDenoiseIllustration,
} as const;
