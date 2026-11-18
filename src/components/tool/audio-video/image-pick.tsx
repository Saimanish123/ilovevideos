"use client";

import { ImageIcon } from "lucide-react";
import { useId, useState } from "react";
import { FileName } from "@/components/tool/file-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDimensions } from "@/lib/format";

export interface Picked {
  name: string;
  blob: Blob;
  width: number;
  height: number;
}

/** Reads a picked picture's natural size; throws when the browser cannot decode it. */
export async function readPicked(file: File): Promise<Picked> {
  const bitmap = await createImageBitmap(file);
  const out = { name: file.name, blob: file, width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return out;
}

/**
 * One picture input: a drop target with a file button, then the chosen file with Remove. For the
 * picture of audio to video and the music-free parts of the slideshow; keyboard path is the button.
 */
export function ImagePick({
  label,
  value,
  onChange,
  disabled,
  accept = "image/*",
  hint,
}: {
  label: string;
  value?: Picked;
  onChange: (next: Picked | undefined) => void;
  disabled?: boolean;
  accept?: string;
  hint?: string;
}) {
  const inputId = useId();
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string>();
  const read = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange(await readPicked(file));
      setError(undefined);
    } catch {
      setError(`${file.name} could not be read as an image. JPEG, PNG and WebP work everywhere.`);
    }
  };
  if (value)
    return (
      <div className="flex items-center gap-3 rounded-md bg-bg-subtle px-4 py-3 text-sm">
        <ImageIcon size={20} strokeWidth={1.5} aria-hidden className="shrink-0 text-fg-muted" />
        <div className="min-w-0 flex-1">
          <FileName name={value.name} />
          <p className="tabular mt-0.5 text-fg-muted text-xs">
            {formatDimensions(Math.round(value.width), Math.round(value.height))}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(undefined)}
          className={cn(buttonVariants({ variant: "quiet", size: "md" }), "min-h-11 px-3")}
        >
          Remove
        </button>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the file button inside is the keyboard path */}
      <div
        className={
          over
            ? "flex flex-col items-center gap-2 rounded-md border border-fg border-solid bg-bg-raised px-4 py-5 text-center text-sm"
            : "flex flex-col items-center gap-2 rounded-md border border-border-strong border-dashed bg-bg-subtle px-4 py-5 text-center text-sm"
        }
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) void read(e.dataTransfer.files[0]);
        }}
      >
        <label
          htmlFor={inputId}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border bg-bg px-4 font-medium has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2"
        >
          {label}
          <input
            id={inputId}
            type="file"
            accept={accept}
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              void read(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {hint && <p className="text-fg-muted text-xs">{hint}</p>}
      </div>
      {error && (
        <p className="text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
