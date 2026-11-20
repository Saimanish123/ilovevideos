import type { SVGProps } from "react";

/**
 * Illustrations for tools that share an engine with a sibling page, so each card shows its own job
 * instead of the engine's picture (add vs replace audio, three volume tools, three filter tools, the
 * animated-image formats, and so on). Same system as ./index (ADR-0008): canvas 240×160, 4px grid,
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

/** Vertical sound bars centred on `y`, one per x, with the given full heights. */
const bars = (xs: number[], y: number, hs: number[]) =>
  xs.map((x, i) => `M${x} ${y - (hs[i % hs.length] ?? 8) / 2}v${hs[i % hs.length] ?? 8}`).join("");

/** Replace audio: under the frame, the old sound lane leaves and a new one takes its place. */
export function ReplaceAudioIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="56" y="24" width="128" height="64" rx="6" fill={RAISED} />
      {play(112, 44, 24)}
      <rect x="24" y="108" width="72" height="28" rx="4" stroke={MUTED} strokeDasharray="4 6" />
      <path d={bars([36, 44, 52, 60, 68, 76, 84], 122, [8, 16, 4, 20, 12, 8, 16])} stroke={MUTED} />
      <path d="M108 112h16M118 104l8 8-8 8" />
      <path d="M132 128h-16M122 120l-8 8 8 8" stroke={MUTED} />
      <rect x="144" y="108" width="72" height="28" rx="4" fill={RAISED} />
      <path
        d={bars([152, 160, 168, 176, 184, 192, 200, 208], 122, [8, 16, 20, 12, 20, 8, 16, 8])}
      />
      <path d="M180 88v20" stroke={MUTED} />
    </Frame>
  );
}

/** Video volume: a playing frame with a volume slider under it, pushed up past the middle. */
export function VideoVolumeIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="24" width="192" height="80" rx="6" fill={RAISED} />
      {play(112, 52, 24)}
      <path d="M24 120h8l8-8v24l-8-8h-8z" />
      <path d="M48 118c4 4 4 8 0 12" stroke={MUTED} />
      <path d="M64 124h152" stroke={MUTED} />
      <path d="M64 124h100" strokeWidth={3} />
      <circle cx="164" cy="124" r="6" fill={RAISED} />
    </Frame>
  );
}

/** Normalize: uneven sound, too quiet in places and too loud in others, evened out between two guides. */
export function NormalizeIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path
        d={bars([28, 36, 44, 52, 60, 68, 76, 84, 92], 80, [8, 72, 16, 40, 4, 88, 20, 56, 8])}
        stroke={MUTED}
      />
      <path d="M108 80h16M118 72l8 8-8 8" />
      <path d="M140 52h76M140 108h76" stroke={MUTED} strokeDasharray="3 5" />
      <path
        d={bars(
          [148, 156, 164, 172, 180, 188, 196, 204, 212],
          80,
          [40, 48, 36, 48, 44, 48, 36, 48, 40],
        )}
      />
    </Frame>
  );
}

/** Fade audio in a video: the frame stays, the sound under it rises from silence and falls back. */
export function VideoAudioFadeIllustration(props: Props) {
  const xs = [28, 40, 52, 64, 76, 88, 100, 112, 124, 136, 148, 160, 172, 184, 196, 208];
  const env = (x: number) => (x < 64 ? (x - 24) / 40 : x > 176 ? (216 - x) / 40 : 1);
  return (
    <Frame {...props}>
      <rect x="72" y="24" width="96" height="56" rx="6" fill={RAISED} />
      {play(112, 40, 24)}
      {xs.map((x, i) => {
        const h = Math.max(2, Math.round((10 + ((i * 7) % 5) * 2.5) * env(x)));
        return <path key={x} d={`M${x} ${116 - h}v${2 * h}`} stroke={MUTED} />;
      })}
      <path d="M24 116L64 92h112l40 24" />
      <circle cx="64" cy="92" r="4" fill={RAISED} />
      <circle cx="176" cy="92" r="4" fill={RAISED} />
    </Frame>
  );
}

/** Remove silence from video: frames with a flat sound line drop out, the talking frames close up. */
export function RemoveSilenceVideoIllustration(props: Props) {
  const top = [24, 64, 104, 144, 184];
  const silent = new Set([64, 144]);
  return (
    <Frame {...props}>
      {top.map((x) =>
        silent.has(x) ? (
          <g key={x} stroke={MUTED}>
            <rect x={x} y="24" width="32" height="24" rx="4" strokeDasharray="4 6" />
            <path d={`M${x} 64h32`} />
          </g>
        ) : (
          <g key={x}>
            <rect x={x} y="24" width="32" height="24" rx="4" />
            <path d={bars([x + 6, x + 12, x + 18, x + 24], 64, [8, 16, 4, 12])} />
          </g>
        ),
      )}
      <path d="M120 80v16M112 88l8 8 8-8" />
      {[72, 104, 136].map((x) => (
        <g key={`k${x}`}>
          <rect x={x} y="108" width="32" height="24" rx="4" fill={RAISED} />
          {play(x + 13, 114, 12)}
        </g>
      ))}
    </Frame>
  );
}

/** Stereo to mono: one clip with two channel lanes becomes a clip with a single lane. */
export function StereoToMonoIllustration(props: Props) {
  const xs = [36, 44, 52, 60, 68, 76, 84];
  return (
    <Frame {...props}>
      <rect x="24" y="44" width="72" height="72" rx="6" stroke={MUTED} />
      <path d="M24 80h72" stroke={MUTED} strokeDasharray="4 6" />
      <path d={bars(xs, 62, [8, 20, 12, 24, 8, 16, 12])} stroke={MUTED} />
      <path d={bars(xs, 98, [12, 16, 8, 24, 12, 20, 8])} stroke={MUTED} />
      <path d="M108 80h16M118 72l8 8-8 8" />
      <rect x="144" y="56" width="72" height="48" rx="6" fill={RAISED} />
      <path d={bars([156, 164, 172, 180, 188, 196, 204], 80, [12, 24, 16, 32, 12, 24, 12])} />
    </Frame>
  );
}

/** Sample rate: the same wave measured at many points, then at fewer, each point a stem. */
export function SampleRateIllustration(props: Props) {
  const y = (x: number, y0: number) => y0 - 14 * Math.sin((2 * Math.PI * (x - 28)) / 92);
  const curve = (y0: number) =>
    Array.from({ length: 31 }, (_, i) => 28 + i * 6)
      .map((x, i) => `${i === 0 ? "M" : "L"}${x} ${Math.round(y(x, y0))}`)
      .join("");
  const stems = (step: number) =>
    Array.from({ length: Math.floor(184 / step) + 1 }, (_, i) => 28 + i * step);
  return (
    <Frame {...props}>
      <path d={curve(44)} stroke={MUTED} />
      {stems(8).map((x) => (
        <path key={`a${x}`} d={`M${x} 44V${Math.round(y(x, 44))}`} stroke={MUTED} />
      ))}
      <path d="M120 68v16M112 76l8 8 8-8" />
      <path d={curve(116)} stroke={MUTED} />
      {stems(16).map((x) => (
        <path key={`b${x}`} d={`M${x} 116V${Math.round(y(x, 116))}`} />
      ))}
    </Frame>
  );
}

/** Fix subtitle overlaps: cues that sit on top of each other are laid out one after another. */
export function SubtitleOverlapsIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="28" width="80" height="20" rx="4" stroke={MUTED} strokeDasharray="4 6" />
      <rect x="68" y="40" width="72" height="20" rx="4" stroke={MUTED} strokeDasharray="4 6" />
      <rect x="120" y="28" width="64" height="20" rx="4" stroke={MUTED} strokeDasharray="4 6" />
      <path d="M120 68v16M112 76l8 8 8-8" />
      <rect x="24" y="96" width="60" height="20" rx="4" fill={RAISED} />
      <rect x="92" y="96" width="60" height="20" rx="4" fill={RAISED} />
      <rect x="160" y="96" width="56" height="20" rx="4" fill={RAISED} />
      <path d="M32 106h36M100 106h40M168 106h32" />
      <path d="M24 132h192" stroke={MUTED} />
      {[24, 72, 120, 168, 216].map((x) => (
        <path key={x} d={`M${x} 128v8`} stroke={MUTED} />
      ))}
    </Frame>
  );
}

/** Subtitle frame rate: frame ticks change spacing, so each cue moves a little further than the last. */
export function SubtitleFrameRateIllustration(props: Props) {
  const from = [24, 64, 104, 144];
  const to = [24, 72, 120, 168];
  return (
    <Frame {...props}>
      <path d="M24 28h192" stroke={MUTED} />
      {[24, 40, 56, 72, 88, 104, 120, 136, 152, 168, 184, 200, 216].map((x) => (
        <path key={`t${x}`} d={`M${x} 24v8`} stroke={MUTED} />
      ))}
      {from.map((x) => (
        <rect
          key={`f${x}`}
          x={x}
          y="40"
          width="32"
          height="16"
          rx="4"
          stroke={MUTED}
          strokeDasharray="4 6"
        />
      ))}
      {from.map((x, i) => (
        <path key={`l${x}`} d={`M${x} 60L${to[i]} 96`} stroke={MUTED} />
      ))}
      {to.map((x) => (
        <rect key={`n${x}`} x={x} y="100" width="32" height="16" rx="4" fill={RAISED} />
      ))}
      <path d="M24 132h192" />
      {[24, 48, 72, 96, 120, 144, 168, 192, 216].map((x) => (
        <path key={`b${x}`} d={`M${x} 128v8`} />
      ))}
    </Frame>
  );
}

/** Video to APNG: a clip becomes a stack of frames whose stair-step edge is kept pixel for pixel. */
export function ApngIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="52" width="72" height="56" rx="6" stroke={MUTED} />
      <path d="M52 68v24l20-12z" stroke={MUTED} />
      <path d="M104 80h16M114 72l8 8-8 8" />
      <rect x="144" y="40" width="72" height="64" rx="6" stroke={MUTED} />
      <rect x="136" y="48" width="72" height="64" rx="6" fill={RAISED} />
      <path d="M148 100h8v-8h8v-8h8v-8h8v-8h8v-8h12v40z" fill="currentColor" stroke="none" />
    </Frame>
  );
}

/** Video to WebP: a large, dithered stack of GIF frames becomes a smaller, clean stack. */
export function WebpIllustration(props: Props) {
  const dots: [number, number][] = [];
  for (let y = 56; y <= 100; y += 8)
    for (let x = 32 + ((y / 8) % 2) * 4; x <= 88; x += 8) dots.push([x, y]);
  return (
    <Frame {...props}>
      <rect x="32" y="32" width="72" height="80" rx="6" stroke={MUTED} />
      <rect x="24" y="40" width="72" height="80" rx="6" stroke={MUTED} fill={RAISED} />
      <path d={dots.map(([x, y]) => `M${x} ${y}h0`).join("")} stroke={MUTED} />
      <path d="M112 80h16M122 72l8 8-8 8" />
      <rect x="160" y="60" width="56" height="40" rx="6" stroke={MUTED} />
      <rect x="152" y="68" width="56" height="40" rx="6" fill={RAISED} />
      <path d="M160 100l12-14 10 10 6-6 12 10" />
      <circle cx="196" cy="80" r="3" />
    </Frame>
  );
}

/** Video to AVIF: three animated files side by side, each smaller; the smallest is the result. */
export function AvifIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M24 40h40l16 16v72H24z" stroke={MUTED} />
      <path d="M64 40v16h16" stroke={MUTED} />
      <path d="M46 80v16l12-8z" stroke={MUTED} />
      <path d="M100 64h32l12 12v52h-44z" stroke={MUTED} />
      <path d="M132 64v12h12" stroke={MUTED} />
      <path d="M117 94v12l9-6z" stroke={MUTED} />
      <path d="M164 88h20l12 12v28h-32z" fill={RAISED} />
      <path d="M184 88v12h12" />
      {play(176, 108, 10)}
      <path d="M24 136h192" stroke={MUTED} />
    </Frame>
  );
}

/** Black and white: a frame of overlapping colour circles becomes one with a half-dark tone disc. */
export function BlackAndWhiteIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="36" width="80" height="88" rx="6" stroke={MUTED} />
      <circle cx="56" cy="72" r="16" stroke={MUTED} />
      <circle cx="72" cy="72" r="16" stroke={MUTED} />
      <circle cx="64" cy="88" r="16" stroke={MUTED} />
      <path d="M112 80h16M122 72l8 8-8 8" />
      <rect x="136" y="36" width="80" height="88" rx="6" fill={RAISED} />
      <circle cx="176" cy="80" r="24" />
      <path d="M176 56a24 24 0 0 1 0 48z" fill="currentColor" />
    </Frame>
  );
}

/** Brightness: a picture with its sun glowing, and a level slider raised toward the plus mark. */
export function BrightnessIllustration(props: Props) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const p = (r: number) =>
      `${(124 + r * Math.cos(a)).toFixed(1)} ${(60 + r * Math.sin(a)).toFixed(1)}`;
    return `M${p(12)}L${p(17)}`;
  }).join("");
  return (
    <Frame {...props}>
      <rect x="24" y="32" width="136" height="96" rx="6" fill={RAISED} />
      <path d="M36 116l28-36 20 20 12-12 32 28" />
      <circle cx="124" cy="60" r="8" />
      <path d={rays} />
      <path d="M192 44v84" stroke={MUTED} />
      <path d="M192 128V64" strokeWidth={3} />
      <circle cx="192" cy="64" r="6" fill={RAISED} />
      <path d="M204 44h8M208 40v8M204 128h8" stroke={MUTED} />
    </Frame>
  );
}

/** Change video thumbnail: one frame picked from the clip becomes the picture on the file's face. */
export function CoverIllustration(props: Props) {
  return (
    <Frame {...props}>
      <rect x="24" y="24" width="48" height="28" rx="4" stroke={MUTED} />
      <rect x="24" y="66" width="48" height="28" rx="4" fill={RAISED} />
      <path d="M30 88l10-12 8 8 6-6 12 10" />
      <rect x="24" y="108" width="48" height="28" rx="4" stroke={MUTED} />
      <path d="M84 80h16M94 72l8 8-8 8" />
      <path d="M120 24h72l24 24v88h-96z" fill={RAISED} />
      <path d="M192 24v24h24" />
      <rect x="132" y="60" width="72" height="48" rx="4" />
      <path d="M140 100l16-20 12 12 8-8 20 16" />
      <circle cx="188" cy="72" r="4" />
    </Frame>
  );
}

/** Boomerang: three frames inside a track that runs forwards along the top and backwards along the bottom. */
export function BoomerangIllustration(props: Props) {
  return (
    <Frame {...props}>
      <path d="M56 48h128" />
      <path d="M152 40l8 8-8 8" />
      <path d="M184 48a32 32 0 0 1 0 64M56 112a32 32 0 0 1 0-64" stroke={MUTED} />
      <path d="M184 112H56" stroke={MUTED} />
      <path d="M88 104l-8 8 8 8" stroke={MUTED} />
      <rect x="68" y="68" width="32" height="24" rx="4" fill={RAISED} />
      {play(80, 74, 12)}
      <rect x="104" y="68" width="32" height="24" rx="4" stroke={MUTED} />
      <rect x="140" y="68" width="32" height="24" rx="4" stroke={MUTED} />
      <path d="M160 74v12l-9-6z" stroke={MUTED} />
    </Frame>
  );
}

export const siblingIllustrations = {
  "replace-audio": ReplaceAudioIllustration,
  "video-volume": VideoVolumeIllustration,
  normalize: NormalizeIllustration,
  "video-audio-fade": VideoAudioFadeIllustration,
  "remove-silence-video": RemoveSilenceVideoIllustration,
  "stereo-to-mono": StereoToMonoIllustration,
  "sample-rate": SampleRateIllustration,
  "subtitle-overlaps": SubtitleOverlapsIllustration,
  "subtitle-frame-rate": SubtitleFrameRateIllustration,
  webp: WebpIllustration,
  apng: ApngIllustration,
  avif: AvifIllustration,
  "black-and-white": BlackAndWhiteIllustration,
  brightness: BrightnessIllustration,
  cover: CoverIllustration,
  boomerang: BoomerangIllustration,
} as const;
