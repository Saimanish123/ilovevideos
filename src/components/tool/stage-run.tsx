import type { ReactNode } from "react";
import { ffmpegOnlyAudioExtensions } from "@/content/formats/audio";
import { ffmpegOnlyExtensions } from "@/content/formats/containers";
import type { MediaInfo, Progress } from "@/tools/engines/types";
import type { EngineId, ToolDefinition } from "@/tools/registry/schema";
import type { EngineClient, EngineFailure, RunResult } from "@/tools/workers/client";
import type { OptionsSpec } from "./options/types";

/**
 * What the single stage and its batch mode share: reading a file, running one job, and the shell.
 * One implementation, so a file in a batch is read and processed exactly as it is on its own.
 */

/**
 * What the stage needs of a tool, and nothing else: the full definition carries the page's prose,
 * which would otherwise be serialized into every page's HTML a second time.
 */
export type StageTool = Pick<ToolDefinition, "slug" | "engine" | "accepts" | "presetOptions"> & {
  /** Primary button label when the page's differs from the engine's verb (`content.action`). */
  action?: string;
};

export const stageToolOf = (t: ToolDefinition): StageTool => ({
  slug: t.slug,
  engine: t.engine,
  accepts: t.accepts,
  presetOptions: t.presetOptions,
  ...(t.content.en.action ? { action: t.content.en.action } : {}),
});

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous option shapes; each spec is typed internally
type AnySpec = OptionsSpec<any>;

/** The `<input accept>` list for what a page takes. */
export function acceptFor(accepts: ToolDefinition["accepts"]): string {
  return accepts
    .map((k) =>
      k === "subtitle"
        ? ".srt,.vtt,.ass,.ssa,.sbv,text/vtt,application/x-subrip"
        : k === "gif"
          ? "image/gif,.gif"
          : `${k}/*`,
    )
    .join(",");
}

/** The error hint for unreadable inputs, from what the page takes (not a hard-coded video list). */
export function acceptHint(accepts: ToolDefinition["accepts"]): string {
  const kinds = accepts.map((k) =>
    k === "video"
      ? "a video"
      : k === "audio"
        ? "an audio file"
        : k === "subtitle"
          ? "a subtitle file"
          : k === "image"
            ? "an image"
            : `a ${k} file`,
  );
  return `Choose ${kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} or ${kinds.at(-1)}` : kinds[0]} this browser can read.`;
}

/**
 * Whether several files on this page run as a batch queue (feature catalog L1). Pages whose primary
 * control is per file never do: a timeline or strip under the preview (`Below`), a frame or mark on
 * the picture (`Overlay`), a report (`noAction`), or several inputs with one output (`multiple`).
 * `batch: false` opts out the rest (add subtitles: one subtitle file belongs to one video).
 */
export function isBatchable(spec: AnySpec): boolean {
  return (
    spec.batch !== false && !spec.multiple && !spec.Below && !spec.Overlay && spec.noAction !== true
  );
}

/** What one input of this page is called in a batch: "video", "audio file", "GIF". */
export function nounFor(accepts: ToolDefinition["accepts"]): string {
  const k = accepts[0];
  return k === "video"
    ? "video"
    : k === "audio"
      ? "audio file"
      : k === "gif"
        ? "GIF"
        : k === "subtitle"
          ? "subtitle file"
          : "file";
}

/** Any thrown value as an engine failure with a sentence, never "[object Object]". */
export function toFailure(e: unknown): EngineFailure {
  const err = e as Partial<EngineFailure> & { message?: string };
  if (err && typeof err === "object" && err.code)
    return { code: err.code, message: err.message ?? "", hint: err.hint };
  return { code: "internal", message: String((e as Error)?.message ?? e) };
}

/**
 * Reads one file: the page's own inspector (a GIF, a subtitle file), else the media inspector, and
 * ffmpeg.wasm for containers the native reader cannot open (AVI, WMV, FLV...).
 */
export async function inspectFile(
  spec: AnySpec,
  client: EngineClient,
  file: File,
  accepts?: ToolDefinition["accepts"],
): Promise<MediaInfo> {
  try {
    return spec.inspect
      ? await spec.inspect(file)
      : await client.inspect(file, { keyframes: spec.inspectKeyframes === true });
  } catch (e) {
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (
      (e as EngineFailure).code !== "unsupported-input" ||
      !(ffmpegOnlyExtensions.includes(ext) || ffmpegOnlyAudioExtensions.includes(ext))
    )
      throw await withPageFormats(e, accepts);
    const { inspectWithFfmpeg } = await import("@/tools/engines/ffmpeg");
    return inspectWithFfmpeg(file);
  }
}

/**
 * A file this page cannot read: the engine's hint lists every format the site opens; the page
 * names only its own (a video page does not offer WAV).
 */
async function withPageFormats(e: unknown, accepts?: ToolDefinition["accepts"]) {
  const failure = e as EngineFailure;
  if (
    !accepts ||
    failure.code !== "unsupported-input" ||
    !failure.hint?.startsWith("This page reads ")
  )
    return e;
  const { acceptedFormatsFor } = await import("./accepted-formats");
  const hint = acceptedFormatsFor(accepts);
  return hint ? { ...failure, hint } : e;
}

/** Runs one single-file job where the page routes it: the engine worker or a page-side runner. */
export async function runJob(
  engine: EngineId,
  spec: AnySpec,
  getClient: () => Promise<EngineClient>,
  job: { file: File; info: MediaInfo; options: unknown },
  ctx: { signal: AbortSignal; onProgress: (p: Progress) => void },
): Promise<RunResult> {
  const { file, info, options } = job;
  if (spec.route?.(options, info, file.name) === "page") {
    const { pageRunners } = await import("@/tools/engines/page-runners");
    const load = pageRunners[engine];
    if (!load) throw { code: "internal", message: "No page runner for this tool." };
    const runner = await load();
    try {
      const r = await runner(file, info, options, ctx);
      return { blob: r.blob, filename: r.filename, ffmpegCommand: r.ffmpegCommand, meta: r.meta };
    } catch (e) {
      const err = e as { code?: string; message?: string; hint?: string };
      throw { code: err.code ?? "internal", message: err.message ?? String(e), hint: err.hint };
    }
  }
  const client = await getClient();
  return client.run(engine, file, options, { info, ...ctx });
}

/**
 * Runs one multi-file job (spec.multiple): in the engine worker with every input in order (the
 * default), or in the page-side runner for several inputs when the spec's `route` says "page" for
 * these options (engines/page-runners `pageRunnersMany`).
 */
export async function runManyJob(
  engine: EngineId,
  spec: AnySpec,
  getClient: () => Promise<EngineClient>,
  job: { inputs: { file: File; info: MediaInfo }[]; options: unknown },
  ctx: { signal: AbortSignal; onProgress: (p: Progress) => void },
): Promise<RunResult> {
  const { inputs, options } = job;
  const first = inputs[0];
  if (first && spec.route?.(options, first.info, first.file.name) === "page") {
    const { pageRunnersMany } = await import("@/tools/engines/page-runners");
    const load = pageRunnersMany[engine];
    if (!load) throw { code: "internal", message: "No page runner for this tool." };
    const runner = await load();
    try {
      const r = await runner(inputs, options, ctx);
      return { blob: r.blob, filename: r.filename, ffmpegCommand: r.ffmpegCommand, meta: r.meta };
    } catch (e) {
      const err = e as { code?: string; message?: string; hint?: string };
      throw { code: err.code ?? "internal", message: err.message ?? String(e), hint: err.hint };
    }
  }
  const client = await getClient();
  return client.runMany(
    engine,
    inputs.map((i) => ({ file: i.file, info: i.info })),
    options,
    ctx,
  );
}

export function phaseLabel(phase: Progress["phase"]): string {
  switch (phase) {
    case "loading":
      return "Loading the encoder";
    case "analyzing":
      return "Reading the file";
    case "processing":
      return "Processing";
    case "finishing":
      return "Finishing";
  }
}

/**
 * The workspace surface once a file is chosen (the idle drop zone is its own section). Below md it
 * keeps the drop zone's `--stage-min-h`, so a chosen file changes no height and nothing shifts.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Workspace"
      className="relative mx-auto min-h-(--stage-min-h) w-full max-w-(--container-content) rounded-lg border border-border bg-bg-raised p-6 md:min-h-80"
    >
      {children}
    </section>
  );
}
