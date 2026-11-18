"use client";

import { useEffect, useState } from "react";
import type { EditableTags } from "@/tools/engines/edit-metadata/fields";

export type EditableState =
  | { status: "reading" }
  | { status: "done"; tags: EditableTags }
  | { status: "failed"; message: string };

/**
 * The tags the edit-metadata tool edits, read from the file on the page. Reads the header only (the
 * movie box, the ID3v2 tag, the FLAC metadata blocks), never the media, so it is quick for any size.
 */
export function useEditable(file: File | undefined): EditableState {
  const [state, setState] = useState<EditableState>({ status: "reading" });
  useEffect(() => {
    if (!file) return;
    let live = true;
    setState({ status: "reading" });
    void import("@/tools/engines/edit-metadata")
      .then(({ readEditable }) => readEditable(file))
      .then((tags) => {
        if (live) setState({ status: "done", tags });
      })
      .catch((e: unknown) => {
        if (live)
          setState({
            status: "failed",
            message: e instanceof Error ? e.message : "The tags could not be read.",
          });
      });
    return () => {
      live = false;
    };
  }, [file]);
  return state;
}

/** An object URL for bytes (a cover picture), revoked when they change or the component goes away. */
export function useBytesUrl(data: Uint8Array | Blob | undefined, mime = "image/jpeg") {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!data) {
      setUrl(undefined);
      return;
    }
    const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mime });
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data, mime]);
  return url;
}
