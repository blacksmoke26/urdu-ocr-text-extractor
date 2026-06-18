/**
 * Status Badge component.
 * Displays small colored indicators for health, processing state, or result status.
 */

import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import type { ComponentType } from 'react';

type BadgeVariant = 'success' | 'error' | 'warning' | 'loading' | 'info' | 'custom';

export interface BadgeProps {
  /** Semantic variant controlling color and icon. */
  variant?: BadgeVariant;
  /** Short text label displayed inside the badge. */
  label: string;
  /** Optional override component to render as the badge icon (defaults to variant's icon). */
  icon?: ComponentType<{ className?: string }>;
}

const STYLE_MAP: Record<BadgeVariant, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  success: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
  error:   { bg: 'bg-red-500/10',     text: 'text-red-600 dark:text-red-400',     icon: XCircle },
  warning: { bg: 'bg-amber-500/10',   text: 'text-amber-600 dark:text-amber-400', icon: AlertTriangle },
  loading: { bg: 'bg-blue-500/10',    text: 'text-blue-600 dark:text-blue-400',   icon: Loader2 },
  info:    { bg: 'bg-violet-500/10',  text: 'text-violet-600 dark:text-violet-400', icon: CheckCircle2 },
  custom:  { bg: 'bg-violet-500/10',  text: 'text-violet-600 dark:text-violet-400', icon: CheckCircle2 },
};

/**
 * A small inline indicator with an icon and label.
 * Supports `loading` variant which shows a spinner animation.
 */
export function Badge({ variant = 'info', label, icon }: BadgeProps) {
  const { bg, text, icon: defaultIcon } = STYLE_MAP[variant];
  const Icon = icon || defaultIcon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${bg} ${text}`}>
      <Icon className={`h-3 w-3 ${variant === 'loading' ? 'animate-spin' : ''}`}/>
      {label}
    </span>
  );
}
