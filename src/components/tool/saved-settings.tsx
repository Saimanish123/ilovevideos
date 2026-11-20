"use client";

import { Check, ChevronDown, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OptionsSpec } from "./options/types";
import {
  deletePreset,
  presetNameProblem,
  readPresets,
  type SavedPreset,
  sameSubset,
  savePreset,
  subsetOf,
} from "./remember";
import { SavedSlotClaim, SavedSlotContent } from "./saved-settings-slot";

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous option shapes; each spec is typed internally
type AnySpec = OptionsSpec<any>;

interface Props {
  spec: AnySpec;
  slug: string;
  value: unknown;
  /** The page's defaults for this file. */
  defaults: unknown;
  preset: Record<string, unknown>;
  /** Settings were restored or a saved entry applied: offer the way back. */
  restored: boolean;
  onApply: (values: Record<string, unknown>) => void;
  onReset: () => void;
}

/**
 * The page's saved settings and "Reset to defaults" around its panel (ADR-0129). The saved list
 * sits at the end of the panel's first "More options" when it has one (./saved-settings-slot),
 * else in a closed "Saved settings" disclosure of its own under the panel. "Reset to defaults"
 * shows when the settings on screen came from memory or a saved entry and differ from the defaults.
 * One polite live region, always mounted, says what saving and deleting did.
 */
export function SavedSettingsArea({ children, ...p }: Props & { children: ReactNode }) {
  const [held, setHeld] = useState(false);
  const owner = useRef<((v: boolean) => void) | null>(null);
  const claim = useCallback((own: (v: boolean) => void) => {
    if (!owner.current) {
      owner.current = own;
      own(true);
      setHeld(true);
    }
    return () => {
      if (owner.current !== own) return;
      owner.current = null;
      setHeld(false);
    };
  }, []);
  const [said, setSaid] = useState("");
  const say = useCallback((text: string) => {
    // Cleared first, so the same words twice are read twice.
    setSaid("");
    requestAnimationFrame(() => setSaid(text));
  }, []);
  const resetRef = useRef<HTMLDivElement>(null);
  const keepable = Object.keys(subsetOf(p.spec, p.defaults, p.preset)).length > 0;
  const current = useMemo(() => subsetOf(p.spec, p.value, p.preset), [p.spec, p.value, p.preset]);
  const atDefaults = sameSubset(current, subsetOf(p.spec, p.defaults, p.preset));
  const content = keepable ? <SavedList {...p} current={current} say={say} inline /> : null;
  if (!keepable) return <>{children}</>;

  const reset = (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-11 shrink-0 text-fg-muted"
      onClick={() => {
        p.onReset();
        say("Settings back to the page's defaults.");
        // The button goes with the restored settings: focus moves to the disclosure that holds them.
        requestAnimationFrame(() =>
          (() => {
            const panel = resetRef.current?.closest("fieldset");
            const summary =
              panel
                ?.querySelector("[data-saved-list]")
                ?.closest("details")
                ?.querySelector("summary") ??
              panel?.querySelector<HTMLElement>("summary[data-saved-settings]");
            (summary as HTMLElement | null | undefined)?.focus();
          })(),
        );
      }}
    >
      Reset to defaults
    </Button>
  );
  const showReset = p.restored && !atDefaults;

  return (
    <SavedSlotClaim.Provider value={claim}>
      <SavedSlotContent.Provider value={content}>{children}</SavedSlotContent.Provider>
      <div ref={resetRef} className="contents">
        {held ? (
          showReset && <div className="flex justify-end">{reset}</div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <details className="group min-w-0 flex-1 text-sm">
              <SavedSummary count={readPresets(p.spec, p.slug, p.preset).length} />
              <div className="mt-3">
                <SavedList {...p} current={current} say={say} />
              </div>
            </details>
            {showReset && reset}
          </div>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>
    </SavedSlotClaim.Provider>
  );
}

function SavedSummary({ count }: { count: number }) {
  return (
    <summary
      data-saved-settings=""
      className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-fg-muted hover:text-fg [&::-webkit-details-marker]:hidden"
    >
      Saved settings
      {count > 0 && <span className="tabular">({count})</span>}
      <ChevronDown
        size={16}
        strokeWidth={1.5}
        aria-hidden
        className="transition-transform duration-(--duration-fast) ease-(--ease-in-out) group-open:rotate-180 motion-reduce:transition-none"
      />
    </summary>
  );
}

/** The saved entries and the name field: in the stage's own disclosure, or inside "More options". */
function SavedList({
  spec,
  slug,
  preset,
  current,
  onApply,
  say,
  inline = false,
}: Props & { current: Record<string, unknown>; say: (t: string) => void; inline?: boolean }) {
  const nameId = useId();
  const problemId = useId();
  const [presets, setPresets] = useState<SavedPreset[]>(() => readPresets(spec, slug, preset));
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string>();
  const listRef = useRef<HTMLFieldSetElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const focusAfterDelete = useRef<number | null>(null);
  useEffect(() => {
    const i = focusAfterDelete.current;
    if (i === null) return;
    focusAfterDelete.current = null;
    // The next entry (the one that moved up), else the last, else the name field.
    const next = listRef.current?.querySelector<HTMLElement>(
      `[data-entry="${Math.min(i, presets.length - 1)}"]`,
    );
    (next ?? input.current)?.focus();
  }, [presets]);

  const save = () => {
    const exists = presets.some((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    const why = presetNameProblem(name, presets.length, exists);
    if (why) {
      setProblem(why);
      say(why);
      return;
    }
    if (!savePreset(spec, slug, name, current, preset)) {
      const blocked =
        "This browser is not keeping data for this site, so the settings were not saved.";
      setProblem(blocked);
      say(blocked);
      return;
    }
    say(`Saved as ${name.trim()}.`);
    setProblem(undefined);
    setName("");
    setPresets(readPresets(spec, slug, preset));
  };

  return (
    <fieldset ref={listRef} data-saved-list="" className="flex min-w-0 flex-col gap-4">
      {/* Inside "More options" the name shows; in the stage's own disclosure its summary says it. */}
      <legend className={inline ? "mb-4 font-medium text-sm" : "sr-only"}>Saved settings</legend>
      {presets.length > 0 && (
        <ul className="flex flex-col">
          {presets.map((p, i) => {
            const active = sameSubset(p.values, current);
            return (
              <li key={p.name} className="flex items-center gap-1">
                <Button
                  data-entry={i}
                  variant="text"
                  size="bare"
                  className="min-w-0 flex-1 justify-start"
                  aria-pressed={active}
                  onClick={() => onApply(p.values)}
                >
                  <span className="truncate">{p.name}</span>
                  {active && <Check size={16} strokeWidth={1.5} aria-hidden />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => {
                    deletePreset(spec, slug, p.name, preset);
                    focusAfterDelete.current = i;
                    setPresets(readPresets(spec, slug, preset));
                    say(`Deleted ${p.name}.`);
                  }}
                >
                  <Trash2 size={20} strokeWidth={1.5} aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={nameId} className="font-medium text-sm">
            Name these settings
          </label>
          <Input
            ref={input}
            id={nameId}
            className="mt-2"
            value={name}
            maxLength={40}
            autoComplete="off"
            aria-describedby={problem ? problemId : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setProblem(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
          />
        </div>
        <Button variant="secondary" onClick={save}>
          Save
        </Button>
      </div>
      {problem && (
        <p id={problemId} className="text-fg-muted text-xs">
          {problem}
        </p>
      )}
    </fieldset>
  );
}
