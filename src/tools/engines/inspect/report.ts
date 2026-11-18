/**
 * Turns MediaInfo into labelled facts for the video-info panel and its plain-text copy.
 * Pure; unit-tested; shared by the panel (display and "Copy as text") and the inspect engine.
 */
import {
  formatBytes,
  formatDimensions,
  formatDuration,
  formatTimecode,
  withUnit,
} from "@/lib/format";
import { codecName } from "../convert-video/plan";
import type { MediaInfo } from "../types";

export interface InfoRow {
  label: string;
  value: string;
}
export interface InfoSection {
  title: string;
  rows: InfoRow[];
}

/** kbps under 1 Mbps, Mbps above, one decimal. */
export function formatBitrate(bps: number | undefined): string | undefined {
  if (!bps || !Number.isFinite(bps) || bps <= 0) return undefined;
  const kbps = bps / 1000;
  if (kbps < 1000) return withUnit(Math.round(kbps).toLocaleString(), "kbps");
  return withUnit((kbps / 1000).toFixed(1), "Mbps");
}

export function formatChannels(n: number): string {
  if (n === 1) return "mono";
  if (n === 2) return "stereo";
  if (n === 6) return "5.1";
  if (n === 8) return "7.1";
  return withUnit(n, "channels");
}

export function formatSampleRate(hz: number): string {
  return withUnit((hz / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }), "kHz");
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** "16:9" for common shapes; falls back to a rounded decimal ratio for odd sizes. */
export function formatAspect(width: number, height: number): string | undefined {
  if (!(width > 0 && height > 0)) return undefined;
  const g = gcd(width, height);
  const w = width / g;
  const h = height / g;
  if (w <= 32 && h <= 32) return `${w}:${h}`;
  return `${(width / height).toFixed(2)}:1`;
}

const audioName = (codec: string) => (codec.startsWith("pcm") ? "PCM" : codecName(codec)) ?? codec;

/** Container codec ids as ffprobe would name the format (subrip, ass, webvtt, mov_text, PGS). */
const SUBTITLE_CODECS: [RegExp, string][] = [
  [/^S_TEXT\/(UTF8|ASCII)$|^subrip$|^srt$/i, "SRT"],
  [/^S_TEXT\/SSA$|^S_SSA$|^ssa$/i, "SSA"],
  [/^S_TEXT\/ASS$|^S_ASS$|^ass$/i, "ASS"],
  [/^S_TEXT\/WEBVTT$|^D_WEBVTT|^wvtt$|^webvtt$/i, "WebVTT"],
  [/^tx3g$|^mov_text$|^text$/i, "MP4 timed text (mov_text)"],
  [/PGS/i, "PGS pictures"],
  [/VOBSUB|^mp4s$|dvd_subtitle/i, "VobSub pictures"],
  [/DVBSUB|dvb_subtitle/i, "DVB pictures"],
];

/** "SRT", "ASS", "WebVTT", "MP4 timed text (mov_text)", "PGS pictures"; the container's id otherwise. */
export function subtitleFormat(sub: { codec: string; kind?: string }): string {
  for (const [re, name] of SUBTITLE_CODECS) if (re.test(sub.codec)) return name;
  if (sub.kind === "srt") return "SRT";
  if (sub.kind === "vtt") return "WebVTT";
  if (sub.kind === "picture") return "Pictures";
  return sub.codec || "unknown";
}

export function infoSections(info: MediaInfo): InfoSection[] {
  const sections: InfoSection[] = [];
  const d = info.durationSec;
  const general: InfoRow[] = [
    { label: "Container", value: info.container },
    {
      label: "Duration",
      value:
        Number.isFinite(d) && d > 0
          ? `${formatDuration(d)} (${withUnit(d.toFixed(2), "s")})`
          : "unknown",
    },
    {
      label: "Size",
      value: `${formatBytes(info.sizeBytes)} (${withUnit(info.sizeBytes.toLocaleString(), "bytes")})`,
    },
  ];
  const overall = d > 0 ? formatBitrate((info.sizeBytes * 8) / d) : undefined;
  if (overall) general.push({ label: "Overall bitrate", value: overall });
  sections.push({ title: "File", rows: general });

  const v = info.video;
  if (v) {
    const rows: InfoRow[] = [{ label: "Codec", value: codecName(v.codec) ?? v.codec }];
    if (v.codecString) rows.push({ label: "Codec string", value: v.codecString });
    rows.push({ label: "Resolution", value: formatDimensions(v.width, v.height) });
    const aspect = formatAspect(v.width, v.height);
    if (aspect) rows.push({ label: "Aspect ratio", value: aspect });
    if (v.fps > 0 && Number.isFinite(v.fps))
      rows.push({
        label: "Frame rate",
        value: withUnit(v.fps.toLocaleString(undefined, { maximumFractionDigits: 2 }), "fps"),
      });
    const br = formatBitrate(v.bitrate);
    if (br) rows.push({ label: "Bitrate", value: br });
    if (v.rotation) rows.push({ label: "Rotation", value: `${v.rotation}°` });
    if (v.language) rows.push({ label: "Language", value: v.language });
    sections.push({ title: "Video", rows });
  }

  const audio = info.audio ?? [];
  audio.forEach((a, i) => {
    const rows: InfoRow[] = [{ label: "Codec", value: audioName(a.codec) }];
    if (a.codecString) rows.push({ label: "Codec string", value: a.codecString });
    rows.push({ label: "Channels", value: formatChannels(a.channels) });
    rows.push({ label: "Sample rate", value: formatSampleRate(a.sampleRate) });
    const br = formatBitrate(a.bitrate);
    if (br) rows.push({ label: "Bitrate", value: br });
    if (a.language) rows.push({ label: "Language", value: a.language });
    sections.push({ title: audio.length > 1 ? `Audio track ${i + 1}` : "Audio", rows });
  });
  if (audio.length === 0)
    sections.push({ title: "Audio", rows: [{ label: "Tracks", value: "none" }] });

  const subs = info.subtitles ?? [];
  subs.forEach((sub, i) => {
    const rows: InfoRow[] = [{ label: "Format", value: subtitleFormat(sub) }];
    if (sub.codec && sub.codec !== subtitleFormat(sub))
      rows.push({ label: "Codec ID", value: sub.codec });
    if (sub.language) rows.push({ label: "Language", value: sub.language });
    if (sub.name) rows.push({ label: "Name", value: sub.name });
    const flags = [sub.default && "default", sub.forced && "forced"].filter(Boolean);
    if (flags.length > 0) rows.push({ label: "Flags", value: flags.join(", ") });
    if (sub.cues !== undefined) rows.push({ label: "Cues", value: sub.cues.toLocaleString("en") });
    sections.push({ title: subs.length > 1 ? `Subtitle track ${i + 1}` : "Subtitles", rows });
  });

  const t = info.tags;
  if (t) {
    const rows: InfoRow[] = [];
    if (t.title) rows.push({ label: "Title", value: t.title });
    if (t.artist) rows.push({ label: "Artist", value: t.artist });
    if (t.album) rows.push({ label: "Album", value: t.album });
    if (t.date) rows.push({ label: "Date", value: t.date });
    if (t.comment) rows.push({ label: "Comment", value: t.comment });
    if (t.description) rows.push({ label: "Description", value: t.description });
    if (t.genre) rows.push({ label: "Genre", value: t.genre });
    if (t.rawKeys && t.rawKeys.length > 0)
      rows.push({ label: "Raw tag keys", value: t.rawKeys.join(", ") });
    if (rows.length > 0) sections.push({ title: "Tags", rows });
  }
  return sections;
}

/** The whole report as plain text, one "Label: value" per line, sections separated by a blank line. */
export function infoReport(info: MediaInfo, fileName?: string): string {
  const parts = infoSections(info).map((s) =>
    [s.title, ...s.rows.map((r) => `${r.label}: ${r.value}`)].join("\n"),
  );
  return [fileName ? `Name: ${fileName}` : undefined, ...parts].filter(Boolean).join("\n\n");
}

/** One-line summary for the file card style readout, e.g. "MP4 · 0:03 · H.264 640×360 · AAC stereo". */
export function infoSummary(info: MediaInfo): string {
  const v = info.video;
  const a = info.audio?.[0];
  return [
    info.container,
    formatTimecode(info.durationSec),
    v && `${codecName(v.codec) ?? v.codec} ${formatDimensions(v.width, v.height)}`,
    a && `${audioName(a.codec)} ${formatChannels(a.channels)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
