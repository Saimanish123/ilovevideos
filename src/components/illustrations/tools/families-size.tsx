import type { ReactNode, SVGProps } from "react";
import { type PlatformId, platforms } from "@/content/platforms";
import { type FramePlatformId, framePlatforms } from "@/content/platforms/frames";
import { label, labelCentered, labelWidth } from "./glyphs";

/**
 * Family illustrations for compress-to-a-size pages (`compress-cap:<mb>`), compress-for-a-destination pages (`compress-for:<id>`) and resize-for-a-platform pages (`resize-for:<id>`).
 * Same system as ./index (ADR-0008): canvas 240×160, 4px grid, 1.5 monoline strokes, round joins,
 * `currentColor` for the subject, `var(--color-fg-muted)` for context, `var(--color-bg-raised)` for
 * flat fills; labels drawn with the stroke alphabet in ./glyphs. Static, decorative.
 *
 * The numbers drawn (a destination's default cap, a platform's ratio) are read from the same content
 * files the pages use, so a picture never disagrees with its page. No brand marks or names: the
 * destination is drawn generically (an envelope, a chat bubble, a thread), the platform by its frame.
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

/** The house arrow with its tail at (x, y): `h16` plus an `8 8` head. */
const arrow = (x: number, y: number) => `M${x} ${y}h16M${x + 10} ${y - 8}l8 8-8 8`;

/** A play triangle centred on (cx, cy), 16 high by default. */
const play = (cx: number, cy: number, h = 16) =>
  `M${cx - (h * 3) / 8} ${cy - h / 2}v${h}l${(h * 7) / 8} ${-h / 2}z`;

/** Largest label height up to `max` that keeps `text` within `width`. */
const fit = (text: string, width: number, max: number) =>
  Math.min(max, (width / labelWidth(text, 12)) * 12);

/**
 * Compress to a size: a muted original too tall for a dashed limit line, and the compressed frame
 * sitting under it. The limit is labelled with the page's own number ("8 MB", "100 MB").
 */
function CompressCapIllustration({ args, ...props }: FamilyProps) {
  const text = `${args[0] ?? ""} MB`;
  const h = fit(text, 88, 16);
  return (
    <Frame {...props}>
      <rect x="24" y="36" width="80" height="92" rx="6" stroke={MUTED} strokeDasharray="4 6" />
      <path d={play(64, 82)} stroke={MUTED} />
      <path d="M24 68h192" strokeDasharray="3 5" />
      <path d={label(text, 216 - labelWidth(text, h), 60 - h, h)} />
      <path d={arrow(112, 104)} />
      <rect x="140" y="84" width="76" height="44" rx="6" fill={RAISED} />
      <path d={play(178, 106)} fill="currentColor" stroke="none" />
    </Frame>
  );
}

/** The cap as a stacked figure on the right: the number large, the unit under it. */
function StackedCap({ mb }: { mb: number }) {
  const n = String(mb);
  const h = fit(n, 56, 28);
  return (
    <>
      <path d={labelCentered(n, 188, 80 - h, h)} />
      <path d={labelCentered("MB", 188, 92)} stroke={MUTED} />
    </>
  );
}

/** Email: the video slipped into an envelope. */
const email = (
  <>
    <rect x="32" y="72" width="104" height="56" fill={RAISED} />
    <rect x="52" y="40" width="64" height="44" rx="6" fill={RAISED} />
    <path d={play(84, 60)} fill="currentColor" stroke="none" />
    <path d="M32 76l52 28 52-28v52H32z" fill={RAISED} />
  </>
);

/** Chat: one message bubble holding the video. */
const chat = (
  <>
    <path
      d="M44 36h80a12 12 0 0 1 12 12v56a12 12 0 0 1-12 12H44l-16 12 4-16V48a12 12 0 0 1 12-12z"
      fill={RAISED}
    />
    <rect x="44" y="48" width="80" height="56" rx="6" />
    <path d={play(84, 76)} fill="currentColor" stroke="none" />
  </>
);

/** Community thread: a muted message above, the posted video as the newest message. */
const thread = (
  <>
    <circle cx="36" cy="40" r="8" stroke={MUTED} />
    <path d="M56 36h64M56 44h40" stroke={MUTED} />
    <circle cx="36" cy="72" r="8" />
    <path d="M56 68h32" />
    <rect x="56" y="80" width="80" height="48" rx="6" fill={RAISED} />
    <path d={play(96, 104)} fill="currentColor" stroke="none" />
  </>
);

const destinations: Record<PlatformId, ReactNode> = {
  discord: thread,
  whatsapp: chat,
  email,
};

/** Compress for a destination: the destination, drawn generically, holding the video, with its default cap. */
function CompressForIllustration({ args, ...props }: FamilyProps) {
  const p = platforms[args[0] as PlatformId];
  return (
    <Frame {...props}>
      {p ? destinations[p.id] : chat}
      {p ? <StackedCap mb={p.defaultMb} /> : null}
    </Frame>
  );
}

/** Target frame per ratio, on the 4px grid, right-aligned to the margin. */
const targets: Record<string, { x: number; y: number; w: number; h: number }> = {
  "9:16": { x: 152, y: 24, w: 64, h: 112 },
  "16:9": { x: 128, y: 56, w: 88, h: 48 },
  "4:5": { x: 152, y: 52, w: 64, h: 80 },
  "1:1": { x: 144, y: 44, w: 72, h: 72 },
};

/** What each platform's page says sits over or around its frame. */
const overlays: Partial<Record<FramePlatformId, ReactNode>> = {
  // Caption along the bottom, buttons down the right edge.
  tiktok: (
    <>
      <path d={play(180, 64)} fill="currentColor" stroke="none" />
      <circle cx="204" cy="84" r="4" stroke={MUTED} />
      <circle cx="204" cy="100" r="4" stroke={MUTED} />
      <circle cx="204" cy="116" r="4" stroke={MUTED} />
      <path d="M164 116h24M164 124h16" stroke={MUTED} />
    </>
  ),
  // Meta's safe zone: 14% top, 35% bottom, 6% each side.
  "instagram-reels": (
    <>
      <rect x="156" y="40" width="56" height="56" stroke={MUTED} strokeDasharray="3 5" />
      <path d={play(184, 68)} fill="currentColor" stroke="none" />
    </>
  ),
  // A Short is up to 3 minutes: a timeline with the 3:00 end.
  "youtube-shorts": (
    <>
      <path d={play(184, 60)} fill="currentColor" stroke="none" />
      <path d={labelCentered("3:00", 184, 96)} />
      <path d="M164 124h40M164 120v8M204 120v8" stroke={MUTED} />
    </>
  ),
  // A vertical clip inside the 16:9 player.
  youtube: (
    <>
      <rect x="160" y="56" width="24" height="48" />
      <path d={play(172, 80, 12)} fill="currentColor" stroke="none" />
    </>
  ),
  // A feed post: a header row in the frame, the landscape picture in a band below it.
  facebook: (
    <>
      <circle cx="164" cy="64" r="4" stroke={MUTED} />
      <path d="M176 64h28" stroke={MUTED} />
      <rect x="152" y="76" width="64" height="32" />
      <path d={play(184, 92, 12)} fill="currentColor" stroke="none" />
    </>
  ),
};

/**
 * Resize for a platform: the muted source → arrow labelled with the target ratio → the platform's
 * frame, with what its page says about that frame (overlays, safe zone, length cap, bars).
 */
function ResizeForIllustration({ args, ...props }: FamilyProps) {
  const id = args[0] as FramePlatformId;
  const ratio = framePlatforms[id]?.ratio ?? "9:16";
  const t = targets[ratio] ?? { x: 152, y: 24, w: 64, h: 112 };
  // A landscape target starts from a vertical clip; every other target from a landscape one.
  const landscape = t.w > t.h;
  const ax = landscape ? 88 : 112;
  return (
    <Frame {...props}>
      {landscape ? (
        <rect x="28" y="48" width="36" height="64" rx="6" stroke={MUTED} strokeDasharray="4 6" />
      ) : (
        <rect x="24" y="60" width="64" height="36" rx="6" stroke={MUTED} strokeDasharray="4 6" />
      )}
      <path d={labelCentered(ratio, ax + 9, 52)} />
      <path d={arrow(ax, 80)} />
      <rect x={t.x} y={t.y} width={t.w} height={t.h} rx="6" fill={RAISED} />
      {overlays[id] ?? (
        <path d={play(t.x + t.w / 2, t.y + t.h / 2)} fill="currentColor" stroke="none" />
      )}
    </Frame>
  );
}

export const sizeFamilyIllustrations: Record<string, (p: FamilyProps) => React.ReactNode> = {
  "compress-cap": CompressCapIllustration,
  "compress-for": CompressForIllustration,
  "resize-for": ResizeForIllustration,
};
