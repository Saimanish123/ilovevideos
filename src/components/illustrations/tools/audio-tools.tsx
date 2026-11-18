import type { SVGProps } from "react";

/**
 * Illustrations for the round-3 sound tools (change pitch, key and BPM finder, merge audio,
 * ringtone maker), in the system of ./index (ADR-0008): canvas 240×160, 4px grid, 1.5 monoline
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

/** A sine from x0 to x1 around y, `cycles` periods, amplitude `a`, as a path. */
function wave(x0: number, x1: number, y: number, a: number, cycles: number): string {
  const steps = 64;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const v = y - a * Math.sin((2 * Math.PI * cycles * i) / steps);
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${v.toFixed(1)}`);
  }
  return pts.join("");
}

/** Change pitch: a slow wave becomes a faster one of the same length, an arrow between. */
export function PitchIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d={wave(28, 212, 44, 16, 3)} stroke={MUTED} />
      <path d="M120 68v16M112 78l8 8 8-8" stroke={MUTED} />
      <path d={wave(28, 212, 108, 16, 5)} />
      <path d="M28 132h184M28 128v8M212 128v8" stroke={MUTED} />
    </Frame>
  );
}

/** Key and BPM finder: a beat grid over sound bars, and a key label card. */
export function KeyBpmIllustration(props: Props) {
  const bars = [28, 36, 44, 52, 60, 68, 76, 84, 92, 100, 108, 116, 124, 132];
  const h = [8, 24, 12, 32, 16, 8, 28, 12, 36, 16, 8, 24, 12, 32];
  return (
    <Frame {...props}>
      {bars.map((x, i) => (
        <path key={x} d={`M${x} ${80 - (h[i] ?? 8) / 2}v${h[i] ?? 8}`} stroke={MUTED} />
      ))}
      <path d="M28 40v80M64 40v80M100 40v80M136 40v80" strokeDasharray="4 6" />
      <rect x="156" y="48" width="60" height="64" rx="8" fill={RAISED} />
      <path d="M164 68h44M164 80h44M164 92h44" stroke={MUTED} />
      <ellipse cx="184" cy="88" rx="6" ry="4" fill="currentColor" stroke="none" />
      <path d="M190 88V60" />
    </Frame>
  );
}

/** Merge audio: two waveforms in a row joined end to end into one. */
export function MergeAudioIllustration(props: Props) {
  const first = [32, 40, 48, 56, 64, 72, 80, 88];
  const second = [144, 152, 160, 168, 176, 184, 192, 200];
  const hA = [8, 20, 12, 28, 16, 24, 8, 16];
  const hB = [16, 8, 24, 12, 28, 12, 20, 8];
  // The joined file: both sets of bars end to end, with no space between them.
  const joined = [...hA, ...hB].map((h, i) => ({
    x: 56 + i * 8,
    h: Math.max(4, Math.round(h / 8) * 4),
  }));
  return (
    <Frame {...props}>
      <rect x="24" y="28" width="72" height="40" rx="6" stroke={MUTED} />
      {first.map((x, i) => (
        <path key={x} d={`M${x} ${48 - (hA[i] ?? 8) / 2}v${hA[i] ?? 8}`} stroke={MUTED} />
      ))}
      <rect x="136" y="28" width="72" height="40" rx="6" stroke={MUTED} />
      {second.map((x, i) => (
        <path key={x} d={`M${x} ${48 - (hB[i] ?? 8) / 2}v${hB[i] ?? 8}`} stroke={MUTED} />
      ))}
      <path d="M60 72v4h112v-4" stroke={MUTED} />
      <path d="M116 76v16M108 86l8 8 8-8" />
      <rect x="40" y="100" width="152" height="32" rx="6" fill={RAISED} />
      {joined.map(({ x, h }) => (
        <path key={`j${x}`} d={`M${x} ${116 - h / 2}v${h}`} />
      ))}
    </Frame>
  );
}

/** Ringtone maker: a phone with a short selected part of a waveform. */
export function RingtoneIllustration(props: Props) {
  const xs = [28, 36, 44, 52, 60, 68, 76, 84, 92, 100, 108, 116];
  const h = [8, 16, 24, 12, 32, 20, 28, 12, 24, 16, 8, 20];
  return (
    <Frame {...props}>
      {xs.map((x, i) => (
        <path
          key={x}
          d={`M${x} ${80 - (h[i] ?? 8) / 2}v${h[i] ?? 8}`}
          stroke={x >= 52 && x <= 92 ? "currentColor" : MUTED}
        />
      ))}
      <path d="M48 52v56M96 52v56" />
      <path d="M124 80h16M134 72l8 8-8 8" />
      <rect x="152" y="28" width="60" height="104" rx="10" fill={RAISED} />
      <path d="M174 40h16" stroke={MUTED} />
      <path d="M168 76v8M176 68v24M184 72v16M192 64v32M200 76v8" />
    </Frame>
  );
}

export const audioToolIllustrations = {
  pitch: PitchIllustration,
  "key-bpm": KeyBpmIllustration,
  "merge-audio": MergeAudioIllustration,
  ringtone: RingtoneIllustration,
} as const;
