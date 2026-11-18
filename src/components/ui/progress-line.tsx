/** Thin, honest progress line (design system §6.4 signature moment 2). Linear easing only. */
export function ProgressLine({ ratio, label }: { ratio: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className="h-0.5 w-full overflow-hidden bg-border"
    >
      <div
        className="h-full w-full origin-left bg-accent transition-transform duration-(--duration-fast) ease-linear"
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  );
}
