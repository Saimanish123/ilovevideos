"use client";

import { Check, Upload } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ProgressLine } from "@/components/ui/progress-line";
import { cn } from "@/lib/cn";
import { matchesAccept, takeHandoffFiles } from "@/lib/handoff";
import { setPageShortcuts } from "@/lib/page-shortcuts";
import { useMediaQuery } from "@/lib/use-media-query";
import type { MediaInfo, Progress } from "@/tools/engines/types";
import type { EngineClient, EngineFailure, RunResult } from "@/tools/workers/client";
import { useActionBarRef } from "./action-bar";
import { type AnySpec, loadSpec, optionsLoaders } from "./options";
import { blockOf, type Captured, type IdleSpec, type StageInput } from "./options/types";
import { withoutFirst } from "./reading";
import {
  acceptFor,
  acceptHint,
  inspectFile,
  phaseLabel,
  runJob,
  runManyJob,
  Shell,
  type StageTool,
  toFailure,
} from "./stage-run";

// The non-idle UI is one chunk, loaded with the engine's spec when the first file is chosen and
// rendered from the loaded module (no lazy wrappers), so nothing suspends once a file is read.
const loadParts = () => import("./stage-parts");
type Parts = Awaited<ReturnType<typeof loadParts>>;

/**
 * `inputs` is set only for multi-file tools (`spec.multiple`, merge): every input in order, with
 * `file`/`info` repeating `inputs[0]`. Single-file tools never see it.
 */
type State =
  | { kind: "idle" }
  /** `count`: how many files are being read (multi-file tools), for the reading line. */
  | { kind: "inspecting"; file: File; count?: number }
  | { kind: "ready"; file: File; info: MediaInfo; options: unknown; inputs?: StageInput[] }
  | {
      kind: "processing";
      file: File;
      info: MediaInfo;
      options: unknown;
      progress: Progress;
      inputs?: StageInput[];
    }
  | {
      kind: "done";
      file: File;
      info: MediaInfo;
      result: RunResult;
      options?: unknown;
      inputs?: StageInput[];
    }
  | {
      kind: "error";
      file?: File;
      info?: MediaInfo;
      options?: unknown;
      error: EngineFailure;
      inputs?: StageInput[];
    };

/**
 * The single interactive surface of a tool page (README.md#tool-page-specification §2).
 * Idle → inspecting → ready → processing → done | error. The URL never changes; files never
 * leave the device; Cancel frees everything; Escape cancels while processing.
 */
export function ToolStage({ tool, idle }: { tool: StageTool; idle?: IdleSpec }) {
  // The engine's spec loads with the first file (options/index.ts); the idle state comes from the
  // server page (options/idle), so the first load is the drop zone and nothing behind it.
  const [spec, setSpec] = useState<AnySpec>();
  const [parts, setParts] = useState<Parts>();
  const available = optionsLoaders[tool.engine] !== undefined;
  const ensureSpec = useCallback(async () => {
    const [s, p] = await Promise.all([
      loadSpec(tool.engine) ?? Promise.reject(new Error("No page for this tool.")),
      loadParts(),
    ]);
    // Set together, so the spec never renders without the parts it needs.
    setParts(p);
    setSpec(s);
    return s;
  }, [tool.engine]);
  const verb = tool.action ?? spec?.verb ?? "Run";
  const [state, setState] = useState<State>({ kind: "idle" });
  // The label for the options in hand (spec.verbFor), on the run button and its progress bar.
  const runVerb =
    (state.kind === "ready" || state.kind === "processing") && spec?.verbFor
      ? spec.verbFor(state.options)
      : verb;
  // A choice made before any file (spec.Idle, e.g. a platform tier) patches the page preset.
  const [presetPatch, setPresetPatch] = useState<Record<string, unknown>>({});
  const preset = useMemo(
    () => ({ ...tool.presetOptions, ...presetPatch }),
    [tool.presetOptions, presetPatch],
  );
  const clientRef = useRef<EngineClient | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Multi-file tools: files still being read, files that could not be added, stable row ids.
  const [reading, setReading] = useState<File[]>([]);
  const pending = reading.length;
  const [notices, setNotices] = useState<string[]>([]);
  const nextInputId = useRef(1);
  // Multi-output results: which output plays in the preview slot (spec.previewResult).
  const [shown, setShown] = useState(0);

  const getClient = useCallback(async () => {
    if (!clientRef.current) {
      const { EngineClient } = await import("@/tools/workers/client");
      clientRef.current = new EngineClient();
    }
    return clientRef.current;
  }, []);
  useEffect(() => () => clientRef.current?.dispose(), []);

  const accept = useMemo(() => acceptFor(tool.accepts), [tool.accepts]);
  // Several files on a single-file tool: the batch queue (batch-stage.tsx) takes over the stage.
  const batchable = idle?.several === "batch";
  const [batch, setBatch] = useState<File[]>();

  const onFile = useCallback(
    async (file: File) => {
      setState({ kind: "inspecting", file });
      try {
        const [spec, client] = await Promise.all([ensureSpec(), getClient()]);
        // The page's own inspector (a GIF), the media inspector, or ffmpeg.wasm for AVI, WMV, FLV...
        const info = await inspectFile(spec, client, file, tool.accepts);
        setState({ kind: "ready", file, info, options: spec.defaults(info, preset) });
      } catch (e) {
        setState({ kind: "error", file, error: toFailure(e) });
      }
    },
    [getClient, ensureSpec, preset],
  );

  /**
   * Multi-file tools: reads each file in turn and appends it to the list. The first readable file
   * moves the stage to ready; a file that cannot be read is named in a notice and skipped.
   */
  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      // The stage leaves idle at the input itself (it takes its reserved height in that step), not
      // after the spec arrives, which may be well outside the input window on a phone network.
      const first = files[0];
      if (first && (state.kind === "idle" || state.kind === "error"))
        setState({ kind: "inspecting", file: first, count: files.length });
      const spec = await ensureSpec();
      const multi = spec.multiple;
      if (!multi) return;
      const current = state.kind === "ready" ? (state.inputs?.length ?? 0) : 0;
      const room = Math.max(0, multi.max - current - pending);
      const take = files.slice(0, room);
      const skipped = files.length - take.length;
      setNotices(
        skipped > 0
          ? [
              `${skipped} ${skipped === 1 ? "file was" : "files were"} not added: the limit is ${multi.max}.`,
            ]
          : [],
      );
      if (take.length === 0) return;
      if (state.kind === "idle" || state.kind === "error") {
        const first = take[0];
        if (first) setState({ kind: "inspecting", file: first, count: take.length });
      }
      setReading((r) => [...r, ...take]);
      const client = await getClient();
      const failed: string[] = [];
      for (const file of take) {
        try {
          // The page's own reader when it has one (pictures for a slideshow), else the inspector.
          const info = spec.inspect
            ? await spec.inspect(file)
            : await client.inspect(file, { keyframes: spec.inspectKeyframes === true });
          const item: StageInput = { id: nextInputId.current++, file, info };
          setState((s) => {
            if (s.kind === "ready" && s.inputs) return { ...s, inputs: [...s.inputs, item] };
            if (s.kind === "inspecting")
              return {
                kind: "ready",
                file,
                info,
                options: spec.defaults(info, preset),
                inputs: [item],
              };
            return s;
          });
        } catch (e) {
          const err = e as EngineFailure;
          failed.push(`${file.name} could not be read. ${err.message ?? ""}`.trim());
        } finally {
          setReading((r) => withoutFirst(r, file));
        }
      }
      if (failed.length) setNotices((n) => [...n, ...failed]);
      // Nothing readable at all: say which files and why.
      setState((s) =>
        s.kind === "inspecting"
          ? {
              kind: "error",
              error: {
                code: "unsupported-input",
                message: failed.join(" "),
                hint: acceptHint(tool.accepts),
              },
            }
          : s,
      );
    },
    [getClient, ensureSpec, preset, state, pending],
  );

  const moveInput = useCallback((from: number, to: number) => {
    setState((s) => {
      if (s.kind !== "ready" || !s.inputs) return s;
      const inputs = [...s.inputs];
      const [item] = inputs.splice(from, 1);
      if (!item) return s;
      inputs.splice(to, 0, item);
      const first = inputs[0] ?? item;
      return { ...s, inputs, file: first.file, info: first.info };
    });
  }, []);

  const removeInput = useCallback((index: number) => {
    setState((s) => {
      if (s.kind !== "ready" || !s.inputs) return s;
      const inputs = s.inputs.filter((_, i) => i !== index);
      const first = inputs[0];
      if (!first) return { kind: "idle" };
      return { ...s, inputs, file: first.file, info: first.info };
    });
    setNotices([]);
  }, []);

  const run = useCallback(async () => {
    if (state.kind !== "ready" || !spec) return;
    const { file, info, options, inputs } = state;
    const controller = new AbortController();
    abortRef.current = controller;
    setShown(0);
    setState({
      kind: "processing",
      file,
      info,
      options,
      inputs,
      progress: { phase: "loading", ratio: 0 },
    });
    try {
      const onProgress = (progress: Progress) =>
        setState((s) => (s.kind === "processing" ? { ...s, progress } : s));
      let result: RunResult;
      if (inputs) {
        // Multi-file tools run in the worker with every input in the user's order, or on the page
        // when the spec routes them there (merge audio encodes MP3 with ffmpeg.wasm).
        result = await runManyJob(
          tool.engine,
          spec,
          getClient,
          { inputs, options },
          { signal: controller.signal, onProgress },
        );
      } else {
        // The engine worker, or the page-side runner the options route to.
        result = await runJob(
          tool.engine,
          spec,
          getClient,
          { file, info, options },
          { signal: controller.signal, onProgress },
        );
      }
      setState({ kind: "done", file, info, result, options, inputs });
    } catch (e) {
      const error = e as EngineFailure;
      if (error.code === "cancelled") setState({ kind: "ready", file, info, options, inputs });
      else setState({ kind: "error", file, info, options, error, inputs });
    } finally {
      abortRef.current = null;
    }
  }, [getClient, spec, state, tool.engine]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  // Back at the drop zone after Remove, Start over or a finished batch: focus goes to its file input
  // so a keyboard or screen reader user is not left on <body>.
  const refocus = useRef(false);
  // ⌘/Ctrl+O with a file in: the picker that replaces it (stage chords below).
  const replaceInput = useRef<HTMLInputElement>(null);
  const reset = useCallback(() => {
    abortRef.current?.abort();
    // Outputs written to on-device storage (large results, ADR-0058) are deleted with the result.
    void clientRef.current?.releaseOutputs().catch(() => undefined);
    setNotices([]);
    refocus.current = true;
    setState({ kind: "idle" });
  }, []);

  /**
   * "Change settings" on a result: back to ready with the same file(s) and the options just used, so
   * a tweak and a second run need no new drop. The previous outputs are released first. Not on a
   * recording (idle.Capture): its done state holds a capture, not a run with options.
   */
  const adjust = useMemo(() => {
    if (state.kind !== "done" || idle?.Capture || state.options === undefined) return undefined;
    const { file, info, options, inputs } = state;
    return () => {
      void clientRef.current?.releaseOutputs().catch(() => undefined);
      // The button unmounts with the result: focus goes to the first control the user came to change.
      focusPanel.current = true;
      setState({ kind: "ready", file, info, options, inputs });
    };
  }, [state, idle?.Capture]);
  const focusPanel = useRef(false);
  const panelRef = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    if (state.kind !== "ready" || !focusPanel.current) return;
    focusPanel.current = false;
    // On a touch screen a text field would open the soft keyboard over the panel: start at the
    // first control that is not one. Keyboard users get the first control, whatever it is.
    const text =
      'input:not([type]), input[type="text"], input[type="search"], input[type="number"], textarea';
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const first = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).find((el) => !(coarse && el.matches(text)));
    (first ?? document.querySelector<HTMLElement>('[data-action="run"]'))?.focus();
  }, [state.kind]);
  const actionBarRef = useActionBarRef();
  // Below lg the stage is one column: with options on screen, the job's controls come straight
  // under the picture and the file card follows them (checklist 14). One card, placed by the
  // breakpoint, so the reading and tab order stay the visual order. Client-only state, so the
  // server value (narrow) is never what a ready stage shows.
  const wide = useMediaQuery("(min-width: 64rem)");
  const cardAfterPanel = !wide && (state.kind === "ready" || state.kind === "processing");

  // The output that plays in the preview slot when done (spec.previewResult): the merged file, or
  // the part the user chose. A File wrapper around the result Blob; nothing is copied.
  const doneResult = state.kind === "done" ? state.result : undefined;
  const playRequested = useRef(false);
  const showOutput = useCallback((index: number) => {
    playRequested.current = true;
    setShown(index);
  }, []);
  const resultFile = useMemo(() => {
    if (!doneResult) return undefined;
    const out = doneResult.files?.[shown] ?? doneResult;
    return new File([out.blob], out.filename, { type: out.blob.type });
  }, [doneResult, shown]);
  // A part chosen from the result list plays in the preview, which is brought into view (it sits
  // above the list on a phone).
  useEffect(() => {
    if (!resultFile || !playRequested.current) return;
    playRequested.current = false;
    const el = videoRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    const play = () => void el.play().catch(() => undefined);
    if (el.readyState >= 2) play();
    else el.addEventListener("loadeddata", play, { once: true });
  }, [resultFile]);

  // A result handed on by the previous tool's next-step link (lib/handoff) opens here already loaded.
  const handoffTaken = useRef(false);
  useEffect(() => {
    // A recorder page takes no file (idle.Capture): a handed-on one waits for a page that does.
    if (handoffTaken.current || !available || idle?.Capture) return;
    handoffTaken.current = true;
    const files = takeHandoffFiles();
    const file = files[0];
    if (!file) return;
    void ensureSpec().then((spec) => {
      // Several files (shared to the installed app): all of them to a multi-file page or a batch.
      const usable = files.filter((f) => matchesAccept(f, accept));
      if (usable.length > 1 && spec.multiple) {
        void addFiles(usable);
        return;
      }
      if (usable.length > 1 && batchable) {
        setBatch(usable);
        return;
      }
      if (!matchesAccept(file, accept)) {
        // A file for the page's second slot (a subtitle file on add subtitles) goes there; anything
        // else this tool cannot take opens nothing.
        void spec.acceptHandoff?.(file).then((patch) => {
          if (patch) setPresetPatch((p) => ({ ...p, ...patch }));
        });
        return;
      }
      if (spec.multiple) void addFiles([file]);
      else void onFile(file);
    });
  }, [available, ensureSpec, addFiles, onFile, accept, idle?.Capture, batchable]);

  // One file opens the single stage; several start a batch on pages that allow it.
  const onDroppedFiles = useCallback(
    (files: File[]) => {
      if (files.length > 1) void ensureSpec().then(() => setBatch(files));
      else if (files[0]) void onFile(files[0]);
    },
    [onFile, ensureSpec],
  );
  const endBatch = useCallback(() => {
    void clientRef.current?.releaseOutputs().catch(() => undefined);
    refocus.current = true;
    setBatch(undefined);
  }, []);

  // Recorder pages (idle.Capture): the done state's parts load while the recording runs, and the
  // finished file opens as the result, with nothing to inspect or run.
  const prepareCapture = useCallback(() => {
    void ensureSpec().catch(() => undefined);
  }, [ensureSpec]);
  const onCaptured = useCallback(
    (c: Captured) => {
      setState({ kind: "inspecting", file: c.file });
      void ensureSpec().then(
        (spec) =>
          setState({
            kind: "done",
            file: c.file,
            info: c.info,
            options: spec.defaults(c.info, preset),
            result: {
              blob: c.file,
              filename: c.file.name,
              meta: c.meta,
              ffmpegCommand: c.ffmpegCommand,
            },
          }),
        (e) => setState({ kind: "error", file: c.file, error: toFailure(e) }),
      );
    },
    [ensureSpec, preset],
  );

  // The "?" dialog in the header lists this page's own keys while the stage is here.
  const pageKeys = spec?.shortcuts;
  const hasPlayer = tool.accepts.some((a) => a === "video" || a === "audio");
  useEffect(() => {
    setPageShortcuts(pageKeys ?? [], hasPlayer);
    return () => setPageShortcuts([], false);
  }, [pageKeys, hasPlayer]);

  // App chords on a tool page (README design system, keyboard): ⌘/Ctrl+O chooses a file, ⌘/Ctrl+Enter
  // runs the page's action, ⌘/Ctrl+S saves the result, Escape cancels a run. They act on the
  // workspace's own controls (data-action), so they only do what a click there would, and never
  // while a dialog (the palette) has focus.
  const stateKind = state.kind;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.isComposing) return;
      if (e.target instanceof Element && e.target.closest('[role="dialog"]')) return;
      const ws = document.querySelector<HTMLElement>('section[aria-label="Workspace"]');
      if (!ws) return;
      const control = (action: string) =>
        ws.querySelector<HTMLElement>(`[data-action="${action}"]:not(:disabled)`);
      const chord = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (!chord && e.key === "Escape") {
        const cancel = control("cancel");
        if (!cancel) return;
        e.preventDefault();
        cancel.click();
        return;
      }
      if (!chord || e.shiftKey) return;
      if (key === "enter") {
        const run = control("run");
        if (!run) return;
        e.preventDefault();
        run.click();
      } else if (key === "s") {
        const save = control("download");
        if (!save) return;
        e.preventDefault();
        save.click();
      } else if (key === "o") {
        if (stateKind === "processing" || stateKind === "inspecting") return;
        e.preventDefault();
        // The page's own file: the hidden replacement picker when a file is in (so a secondary well,
        // such as a watermark's logo, is not what ⌘O opens), else the drop zone's or the list's.
        (replaceInput.current ?? ws.querySelector<HTMLInputElement>('input[type="file"]'))?.click();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [stateKind]);

  if (!available) {
    return (
      <Shell>
        <p className="text-fg-muted text-sm">This tool is not available yet.</p>
      </Shell>
    );
  }

  if (batch && spec && parts)
    return (
      <parts.BatchStage
        tool={tool}
        spec={spec}
        verb={verb}
        preset={preset}
        initial={batch}
        getClient={getClient}
        onReset={endBatch}
      />
    );

  // A recorder page (ADR-0099): the idle workspace is the recorder; its file is the result.
  if (state.kind === "idle" && idle?.Capture)
    return <idle.Capture preset={preset} onStart={prepareCapture} onCaptured={onCaptured} />;

  if (state.kind === "idle")
    return (
      <DropZone
        accept={accept}
        onFile={onFile}
        onFiles={idle?.several === "multiple" ? addFiles : batchable ? onDroppedFiles : undefined}
        batch={batchable}
        prompt={idle?.dropPrompt?.(preset)}
        focusOnMount={refocus}
        idle={
          idle?.Idle ? (
            <idle.Idle
              preset={preset}
              onPresetChange={(patch) => setPresetPatch((p) => ({ ...p, ...patch }))}
            />
          ) : undefined
        }
      />
    );

  // A file is in and the engine's spec and the stage parts are on their way (tens of ms).
  const readingCount = state.kind === "inspecting" ? Math.max(pending, state.count ?? 1) : 1;
  if (!spec || !parts) return <Reading count={readingCount} />;
  const {
    FileCard,
    FileList,
    ImagePreview,
    NextStep,
    ResultCard,
    ResultFiles,
    ShortcutHint,
    VideoPreview,
  } = parts;

  const file = state.file;
  const info = "info" in state ? state.info : undefined;
  const inputs = "inputs" in state ? state.inputs : undefined;
  // Ready: why the action should not run, if it should not (reason, settled success, or a way out).
  const block =
    state.kind === "ready"
      ? blockOf(spec.blocked?.(state.options, state.info, inputs, state.file))
      : undefined;
  // Done: the tool's verdict on its own job, and the next step for that outcome.
  const verdict =
    state.kind === "done"
      ? spec.result?.(state.options, state.info, {
          bytes: state.result.files
            ? state.result.files.reduce((sum, f) => sum + f.blob.size, 0)
            : state.result.blob.size,
          files: state.result.files?.length ?? 1,
          inputs: state.inputs,
        })
      : undefined;
  const next = verdict?.next === null ? undefined : (verdict?.next ?? spec.nextStep);
  const multi = spec.multiple !== undefined;
  // Several files before the first is read: the same line in the same place as before the spec came.
  if (multi && state.kind === "inspecting") return <Reading count={readingCount} />;
  // Multi-file tools show the ordered input list instead of one preview until there is a result.
  // A file that could not be read has nothing to preview: no empty "0:00" player under the error.
  const showPreview =
    (!multi || state.kind === "done") &&
    !(state.kind === "error" && !("info" in state && state.info));
  const showsResult =
    state.kind === "done" &&
    (spec.previewResult === true ||
      (typeof spec.previewResult === "function" && spec.previewResult(state.options))) &&
    !!resultFile;
  const progress = state.kind === "processing" ? state.progress : undefined;

  return (
    <Shell>
      {/* ⌘/Ctrl+O's picker when nothing on screen takes a file: replaces it only once one is chosen.
          A multi-file list has its own "Add" picker until the job is done. */}
      {(!multi || state.kind === "done") && (
        <input
          ref={replaceInput}
          type="file"
          accept={accept}
          multiple={multi}
          data-replace
          tabIndex={-1}
          aria-hidden
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length === 0) return;
            if (multi) {
              reset();
              void addFiles(files);
            } else if (files[0]) onFile(files[0]);
          }}
        />
      )}
      {state.kind === "processing" && (
        <div className="absolute inset-x-0 top-0 overflow-hidden rounded-t-lg">
          <ProgressLine ratio={state.progress.ratio} label={`${runVerb} progress`} />
        </div>
      )}
      {/* Panel width is the --container-panel token; minmax(0,1fr) stops long meta from widening the column. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_var(--container-panel)]">
        <div className="flex flex-col gap-4">
          {file && showPreview && spec.Hero && (!multi || showsResult) ? (
            // Inputs without a picture (audio) get the page's own hero instead of an empty video box.
            <spec.Hero
              key={showsResult ? "result" : "source"}
              file={showsResult && resultFile ? resultFile : file}
              showing={showsResult && resultFile ? "result" : "source"}
              info={info}
              value={"options" in state ? state.options : undefined}
              preset={preset}
              phase={state.kind}
              progress={progress}
              media={videoRef}
              onChange={
                state.kind === "ready"
                  ? (options: unknown) =>
                      setState((s) => (s.kind === "ready" ? { ...s, options } : s))
                  : undefined
              }
            />
          ) : (
            file &&
            showPreview &&
            (state.kind === "done" && state.result.blob.type.startsWith("image/") ? (
              // An image result (a GIF, a still) takes the preview's place so before → after reads on one surface.
              <ImagePreview
                blob={state.result.blob}
                info={info}
                alt={`Preview of ${state.result.filename}`}
              />
            ) : (
              <VideoPreview
                key={showsResult ? `result-${shown}` : "source"}
                file={showsResult && resultFile ? resultFile : file}
                info={info}
                videoRef={videoRef}
                bar={!spec.ownPlayback || showsResult}
                videoStyle={
                  (state.kind === "ready" || state.kind === "processing") && info
                    ? spec.previewStyle?.(state.options, info)
                    : undefined
                }
                track={
                  !info
                    ? undefined
                    : state.kind === "ready" || state.kind === "processing"
                      ? spec.previewTrack?.(state.options, info, "ready")
                      : state.kind === "done" && showsResult
                        ? spec.previewTrack?.(state.options, info, "done")
                        : undefined
                }
                overlay={
                  spec.Overlay && (state.kind === "ready" || state.kind === "processing") ? (
                    <spec.Overlay
                      disabled={state.kind === "processing"}
                      value={state.options}
                      onChange={(options: unknown) =>
                        setState((s) => (s.kind === "ready" ? { ...s, options } : s))
                      }
                      info={state.info}
                      preset={preset}
                      media={{ file: state.file, video: videoRef, inputs }}
                      progress={progress}
                    />
                  ) : undefined
                }
              />
            ))
          )}
          {spec.Below && (state.kind === "ready" || state.kind === "processing") && (
            <div className={state.kind === "processing" ? "opacity-60" : undefined}>
              <spec.Below
                disabled={state.kind === "processing"}
                value={state.options}
                onChange={(options: unknown) =>
                  setState((s) => (s.kind === "ready" ? { ...s, options } : s))
                }
                info={state.info}
                preset={preset}
                media={{ file: state.file, video: videoRef, inputs }}
                progress={progress}
              />
            </div>
          )}
          {multi && inputs && state.kind !== "done" && (
            <FileList
              inputs={inputs}
              notes={
                state.kind === "ready" || state.kind === "processing"
                  ? spec.inputNotes?.(state.options, inputs)
                  : undefined
              }
              disabled={state.kind !== "ready"}
              active={progress?.item?.index}
              reading={reading}
              notices={notices}
              accept={accept}
              max={spec.multiple?.max ?? 1}
              noun={spec.multiple?.noun}
              collapseAfter={spec.multiple?.collapseAfter}
              unordered={spec.multiple?.unordered}
              selected={
                state.kind === "ready"
                  ? spec.multiple?.selected?.(state.options, inputs)
                  : undefined
              }
              onSelect={
                spec.multiple?.select
                  ? (index: number) =>
                      setState((s) =>
                        s.kind === "ready" && s.inputs && spec.multiple?.select
                          ? { ...s, options: spec.multiple.select(s.options, index, s.inputs) }
                          : s,
                      )
                  : undefined
              }
              roles={spec.multiple?.roles?.(inputs, "options" in state ? state.options : undefined)}
              onMove={moveInput}
              onRemove={removeInput}
              onAdd={addFiles}
            />
          )}
          {/* A page with a control under the preview (a timeline) shows the card once that control
              is in, so the card never drops below it after the file is read (CLS, design review 4). */}
          {file && !multi && !(spec.Below && state.kind === "inspecting") && !cardAfterPanel && (
            <FileCard
              file={file}
              info={info}
              unreadable={state.kind === "error" && !info}
              onRemove={state.kind === "processing" || state.kind === "done" ? undefined : reset}
            />
          )}
        </div>
        {/* On phones this column dissolves into the grid (display: contents), so the sticky action bar
            sticks to the viewport for the whole workspace, not only while the panel is on screen. */}
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          {state.kind === "inspecting" && (
            <p className="text-fg-muted text-sm" aria-live="polite">
              {pending > 1 ? `Reading ${pending} files` : "Reading the file"}
            </p>
          )}

          {(state.kind === "ready" || state.kind === "processing") && (
            <>
              <fieldset
                ref={panelRef}
                disabled={state.kind === "processing"}
                className="flex flex-col gap-6 disabled:opacity-60"
              >
                <spec.Panel
                  value={state.options}
                  onChange={(options: unknown) =>
                    setState((s) => (s.kind === "ready" ? { ...s, options } : s))
                  }
                  info={state.info}
                  preset={preset}
                  media={{ file: state.file, video: videoRef, inputs }}
                  progress={progress}
                />
              </fieldset>
              {cardAfterPanel && file && !multi && (
                <FileCard
                  file={file}
                  info={info}
                  onRemove={state.kind === "processing" ? undefined : reset}
                />
              )}
              {/* noAction panels (video-info) are the result: no summary line, no primary button.
                  On phones the status line rides in the sticky bar with the button, so the numbers it
                  states are never scrolled under the bar (scroll-padding in globals.css keeps focused
                  controls above it too). On desktop the bar is static and spaced as the column. */}
              {!spec.noAction && (
                <div
                  ref={actionBarRef}
                  data-action-bar=""
                  className="-mx-6 sticky bottom-0 mt-auto flex flex-col gap-2 border-border border-t bg-bg-raised px-6 py-3 lg:static lg:m-0 lg:gap-6 lg:border-0 lg:p-0"
                >
                  <p
                    className={cn(
                      "tabular text-fg-muted text-sm",
                      // Settled: the verdict below shows the answer; the live region only announces it.
                      block?.settled && pending === 0 && "sr-only",
                    )}
                    role="status"
                    aria-live="polite"
                  >
                    {state.kind === "processing" ? (
                      (state.progress.detail ?? phaseLabel(state.progress.phase))
                    ) : pending > 0 ? (
                      `Reading ${pending} more ${pending === 1 ? "file" : "files"}`
                    ) : block?.settled ? (
                      // The always-mounted live region announces the answer; it shows below.
                      <span className="sr-only">{block.reason}</span>
                    ) : (
                      (block?.reason ?? spec.summary?.(state.options, state.info, inputs))
                    )}
                  </p>
                  {/* Settled: the file already does the job. The answer sits where the button would
                      be, in the verdict's look, so there is nothing to press and no dead button. */}
                  {block?.settled && pending === 0 ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-fg text-bg-raised">
                          <Check size={16} strokeWidth={1.5} aria-hidden />
                        </span>
                        <p className="text-body">{block.reason}</p>
                      </div>
                      {/* The answer first, then the way out. */}
                      {block.action && <NextStep {...block.action} file={state.file} />}
                    </div>
                  ) : (
                    <>
                      {block?.action && pending === 0 && (
                        <NextStep {...block.action} file={state.file} />
                      )}
                      <div className="flex items-center gap-3">
                        {state.kind === "ready" ? (
                          <Button
                            variant="primary"
                            size="lg"
                            className="w-full"
                            onClick={run}
                            data-action="run"
                            disabled={pending > 0 || block !== undefined}
                          >
                            {runVerb}
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="lg"
                            className="w-full"
                            onClick={cancel}
                            data-action="cancel"
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {spec.shortcuts && state.kind === "ready" && <ShortcutHint items={spec.shortcuts} />}
            </>
          )}

          {state.kind === "done" && state.result.files && state.result.files.length > 1 && (
            <ResultFiles
              files={state.result.files}
              sourceName={state.file.name}
              beforeBytes={state.file.size}
              meta={state.result.meta}
              ffmpegCommand={state.result.ffmpegCommand}
              shown={spec.previewResult ? shown : undefined}
              onShow={spec.previewResult ? showOutput : undefined}
              nextStep={next}
              sourceFile={state.file}
              verdict={verdict}
              onStartOver={reset}
              onAdjust={adjust}
              zipName={spec.zipName?.(state.options, state.file.name)}
            />
          )}

          {state.kind === "done" && !(state.result.files && state.result.files.length > 1) && (
            <ResultCard
              blob={state.result.blob}
              filename={state.result.filename}
              beforeBytes={
                state.inputs
                  ? state.inputs.reduce((sum, i) => sum + i.file.size, 0)
                  : state.file.size
              }
              nextStep={next}
              sourceFile={state.file}
              showChange={!state.inputs}
              audioPreview={!(spec.Hero && showsResult)}
              meta={state.result.meta}
              ffmpegCommand={state.result.ffmpegCommand}
              onStartOver={reset}
              verdict={verdict}
              onAdjust={adjust}
            />
          )}

          {state.kind === "error" && (
            <div className="flex flex-col gap-4" role="alert">
              <p className="text-body">
                {state.error.message}
                {state.error.hint && <span className="text-fg-muted"> {state.error.hint}</span>}
              </p>
              <div className="flex gap-3">
                {state.info && state.options !== undefined && (
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => {
                      if (state.file && state.info)
                        setState({
                          kind: "ready",
                          file: state.file,
                          info: state.info,
                          options: state.options,
                          inputs: state.inputs,
                        });
                    }}
                  >
                    Try again
                  </Button>
                )}
                <Button variant="ghost" size="md" onClick={reset}>
                  Start over
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

/** The stage between the first file and its controls: the same shell, saying what is happening. */
function Reading({ count = 1 }: { count?: number }) {
  return (
    <Shell>
      <p className="text-fg-muted text-sm" aria-live="polite">
        {count > 1 ? `Reading ${count} files` : "Reading the file"}
      </p>
    </Shell>
  );
}

function DropZone({
  accept,
  onFile,
  onFiles,
  batch = false,
  prompt,
  idle,
  focusOnMount,
}: {
  accept: string;
  onFile: (f: File) => void;
  /**
   * Multi-file tools, and single-file tools that batch: every dropped, pasted or chosen file (the
   * input takes a multi-select).
   */
  onFiles?: (files: File[]) => void;
  /** A single-file tool that also takes several files as a batch: the copy stays singular. */
  batch?: boolean;
  /** Names the job (spec.dropPrompt). */
  prompt?: string;
  /** The page's idle content (spec.Idle): its target and any choice to make before a file. */
  idle?: React.ReactNode;
  /** Set when the stage returned here from a file (Remove, Start over): focus the file input once. */
  focusOnMount?: { current: boolean };
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  // Once, when the drop zone appears.
  useEffect(() => {
    if (!focusOnMount?.current) return;
    focusOnMount.current = false;
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (onFiles && files.length) onFiles(files);
      else if (files[0]) onFile(files[0]);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFile, onFiles]);

  return (
    <section
      aria-label="Workspace"
      className={cn(
        "mx-auto flex min-h-(--stage-min-h) w-full max-w-(--container-content) flex-col items-center justify-start rounded-lg border px-8 pt-16 pb-8 text-center transition-colors duration-(--duration-instant) md:min-h-80 md:justify-center md:pt-8",
        over
          ? "border-solid border-fg bg-bg-raised"
          : "border-dashed border-border-strong bg-bg-subtle",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (onFiles && files.length) onFiles(files);
        else if (files[0]) onFile(files[0]);
      }}
    >
      <Upload size={24} strokeWidth={1.5} aria-hidden className="text-fg-muted" />
      <p className="mt-4 text-body">
        {prompt ?? (onFiles && !batch ? "Drop videos here" : "Drop a video here")}
        {/* On phones the full-width button below is the way in, so the inline link is not repeated. */}
        <span className="pointer-coarse:hidden">
          {" "}
          or{" "}
          <label
            htmlFor={inputId}
            className="cursor-pointer rounded-sm font-medium underline decoration-1 underline-offset-3 has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2"
          >
            {onFiles && !batch ? "choose files" : "choose a file"}
          </label>
        </span>
      </p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={onFiles !== undefined}
        className="peer sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (onFiles && files.length) onFiles(files);
          else if (files[0]) onFile(files[0]);
        }}
      />
      {/* Phones cannot drag and drop: a full-width 44px target opens the picker (design review 2). */}
      <label
        htmlFor={inputId}
        className={cn(
          buttonVariants({ variant: "secondary", size: "lg" }),
          "mt-4 w-full max-w-xs cursor-pointer pointer-fine:hidden peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-focus-visible:outline-offset-2",
        )}
      >
        {onFiles && !batch ? "Choose files" : "Choose a file"}
      </label>
      <p className="mt-2 text-fg-muted text-sm">
        {/* Every job runs on this device (ADR-0024): there is no server path to mention. */}
        {batch
          ? "One file or several at once. Files stay on this device."
          : onFiles
            ? "Your files stay on this device."
            : "Your file stays on this device."}
      </p>
      {idle && <div className="mt-6 w-full max-w-sm">{idle}</div>}
    </section>
  );
}
