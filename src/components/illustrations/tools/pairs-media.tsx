import type { SVGProps } from "react";
import { labelCentered } from "./glyphs";

/**
 * Family illustrations for video format pairs (`video-pair:<from>:<to>`), codec pairs (`codec-pair:<from>:<to>`) and video-to-audio pairs (`video-audio-pair:<from>:<to>`).
 * Same system as ./index (ADR-0008): canvas 240×160, 4px grid, 1.5 monoline strokes, round joins,
 * `currentColor` for the subject, `var(--color-fg-muted)` for context, `var(--color-bg-raised)` for
 * flat fills; labels drawn with the stroke alphabet in ./glyphs. Static, decorative.
 */

const MUTED = "var(--color-fg-muted)";
const RAISED = "var(--color-bg-raised)";

type Props = SVGProps<SVGSVGElement>;
type FamilyProps = Props & { args: string[] };

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

/** Upper-case format id as a label, for example `mov` to MOV. */
const name = (id: string | undefined) => (id ?? "").toUpperCase();

/**
 * Video format pair: the same video moves from one labelled file to another. The source file is
 * muted and dashed (it goes away), the target is solid on a raised fill with a playing frame.
 */
function VideoPairIllustration({ args, ...props }: FamilyProps) {
  const [from, to] = args;
  return (
    <Frame {...props}>
      <path d="M24 28h56l20 20v84H24z" stroke={MUTED} strokeDasharray="4 6" />
      <rect x="40" y="52" width="44" height="32" rx="6" stroke={MUTED} />
      <path d="M58 62v12l9-6z" stroke={MUTED} />
      <path d={labelCentered(name(from), 62, 100, 16)} stroke={MUTED} />
      <path d="M112 80h16M122 72l8 8-8 8" />
      <path d="M140 28h56l20 20v84h-76z" fill={RAISED} />
      <path d="M196 28v20h20" />
      <rect x="156" y="52" width="44" height="32" rx="6" />
      <path d="M174 62v12l9-6z" fill="currentColor" stroke="none" />
      <path d={labelCentered(name(to), 178, 100, 16)} />
    </Frame>
  );
}

/**
 * Codec pair: one container holds the same frame before and after; only the stream's codec label
 * changes. The enclosing outline is what sets it apart from a container pair.
 */
function CodecPairIllustration({ args, ...props }: FamilyProps) {
  const [from, to] = args;
  return (
    <Frame {...props}>
      <rect x="24" y="28" width="192" height="104" rx="8" stroke={MUTED} />
      <rect x="40" y="44" width="64" height="48" rx="6" stroke={MUTED} />
      <path d="M67 60v16l12-8z" stroke={MUTED} />
      <path d={labelCentered(name(from), 72, 104, 16)} stroke={MUTED} />
      <path d="M112 68h16M122 60l8 8-8 8" />
      <rect x="136" y="44" width="64" height="48" rx="6" fill={RAISED} />
      <path d="M163 60v16l12-8z" fill="currentColor" stroke="none" />
      <path d={labelCentered(name(to), 168, 104, 16)} />
    </Frame>
  );
}

/** Video to audio pair: a labelled muted video frame gives a labelled solid sound wave. */
function VideoAudioPairIllustration({ args, ...props }: FamilyProps) {
  const [from, to] = args;
  return (
    <Frame {...props}>
      <rect x="24" y="40" width="80" height="56" rx="6" stroke={MUTED} />
      <path d="M59 60v16l12-8z" stroke={MUTED} />
      <path d={labelCentered(name(from), 64, 108, 16)} stroke={MUTED} />
      <path d="M112 68h16M122 60l8 8-8 8" />
      <path d="M144 64v8M152 56v24M160 48v40M168 60v16M176 40v56M184 52v32M192 44v48M200 56v24M208 64v8" />
      <path d={labelCentered(name(to), 176, 108, 16)} />
    </Frame>
  );
}

export const mediaPairIllustrations: Record<string, (p: FamilyProps) => React.ReactNode> = {
  "video-pair": VideoPairIllustration,
  "codec-pair": CodecPairIllustration,
  "video-audio-pair": VideoAudioPairIllustration,
};
