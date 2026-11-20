import type { ComponentType, SVGProps } from "react";
import type { EngineId } from "@/tools/registry/schema";
import { audioToolIllustrations } from "./audio-tools";
import { backgroundIllustrations } from "./background";
import { captureIllustrations } from "./capture";
import { sizeFamilyIllustrations } from "./families-size";
import { framesFilesIllustrations } from "./frames-files";
import { framesTextIllustrations } from "./frames-text";
import { mediaPairIllustrations } from "./pairs-media";
import { soundPairIllustrations } from "./pairs-sound";
import { pictureQualityIllustrations } from "./picture-quality";
import { regionsLayersIllustrations } from "./regions-layers";
import { siblingIllustrations } from "./siblings";
import { speechIllustrations } from "./speech";
import { textTimeIllustrations } from "./text-time";
import { timeLayoutIllustrations } from "./time-layout";
import { videoEditIllustrations } from "./video-edits";

/**
 * Monochrome vector illustrations of tool operations (README.md#design-system §7.1, ADR-0008).
 * Canvas 240×160, 4px grid, 1.5 monoline strokes, round joins. Two values only: `currentColor`
 * for the subject and `var(--color-fg-muted)` for context; flat fills use `var(--color-bg-raised)`.
 * Static. Decorative: always `aria-hidden`, the card title is the accessible name.
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

/** Compress: a large dashed frame collapsing into a small solid one. */
export function CompressIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="24" width="192" height="112" rx="8" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M48 48l20 20M48 48v16M48 48h16" stroke={MUTED} />
      <path d="M192 48l-20 20M192 48v16M192 48h-16" stroke={MUTED} />
      <path d="M48 112l20-20M48 112v-16M48 112h16" stroke={MUTED} />
      <path d="M192 112l-20-20M192 112v-16M192 112h-16" stroke={MUTED} />
      <rect x="88" y="56" width="64" height="48" rx="6" fill={RAISED} />
      <path d="M113 72v16l14-8z" fill="currentColor" stroke="none" />
    </Frame>
  );
}

/** Trim: a film strip with a cut; the removed part is muted, the kept part is solid. */
export function TrimIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M24 56h72v48H24z" stroke={MUTED} />
      {[32, 48, 64, 80].map((x) => (
        <rect key={`t${x}`} x={x} y="60" width="8" height="6" rx="1" stroke={MUTED} />
      ))}
      {[32, 48, 64, 80].map((x) => (
        <rect key={`b${x}`} x={x} y="94" width="8" height="6" rx="1" stroke={MUTED} />
      ))}
      <path d="M104 56h112v48H104z" fill={RAISED} />
      {[112, 128, 144, 160, 176, 192].map((x) => (
        <rect key={`kt${x}`} x={x} y="60" width="8" height="6" rx="1" />
      ))}
      {[112, 128, 144, 160, 176, 192].map((x) => (
        <rect key={`kb${x}`} x={x} y="94" width="8" height="6" rx="1" />
      ))}
      <path d="M100 32v96" strokeDasharray="3 5" />
      <circle cx="94" cy="24" r="4" />
      <circle cx="106" cy="24" r="4" />
      <path d="M97 27l3 5M103 27l-3 5" />
    </Frame>
  );
}

/** Remux (MOV to MP4): the same film content moves from a dashed container into a solid one. */
export function RemuxIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="20" y="40" width="80" height="80" rx="8" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M36 64h48M36 80h48M36 96h32" stroke={MUTED} />
      <path d="M112 80h20M126 72l8 8-8 8" />
      <rect x="140" y="40" width="80" height="80" rx="8" fill={RAISED} />
      <path d="M156 64h48M156 80h48M156 96h32" />
    </Frame>
  );
}

/** Video to GIF: one playing frame becomes a short looping stack of frames. */
export function VideoToGifIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="20" y="48" width="80" height="64" rx="6" stroke={MUTED} />
      <path d="M53 70v20l17-10z" stroke={MUTED} />
      <path d="M112 80h16M122 72l8 8-8 8" />
      <rect x="156" y="60" width="64" height="48" rx="6" stroke={MUTED} />
      <rect x="148" y="54" width="64" height="48" rx="6" stroke={MUTED} />
      <rect x="140" y="48" width="64" height="48" rx="6" fill={RAISED} />
      <path d="M160 120a20 12 0 1 0 40 0" />
      <path d="M200 120l-6-4M200 120l-6 4" />
    </Frame>
  );
}

/** Mute: a frame keeps its picture while the sound wave beside it is struck through. */
export function MuteIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="28" y="44" width="112" height="72" rx="6" fill={RAISED} />
      <path d="M77 68v24l18-12z" fill="currentColor" stroke="none" />
      <path d="M164 96V64l16-8v48z" stroke={MUTED} />
      <path d="M192 70c6 6 6 14 0 20M200 62c10 10 10 26 0 36" stroke={MUTED} />
      <path d="M156 116l56-56" />
    </Frame>
  );
}

/** Video to audio: a frame recedes in muted strokes while a solid sound wave leaves it to the right. */
export function VideoToAudioIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="28" y="44" width="96" height="72" rx="6" stroke={MUTED} fill={RAISED} />
      <path d="M68 68v24l20-12z" stroke={MUTED} />
      <path d="M132 80h12" stroke={MUTED} />
      <path d="M148 76v8M156 68v24M164 60v40M172 72v16M180 52v56M188 64v32M196 76v8M204 60v40M212 76v8" />
    </Frame>
  );
}

/** Extract frame: one frame lifts out of a muted film strip and becomes a solid still image. */
export function FrameExtractIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M24 96h192v40H24z" stroke={MUTED} />
      {[32, 64, 96, 128, 160, 192].map((x) => (
        <rect key={`s${x}`} x={x} y="100" width="24" height="32" rx="2" stroke={MUTED} />
      ))}
      <rect x="96" y="100" width="24" height="32" rx="2" stroke="currentColor" fill={RAISED} />
      <path d="M108 92V60M100 68l8-8 8 8" />
      <rect x="80" y="20" width="80" height="52" rx="4" fill={RAISED} />
      <path d="M92 60l16-16 12 12 8-8 20 12" />
      <circle cx="136" cy="34" r="4" />
    </Frame>
  );
}

/** Inspect: a frame with its facts laid out as label and value lines, a lens over the top corner. */
export function InspectIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="28" y="36" width="96" height="88" rx="6" stroke={MUTED} fill={RAISED} />
      <path d="M60 68v24l20-12z" stroke={MUTED} />
      <path d="M144 48h20M172 48h40" stroke={MUTED} />
      <path d="M144 64h16M172 64h32" stroke={MUTED} />
      <path d="M144 80h24M172 80h36" />
      <path d="M144 96h16M172 96h28" />
      <path d="M144 112h20M172 112h40" stroke={MUTED} />
      <circle cx="120" cy="40" r="16" fill={RAISED} />
      <path d="M131 51l13 13" />
    </Frame>
  );
}

/** Rotate: a landscape frame in muted strokes becomes the same frame stood upright, with a quarter-turn arrow. */
export function RotateIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="52" width="88" height="56" rx="6" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M52 70v20l16-10z" stroke={MUTED} />
      <path d="M120 60a20 20 0 0 1 20 20" />
      <path d="M140 80l-6-6M140 80l6-6" />
      <rect x="156" y="36" width="56" height="88" rx="6" fill={RAISED} />
      <path d="M176 70v20l16-10z" fill="currentColor" stroke="none" />
    </Frame>
  );
}

/** Speed: a frame followed by chevrons that tighten to the right, over a shortened time bar. */
export function SpeedIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="28" y="40" width="96" height="64" rx="6" fill={RAISED} />
      <path d="M64 60v24l20-12z" fill="currentColor" stroke="none" />
      <path d="M140 60l12 12-12 12M160 60l12 12-12 12M180 60l12 12-12 12" />
      <path d="M28 124h184" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M28 124h92" />
      <path d="M120 118v12" />
    </Frame>
  );
}

/** Strip metadata: a frame keeps its picture while the tag lines beside it are struck out. */
export function StripMetadataIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="44" width="104" height="72" rx="6" fill={RAISED} />
      <path d="M68 68v24l20-12z" fill="currentColor" stroke="none" />
      <path d="M148 56h64M148 72h48M148 88h56M148 104h40" stroke={MUTED} />
      <path d="M144 112l72-64" />
    </Frame>
  );
}

/** Crop: a muted picture with a solid frame drawn inside it and corner marks; the outside is dimmed. */
export function CropIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="28" width="192" height="104" rx="6" stroke={MUTED} strokeDasharray="4 6" />
      <rect x="84" y="44" width="72" height="72" rx="2" fill={RAISED} />
      <path d="M112 68v24l20-12z" fill="currentColor" stroke="none" />
      <path d="M84 56V44h12M144 44h12v12M156 104v12h-12M96 116H84v-12" />
    </Frame>
  );
}

/** Aspect ratio: a landscape picture set inside an upright frame, with bars above and below. */
export function AspectRatioIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="28" y="52" width="80" height="56" rx="6" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M116 80h16M126 74l6 6-6 6" />
      <rect x="152" y="24" width="64" height="112" rx="6" />
      <rect x="152" y="62" width="64" height="36" fill={RAISED} />
      <path d="M178 72v16l12-8z" fill="currentColor" stroke="none" />
      <path d="M160 44h48M160 116h48" stroke={MUTED} />
    </Frame>
  );
}

/** Split: one film strip cut into three parts at two dashed lines; the middle part is lifted. */
export function SplitIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M24 56h60v48H24z" stroke={MUTED} />
      <path d="M96 48h48v48H96z" fill={RAISED} />
      <path d="M156 56h60v48h-60z" stroke={MUTED} />
      {[32, 48, 64].map((x) => (
        <rect key={`a${x}`} x={x} y="60" width="8" height="6" rx="1" stroke={MUTED} />
      ))}
      {[104, 120, 136].map((x) => (
        <rect key={`b${x}`} x={x - 2} y="52" width="8" height="6" rx="1" />
      ))}
      {[164, 180, 196].map((x) => (
        <rect key={`c${x}`} x={x} y="60" width="8" height="6" rx="1" stroke={MUTED} />
      ))}
      <path d="M90 32v96M150 32v96" strokeDasharray="3 5" />
    </Frame>
  );
}

/** Merge: two short strips meet and continue as one long solid strip. */
export function MergeIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M24 32h56v36H24zM24 92h56v36H24z" stroke={MUTED} />
      <path d="M88 50c16 0 20 30 36 30M88 110c16 0 20-30 36-30" stroke={MUTED} />
      <path d="M132 56h84v48h-84z" fill={RAISED} />
      {[140, 156, 172, 188, 204].map((x) => (
        <rect key={`t${x}`} x={x - 2} y="60" width="8" height="6" rx="1" />
      ))}
      {[140, 156, 172, 188, 204].map((x) => (
        <rect key={`b${x}`} x={x - 2} y="94" width="8" height="6" rx="1" />
      ))}
    </Frame>
  );
}

/** Convert audio: a muted sound wave on the left becomes a solid one on the right, an arrow between. */
export function ConvertAudioIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path
        d="M28 76v8M36 64v32M44 56v48M52 68v24M60 60v40M68 72v16M76 64v32M84 76v8"
        stroke={MUTED}
      />
      <path d="M104 80h32M128 72l8 8-8 8" />
      <rect x="148" y="48" width="68" height="64" rx="6" fill={RAISED} />
      <path d="M160 76v8M168 64v32M176 56v48M184 68v24M192 60v40M200 72v16M208 76v8" />
    </Frame>
  );
}

/** Add audio: a video frame with a solid sound lane joining it underneath. */
export function AddAudioIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="40" y="28" width="160" height="72" rx="6" fill={RAISED} />
      <path d="M113 52v24l18-12z" fill="currentColor" stroke="none" />
      <rect x="40" y="112" width="160" height="24" rx="4" stroke={MUTED} />
      <rect x="72" y="112" width="96" height="24" rx="4" />
      <path d="M84 120v8M92 116v16M100 118v12M108 114v20M116 120v8M124 116v16M132 118v12M140 114v20M148 120v8M156 118v12" />
    </Frame>
  );
}

/** GIF to video: a muted stack of looping frames becomes one solid frame with a timeline under it. */
export function GifToVideoIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="36" y="60" width="56" height="40" rx="4" stroke={MUTED} />
      <rect x="28" y="52" width="56" height="40" rx="4" stroke={MUTED} />
      <rect x="20" y="44" width="56" height="40" rx="4" stroke={MUTED} fill={RAISED} />
      <path d="M32 116a16 8 0 1 0 32 0" stroke={MUTED} />
      <path d="M64 116l-6-4M64 116l-6 4" stroke={MUTED} />
      <path d="M104 80h16M114 72l8 8-8 8" />
      <rect x="132" y="40" width="88" height="64" rx="6" fill={RAISED} />
      <path d="M169 60v24l18-12z" fill="currentColor" stroke="none" />
      <path d="M132 120h88" stroke={MUTED} />
      <path d="M132 120h40" />
      <circle cx="172" cy="120" r="4" fill={RAISED} />
    </Frame>
  );
}

/** Add subtitles: a subtitle file's cue lines travel into the lower third of a frame. */
export function AddSubtitlesIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M20 40h36l12 12v68H20z" stroke={MUTED} fill={RAISED} />
      <path d="M56 40v12h12" stroke={MUTED} />
      <path d="M28 68h20M28 76h32M28 92h24M28 100h28" stroke={MUTED} />
      <path d="M80 80h16M90 72l8 8-8 8" />
      <rect x="108" y="36" width="112" height="88" rx="6" fill={RAISED} />
      <path d="M157 56v20l16-10z" fill="currentColor" stroke="none" />
      <path d="M128 100h72M140 112h48" />
    </Frame>
  );
}

/** Convert subtitles: the same cues move from a muted file into a solid file of another format. */
export function ConvertSubtitlesIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M28 32h48l16 16v80H28z" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M40 60h12M56 60h24M40 72h36M40 92h12M56 92h24M40 104h28" stroke={MUTED} />
      <path d="M104 80h32M128 72l8 8-8 8" />
      <path d="M148 32h48l16 16v80h-64z" fill={RAISED} />
      <path d="M196 32v16h16" />
      <path d="M160 60h12M176 60h24M160 72h36M160 92h12M176 92h24M160 104h28" />
    </Frame>
  );
}

/** Shift subtitles: a row of cues in muted outline, and the same row moved later along the time axis. */
export function ShiftSubtitlesIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M20 128h200" stroke={MUTED} />
      {[20, 60, 100, 140, 180, 220].map((x) => (
        <path key={`k${x}`} d={`M${x} 124v8`} stroke={MUTED} />
      ))}
      <rect x="24" y="44" width="40" height="20" rx="4" stroke={MUTED} strokeDasharray="4 6" />
      <rect x="76" y="44" width="56" height="20" rx="4" stroke={MUTED} strokeDasharray="4 6" />
      <rect x="144" y="44" width="32" height="20" rx="4" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M44 72v12M44 84h28M64 78l8 6-8 6" />
      <rect x="52" y="96" width="40" height="20" rx="4" fill={RAISED} />
      <rect x="104" y="96" width="56" height="20" rx="4" fill={RAISED} />
      <rect x="172" y="96" width="32" height="20" rx="4" fill={RAISED} />
    </Frame>
  );
}

/** Watermark: a frame with a small solid mark placed in its corner, guides showing the margin. */
export function WatermarkIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="28" y="28" width="184" height="104" rx="6" fill={RAISED} />
      <path d="M110 64v32l26-16z" stroke={MUTED} />
      <path d="M160 28v88M28 116h172" stroke={MUTED} strokeDasharray="3 5" />
      <rect x="168" y="96" width="32" height="24" rx="4" fill={RAISED} />
      <circle cx="184" cy="108" r="6" />
    </Frame>
  );
}

/** Flip: a frame and its mirror image either side of a dashed axis, with an arrow over the top. */
export function FlipIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M120 24v112" stroke={MUTED} strokeDasharray="3 5" />
      <rect x="28" y="48" width="80" height="64" rx="6" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M44 96l20-28 12 16 8-8 12 20z" stroke={MUTED} />
      <rect x="132" y="48" width="80" height="64" rx="6" fill={RAISED} />
      <path d="M196 96l-20-28-12 16-8-8-12 20z" />
      <path d="M68 36c16-12 88-12 104 0" />
      <path d="M172 36l-8-2M172 36l-2-8" />
    </Frame>
  );
}

/** Volume: a speaker with its waves, and a fader raised on the right. */
export function VolumeIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M36 68h16l20-16v56l-20-16H36z" fill={RAISED} />
      <path
        d="M88 64c6 6 6 26 0 32M100 54c12 12 12 40 0 52M112 44c18 18 18 54 0 72"
        stroke={MUTED}
      />
      <path d="M176 32v96" stroke={MUTED} />
      <path d="M176 128V64" strokeWidth={3} />
      <rect x="164" y="52" width="24" height="12" rx="4" fill={RAISED} />
      <path d="M196 40h12M196 60h8M196 80h12M196 100h8M196 120h12" stroke={MUTED} />
    </Frame>
  );
}

/** Audio fade: sound bars under an envelope that rises from silence and falls back to it. */
export function AudioFadeIllustration(props: Props) {
  const bars = [28, 40, 52, 64, 76, 88, 100, 112, 124, 136, 148, 160, 172, 184, 196, 208];
  const env = (x: number) => (x < 76 ? (x - 24) / 52 : x > 160 ? Math.max(0, (212 - x) / 52) : 1);
  return (
    <Frame {...props}>
      {bars.map((x, i) => {
        const h = Math.max(2, (16 + ((i * 7) % 5) * 6) * env(x));
        return <path key={x} d={`M${x} ${80 - h}v${2 * h}`} stroke={MUTED} />;
      })}
      <path d="M24 124L76 36h84l52 88" />
      <circle cx="76" cy="36" r="4" fill={RAISED} />
      <circle cx="160" cy="36" r="4" fill={RAISED} />
    </Frame>
  );
}

/** Audio sync: a frame and the sound under it, the sound slid back into line with the picture. */
export function AudioSyncIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="64" y="24" width="112" height="56" rx="6" fill={RAISED} />
      <path d="M112 42v20l16-10z" fill="currentColor" stroke="none" />
      <path d="M120 88v48" strokeDasharray="3 5" />
      <path d="M92 100v24M100 108v8M108 96v32M116 104v16M124 92v40M132 104v16M140 98v28" />
      <path
        d="M144 100v24M152 108v8M160 96v32M168 104v16M176 92v40"
        stroke={MUTED}
        strokeDasharray="2 4"
      />
      <path d="M44 112h32M52 104l-8 8 8 8" />
    </Frame>
  );
}

/** Audio tracks: three sound lanes with boxes; two are kept, the third is struck through. */
export function AudioTracksIllustration(props: Props) {
  const wave = (y: number) =>
    `M84 ${y}h8M96 ${y - 8}v16M104 ${y - 4}v8M112 ${y - 10}v20M120 ${y - 6}v12M128 ${y - 10}v20M136 ${y - 4}v8M144 ${y - 8}v16M152 ${y - 6}v12M160 ${y - 10}v20M168 ${y - 4}v8M176 ${y}h24`;
  return (
    <Frame {...props}>
      <rect x="40" y="36" width="16" height="16" rx="3" fill="currentColor" />
      <path d="M44 44l3 3 6-6" stroke={RAISED} />
      <path d={wave(44)} />
      <rect x="40" y="72" width="16" height="16" rx="3" fill="currentColor" />
      <path d="M44 80l3 3 6-6" stroke={RAISED} />
      <path d={wave(80)} />
      <rect x="40" y="108" width="16" height="16" rx="3" stroke={MUTED} />
      <path d={wave(116)} stroke={MUTED} />
      <path d="M76 116h132" />
    </Frame>
  );
}

/** Remove silence: a waveform whose flat pauses are cut out and the speech pulled together. */
export function RemoveSilenceIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M24 56h192" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M28 44v24M36 36v40M44 48v16M52 40v32" />
      <path d="M60 56h36" stroke={MUTED} />
      <path d="M104 40v32M112 48v16M120 32v48M128 44v24" />
      <path d="M136 56h40" stroke={MUTED} />
      <path d="M184 36v40M192 44v24M200 48v16M208 40v32" />
      <path d="M78 36v40M156 36v40" strokeDasharray="3 5" />
      <path d="M40 116v24M48 108v40M56 120v16M64 112v32M76 112v32M84 120v16M92 104v48M100 116v24M112 108v40M120 116v24M128 120v16M136 112v32" />
      <path d="M150 128h24M166 120l8 8-8 8" stroke={MUTED} />
    </Frame>
  );
}

/** Trim audio: the kept stretch of a waveform raised between two cut lines; the ends fall away. */
export function TrimAudioIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M24 80h192" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M28 72v16M36 68v24M44 76v8M52 68v24M60 72v16M68 64v32" stroke={MUTED} />
      <rect x="76" y="36" width="88" height="88" rx="6" fill={RAISED} />
      <path d="M84 64v32M92 52v56M100 68v24M108 48v64M116 60v40M124 44v72M132 68v24M140 56v48M148 52v56M156 64v32" />
      <path d="M172 68v24M180 76v8M188 64v32M196 72v16M204 68v24M212 76v8" stroke={MUTED} />
      <path d="M76 28v104M164 28v104" strokeDasharray="3 5" />
      <path d="M72 28h8M160 28h8" />
    </Frame>
  );
}

/** Change audio speed: the same waveform played twice as fast is half as long (half the pitch). */
export function AudioSpeedIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path
        d="M28 48v8M44 40v24M60 44v16M76 36v32M92 44v16M108 40v24M124 48v8M140 36v32M156 40v24M172 44v16M188 40v24M204 48v8"
        stroke={MUTED}
      />
      <path d="M28 80h176" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M28 108v8M36 100v24M44 104v16M52 96v32M60 104v16M68 100v24M76 108v8M84 96v32M92 100v24M100 104v16M108 100v24M116 108v8" />
      <path d="M144 100l12 12-12 12M164 100l12 12-12 12M184 100l12 12-12 12" />
    </Frame>
  );
}

export const illustrations = {
  volume: VolumeIllustration,
  "audio-fade": AudioFadeIllustration,
  "audio-sync": AudioSyncIllustration,
  "audio-tracks": AudioTracksIllustration,
  "remove-silence": RemoveSilenceIllustration,
  compress: CompressIllustration,
  trim: TrimIllustration,
  split: SplitIllustration,
  merge: MergeIllustration,
  remux: RemuxIllustration,
  "video-to-gif": VideoToGifIllustration,
  mute: MuteIllustration,
  "video-to-audio": VideoToAudioIllustration,
  "convert-audio": ConvertAudioIllustration,
  "add-audio": AddAudioIllustration,
  "frame-extract": FrameExtractIllustration,
  inspect: InspectIllustration,
  rotate: RotateIllustration,
  speed: SpeedIllustration,
  "strip-metadata": StripMetadataIllustration,
  crop: CropIllustration,
  "aspect-ratio": AspectRatioIllustration,
  "gif-to-video": GifToVideoIllustration,
  "add-subtitles": AddSubtitlesIllustration,
  "convert-subtitles": ConvertSubtitlesIllustration,
  "shift-subtitles": ShiftSubtitlesIllustration,
  watermark: WatermarkIllustration,
  flip: FlipIllustration,
  ...videoEditIllustrations,
  ...framesTextIllustrations,
  ...framesFilesIllustrations,
  ...regionsLayersIllustrations,
  ...backgroundIllustrations,
  ...textTimeIllustrations,
  ...timeLayoutIllustrations,
  ...pictureQualityIllustrations,
  ...captureIllustrations,
  ...audioToolIllustrations,
  ...speechIllustrations,
  ...siblingIllustrations,
  "trim-audio": TrimAudioIllustration,
  "audio-speed": AudioSpeedIllustration,
} as const;

/** Default illustration per engine. A registry entry may override with `illustration`. */
export const engineIllustrations: Partial<Record<EngineId, IllustrationId>> = {
  volume: "volume",
  "audio-fade": "audio-fade",
  "audio-sync": "audio-sync",
  "audio-tracks": "audio-tracks",
  "remove-silence": "remove-silence",
  compress: "compress",
  remux: "remux",
  "convert-video": "remux",
  trim: "trim",
  split: "split",
  merge: "merge",
  mute: "mute",
  "video-to-gif": "video-to-gif",
  "animated-image": "animated-image",
  "frame-pick": "sharpest-frame",
  thumbnail: "thumbnail",
  repair: "repair",
  "video-to-audio": "video-to-audio",
  "convert-audio": "convert-audio",
  "add-audio": "add-audio",
  "frame-extract": "frame-extract",
  inspect: "inspect",
  rotate: "rotate",
  speed: "speed",
  "strip-metadata": "strip-metadata",
  crop: "crop",
  "aspect-ratio": "aspect-ratio",
  "gif-to-video": "gif-to-video",
  "subtitles-add": "add-subtitles",
  "subtitles-convert": "convert-subtitles",
  watermark: "watermark",
  flip: "flip",
  framerate: "framerate",
  codec: "codec",
  faststart: "faststart",
  loop: "loop",
  reverse: "reverse",
  pad: "border",
  filter: "filter",
  "video-fade": "fade",
  "thumbnail-grid": "contact-sheet",
  "video-to-frames": "image-sequence",
  "images-to-video": "slideshow",
  "audio-to-video": "audio-to-video",
  "edit-metadata": "edit-metadata",
  cover: "thumbnail",
  "subtitles-extract": "extract-subtitles",
  "text-overlay": "text-overlay",
  "time-overlay": "progress-bar",
  "intro-outro": "intro-outro",
  "blur-region": "blur",
  "image-overlay": "image-overlay",
  "chroma-key": "green-screen",
  "portrait-matte": "background-replace",
  clarity: "sharpen",
  stabilize: "stabilize",
  bitrate: "bitrate",
  "freeze-frame": "freeze-frame",
  "zoom-pan": "zoom",
  layout: "picture-in-picture",
  clips: "shorts-clips",
  "screen-record": "screen-record",
  "webcam-record": "webcam-record",
  "audio-record": "voice-record",
  pitch: "pitch",
  "audio-analyze": "key-bpm",
  "join-audio": "merge-audio",
  ringtone: "ringtone",
  "speech-denoise": "speech-denoise",
};

/**
 * Family illustrations: one drawing per generated page, keyed `<family>:<arg>[:<arg>…]` in the
 * registry's `illustration` field (for example `video-pair:mov:mp4`, `compress-cap:8`). The family
 * component draws the args (format names, sizes, ratios) with the stroke alphabet in ./glyphs, so
 * every page in a family gets its own picture without a hand-drawn file per page.
 */
export type FamilyIllustration = ComponentType<Props & { args: string[] }>;

export const familyIllustrations: Record<string, FamilyIllustration> = {
  ...mediaPairIllustrations,
  ...soundPairIllustrations,
  ...sizeFamilyIllustrations,
};

type StaticIllustrationId = keyof typeof illustrations;
export type IllustrationId = StaticIllustrationId | `${string}:${string}`;

function familyOf(id: string): { family: FamilyIllustration; args: string[] } | undefined {
  const [name, ...args] = id.split(":");
  const family = name ? familyIllustrations[name] : undefined;
  return family && args.length > 0 ? { family, args } : undefined;
}

export function resolveIllustration(
  engine: EngineId,
  override?: string,
): IllustrationId | undefined {
  if (override && (override in illustrations || familyOf(override))) {
    return override as IllustrationId;
  }
  return engineIllustrations[engine];
}

/** The component that draws `id`, with a family's args bound, for cards, OG images and tests. */
export function illustrationComponent(id: IllustrationId): ComponentType<Props> {
  if (id in illustrations) return illustrations[id as StaticIllustrationId];
  const f = familyOf(id);
  if (!f) throw new Error(`Unknown illustration ${id}`);
  const { family: Family, args } = f;
  return function BoundFamilyIllustration(props: Props) {
    return <Family {...props} args={args} />;
  };
}

export function ToolIllustration({ id, ...props }: { id: IllustrationId } & Props) {
  if (id in illustrations) {
    const C = illustrations[id as StaticIllustrationId];
    return <C {...props} />;
  }
  const f = familyOf(id);
  return f ? <f.family {...props} args={f.args} /> : null;
}
