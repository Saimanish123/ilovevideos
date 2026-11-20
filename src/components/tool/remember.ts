/**
 * Remembered settings and saved presets per tool page (ADR-0129, feature catalog L3). Both hold the
 * subset of a page's options that its spec names in `remember`: settings that do not depend on the
 * file. Stored in this browser's local storage under `settings:<slug>` and `presets:<slug>`, read
 * back through the spec's schema key by key, so a value from an older version of a page, or one
 * edited by hand, is dropped and the page's default stands. Keys the page's preset sets (a page's
 * target size, a pair page's format) are never restored or saved over it.
 *
 * Loaded with the stage's parts after a file is chosen; nothing here runs on a page's first load.
 */
import { PRESETS_PREFIX, SETTINGS_PREFIX } from "@/lib/storage/keys";
import { readJson, removeKey, writeJson } from "@/lib/storage/local";
import type { MediaInfo } from "@/tools/engines/types";
import type { OptionsSpec } from "./options/types";

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous option shapes; each spec is typed internally
type AnySpec = OptionsSpec<any>;
type Kept = Record<string, unknown>;

export const settingsKey = (slug: string) => `${SETTINGS_PREFIX}${slug}`;
export const presetsKey = (slug: string) => `${PRESETS_PREFIX}${slug}`;
/** Saved presets per page, and the longest name. */
export const PRESET_MAX = 12;
export const PRESET_NAME_MAX = 40;

export interface SavedPreset {
  name: string;
  values: Kept;
}

/** The keys the page preset fixes: never restored from memory, never saved. */
function lockedKeys(preset: Record<string, unknown>): Set<string> {
  return new Set(Object.keys(preset).filter((k) => preset[k] !== undefined));
}

/** The kept subset of `value` (the spec's `pick`, or its schema's keys), without undefined values. */
export function subsetOf(
  spec: AnySpec,
  value: unknown,
  preset: Record<string, unknown> = {},
): Kept {
  const r = spec.remember;
  if (!r || value === null || typeof value !== "object") return {};
  const raw: Kept = r.pick
    ? r.pick(value)
    : Object.fromEntries(Object.keys(r.schema.shape).map((k) => [k, (value as Kept)[k]]));
  const locked = lockedKeys(preset);
  const out: Kept = {};
  for (const [k, v] of Object.entries(raw)) if (v !== undefined && !locked.has(k)) out[k] = v;
  return out;
}

/** The valid keys of a stored subset: each one checked by its own schema, locked keys left out. */
export function validSubset(
  spec: AnySpec,
  raw: unknown,
  preset: Record<string, unknown> = {},
): Kept {
  const shape = spec.remember?.schema.shape;
  if (!shape || raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const locked = lockedKeys(preset);
  const out: Kept = {};
  for (const [k, v] of Object.entries(raw as Kept)) {
    const field = shape[k];
    if (!field || locked.has(k)) continue;
    try {
      const parsed = field.safeParse(v);
      if (parsed.success) out[k] = parsed.data;
    } catch {
      // A schema that throws is a page bug; the default stands.
    }
  }
  return out;
}

/** `value` with a kept subset put back (the spec's `apply`, or a shallow merge). */
export function applySubset<O>(spec: AnySpec, value: O, kept: Kept): O {
  if (Object.keys(kept).length === 0) return value;
  const r = spec.remember;
  if (!r) return value;
  return r.apply ? r.apply(value, kept) : ({ ...value, ...kept } as O);
}

/** Order-independent JSON, so two subsets with the same values compare equal. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Kept)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v) ?? "undefined";
}

export const sameSubset = (a: Kept, b: Kept) => stable(a) === stable(b);

/** The settings remembered for this page, validated; {} when none. */
export function readRemembered(
  spec: AnySpec,
  slug: string,
  preset: Record<string, unknown> = {},
): Kept {
  if (!spec.remember) return {};
  const stored = readJson(settingsKey(slug));
  const values =
    stored && typeof stored === "object" ? (stored as { values?: unknown }).values : undefined;
  return validSubset(spec, values, preset);
}

export interface StartOptions<O> {
  /** What the page starts the file with: its defaults, with the remembered settings applied. */
  options: O;
  /** The page's own defaults for this file, for "Reset to defaults". */
  defaults: O;
  /** True when remembered settings changed something. */
  restored: boolean;
}

/** `spec.defaults(info, preset)`, then the remembered subset over it (pages without `remember`: as is). */
export function startOptions<O>(
  spec: OptionsSpec<O>,
  slug: string,
  info: MediaInfo,
  preset: Record<string, unknown>,
): StartOptions<O> {
  const defaults = spec.defaults(info, preset);
  if (!spec.remember) return { options: defaults, defaults, restored: false };
  const kept = readRemembered(spec, slug, preset);
  let options = defaults;
  try {
    options = applySubset(spec, defaults, kept);
  } catch {
    options = defaults;
  }
  const restored = !sameSubset(subsetOf(spec, options, preset), subsetOf(spec, defaults, preset));
  return { options, defaults, restored };
}

/**
 * Keeps the page's current settings for the next file: the subset when it differs from the
 * defaults, nothing when it matches them (so a page's defaults can improve later).
 */
export function persistSettings(
  spec: AnySpec,
  slug: string,
  value: unknown,
  defaults: unknown,
  preset: Record<string, unknown>,
): void {
  if (!spec.remember) return;
  const now = subsetOf(spec, value, preset);
  if (sameSubset(now, subsetOf(spec, defaults, preset))) removeKey(settingsKey(slug));
  else writeJson(settingsKey(slug), { v: 1, values: now });
}

export function forgetSettings(slug: string): void {
  removeKey(settingsKey(slug));
}

/** This page's saved presets, oldest first; entries that do not parse are dropped. */
export function readPresets(
  spec: AnySpec,
  slug: string,
  preset: Record<string, unknown> = {},
): SavedPreset[] {
  const stored = readJson(presetsKey(slug));
  const items =
    stored && typeof stored === "object" ? (stored as { items?: unknown }).items : undefined;
  if (!Array.isArray(items)) return [];
  const out: SavedPreset[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const name = (it as { name?: unknown }).name;
    if (typeof name !== "string" || !name.trim() || name.length > PRESET_NAME_MAX) continue;
    const values = validSubset(spec, (it as { values?: unknown }).values, preset);
    if (Object.keys(values).length === 0) continue;
    out.push({ name, values });
  }
  return out.slice(0, PRESET_MAX);
}

/** Why a name cannot be saved, or undefined when it can. A saved name is replaced, not doubled. */
export function presetNameProblem(
  name: string,
  count: number,
  exists: boolean,
): string | undefined {
  const n = name.trim();
  if (!n) return "Type a name first.";
  if (n.length > PRESET_NAME_MAX) return `Up to ${PRESET_NAME_MAX} characters.`;
  if (!exists && count >= PRESET_MAX)
    return `Up to ${PRESET_MAX} presets on a page; delete one to save another.`;
  return undefined;
}

/** Saves (or replaces) a preset; false when storage refused it. */
export function savePreset(
  spec: AnySpec,
  slug: string,
  name: string,
  values: Kept,
  preset: Record<string, unknown> = {},
): boolean {
  const n = name.trim().slice(0, PRESET_NAME_MAX);
  const list = readPresets(spec, slug, preset);
  const i = list.findIndex((p) => p.name.toLowerCase() === n.toLowerCase());
  if (i >= 0) list[i] = { name: n, values };
  else list.push({ name: n, values });
  return writeJson(presetsKey(slug), { v: 1, items: list.slice(0, PRESET_MAX) });
}

export function deletePreset(
  spec: AnySpec,
  slug: string,
  name: string,
  preset: Record<string, unknown> = {},
): void {
  const list = readPresets(spec, slug, preset).filter((p) => p.name !== name);
  if (list.length) writeJson(presetsKey(slug), { v: 1, items: list });
  else removeKey(presetsKey(slug));
}

/** A saved entry applied to the options on screen; the options as they were if the page's `apply` throws. */
export function applyKept<O>(spec: AnySpec, value: O, kept: Kept): O {
  try {
    return applySubset(spec, value, kept);
  } catch {
    return value;
  }
}

/** The kept settings back to the page's defaults for this file; everything else as it is. */
export function resetKept<O>(
  spec: AnySpec,
  value: O,
  defaults: unknown,
  preset: Record<string, unknown>,
): O {
  return applyKept(spec, value, subsetOf(spec, defaults, preset));
}
