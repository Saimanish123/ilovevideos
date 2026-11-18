import type { SVGProps } from "react";

/**
 * Illustrations for the recorders (screen, webcam, voice), in the system of ./index (ADR-0008):
 * canvas 240×160, 4px grid, 1.5 monoline strokes, round joins, `currentColor` for the subject,
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

/** Screen recorder: a monitor with a record dot and a round camera bubble in its corner. */
export function ScreenRecordIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="40" y="24" width="160" height="96" rx="8" fill={RAISED} />
      <path d="M100 136h40M120 120v16" stroke={MUTED} />
      <path d="M56 44h56M56 56h80M56 68h64M56 80h72" stroke={MUTED} />
      <circle cx="172" cy="96" r="12" stroke={MUTED} />
      <circle cx="172" cy="92" r="4" stroke={MUTED} />
      <path d="M164 104c2-4 14-4 16 0" stroke={MUTED} />
      <circle cx="184" cy="40" r="6" fill="currentColor" stroke="none" />
    </Frame>
  );
}

/** Webcam recorder: a camera lens on a stand with a record dot. */
export function WebcamRecordIllustration(props: Props) {
  return (
    <Frame {...props}>
      <circle cx="120" cy="68" r="40" fill={RAISED} />
      <circle cx="120" cy="68" r="20" />
      <circle cx="120" cy="68" r="8" stroke={MUTED} />
      <path d="M120 108v16M92 136h56M104 124h32" stroke={MUTED} />
      <circle cx="176" cy="36" r="6" fill="currentColor" stroke="none" />
    </Frame>
  );
}

/** Voice recorder: a microphone beside the waveform it is writing. */
export function VoiceRecordIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="40" y="36" width="32" height="56" rx="16" fill={RAISED} />
      <path d="M32 80c0 16 12 28 24 28s24-12 24-28M56 108v20M44 128h24" stroke={MUTED} />
      <path d="M104 72v16M116 60v40M128 68v24M140 48v64M152 64v32M164 56v48M176 72v16M188 64v32M200 76v8" />
    </Frame>
  );
}

export const captureIllustrations = {
  "screen-record": ScreenRecordIllustration,
  "webcam-record": WebcamRecordIllustration,
  "voice-record": VoiceRecordIllustration,
} as const;
