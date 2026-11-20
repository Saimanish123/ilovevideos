"use client";

import { History } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions, DialogContent } from "@/components/ui/dialog";
import { ProgressLine } from "@/components/ui/progress-line";
import { formatBytes, formatDuration } from "@/lib/format";
import type { Interrupted } from "@/tools/engines/capture/find";
import type { Captured } from "../options/types";
import { ActionBar, CaptureError, CaptureLayout } from "./parts";

/** "14:02" today, "yesterday 22:10", else "17 Nov 22:10". */
export function startedWords(started: number, now = Date.now()): string {
  const d = new Date(started);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const today = new Date(now);
  if (today.toDateString() === d.toDateString()) return time;
  const y = new Date(now - 86_400_000);
  if (y.toDateString() === d.toDateString()) return `yesterday ${time}`;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${time}`;
}

/**
 * Focuses what `find` returns once it is on the page (the next state loads its parts first), for up
 * to two seconds, so focus never falls to the page when the offer goes away.
 */
function focusWhenThere(find: () => HTMLElement | null | undefined) {
  const until = performance.now() + 2000;
  const step = () => {
    const el = find();
    if (el) el.focus();
    else if (performance.now() < until) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const workspace = () => document.querySelector<HTMLElement>('section[aria-label="Workspace"]');

/**
 * The recorder page after a recording was cut off (ADR-0130): in the recorder's place and shape,
 * one line saying what was found, Recover it (opens the finished file as the result) and Discard
 * (asks first). Shown once per interrupted recording; the recorder returns after either.
 */
export function RecoveryOffer({
  found,
  onRecovered,
  onDone,
}: {
  found: Interrupted;
  onRecovered: (c: Captured) => void;
  /** The offer is settled (discarded): back to the recorder. */
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<number>();
  const [error, setError] = useState<{ message: string; hint?: string }>();
  const [confirm, setConfirm] = useState(false);
  const words = `A recording from ${startedWords(found.meta.started)} was interrupted (${formatDuration(found.seconds)}, ${formatBytes(found.bytes)}).`;

  const recover = async () => {
    setBusy(0);
    setError(undefined);
    try {
      const { recoverInterrupted } = await import("@/tools/engines/capture/recover");
      const rec = await recoverInterrupted(found, (r) => setBusy(r));
      // Focus goes to the result's Download, the next thing to do.
      focusWhenThere(() => workspace()?.querySelector<HTMLElement>('[data-action="download"]'));
      onRecovered({
        file: rec.file,
        info: rec.info,
        meta: rec.meta,
        ffmpegCommand: rec.ffmpegCommand,
      });
    } catch (e) {
      console.error("Recovery failed", e);
      setError({
        message: (e as Error)?.message || "The recording could not be recovered.",
        hint: (e as { hint?: string }).hint ?? "Discard it to record again.",
      });
      setBusy(undefined);
    }
  };

  const discard = async () => {
    setConfirm(false);
    const { discardInterrupted } = await import("@/tools/engines/capture/find");
    await discardInterrupted(found);
    onDone();
    // Back to the recorder: focus on its first action (Start recording, or Turn on camera).
    focusWhenThere(() =>
      workspace()?.querySelector<HTMLElement>("[data-action-bar] button:not(:disabled)"),
    );
  };

  return (
    <CaptureLayout
      stage={
        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-bg-stage text-gray-400">
          <History size={24} strokeWidth={1.5} aria-hidden />
          {busy !== undefined && (
            <div className="absolute inset-x-0 bottom-0">
              <ProgressLine ratio={busy} label="Recovery progress" />
            </div>
          )}
        </div>
      }
      panel={
        <>
          <p className="tabular text-body" role="status">
            {busy !== undefined ? `Recovering · ${Math.round(busy * 100)}%` : words}
          </p>
          {error && <CaptureError message={error.message} hint={error.hint} />}
          <ActionBar>
            <div className="flex flex-col gap-3">
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                disabled={busy !== undefined}
                onClick={() => void recover()}
              >
                Recover it
              </Button>
              <Dialog open={confirm} onOpenChange={setConfirm}>
                <Button
                  variant="ghost"
                  size="md"
                  className="self-center"
                  disabled={busy !== undefined}
                  onClick={() => setConfirm(true)}
                >
                  Discard
                </Button>
                <DialogContent
                  title={`Discard this ${formatDuration(found.seconds)} recording?`}
                  description="It cannot be recovered."
                  showClose={false}
                >
                  <DialogActions>
                    <Button variant="secondary" size="md" onClick={() => setConfirm(false)}>
                      Keep it
                    </Button>
                    <Button variant="destructive" size="md" onClick={() => void discard()}>
                      Discard
                    </Button>
                  </DialogActions>
                </DialogContent>
              </Dialog>
            </div>
          </ActionBar>
        </>
      }
    />
  );
}
