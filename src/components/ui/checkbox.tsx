import { Check } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";

/** Native checkbox with a drawn box; label and optional hint. */
export function Checkbox({
  label,
  hint,
  ...props
}: { label: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <span className="relative mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-bg-raised has-checked:border-fg has-checked:bg-fg has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2">
        <input
          type="checkbox"
          {...props}
          className="peer absolute inset-0 cursor-pointer opacity-0"
        />
        <Check
          size={12}
          strokeWidth={1.5}
          aria-hidden
          className="hidden text-bg-raised peer-checked:block"
        />
      </span>
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-fg-muted text-xs">{hint}</span>}
      </span>
    </label>
  );
}
