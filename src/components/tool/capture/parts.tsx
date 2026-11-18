"use client";

import { type ReactNode, useEffect, useId, useState } from "react";
import { useActionBarRef } from "../action-bar";

/**
 * The setup pieces the three recorders share: the workspace layout, the action bar, the device
 * picker, More options and the error line. The recording pieces are in ./live and ./wave, so each
 * page's first load carries only what it shows (ADR-0104).
 */

/** The recorder's workspace: the picture (or waveform) on the left, the panel on the right. */
export function CaptureLayout({ stage, panel }: { stage?: ReactNode; panel: ReactNode }) {
  // Set once the recorder is interactive (its chunk loaded and hydrated), for tests and tools.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <section
      aria-label="Workspace"
      data-ready={ready || undefined}
      className="relative mx-auto flex min-h-(--stage-min-h) w-full max-w-(--container-content) flex-col rounded-lg border border-border bg-bg-raised p-6 md:min-h-80"
    >
      {/* Below lg a column that fills the card, so the sticky bar's mt-auto pins it to the card's
          bottom instead of leaving it mid-card; from lg the stage's two columns. */}
      <div className="flex flex-1 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_var(--container-panel)]">
        {stage && <div className="flex flex-col gap-4">{stage}</div>}
        <div className="contents lg:flex lg:flex-col lg:gap-6">{panel}</div>
      </div>
    </section>
  );
}

/** The panel's main action before recording: one primary, full width, sticky on phones. */
export function ActionBar({ children }: { children: ReactNode }) {
  const barRef = useActionBarRef();
  return (
    <div
      // Phones: the sticky bar the page keeps focused controls clear of (globals.css), as on the stage.
      data-action-bar=""
      ref={barRef}
      className="-mx-6 sticky bottom-0 mt-auto flex flex-col gap-2 border-border border-t bg-bg-raised px-6 py-3 lg:static lg:m-0 lg:gap-6 lg:border-0 lg:p-0"
    >
      {children}
    </div>
  );
}

/**
 * A device picker: the browser's own list, named once the device is allowed. With `none`, its first
 * entry turns the device off (value "off"), so one control says both whether and which. Before the
 * browser has allowed the device there are no names: one entry stands for its default device.
 */
export function DeviceSelect({
  label,
  devices,
  value,
  onChange,
  none,
  fallback,
  disabled,
  hint,
}: {
  label: string;
  devices: MediaDeviceInfo[];
  value: string | undefined;
  onChange: (id: string) => void;
  /** Label of the "off" entry ("No microphone"). */
  none?: string;
  /** Label of the default device before names are known ("Microphone"). */
  fallback?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  const listed = devices.length
    ? devices.map((d, i) => ({ id: d.deviceId, name: d.label || `${fallback ?? label} ${i + 1}` }))
    : [{ id: "", name: fallback ?? label }];
  return (
    <div>
      <label htmlFor={id} className="font-medium text-sm">
        {label}
      </label>
      <select
        id={id}
        // "" means the default device: once names are known that is the first listed one, so the
        // select never falls through to the "off" entry; "off" stays off.
        value={value || listed[0]?.id || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-10 pointer-coarse:h-11 w-full truncate rounded-md border border-border bg-bg-raised px-3 text-fg text-sm transition-colors duration-(--duration-instant) hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-60"
      >
        {none && <option value="off">{none}</option>}
        {listed.map((d) => (
          <option key={d.id || "default"} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      {hint && <p className="mt-2 text-fg-muted text-xs">{hint}</p>}
    </div>
  );
}

/** The shared "More options" disclosure (review lessons: one component across pages). */
export { MoreOptions } from "../regions/more-options";

/** The error line with its way back (two sentences: what happened, what to do). */
export function CaptureError({ message, hint }: { message: string; hint?: string }) {
  return (
    <p className="text-body" role="alert">
      {message}
      {hint && <span className="text-fg-muted"> {hint}</span>}
    </p>
  );
}
