"use client";

import { Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { ToolDefinition } from "@/tools/registry/schema";

/**
 * The single interactive surface of a tool page (design system §8.2–8.3).
 * This is the idle drop zone only. The active workspace (preview + controls + progress)
 * is implemented per engine in Phase 1; see docs/03-architecture.md.
 */
export function ToolStage({ tool }: { tool: ToolDefinition }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const accept = tool.accepts
    .map((k) => (k === "subtitle" ? ".srt,.vtt,.ass" : `${k}/*`))
    .join(",");

  return (
    <section
      aria-label="Workspace"
      className={[
        "mx-auto flex min-h-60 w-full max-w-(--container-content) flex-col items-center justify-center rounded-lg border p-8 text-center transition-colors duration-(--duration-instant) md:min-h-80",
        over
          ? "border-solid border-fg bg-bg-raised"
          : "border-dashed border-border-strong bg-bg-subtle",
      ].join(" ")}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        setFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <Upload size={24} strokeWidth={1.5} aria-hidden className="text-fg-muted" />
      <p className="mt-4 text-body">
        Drop a video here or{" "}
        <label
          htmlFor={inputId}
          className="cursor-pointer font-medium underline decoration-1 underline-offset-[3px]"
        >
          choose a file
        </label>
      </p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple
        className="sr-only"
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
      />
      <p className="mt-2 text-sm text-fg-muted">
        {tool.onDeviceOnly
          ? "Your file stays on this device."
          : "Large files may be processed on our server with your consent."}
      </p>
      {files.length > 0 && (
        <ul className="mt-6 w-full max-w-md text-left text-sm">
          {files.map((f) => (
            <li
              key={`${f.name}-${f.size}`}
              className="flex justify-between border-t border-border py-2"
            >
              <span className="truncate">{f.name}</span>
              <span className="tabular text-fg-muted">{(f.size / 1_048_576).toFixed(1)} MB</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
