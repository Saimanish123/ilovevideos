/**
 * Decides how clips are joined: a stream copy when every clip carries the same streams (codec,
 * profile and level, size, rotation, audio layout), a re-encode to the first clip's frame otherwise.
 * Pure: the page uses it to say which path will run and why; the engine runs it again and then
 * compares the codec configuration bytes, which the page cannot see.
 */
import { formatDimensions, withUnit } from "@/lib/format";
import { codecName as displayName } from "../convert-video/plan";
import type { MediaInfo } from "../types";

export const MAX_CLIPS = 50;

export interface MergeClip {
  name: string;
  info: MediaInfo;
}

export interface MergePlan {
  /** True when the clips can be joined without re-encoding. */
  copy: boolean;
  /** Why a stream copy is not possible, most important first. Empty when `copy`. */
  reasons: string[];
  /** 0-based indexes of the clips that differ from clip 1 (they force the re-encode). */
  culprits: number[];
  /** Output frame: the first clip's display size, rounded down to even numbers for the encoder. */
  width: number;
  height: number;
  /** Any clip has sound; clips without it get silence when re-encoding. */
  hasAudio: boolean;
  totalSec: number;
}

const codecName = (c: string) => displayName(c) ?? "an unknown codec";
const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/** H.264 profile indications (ISO/IEC 14496-10 Annex A) by the first byte of avc1.PPCCLL. */
const avcProfiles: Record<string, string> = {
  "42": "Baseline",
  "4d": "Main",
  "58": "Extended",
  "64": "High",
  "6e": "High 10",
  "7a": "High 4:2:2",
  f4: "High 4:4:4",
};

/** "avc1.4d401e" → "H.264 Main, level 3.0"; other codecs fall back to the codec string. */
export function profileName(codec: string, codecString: string): string {
  const m = /^avc[13]\.([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(codecString);
  if (codec === "avc" && m?.[1] && m[3]) {
    const profile = avcProfiles[m[1].toLowerCase()];
    const level = (Number.parseInt(m[3], 16) / 10).toFixed(1);
    if (profile) return `H.264 ${profile}, level ${level}`;
  }
  return `${codecName(codec)} (${codecString})`;
}

const khz = (hz: number) => withUnit(Number((hz / 1000).toFixed(1)), "kHz");
const layout = (channels: number) =>
  channels === 1 ? "mono" : channels === 2 ? "stereo" : `${channels} channels`;

export function planMerge(clips: MergeClip[], opts: { reencode?: boolean } = {}): MergePlan {
  const first = clips[0]?.info;
  const v0 = first?.video;
  const a0 = first?.audio?.[0];
  const reasons: string[] = [];
  const culprits: number[] = [];
  const hasAudio = clips.some((c) => (c.info.audio?.length ?? 0) > 0);

  clips.forEach((clip, i) => {
    if (i === 0) return;
    const n = `Clip ${i + 1}`;
    const v = clip.info.video;
    const a = clip.info.audio?.[0];
    const before = reasons.length;
    if (v && v0) {
      // What people notice first: the frame. Then the codec, then its profile and level.
      if (v.width !== v0.width || v.height !== v0.height) {
        reasons.push(
          `${n} is ${formatDimensions(v.width, v.height)}; clip 1 is ${formatDimensions(v0.width, v0.height)}.`,
        );
      } else if ((v.rotation ?? 0) !== (v0.rotation ?? 0)) {
        reasons.push(`${n} is rotated differently from clip 1.`);
      }
      if (v.codec !== v0.codec) {
        reasons.push(`${n} is ${codecName(v.codec)}; clip 1 is ${codecName(v0.codec)}.`);
      } else if (v.codecString && v0.codecString && v.codecString !== v0.codecString) {
        reasons.push(
          `${n} is ${profileName(v.codec, v.codecString)}; clip 1 is ${profileName(v0.codec, v0.codecString)}.`,
        );
      }
    }
    if (!!a !== !!a0) {
      reasons.push(a ? `${n} has sound; clip 1 does not.` : `${n} has no sound; clip 1 does.`);
    } else if (a && a0) {
      if (a.codec !== a0.codec) {
        reasons.push(`${n} has ${codecName(a.codec)} sound; clip 1 has ${codecName(a0.codec)}.`);
      } else if (a.sampleRate !== a0.sampleRate || a.channels !== a0.channels) {
        reasons.push(
          `${n}'s sound is ${khz(a.sampleRate)} ${layout(a.channels)}; clip 1's is ${khz(a0.sampleRate)} ${layout(a0.channels)}.`,
        );
      }
    }
    if (reasons.length > before) culprits.push(i);
  });

  return {
    copy: !opts.reencode && reasons.length === 0,
    reasons,
    culprits,
    width: even(v0?.width ?? 1280),
    height: even(v0?.height ?? 720),
    hasAudio,
    totalSec: clips.reduce((s, c) => s + (c.info.durationSec || 0), 0),
  };
}

/** A clip the merge cannot use at all, as a sentence; undefined when every clip has video. */
export function unusableClip(clips: MergeClip[]): string | undefined {
  const i = clips.findIndex((c) => !c.info.video);
  if (i < 0) return undefined;
  return `Clip ${i + 1} (${clips[i]?.name}) has no video track. Remove it to merge the rest.`;
}
