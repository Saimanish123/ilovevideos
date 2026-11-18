"use client";

import { Copy, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MediaInfo } from "@/tools/engines/types";

/** Still results (not an animated GIF) can be copied as an image. */
const STILL = /^image\/(png|jpeg|webp)$/;

/**
 * Preview of an image result (a finished GIF, a still) on the dark stage, in the same box the video
 * preview used, so before → after reads as one surface. A GIF plays at its real speed with a Pause
 * toggle beside it, and starts paused on its first frame when the user asks for reduced motion
 * (WCAG 2.2.2). A still also gets Copy image, when the browser can put an image on the clipboard.
 */
export function ImagePreview({ blob, info, alt }: { blob: Blob; info?: MediaInfo; alt: string }) {
  // Created in an effect (not useMemo) so StrictMode's double invoke cannot revoke a URL still in use.
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  const v = info?.video;
  const ratio = v && v.width > 0 && v.height > 0 ? `${v.width} / ${v.height}` : "16 / 9";
  // Animated: a GIF or an APNG by type; an animated WebP or AVIF only by its header (read below).
  const [gif, setAnimated] = useState(
    () => blob.type === "image/gif" || blob.type === "image/apng",
  );
  const reduced = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [playing, setPlaying] = useState(() => !gif || !reduced());
  // WebP and AVIF may or may not be animated: the picture and its buttons wait for the header, so
  // nothing swaps (Copy → Pause) and a reduced-motion user never sees it move.
  const sniff = blob.type === "image/webp" || blob.type === "image/avif";
  const [checked, setChecked] = useState(!sniff);
  useEffect(() => {
    if (!sniff) return;
    let live = true;
    setChecked(false);
    void isAnimated(blob).then((yes) => {
      if (!live) return;
      if (yes) {
        setAnimated(true);
        if (reduced()) setPlaying(false);
      }
      setChecked(true);
    });
    return () => {
      live = false;
    };
  }, [blob, sniff]);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Paused: the first frame (or, after Pause, the frame on screen) drawn on a canvas; the animated
  // <img> stays mounted but hidden, so nothing moves.
  useEffect(() => {
    if (!gif || playing) return;
    let live = true;
    void createImageBitmap(blob)
      .then((bitmap) => {
        const c = canvasRef.current;
        if (live && c && c.width === 0) {
          c.width = bitmap.width;
          c.height = bitmap.height;
          c.getContext("2d")?.drawImage(bitmap, 0, 0);
        }
        bitmap.close();
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [gif, playing, blob]);
  const toggle = () => {
    if (playing) {
      // Freeze on the frame the user is looking at.
      const img = imgRef.current;
      const c = canvasRef.current;
      if (img && c && img.naturalWidth > 0) {
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d")?.drawImage(img, 0, 0);
      }
    } else if (canvasRef.current) {
      canvasRef.current.width = 0;
    }
    setPlaying(!playing);
  };
  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex w-full items-center justify-center overflow-hidden rounded-lg bg-bg-stage"
        style={{ aspectRatio: ratio, maxHeight: "var(--sheet-preview-max-h)" }}
        data-testid="image-stage"
      >
        {url && (
          <img
            ref={imgRef}
            src={url}
            alt={alt}
            hidden={(gif && !playing) || !checked}
            data-testid="result-preview"
            className="max-h-full max-w-full object-contain"
          />
        )}
        {gif && (
          <canvas
            ref={canvasRef}
            // Zero until a frame is drawn; React sets it once and leaves later sizes alone.
            width={0}
            height={0}
            hidden={playing}
            role="img"
            aria-label={`${alt}, paused`}
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>
      {!checked && <div className="min-h-11" aria-hidden />}
      {checked && gif && (
        <div className="flex">
          <Button
            variant="secondary"
            size="md"
            // Fixed width so the button does not change size between Play and Pause (design system §8.1).
            className="min-h-11 min-w-24"
            onClick={toggle}
            aria-label={
              blob.type === "image/gif"
                ? playing
                  ? "Pause the GIF"
                  : "Play the GIF"
                : playing
                  ? "Pause the animation"
                  : "Play the animation"
            }
          >
            {playing ? (
              <Pause size={16} strokeWidth={1.5} aria-hidden />
            ) : (
              <Play size={16} strokeWidth={1.5} aria-hidden />
            )}
            {playing ? "Pause" : "Play"}
          </Button>
        </div>
      )}
      {checked && STILL.test(blob.type) && !gif && <CopyImage blob={blob} />}
    </div>
  );
}

/**
 * Whether a WebP or AVIF holds an animation: the WebP `VP8X` animation flag, or an AVIF whose brand
 * is `avis` (an image sequence). Reads the first 32 bytes only.
 */
export async function isAnimated(blob: Blob): Promise<boolean> {
  const b = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
  const at = (i: number) =>
    String.fromCharCode(b[i] ?? 0, b[i + 1] ?? 0, b[i + 2] ?? 0, b[i + 3] ?? 0);
  if (at(0) === "RIFF" && at(8) === "WEBP" && at(12) === "VP8X") return ((b[20] ?? 0) & 0x02) !== 0;
  if (at(4) === "ftyp") return at(8) === "avis";
  return false;
}

/** Whether this browser can write a PNG to the clipboard (Clipboard API with image support). */
function canCopyImages(): boolean {
  if (typeof window === "undefined" || typeof ClipboardItem === "undefined") return false;
  if (!window.isSecureContext || typeof navigator.clipboard?.write !== "function") return false;
  const supports = (ClipboardItem as unknown as { supports?: (type: string) => boolean }).supports;
  return typeof supports === "function" ? supports("image/png") : true;
}

/** PNG of the still: the blob itself, or a lossless re-encode of a JPG or WebP (clipboards take PNG). */
async function asPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/png"),
  );
}

/**
 * Copies the still to the clipboard as PNG. Hidden where the browser cannot (checked on mount, never
 * guessed from the user agent). The label says "Copied" for 1.5 s, or that it could not.
 */
function CopyImage({ blob }: { blob: Blob }) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setSupported(canCopyImages()), []);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!supported) return null;
  const copy = async () => {
    try {
      // The item is created inside the click with a promise, which Safari requires for async data.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": asPng(blob) })]);
      setState("copied");
    } catch {
      setState("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1500);
  };
  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" size="md" className="min-h-11" onClick={copy}>
        <Copy size={16} strokeWidth={1.5} aria-hidden />
        Copy image
      </Button>
      <p className="text-fg-muted text-sm" role="status" aria-live="polite">
        {state === "copied"
          ? "Copied as PNG. Paste it into a message or a document."
          : state === "failed"
            ? "Could not copy. Download it instead."
            : ""}
      </p>
    </div>
  );
}
