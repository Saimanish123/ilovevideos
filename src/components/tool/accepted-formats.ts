/**
 * The formats a page reads, by what it accepts (video pages list containers, audio pages list audio
 * formats). Imported only when a file fails to read, so the lists never weigh on first load.
 */
import { audioSources } from "@/content/formats/audio";
import { containers } from "@/content/formats/containers";
import type { ToolDefinition } from "@/tools/registry/schema";

const list = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export function acceptedFormatsFor(accepts: ToolDefinition["accepts"]): string | undefined {
  const names = [
    ...(accepts.includes("video") ? containers.map((c) => c.name) : []),
    ...(accepts.includes("audio") ? audioSources.map((s) => s.name) : []),
  ];
  const unique = [...new Set(names)];
  return unique.length > 0 ? `This page reads ${list(unique)} files.` : undefined;
}
