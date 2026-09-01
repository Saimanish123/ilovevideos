import { icons, type LucideProps } from "lucide-react";

/**
 * Resolves a registry icon name. Lucide names are kebab-case ("minimize-2").
 * Custom monoline glyphs for tools should be added here as they are drawn (see design system §7).
 */
export function ToolIcon({ name, ...props }: { name: string } & LucideProps) {
  const pascal = name.replace(/(^|-)(\w)/g, (_, __, ch: string) => ch.toUpperCase());
  const Icon = icons[pascal as keyof typeof icons];
  if (!Icon) return <span aria-hidden className="inline-block size-6" />;
  return <Icon size={24} strokeWidth={1.5} aria-hidden {...props} />;
}
