import type { ReactNode } from "react";

/** Label + control + one-line hint (README.md#tool-page-specification §3). */
export function Field({
  label,
  hint,
  htmlFor,
  labelId,
  trailing,
  children,
}: {
  label: string;
  hint?: string;
  /** Id of the control this labels. Use `labelId` + `aria-labelledby` for grouped controls instead. */
  htmlFor?: string;
  labelId?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="font-medium text-sm">
            {label}
          </label>
        ) : (
          <span id={labelId} className="font-medium text-sm">
            {label}
          </span>
        )}
        {trailing && <span className="tabular text-fg-muted text-sm">{trailing}</span>}
      </div>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-2 text-fg-muted text-xs">{hint}</p>}
    </div>
  );
}
