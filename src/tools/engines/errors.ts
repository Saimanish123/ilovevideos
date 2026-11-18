/**
 * Failure classes (README.md#system-design-and-production-principles, "Failure handling").
 * Every engine failure is one of these; the UI writes copy per class, never per exception.
 */
export type EngineErrorCode =
  | "unsupported-input"
  | "unsupported-output"
  | "resource"
  | "cancelled"
  | "internal";

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  /** What the user can do next, one sentence. */
  readonly hint?: string;
  constructor(code: EngineErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "EngineError";
    this.code = code;
    this.hint = hint;
  }
}

export function isEngineError(e: unknown): e is EngineError {
  return e instanceof EngineError || (e instanceof Error && e.name === "EngineError");
}

/** Best-effort classification of an unknown thrown value. */
export function classifyError(e: unknown): EngineError {
  if (isEngineError(e)) return e;
  // Options that fail their schema (zod): say what is wrong, never the raw issue list.
  const issues = (e as { issues?: { message?: string }[] } | null)?.issues;
  if (Array.isArray(issues)) {
    const first = issues[0]?.message?.replace(/\.?$/, ".") ?? "These settings cannot be used.";
    return new EngineError("unsupported-input", first, "Change the settings and try again.");
  }
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (lower.includes("abort") || lower.includes("cancel")) {
    return new EngineError("cancelled", "Cancelled.");
  }
  // An ArrayBuffer cannot pass 2 GiB: that is a size limit, not a device short of memory, and more
  // memory or another browser does not help (outputs that large stream to disk, ./mediabunny/output-store).
  if (lower.includes("array buffer allocation") || lower.includes("invalid array buffer length")) {
    return new EngineError(
      "resource",
      "The result grew past the 2 GB a browser can hold in one piece of memory.",
      "Process a shorter part of the file, or use a browser that can write to disk storage (current Chrome, Edge or Firefox).",
    );
  }
  if (lower.includes("quota")) {
    return new EngineError(
      "resource",
      "This site's disk storage is full, so the result could not be written.",
      "Free disk space, or clear this site's stored data in the browser settings, then try again.",
    );
  }
  if (lower.includes("memory") || lower.includes("allocation")) {
    return new EngineError(
      "resource",
      "This browser ran out of memory while processing the file.",
      "Try a smaller file, close other tabs, or use desktop Chrome.",
    );
  }
  if (lower.includes("decod") || lower.includes("unsupported") || lower.includes("unknown codec")) {
    return new EngineError(
      "unsupported-input",
      "This file uses a codec your browser cannot decode.",
      "Convert it to MP4 on another device first, or try desktop Chrome.",
    );
  }
  return new EngineError("internal", `Something went wrong: ${msg}`, "Try again or start over.");
}

/** What an engine was asked to write, for `cannotEncodeError`. */
export interface EncodeRequest {
  /** "audio" when the output is sound only, or the source has no picture. */
  kind: "video" | "audio";
  /** Display name of the codec the output needs ("Opus", "H.264"), when known. */
  codec?: string;
  /** The source's sound or picture, as facts ("6 channels, 48 kHz"; "3840×2160"). */
  source?: string;
}

/**
 * The failure when an engine's `supports()` says no: names the kind of track and the codec, and the
 * source facts that most often cause it (a 5.1 track for an encoder that takes stereo, a picture
 * larger than the encoder's limit).
 */
export function cannotEncodeError(r: EncodeRequest): EngineError {
  const what = r.codec ? `${r.codec} ${r.kind}` : r.kind;
  return new EngineError(
    "unsupported-output",
    `This browser cannot encode ${what}${r.source ? ` from this source (${r.source})` : ""}.`,
    r.kind === "audio"
      ? "Choose another format, or try desktop Chrome, Edge or Safari 17.4 or newer."
      : "Choose a smaller size or another format, or try desktop Chrome, Edge or Safari 17.4 or newer.",
  );
}
