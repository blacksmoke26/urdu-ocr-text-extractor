/**
 * ProgressBar component for showing upload/processing progress.
 * Smooth, animated horizontal bar with percentage label overlay.
 */

export interface ProgressBarProps {
  /** Progress value from 0 to 100. */
  value: number;
  /** Optional label shown above the bar. */
  label?: string;
}

/**
 * Visual progress indicator. Shows a filled track proportional to `value`.
 * Disappears when `value` reaches 100 unless explicitly shown.
 */
export function ProgressBar({ value, label }: ProgressBarProps) {
  if (value <= 0 && !label) return null;

  const pct = Math.min(100, Math.max(0, value));

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span>{label}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      )}
      <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
