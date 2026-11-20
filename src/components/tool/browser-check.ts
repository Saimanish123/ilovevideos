import { useEffect, useState } from "react";
import { canFallBack, ffmpegCanStart } from "@/tools/engines/fallbacks";
import type { MediaInfo } from "@/tools/engines/types";
import type { EngineId } from "@/tools/registry/schema";
import type { EngineClient, EngineFailure } from "@/tools/workers/client";
import { type Blocked, type OptionsSpec, type StageInput, unfixable } from "./options/types";

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous option shapes; each spec is typed internally
type AnySpec = OptionsSpec<any>;

/** What the check needs of the ready state. */
export interface ReadyJob {
  file: File;
  info: MediaInfo;
  options: unknown;
  inputs?: StageInput[];
}

/** Options change many times a second while a slider moves: ask once they settle. */
const SETTLE_MS = 250;

/** The block for a page run that needs the converter where it cannot start (ADR-0141). Pure. */
export function converterBlock(): Blocked {
  // Without WebAssembly no reload helps, and the reason says what does; with it, the page loaded
  // without cross-origin isolation (an in-app browser, an extension rewriting headers), which a
  // reload or the browser itself fixes, not another file.
  return typeof WebAssembly === "undefined"
    ? unfixable(
        "This browser cannot make this file. Try a current Chrome, Edge, Firefox or Safari.",
      )
    : {
        ...unfixable(
          "This page did not load in the mode this tool needs. Reload it, or open it in the browser itself rather than inside another app.",
        ),
        reload: true,
      };
}

/** What to do next when a failure names none: every reason ends with one (ADR-0141). */
export const BROWSER_ACTION = "Try a current Chrome or Edge.";

/**
 * The block a failed check becomes (ADR-0147): none when the engine's ffmpeg.wasm runner takes the
 * job over (../../tools/engines/fallbacks), else the failure's cause and what to do next, as the run
 * would say them. It is `unfixable` (ADR-0141: the reason stands where the button was, with "Choose
 * another file") unless the page offers another format or codec, which may be one this browser
 * writes; a pair page with its target locked offers none. Pure.
 */
export function blockFromFailure(
  engine: EngineId,
  failure: EngineFailure | undefined,
  fallBack: (engine: EngineId) => boolean = canFallBack,
  locked = false,
): Blocked | undefined {
  if (!failure || fallBack(engine)) return undefined;
  const reason = `${failure.message} ${failure.hint ?? BROWSER_ACTION}`;
  return formatChoice.has(engine) && !locked ? { reason } : unfixable(reason);
}

/** Engines whose page offers another output format or codec, which may be one this browser writes. */
const formatChoice: ReadonlySet<EngineId> = new Set<EngineId>([
  "convert-video",
  "convert-audio",
  "video-to-audio",
  "codec",
  "animated-image",
]);

/**
 * Says before the user starts when this browser cannot do the job as set (ADR-0147): asks the
 * engine worker the same `supports()` question the run asks, for the file and options in hand, and
 * again when the options settle. Pages that run on the page itself are checked for what the
 * converter needs. Undefined while asking and when the job can run, natively or through its
 * fallback. Never blocks on its own failure: the run then says what went wrong.
 */
export function useBrowserCheck(
  engine: EngineId,
  spec: AnySpec | undefined,
  job: ReadyJob | undefined,
  getClient: () => Promise<EngineClient>,
  /** The page locks its target format or codec (a pair page): no option can clear a block. */
  locked = false,
): Blocked | undefined {
  const [result, setResult] = useState<{ job: ReadyJob; block?: Blocked }>();
  const file = job?.file;
  const info = job?.info;
  const options = job?.options;
  const inputs = job?.inputs;
  useEffect(() => {
    if (!spec || !file || !info || spec.noAction) return;
    const current: ReadyJob = { file, info, options, inputs };
    if (spec.route?.(options, info, file.name) === "page") {
      setResult({
        job: current,
        block: needsConverter(engine) && !ffmpegCanStart() ? converterBlock() : undefined,
      });
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const client = await getClient();
        const list = inputs?.length
          ? inputs.map((i) => ({ file: i.file, info: i.info }))
          : [{ file, info }];
        const failure = await client.check(engine, list, options);
        if (live)
          setResult({
            job: current,
            block: blockFromFailure(engine, failure, canFallBack, locked),
          });
      } catch {
        if (live) setResult({ job: current });
      }
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [engine, spec, file, info, options, inputs, getClient, locked]);
  // An answer for another file or other options is not this one's.
  if (!result || !job || result.job.file !== job.file || result.job.options !== job.options)
    return undefined;
  return result.block;
}

/**
 * Page runners that start ffmpeg.wasm for every run. The others (metadata, fast start, the drawn
 * still for audio to video) only read and write the file, or hand it to the worker.
 */
const pageWithoutConverter: ReadonlySet<EngineId> = new Set<EngineId>([
  "edit-metadata",
  "cover",
  "faststart",
  "audio-to-video",
  "watermark",
  "text-overlay",
  "volume",
  "audio-fade",
  "remove-silence",
  "speech-denoise",
  "pitch",
  "ringtone",
]);
const needsConverter = (engine: EngineId) => !pageWithoutConverter.has(engine);
