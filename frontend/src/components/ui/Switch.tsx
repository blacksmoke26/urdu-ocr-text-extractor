/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import React from 'react';
import * as RSwitch from '@radix-ui/react-switch';
import {Loader2, Check} from 'lucide-react'; // Optional: Icon library for visual feedback

// utils
import {cn} from '#/lib/utils'; // Assuming you have a utility for class merging. If not, use `clsx` or `tailwind-merge`.

// Types for component configuration
export type SwitchSize = 'sm' | 'md' | 'lg';
export type SwitchColor = 'primary' | 'success' | 'danger' | 'warning';

export interface SwitchProps extends RSwitch.SwitchProps {
  /** Unique identifier (auto-generated if omitted) */
  id?: string;
  /** The visual size of the switch */
  size?: SwitchSize;
  /** Color theme of the switch in checked state */
  color?: SwitchColor;
  /** Main label text or element to display next to the switch */
  label?: React.ReactNode;
  /** Helper text to display below the label */
  description?: React.ReactNode;
  /** Shows a loading spinner inside the thumb and disables interaction */
  isLoading?: boolean;
  /** Icon to show when checked (null to disable) */
  checkedIcon?: React.ReactNode;
  /** Icon to show when unchecked (null to disable) */
  uncheckedIcon?: React.ReactNode;
  /** Position of the label relative to the switch */
  labelPosition?: 'left' | 'right' | 'top' | 'bottom';
  /** Custom classes for the label */
  labelClassname?: string;
  /** Custom classes for the root container */
  containerClassName?: string;
}

// Configuration maps for Tailwind classes
const sizeClasses: Record<SwitchSize, string> = {
  sm: 'h-5 w-9',
  md: 'h-6 w-11',
  lg: 'h-7 w-12',
};

const thumbSizeClasses: Record<SwitchSize, string> = {
  sm: 'size-3.5 data-[state=checked]:translate-x-4',
  md: 'size-4 data-[state=checked]:translate-x-5',
  lg: 'size-5 data-[state=checked]:translate-x-6',
};

const colorClasses: Record<SwitchColor, { bg: string; thumb: string; ring: string }> = {
  primary: {
    bg: 'data-[state=checked]:bg-blue-600 dark:data-[state=checked]:bg-blue-500',
    thumb: 'data-[state=checked]:bg-white',
    ring: 'focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900',
  },
  success: {
    bg: 'data-[state=checked]:bg-emerald-600 dark:data-[state=checked]:bg-emerald-500',
    thumb: 'data-[state=checked]:bg-white',
    ring: 'focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900',
  },
  danger: {
    bg: 'data-[state=checked]:bg-rose-600 dark:data-[state=checked]:bg-rose-500',
    thumb: 'data-[state=checked]:bg-white',
    ring: 'focus-visible:ring-rose-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900',
  },
  warning: {
    bg: 'data-[state=checked]:bg-amber-500 dark:data-[state=checked]:bg-amber-400',
    thumb: 'data-[state=checked]:bg-white',
    ring: 'focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900',
  },
};

/**
 * Advanced Switch component with theming, loading states, and accessibility.
 *
 * @example
 * ```tsx
 * <Switch
 *   label="Airplane Mode"
 *   description="Disable all wireless connections"
 *   size="lg"
 *   color="primary"
 *   defaultChecked
 * />
 * ```
 */
export const Switch: React.FC<SwitchProps> = (props) => {
  const {
    id,
    size = 'sm',
    color = 'primary',
    label,
    description,
    isLoading = false,
    checkedIcon = <Check className="size-3 text-white" strokeWidth={3}/>,
    uncheckedIcon = null, // Optional: <X className="size-3 text-gray-400" />
    labelPosition = 'right',
    disabled,
    className,
    containerClassName,
    onCheckedChange,
    labelClassname,
    ...rest
  } = props;

  // Generate unique ID if not provided for accessibility
  const switchId = React.useId();
  const finalId = id || `switch-${switchId}`;
  const descriptionId = `${finalId}-desc`;

  const isDisabled = disabled || isLoading;

  // Determine layout classes based on label position
  const layoutClasses = cn(
    'flex items-start gap-3',
    {
      'flex-row': labelPosition === 'left' || labelPosition === 'right',
      'flex-col-reverse items-start gap-2': labelPosition === 'top',
      'flex-col items-start gap-2': labelPosition === 'bottom',
    },
    labelPosition === 'left' && 'flex-row-reverse',
    containerClassName,
  );

  return (
    <div className={layoutClasses}>
      <label
        className={cn(
          'inline-flex relative items-center cursor-pointer select-none',
          isDisabled && 'cursor-not-allowed opacity-70',
        )}
      >
        <RSwitch.Root
          id={finalId}
          className={cn(
            // Base styles
            'peer items-center inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',

            // Sizes
            sizeClasses[size],

            // Dark Mode Unchecked State (Gray-300 light / Gray-700 dark)
            'bg-gray-300 dark:bg-gray-700',

            // Theme Colors (Checked State)
            colorClasses[color].bg,
            colorClasses[color].ring,

            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          disabled={isDisabled}
          onCheckedChange={(val) => {
            if (!isLoading && onCheckedChange) {
              onCheckedChange(val);
            }
          }}
          aria-describedby={description ? descriptionId : undefined}
          {...rest}
        >
          <RSwitch.Thumb
            className={cn(
              // Base styles
              'pointer-events-none block rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out',

              // Sizes & Translations
              thumbSizeClasses[size],

              // Loading State adjustment
              isLoading && 'translate-x-0',
            )}
          >
            {/* Content inside the thumb (Icons / Loader) */}
            <div className="flex items-center justify-center w-full h-full">
              {isLoading ? (
                <Loader2 className="animate-spin text-gray-400" size={size === 'sm' ? 12 : 16}/>
              ) : (
                <>
                  {/* Use Radix data-state to toggle visibility instead of react state to avoid DOM thrashing */}
                  <span className="data-[state=unchecked]:hidden data-[state=checked]:flex">
                    {checkedIcon}
                  </span>
                  <span className="data-[state=checked]:hidden data-[state=unchecked]:flex">
                    {uncheckedIcon}
                  </span>
                </>
              )}
            </div>
          </RSwitch.Thumb>
        </RSwitch.Root>
      </label>

      {/* Label and Description Section */}
      {(label || description) && (
        <div className={cn('flex flex-col justify-center items-center', labelPosition === 'left' && 'items-end')}>
          {label && (
            <label
              htmlFor={finalId}
              className={cn(
                'font-normal leading-none peer-disabled:cursor-not-allowed pt-[2px] peer-disabled:opacity-70',
                // Text colors based on theme
                'text-gray-900 dark:text-gray-100',
                labelClassname,
              )}
            >
              {label}
            </label>
          )}
          {description && (
            <p
              id={descriptionId}
              className={cn(
                'text-xs mt-1',
                'text-gray-500 dark:text-gray-400',
              )}
            >
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
