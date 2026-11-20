import type { ComponentType, CSSProperties, RefObject } from "react";
import type { MediaInfo, Progress } from "@/tools/engines/types";

/** One inspected input of a multi-file tool (merge), in the order the user arranged. */
export interface StageInput {
  /** Stable per drop, so list rows keep their identity when reordered. */
  id: number;
  file: File;
  info: MediaInfo;
}

export interface OptionsPanelProps<O> {
  value: O;
  onChange: (next: O) => void;
  info: MediaInfo;
  /** True while processing: controls must not accept input or move the preview. */
  disabled?: boolean;
  /** The page's preset options (may lock or hide controls). */
  preset: Record<string, unknown>;
  /**
   * The dropped file and the preview element, for controls that need frames or seeking. Multi-file
   * tools (`multiple`) also get every input, in order; `file` is then the first one. In a batch
   * (several files on a single-file tool) `batch` lists every readable file; the options apply to all
   * of them and `file`/`info` are the first one's.
   */
  media: {
    file: File;
    video: RefObject<HTMLVideoElement | null>;
    inputs?: StageInput[];
    batch?: StageInput[];
  };
  /** Live progress while processing, e.g. to mark the part or clip being written (`progress.item`). */
  progress?: Progress;
}

/**
 * Everything the stage needs to render one engine's controls (ADR-0016). The stage is one state
 * machine; a page is tuned to its job only through these optional hooks, by state:
 *
 * - Idle: not here. `IdleSpec` (`dropPrompt`, `Idle`, `several`) lives in `options/idle/<engine>.tsx`,
 *   so a page's first load carries its idle state and none of the rest; this spec loads on the first
 *   file (`options/index.ts`). `multiple` (several in) stays here.
 * - Inspecting: `inspect` (read on the page, e.g. text), `inspectKeyframes`.
 * - Ready, what dominates: `Hero` (replaces the preview: waveform, cue list), `Overlay` (on the
 *   picture: crop frame, watermark), `Below` (under it: timelines), `previewStyle`, `previewTrack`.
 * - Ready, the panel and its line: `Panel`, `summary`, `blocked` (reason, a way out, or `settled`),
 *   `inputNotes` (per input), `noAction` (the panel is the result).
 * - Processing: the engine's `Progress` (`detail`, `item`) drives the line and the panel.
 * - Done: `result` (the verdict, including `next` for this outcome), `previewResult` (the output
 *   plays in the preview slot), `nextStep` (the default next tool; the file is handed on), `zipName`
 *   (the ZIP of several outputs).
 * - Several files on a single-file tool run as a batch queue with one set of options, unless the
 *   page's primary control is per file (`Below`, `Overlay`, `noAction`, `multiple`) or it sets
 *   `batch: false`. `blocked` is asked per file; a blocked or settled file is skipped with its reason.
 * - Handoff: `acceptHandoff` takes a handed-on file this page's drop zone does not (a subtitle file).
 * - Any state with controls: `shortcuts` (the keys the page's panel and timeline handle, shown as a
 *   hint). Keys are handled in the panel or timeline, never on the window.
 */
export interface OptionsSpec<O> {
  /** Primary button label. A verb (design principles §1.6). */
  verb: string;
  /**
   * Optional: the label for the current options when one fixed verb would overstate the job ("Add
   * intro" when there is no outro). Ready and processing only; overrides `verb` and the registry
   * `action` there. The idle state and the page prose keep the fixed verb.
   */
  verbFor?: (options: O) => string;
  Panel: ComponentType<OptionsPanelProps<O>>;
  /** Optional wide control rendered directly under the preview (e.g. a timeline). */
  Below?: ComponentType<OptionsPanelProps<O>>;
  /**
   * Optional layer drawn over the preview picture (e.g. a crop frame). While it is shown the preview's
   * native controls are hidden, so pair it with a `Below` scrubber for choosing the frame.
   */
  Overlay?: ComponentType<OptionsPanelProps<O>>;
  defaults: (info: MediaInfo, preset: Record<string, unknown>) => O;
  /** Where this run executes: the engine worker (default) or a page-side runner (see engines/page-runners). */
  route?: (value: O, info: MediaInfo, fileName: string) => "worker" | "page";
  /**
   * When the action should not run for this file, return why; otherwise undefined (tool-page spec
   * §2, Ready row). A string disables the primary button with that reason. A `Blocked` can also offer
   * one action link (the file is handed on, e.g. "Trim video" when it is too long), or say the job is
   * already `settled` (the file already fits): then the stage shows it as a success, with no primary.
   */
  blocked?: (
    value: O,
    info: MediaInfo,
    inputs?: StageInput[],
    /** The file itself (its name tells containers apart that the inspector reports as one). */
    file?: File,
  ) => string | Blocked | undefined;
  /** One line under the controls: estimate, "lossless", or a caveat. Multi-file tools get `inputs`. */
  summary?: (value: O, info: MediaInfo, inputs?: StageInput[]) => string | undefined;
  /**
   * Several files in (merge). The idle drop zone takes a multi-select, later drops add to the list,
   * and the ready state shows the reorderable input list instead of the preview. Batch can reuse it.
   */
  multiple?: {
    min: number;
    max: number;
    /**
     * Inputs with jobs instead of an order (add audio: a video and its new sound). The list then
     * names each row's role, offers no reordering and no running total, and "Add" is singular.
     * `value` is the current options once they exist (ready and later), for roles an option swaps
     * (picture in picture: which video is the inset); undefined before.
     */
    roles?: (inputs: StageInput[], value?: O) => (string | undefined)[];
    /** What one input is called in the list ("clip" by default). */
    noun?: string;
    /** Long lists show this many rows behind "Show all n" (FileList `collapseAfter`). */
    collapseAfter?: number;
    /** Order means nothing (an analysis per file): rows cannot be reordered, only removed. */
    unordered?: true;
    /** The row whose details the panel shows, and how choosing a row changes the options. */
    selected?: (value: O, inputs: StageInput[]) => number | undefined;
    select?: (value: O, index: number, inputs: StageInput[]) => O;
  };
  /** Per-input note under a row of the input list (e.g. "differs from clip 1"), same order as inputs. */
  inputNotes?: (value: O, inputs: StageInput[]) => (string | undefined)[];
  /**
   * Reads the dropped file on the page instead of the media inspector, for inputs it cannot open (a
   * GIF, read from its header without decoding; a picture for a slideshow). Multi-file tools read
   * every added file with it.
   */
  inspect?: (file: File) => Promise<MediaInfo>;
  /** Ask the inspector for key frame times (`info.video.keyframes`), e.g. for lossless cut markers. */
  inspectKeyframes?: true;
  /**
   * When done, the preview slot plays the output (or the chosen part) instead of the source. A function
   * decides per run, for outputs a browser cannot play (an AVI from the converter keeps the source).
   */
  previewResult?: true | ((value: O) => boolean);
  /** The page draws its own play control (trim's "Play the selection"): the preview shows no playback bar. */
  ownPlayback?: boolean;
  /** The likely next step, one link on the result. The link carries the output to that tool (lib/handoff). */
  nextStep?: NextStepLink;
  /**
   * Done, several output files: the name of their ZIP ("clip-frames.zip"). Default
   * `<source>-parts.zip`, which suits parts of a video (split) but not frames or subtitle tracks.
   */
  zipName?: (value: O, fileName: string) => string;
  /**
   * The panel is the result and nothing runs: the stage renders no primary button and no summary line
   * (video-info). Never combine with `route` or `blocked`.
   */
  noAction?: true;
  /**
   * Inline style applied to the preview <video> so it shows the result live (a rotation, a flip).
   * Transform, opacity and `filter` only (a colour look referencing an SVG filter the panel renders);
   * nothing that changes layout, so the container keeps the source aspect ratio.
   */
  previewStyle?: (value: O, info: MediaInfo) => CSSProperties | undefined;
  /**
   * Subtitle cues the browser draws over the preview as a native text track, so the native controls
   * stay (add subtitles). Ready: the cues as they will be added. Done (with `previewResult`): return
   * them again for a soft track, or undefined when the text is burned into the picture.
   */
  previewTrack?: (value: O, info: MediaInfo, phase: "ready" | "done") => PreviewTrack | undefined;
  /**
   * Replaces the video preview for inputs without a picture (an audio file): the page's own hero, e.g.
   * a waveform with a player. Shown from inspecting to done; when done with `previewResult` it gets
   * the output, and the result card then leaves playback to it. Multi-file tools show it only when
   * done with `previewResult`, for the output (merge audio).
   */
  Hero?: ComponentType<HeroProps<O>>;
  /**
   * The keys this page handles (in its panel, timeline or preview), for the stage's discoverable hint
   * in the ready state. Only a hint: listing a key here does not bind it. Keys are handled while
   * focus is in the workspace and never while a text field has focus (components/tool/shortcuts).
   */
  shortcuts?: Shortcut[];
  /**
   * `false` keeps the page to one file at a time although its controls are not per-file hooks: the
   * options only make sense for one particular file (add subtitles: the subtitle file belongs to one
   * video). Pages with `Below`, `Overlay`, `noAction` or `multiple` are never batched.
   */
  batch?: false;
  /**
   * A file handed on by the previous tool (lib/handoff) that the drop zone does not accept, e.g. a
   * converted subtitle file arriving on add subtitles. Return a preset patch that puts it in its slot
   * (it reaches `defaults` and `Idle` like an idle choice), or undefined to drop it.
   */
  acceptHandoff?: (file: File) => Promise<Record<string, unknown> | undefined>;
  /**
   * Settings this page keeps for the next file (ADR-0129): the ones that do not depend on the file
   * (a quality preset, an output format, a look, sound on or off), never ranges, frames, regions or
   * anything measured from the file. Default: nothing is kept. The same subset is what a saved
   * preset holds. Keys the page's preset sets are never restored over it.
   */
  remember?: RememberSpec<O>;
  /** Done state: the verdict line, from the options used and the real output size (next steps: `nextStep`). */
  result?: (
    value: O,
    info: MediaInfo,
    output: {
      bytes: number;
      /** Number of output files (split); 1 otherwise. */
      files: number;
      /** The inputs of a multi-file run (merge). */
      inputs?: StageInput[];
    },
  ) => ResultVerdict | undefined;
  /**
   * Done, with `previewResult`: how the result is compared with the source (components/tool/compare,
   * ADR-0134). Default: a picture result of a video gets a wipe (side by side when the frame changes
   * shape), a sound result gets a Before/After switch. `false` for pages where a compare makes no
   * sense: stream copies (identical), results whose timeline differs from the source (trim, loop,
   * reverse, joins), and results with no source picture or sound to compare against. A function
   * decides per run (convert: only when it re-encodes).
   */
  compare?: false | ((value: O, info: MediaInfo) => CompareSpec | false);
}

/** How a done state compares the result with the source (`OptionsSpec.compare`). */
export interface CompareSpec {
  /** What the job changed: the picture (wipe or side by side) or the sound (Before/After switch). */
  what: "picture" | "sound";
  /** The frame changes shape or orientation (crop, rotate, flip, pad): side by side, never a wipe. */
  layout?: "side-by-side";
  /** Sound: loudness is the job (volume, fades), so the switch keeps the difference audible. */
  keepLoudness?: true;
  /** Source seconds per result second (a 2× speed-up shows source second 4 at its second 2). */
  timeScale?: number;
}

/** One key's validator: a zod (mini) schema, typed structurally so this file needs no zod import. */
export interface RememberField {
  safeParse(value: unknown): { success: boolean; data?: unknown };
}

/**
 * What a page remembers (`OptionsSpec.remember`): a zod object of the kept settings, built with
 * `./remember-schema`. A stored value is checked key by key, so a stale or edited one is dropped and
 * the page's default stands. `pick` and `apply` map options to the stored subset and back when the
 * settings are nested; by default they are the schema's keys at the top level of the options.
 */
export interface RememberSpec<O> {
  schema: { shape: Record<string, RememberField> };
  pick?: (value: O) => Record<string, unknown>;
  apply?: (value: O, kept: Record<string, unknown>) => O;
}

export interface HeroProps<O> {
  /** The source; the output when done and the spec sets `previewResult`. */
  file: File;
  /** Which of the two `file` is: decide what to say from this, never from the file name. */
  showing: "source" | "result";
  /** Undefined while the file is still being read. */
  info?: MediaInfo;
  value?: O;
  /** The page's preset options, known from the first render (before `value` exists). */
  preset?: Record<string, unknown>;
  phase: "inspecting" | "ready" | "processing" | "done" | "error";
  progress?: Progress;
  /**
   * The stage's preview element ref (`media.video` in the panels). A hero that plays the file attaches
   * its media element here, so the page's `Below` timeline and shortcuts drive the same playback.
   */
  media?: RefObject<HTMLMediaElement | null>;
  /**
   * Ready state only: changes the options from the hero, for a hero that is also the primary control
   * (handles on a waveform, e.g. fade lengths). Undefined in every other state, and in a batch (which
   * shows no hero), so the panel must offer the same values. (Method syntax keeps heroes typed for
   * `HeroProps<unknown>`, such as the shared audio hero, assignable to every page's spec.)
   */
  onChange?(next: O): void;
}

/** One entry of the shortcut hint: `keys` as printed ("I", "Shift ←"), `label` what it does. */
export interface Shortcut {
  keys: string;
  label: string;
}

export interface PreviewTrack {
  /** WebVTT text. */
  vtt: string;
  /** BCP 47 or ISO 639 code for the track's srclang. */
  language: string;
  label: string;
}

/**
 * What a page shows before any file (ADR-0016 idle hooks). Each engine's lives in its own light
 * module, `options/idle/<engine>.tsx`, which the server page hands to the stage, so it renders on the
 * server and ships alone; the engine's `OptionsSpec` loads only once a file is chosen.
 */
export interface IdleSpec {
  /** Drop-zone prompt naming the job, e.g. "Drop a video to fit it under 10 MB". Default "Drop a video here". */
  dropPrompt?: (preset: Record<string, unknown>) => string;
  /**
   * Idle state: names the page's target and may offer one choice (a platform's tiers).
   * `onPresetChange` patches the page preset that `defaults` receives once a file is dropped.
   * Rendered inside the drop zone, under the prompt.
   */
  Idle?: ComponentType<IdleProps>;
  /**
   * What several files mean here, known before the spec loads: `multiple` (the spec's `multiple`,
   * merge) or `batch` (a batch queue, `isBatchable`). Unit-tested against the spec.
   */
  several?: "multiple" | "batch";
  /**
   * A recorder in place of the drop zone (screen, camera, voice; ADR-0099). It renders the whole
   * idle workspace, from setup through recording, and hands the finished file to the stage, which
   * opens it in the done state as the result. Pages without it keep the drop zone unchanged.
   */
  Capture?: ComponentType<CaptureProps>;
}

export interface CaptureProps {
  /** The page preset with any idle choice applied. */
  preset: Record<string, unknown>;
  /** Called when recording starts, so the done state's parts load while it runs. */
  onStart: () => void;
  /** The recording is written: the stage shows it as the result. */
  onCaptured: (capture: Captured) => void;
}

/** A finished recording, with the facts the recorder knows (read back from the file). */
export interface Captured {
  file: File;
  info: MediaInfo;
  /** The result line's facts: "0:42 · 1920×1080 · 30 fps · H.264, AAC". */
  meta?: string;
  ffmpegCommand?: string;
}

export interface IdleProps {
  /** The page preset with any idle choice applied. */
  preset: Record<string, unknown>;
  onPresetChange: (patch: Record<string, unknown>) => void;
}

export interface ResultVerdict {
  /** Replaces "Done", e.g. "Fits under 10 MB: 9.1 MB". */
  title: string;
  /** One or two sentences under the numbers. */
  detail?: string;
  /** The job was not met (over the limit, no smaller): the card says so and offers to adjust. */
  missed?: boolean;
  /** The next step for this outcome, overriding `nextStep`; `null` offers none. */
  next?: NextStepLink | null;
  /**
   * `false` hides the before → after percentage: for jobs where the size is meant to change
   * (conversions to lossless formats, resizes, subtitle files), a "+900%" reads as a failure.
   */
  change?: false;
  /**
   * `false` drops the before → after sizes when the output is a different kind of file from the
   * input, so the line gives the output's own facts. Stills from a video do this without asking.
   */
  before?: false;
}

/** One link to a sibling tool. The stage hands the current file (or result) on with it. */
export interface NextStepLink {
  slug: string;
  label: string;
  /**
   * What the link hands on: the result (default), or the source file when the next tool works on
   * the original (a contact sheet's "save one frame at full size" needs the video, not the sheet).
   */
  with?: "result" | "source";
}

/** A richer `blocked` answer: the reason, and optionally a way forward or "nothing to do". */
export interface Blocked {
  reason: string;
  /** The job is already done for this file (it already fits): shown as success, no primary button. */
  settled?: true;
  /** One link that solves it elsewhere, with the file handed on. */
  action?: NextStepLink;
  /**
   * `false` when no option on this page can clear the block (the file's format, a missing track,
   * what this browser can decode or encode): the stage then shows the reason, and `action` if any,
   * in place of the primary button instead of a disabled one (ADR-0141). Omit it when changing an
   * option can clear the block.
   */
  fixable?: false;
  /**
   * With `fixable: false`: the way out is reloading the page, not another file (the page did not
   * load in the mode the tool needs). The stage shows "Reload the page" in place of "Choose another
   * file" (ADR-0147).
   */
  reload?: true;
}

/** Normalises a `blocked` answer. */
export const blockOf = (b: string | Blocked | undefined): Blocked | undefined =>
  typeof b === "string" ? { reason: b } : b;

/** A block no option on the page can clear (`Blocked.fixable`): a missing track, the format. */
export const unfixable = (reason: string, action?: NextStepLink): Blocked =>
  action ? { reason, action, fixable: false } : { reason, fixable: false };
