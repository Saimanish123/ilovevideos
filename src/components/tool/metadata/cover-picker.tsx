"use client";

import { ImageIcon } from "lucide-react";
import { useId, useState } from "react";
import { FileName } from "@/components/tool/file-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatBytes, formatDimensions } from "@/lib/format";
import type { EditMetadataOptions } from "@/tools/engines/edit-metadata/fields";

type NewCover = NonNullable<EditMetadataOptions["cover"]>;

/** Covers larger than this on their long side are scaled down (cover art is shown small everywhere). */
const MAX_EDGE = 3000;

/**
 * Reads a picked image into a cover: JPEG and PNG are kept byte for byte; any other image the
 * browser decodes (WebP, AVIF, GIF, HEIC on Safari) is drawn once and saved as JPEG, since those two
 * are what MP4, MP3 and FLAC players read. Anything over MAX_EDGE is scaled down, as JPEG.
 */
export async function readCover(file: File): Promise<NewCover> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    const keep = /^image\/(jpeg|png)$/.test(file.type) && Math.max(width, height) <= MAX_EDGE;
    if (keep)
      return { name: file.name, blob: file, mime: file.type as NewCover["mime"], width, height };
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("no canvas");
    c.imageSmoothingQuality = "high";
    c.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    if (!blob) throw new Error("no jpeg");
    return {
      name: file.name.replace(/\.[^.]+$/, ".jpg"),
      blob,
      mime: "image/jpeg",
      width: w,
      height: h,
    };
  } finally {
    bitmap.close();
  }
}

/**
 * The cover control: the file's own cover (with Remove), a newly picked one (with Undo), or a picker.
 * Drop target plus a file button, like the watermark's logo input.
 */
export function CoverPicker({
  value,
  onChange,
  hasCover,
  disabled,
}: {
  value: EditMetadataOptions["cover"];
  onChange: (cover: EditMetadataOptions["cover"]) => void;
  /** The file already has a cover. */
  hasCover: boolean;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [error, setError] = useState<string>();
  const [over, setOver] = useState(false);
  const read = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange(await readCover(file));
      setError(undefined);
    } catch {
      setError(`${file.name} could not be read as an image. JPEG and PNG work everywhere.`);
    }
  };
  const button = cn(buttonVariants({ variant: "quiet", size: "md" }), "min-h-11 shrink-0 px-3");

  const row = (title: string, detail: string, action: React.ReactNode) => (
    <div className="flex items-center gap-3 rounded-md bg-bg-subtle px-4 py-3 text-sm">
      <ImageIcon size={20} strokeWidth={1.5} aria-hidden className="shrink-0 text-fg-muted" />
      <div className="min-w-0 flex-1">
        <FileName name={title} />
        <p className="tabular mt-0.5 text-fg-muted text-xs">{detail}</p>
      </div>
      {action}
    </div>
  );

  const picker = (
    <label
      htmlFor={inputId}
      className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border bg-bg px-4 font-medium text-sm has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2"
    >
      {hasCover || value ? "Choose another image" : "Choose an image"}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          void read(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-2">
      {value
        ? row(
            value.name,
            `${formatDimensions(value.width, value.height)} · ${formatBytes(value.blob.size)} · new`,
            <button
              type="button"
              className={button}
              disabled={disabled}
              onClick={() => onChange(undefined)}
            >
              Undo
            </button>,
          )
        : hasCover && value !== null
          ? row(
              "Cover in the file",
              "Kept unless you change it",
              <button
                type="button"
                className={button}
                disabled={disabled}
                onClick={() => onChange(null)}
              >
                Remove
              </button>,
            )
          : value === null
            ? row(
                "Cover removed",
                "The copy will have no cover",
                <button
                  type="button"
                  className={button}
                  disabled={disabled}
                  onClick={() => onChange(undefined)}
                >
                  Undo
                </button>,
              )
            : null}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the file button inside is the keyboard path */}
      <div
        className={
          over
            ? "flex flex-wrap items-center gap-3 rounded-md border border-fg border-solid bg-bg-raised p-3"
            : "flex flex-wrap items-center gap-3 rounded-md border border-border-strong border-dashed bg-bg-subtle p-3"
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
        {picker}
        <p className="min-w-0 flex-1 text-fg-muted text-xs">A square picture, JPEG or PNG.</p>
      </div>
      {error && (
        <p className="text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
