"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept current as it changes. On the server, and in the first client
 * render, it is `serverValue`, so only use it for client-only state (a stage with a file in it) or
 * where a one-frame correction is harmless.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
