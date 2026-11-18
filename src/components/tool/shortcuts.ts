"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Per-tool keyboard shortcuts (feature catalog L8). Keys are scoped to the tool's workspace, never
 * the window: a key acts when focus is inside the workspace, or when nothing has focus and the last
 * click was in the workspace. A key the focused control needs is left to it: every key in a text
 * field, Space on buttons, checkboxes and radios, arrows on radios, sliders and lists, Space and
 * arrows on a native player. Modifier chords other than Shift are never taken here (the browser's and
 * the command palette's; the stage's few app chords live in tool-stage). The hint the stage shows
 * comes from `OptionsSpec.shortcuts`.
 *
 * Two priorities: a page's own keys, and `fallback` keys (the preview's player keys: J K L, arrows,
 * digits). A fallback key runs only when no page binding in the same workspace takes it, so a page
 * that gives ← → a meaning of its own (one frame on extract frame) keeps it.
 */

export interface KeyBinding {
  /** `KeyboardEvent.key`; letters match either case (" " is Space, "ArrowLeft", "i"). */
  key: string;
  /** Required Shift state; undefined accepts either. */
  shift?: boolean;
  run: (e: KeyboardEvent) => void;
}

const WORKSPACE = 'section[aria-label="Workspace"]';

/** Whether a binding answers this key event. */
function matches(b: KeyBinding, e: KeyboardEvent): boolean {
  return (
    (b.key.length === 1 ? b.key.toLowerCase() === e.key.toLowerCase() : b.key === e.key) &&
    (b.shift === undefined || b.shift === e.shiftKey)
  );
}

/** Page (non-fallback) bindings that are live now, with the element that places them. */
const pageBindings = new Set<{
  anchor: RefObject<Element | null>;
  bindings: RefObject<KeyBinding[]>;
}>();

// The workspace the last pointer press landed in. The drop zone and the active stage are two
// different sections, so a press on the drop zone (choosing a file) still counts once it is gone.
let lastPressed: Element | null = null;
let tracking = false;
function trackPresses() {
  if (tracking || typeof document === "undefined") return;
  tracking = true;
  document.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.target;
      lastPressed = t instanceof Element ? t.closest(WORKSPACE) : null;
    },
    true,
  );
}

const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
const SLIDER_KEYS = new Set([...ARROWS, "Home", "End", "PageUp", "PageDown"]);
const TOGGLE_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "range"]);
const LIST_ROLES = new Set(["combobox", "listbox", "option", "menu", "menuitem", "tab", "tablist"]);

/** True when the focused element needs this key itself. */
export function ownedByTarget(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  const role = target.getAttribute("role");
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    if (!TOGGLE_INPUTS.has(type)) return true;
    if (key === " " || key === "Enter") return true;
    if ((type === "radio" || type === "range") && ARROWS.has(key)) return true;
    return false;
  }
  if (tag === "VIDEO" || tag === "AUDIO") return key === " " || ARROWS.has(key);
  if (role && LIST_ROLES.has(role)) return true;
  if (role === "slider" && SLIDER_KEYS.has(key)) return true;
  if (
    (tag === "BUTTON" || tag === "A" || tag === "SUMMARY" || role === "button") &&
    (key === " " || key === "Enter")
  )
    return true;
  return false;
}

/** Whether a key event belongs to the workspace that holds `anchor`. */
function inWorkspace(anchor: Element, target: EventTarget | null): boolean {
  const ws = anchor.closest(WORKSPACE);
  if (!ws) return false;
  if (target instanceof Node && ws.contains(target)) return true;
  const idle = target === document.body || target === document.documentElement;
  return idle && lastPressed !== null && (lastPressed === ws || !lastPressed.isConnected);
}

/**
 * Binds keys while `enabled`, for the workspace that contains `anchor` (any element the component
 * renders). Bindings may change every render; the listener reads the latest ones.
 */
export function useWorkspaceKeys(
  anchor: RefObject<Element | null>,
  bindings: KeyBinding[],
  enabled = true,
  { fallback = false }: { fallback?: boolean } = {},
) {
  const latest = useRef(bindings);
  useLayoutEffect(() => {
    latest.current = bindings;
  });
  useEffect(() => {
    if (!enabled) return;
    trackPresses();
    const entry = { anchor, bindings: latest };
    if (!fallback) pageBindings.add(entry);
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const el = anchor.current;
      if (!el || !inWorkspace(el, e.target)) return;
      if (ownedByTarget(e.target, e.key)) return;
      const hit = latest.current.find((b) => matches(b, e));
      if (!hit) return;
      if (fallback && takenByPage(el, e)) return;
      e.preventDefault();
      hit.run(e);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      pageBindings.delete(entry);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, enabled, fallback]);
}

/** True when a page binding in the same workspace as `el` answers this key. */
function takenByPage(el: Element, e: KeyboardEvent): boolean {
  const ws = el.closest(WORKSPACE);
  for (const p of pageBindings) {
    const a = p.anchor.current;
    if (a && a.closest(WORKSPACE) === ws && p.bindings.current.some((b) => matches(b, e)))
      return true;
  }
  return false;
}

/** Plays a paused preview and pauses a playing one. */
export function togglePlayback(el: HTMLMediaElement | null | undefined) {
  if (!el) return;
  if (el.paused) void el.play().catch(() => undefined);
  else el.pause();
}

/** The Space entry every page with a preview lists in its hint. */
export const PLAY_SHORTCUT = { keys: "Space", label: "Play or pause the preview" } as const;

/** Moves the playhead by `seconds`, inside the media's length. */
export function seekBy(el: HTMLMediaElement | null | undefined, seconds: number) {
  if (!el || !Number.isFinite(el.duration)) return;
  el.currentTime = Math.min(el.duration, Math.max(0, el.currentTime + seconds));
}

/** Pauses and moves one frame back or forward (`fps` from the inspector; 30 when unknown). */
export function stepFrame(el: HTMLMediaElement | null | undefined, direction: 1 | -1, fps = 30) {
  if (!el) return;
  el.pause();
  seekBy(el, direction / (fps > 0 ? fps : 30));
}

/** Jumps to a fraction of the length (0 is the start; the 1 to 9 keys are 10% to 90%). */
export function seekToFraction(el: HTMLMediaElement | null | undefined, fraction: number) {
  if (!el || !Number.isFinite(el.duration)) return;
  el.currentTime = el.duration * Math.min(1, Math.max(0, fraction));
}

/**
 * Full screen for the preview box, or back. iPhone Safari has no element full screen, only the
 * video's own (webkitEnterFullscreen), which it then controls itself.
 */
export function toggleFullscreen(box: HTMLElement | null, video: HTMLVideoElement | null) {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => undefined);
    return;
  }
  if (box?.requestFullscreen) void box.requestFullscreen().catch(() => undefined);
  else
    (
      video as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    )?.webkitEnterFullscreen?.();
}

/**
 * The preview's own keys (fallback priority: a page's binding of the same key wins). Listed in the
 * page's hint and in the "?" dialog, so every video page documents them the same way.
 */
export const PLAYER_SHORTCUTS = [
  { keys: "Space", label: "Play or pause the preview" },
  { keys: "K", label: "Play or pause" },
  { keys: "← →", label: "Back or forward 5 seconds" },
  { keys: "J L", label: "Back or forward 10 seconds" },
  { keys: ", .", label: "One frame back or forward (pauses)" },
  { keys: "Home End", label: "Start or end" },
  { keys: "0–9", label: "Jump to 0% … 90%" },
  { keys: "M", label: "Mute or unmute" },
  { keys: "F", label: "Full screen" },
] as const;

/**
 * Binds the player keys (PLAYER_SHORTCUTS) for one media element, at fallback priority. `box` is what
 * F puts in full screen (video only); `fps` sizes the , and . frame steps.
 */
export function usePlayerKeys(
  media: RefObject<HTMLMediaElement | null>,
  {
    box,
    fps,
    enabled = true,
  }: { box?: RefObject<HTMLElement | null>; fps?: number; enabled?: boolean } = {},
) {
  const m = () => media.current;
  const bindings: KeyBinding[] = [
    { key: " ", run: () => togglePlayback(m()) },
    { key: "k", run: () => togglePlayback(m()) },
    { key: "ArrowLeft", shift: false, run: () => seekBy(m(), -5) },
    { key: "ArrowRight", shift: false, run: () => seekBy(m(), 5) },
    { key: "j", run: () => seekBy(m(), -10) },
    { key: "l", run: () => seekBy(m(), 10) },
    { key: ",", run: () => stepFrame(m(), -1, fps) },
    { key: ".", run: () => stepFrame(m(), 1, fps) },
    { key: "Home", run: () => seekToFraction(m(), 0) },
    { key: "End", run: () => seekToFraction(m(), 1) },
    ...Array.from({ length: 10 }, (_, n) => ({
      key: String(n),
      run: () => seekToFraction(m(), n / 10),
    })),
    {
      key: "m",
      run: () => {
        const el = m();
        if (el) el.muted = !el.muted;
      },
    },
  ];
  if (box)
    bindings.push({
      key: "f",
      run: () => {
        const el = m();
        toggleFullscreen(box.current, el instanceof HTMLVideoElement ? el : null);
      },
    });
  useWorkspaceKeys(media, bindings, enabled, { fallback: true });
}
