import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ShareChooser, type ShareGroups, type ShareKind } from "@/components/share/share-chooser";
import { getTool } from "@/tools/registry";

export const metadata: Metadata = {
  title: "Open a shared file",
  // Reached only from the installed app's Share menu; it has nothing to show a search visitor.
  robots: { index: false, follow: false },
};

/**
 * Which tools a shared file is offered (ADR-0103): a short list per kind of file, for one file and
 * for several. Pages that take several files take them all (merge, a batch); the rest are left out
 * of the "several" lists rather than silently opening only the first.
 */
const lists: Record<ShareKind, { one: string[]; several: string[] }> = {
  video: {
    one: [
      "compress-video",
      "trim-video",
      "video-converter",
      "video-to-gif",
      "extract-audio-from-video",
      "crop-video",
      "remove-audio-from-video",
      "rotate-video",
    ],
    several: [
      "merge-videos",
      "compress-video",
      "video-converter",
      "remove-audio-from-video",
      "rotate-video",
    ],
  },
  audio: {
    one: [
      "trim-audio",
      "audio-converter",
      "normalize-audio",
      "change-audio-volume",
      "fade-audio",
      "remove-silence-from-audio",
    ],
    several: [
      "merge-audio",
      "audio-converter",
      "normalize-audio",
      "change-audio-volume",
      "fade-audio",
    ],
  },
  gif: { one: ["gif-to-mp4"], several: ["gif-to-mp4"] },
  image: { one: ["images-to-video"], several: ["images-to-video"] },
  subtitle: {
    one: ["subtitle-converter", "shift-subtitle-timing", "fix-subtitle-overlaps"],
    several: ["subtitle-converter"],
  },
};

/** A tool's subtitle without "in your browser" or "not uploaded": true of every choice here. */
const short = (subtitle: string) =>
  subtitle
    .replace(/\s*(Runs in your browser|Not uploaded|Nothing is uploaded)\.?$/i, "")
    .replace(/,? in your browser(?=[,.])/i, "")
    .replace(/,\s*([.,])/g, "$1")
    .trim();

const kinds = ["video", "audio", "gif", "image", "subtitle"] as const;

const groupsFor = (): ShareGroups => {
  const pick = (slugs: string[]) =>
    slugs.flatMap((slug) => {
      const t = getTool(slug);
      return t ? [{ slug, title: t.content.en.title, subtitle: short(t.content.en.subtitle) }] : [];
    });
  return Object.fromEntries(
    Object.entries(lists).map(([k, v]) => [k, { one: pick(v.one), several: pick(v.several) }]),
  ) as ShareGroups;
};

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  /** Set by the service worker's redirect: how many files and the first one's kind. */
  searchParams: Promise<{ files?: string; kind?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const q = await searchParams;
  const kind = kinds.find((k) => k === q.kind);
  const count = Math.max(1, Number(q.files) || 1);
  return (
    <article className="mx-auto w-full max-w-(--container-content) px-4 py-12 md:px-8 md:py-16">
      <h1 className="text-h1 text-balance">Open a shared file</h1>
      <p className="mt-3 max-w-(--container-prose) text-body-lg text-fg-muted">
        Choose what to do with it. The file stays on this device.
      </p>
      <div className="mt-10">
        <ShareChooser groups={groupsFor()} kind={kind} count={count} />
      </div>
    </article>
  );
}
