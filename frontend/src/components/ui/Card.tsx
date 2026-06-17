/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 *
 * Reusable Card component with dark-mode support.
 * Provides a consistent container for content sections throughout the app.
 * Uses Tailwind CSS for styling without external dependencies beyond Radix themes.
 */

import { type ReactNode } from 'react';

interface CardProps {
  /** The card's visual title shown at the top (text or JSX element). */
  title?: string | ReactNode;
  /** Optional subtitle or description below the title. */
  description?: string;
  /** Card content children. */
  children: ReactNode;
  /** Additional class names for customization. */
  className?: string;
}

/**
 * A bordered, rounded container with optional header.
 * Adapts colors based on the `dark` theme class on `html`.
 */
export function Card({ title, description, children, className = '' }: CardProps) {
  return (
    <div className={`rounded-xl border border-gray-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/50 shadow-sm backdrop-blur-sm ${className}`}>
      {(title || description) && (
        <div className="px-5 pt-5 pb-2">
          {title && (
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          )}
          {description && (
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
      )}
      <div className="px-5 py-3">
        {children}
      </div>
    </div>
  );
}
