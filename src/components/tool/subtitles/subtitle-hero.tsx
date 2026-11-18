"use client";

import { useEffect, useMemo, useState } from "react";
import { formatNames, parseSubtitles } from "@/tools/engines/subtitles";
import { cueClock } from "@/tools/engines/subtitles/time";
import { fixTotal } from "@/tools/engines/subtitles/timing";
import {
  applyEdits,
  type SubtitlesConvertOptions,
} from "@/tools/engines/subtitles-convert/options";
import type { HeroProps } from "../options/types";
import { CueList } from "./cue-list";
import { docFor, plannedFix } from "./doc-cache";

const count = (n: number, one = "cue", many = `${one}s`) =>
  `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

/**
 * The hero of the subtitle tools (spec.Hero): the cue list, where a video page shows the picture.
 * Ready: the cues as they will be written, with the old times under any cue an edit moved and the
 * timing problems in words. Done: the output file read back, so what is shown is what was written.
 */
export function SubtitleHero({ file, info, value, phase }: HeroProps<SubtitlesConvertOptions>) {
  const doc = docFor(info);
  const edit = useMemo(() => (doc && value ? applyEdits(doc, value) : undefined), [doc, value]);
  const before = useMemo(() => {
    if (!doc || !edit || edit.doc === doc) return undefined;
    return new Map(doc.cues.map((c) => [c.line, c]));
  }, [doc, edit]);

  if (phase === "inspecting") return <Surface caption="Reading the subtitles" />;
  if (phase === "done") return <ResultText file={file} />;
  if (!doc || !edit || !value) return null;

  const cues = edit.doc.cues;
  const first = cues[0];
  const problems = fixTotal(plannedFix(info));
  let caption = `${count(cues.length)} · ${cueClock(first?.start ?? 0)} – ${cueClock(cues.at(-1)?.end ?? 0)}`;
  if (value.job === "fix" && problems > 0)
    caption = `${count(problems, "problem")} found · ${count(cues.length)} after fixing`;
  else if (before && first && value.job !== "fix")
    caption = `${count(cues.length)}, first line now at ${cueClock(first.start)}`;
  return (
    <Surface caption={caption}>
      <CueList
        cues={cues}
        before={before}
        issues={value.fix ? undefined : doc.issues}
        label={`Cues in ${file.name}`}
      />
    </Surface>
  );
}

function Surface({ caption, children }: { caption: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="tabular text-fg-muted text-sm" aria-live="polite">
        {caption}
      </p>
      {children}
    </div>
  );
}

const PREVIEW_LINES = 400;

/**
 * The written file, read back. Timed formats are parsed again and shown as cues (proof the output is
 * valid); a TXT transcript is shown as its text.
 */
function ResultText({ file }: { file: File }) {
  const [text, setText] = useState<string>();
  useEffect(() => {
    let live = true;
    void file.text().then((t) => {
      if (live) setText(t);
    });
    return () => {
      live = false;
    };
  }, [file]);
  const parsed = useMemo(() => {
    if (text === undefined || /\.txt$/i.test(file.name)) return undefined;
    try {
      return parseSubtitles(text, file.name);
    } catch {
      return undefined;
    }
  }, [text, file.name]);
  if (text === undefined) return <Surface caption="Reading the result" />;
  if (parsed)
    return (
      <Surface
        caption={`${file.name}, read back: ${count(parsed.cues.length)} in ${formatNames[parsed.format]}`}
      >
        <CueList cues={parsed.cues} label={`Cues in ${file.name}`} />
      </Surface>
    );
  const lines = text.replace(/\n$/, "").split("\n");
  return (
    <Surface caption={`${file.name}: ${count(lines.length, "line")}`}>
      <section
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll container must be reachable by keyboard
        tabIndex={0}
        aria-label={`Text of ${file.name}`}
        className="overflow-auto rounded-md bg-bg-subtle p-4 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        style={{ maxHeight: "60vh" }}
      >
        <pre className="whitespace-pre-wrap break-words font-mono text-xs">
          {lines.slice(0, PREVIEW_LINES).join("\n")}
        </pre>
      </section>
      {lines.length > PREVIEW_LINES && (
        <p className="tabular text-fg-muted text-sm">
          The first {PREVIEW_LINES} lines are shown; the file has {count(lines.length, "line")}.
        </p>
      )}
    </Surface>
  );
}
