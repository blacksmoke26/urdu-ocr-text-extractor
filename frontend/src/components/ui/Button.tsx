/**
 * Primary Button component.
 * Supports multiple variants (default, destructive, ghost) and loading state with spinner icon.
 */

import { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps {
  variant?: ButtonVariant;
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-violet-600 text-white hover:bg-violet-700 disabled:bg-violet-400',
  secondary: 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50',
  ghost: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50',
  destructive: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400',
};

/**
 * A styled button with consistent spacing and dark-mode awareness.
 * When `loading` is true, shows a spinner and disables interaction.
 */
export function Button({
  variant = 'primary',
  children,
  disabled = false,
  loading = false,
  onClick,
  className = '',
  type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
