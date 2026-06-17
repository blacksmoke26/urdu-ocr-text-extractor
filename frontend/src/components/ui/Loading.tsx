/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2026 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import React from 'react';
import {cn} from '#/lib/utils';

/**
 * Props for the LoadingSpinner component.
 */
interface LoadingSpinnerProps {
  /** Additional CSS classes to apply. */
  className?: string;
  /** Size of the spinner, defaults to 'md'. */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * A rotating spinner animation for indicating loading states.
 *
 * @example
 * <LoadingSpinner size="lg" className="text-blue-500" />
 *
 * @developer_note
 * The spinner uses Tailwind's `animate-spin` for rotation and `border-current` to inherit text color.
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({className, size = 'md'}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <div
      className={cn('animate-spin rounded-full border-2 border-current border-t-transparent', sizeClasses[size], className)}/>
  );
};

/**
 * Props for the LoadingDots component.
 */
interface LoadingDotsProps {
  /** Additional CSS classes to apply. */
  className?: string;
}

/**
 * A bouncing dots animation for indicating loading states.
 *
 * @example
 * <LoadingDots className="text-gray-400" />
 *
 * @developer_note
 * Each dot has a staggered animation delay for a smooth wave effect.
 */
export const LoadingDots: React.FC<LoadingDotsProps> = ({className}) => {
  return (
    <div className={cn('flex space-x-1', className)}>
      <div className="h-2 w-2 bg-current rounded-full animate-bounce" style={{animationDelay: '0ms'}}/>
      <div className="h-2 w-2 bg-current rounded-full animate-bounce" style={{animationDelay: '150ms'}}/>
      <div className="h-2 w-2 bg-current rounded-full animate-bounce" style={{animationDelay: '300ms'}}/>
    </div>
  );
};
