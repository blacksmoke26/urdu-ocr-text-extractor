/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2026 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import React, {useRef} from 'react';
import {cn} from '#/lib/utils';
import {Label, type LabelProps} from './Label';

/**
 * Available variants for the Checkbox shape.
 * @default 'default'
 */
export type CheckboxVariant = 'default' | 'rounded' | 'circle';

/**
 * Available sizes for the Checkbox.
 * @default 'md'
 */
export type CheckboxSize = 'sm' | 'md' | 'lg';

/**
 * Available colors for the Checkbox.
 * @default 'primary'
 */
export type CheckboxColor = 'primary' | 'secondary' | 'destructive' | 'accent' | 'success' | 'info' | 'warning';

/**
 * Properties for the Checkbox component.
 * Extends standard HTML input attributes for checkboxes.
 */
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'checked' | 'size'> {
  /**
   * The checked state of the checkbox.
   * @default false
   */
  checked?: boolean;

  /**
   * The text label to display next to the checkbox.
   */
  label?: string;

  /**
   * Additional properties to pass to the Label component.
   */
  labelOptions?: Omit<LabelProps, 'children'>;

  /**
   * Callback function invoked when the checked state changes.
   * @param checked - The new checked state.
   */
  onCheckedChange?(checked: boolean): void;

  /**
   * The visual variant of the checkbox.
   * @default 'default'
   */
  variant?: CheckboxVariant;

  /**
   * The size of the checkbox.
   * @default 'md'
   */
  size?: CheckboxSize;

  /**
   * The color scheme of the checkbox when checked.
   * @default 'primary'
   */
  color?: CheckboxColor;
}

/** Mapping of size variants to Tailwind classes */
const sizeClasses: Record<CheckboxSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

/** Mapping of checkmark icon sizes to Tailwind classes */
const iconSizeClasses: Record<CheckboxSize, string> = {
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
};

/** Mapping of label text sizes to Tailwind classes */
const labelSizeClasses: Record<CheckboxSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

/** Mapping of shape variants to Tailwind classes */
const variantClasses: Record<CheckboxVariant, string> = {
  default: 'rounded-sm',
  rounded: 'rounded-md',
  circle: 'rounded-full',
};

/** Mapping of color schemes to Tailwind classes */
const colorClasses: Record<CheckboxColor, { checked: string; unchecked: string }> = {
  primary: {
    checked: 'bg-primary border-primary text-primary-foreground',
    unchecked: 'bg-background border-input hover:border-primary/50',
  },
  secondary: {
    checked: 'bg-secondary border-secondary text-secondary-foreground',
    unchecked: 'bg-background border-input hover:border-secondary/50',
  },
  destructive: {
    checked: 'bg-destructive border-destructive text-destructive-foreground',
    unchecked: 'bg-background border-input hover:border-destructive/50',
  },
  accent: {
    checked: 'bg-accent border-accent text-accent-foreground',
    unchecked: 'bg-background border-input hover:border-accent/50',
  },
  success: {
    checked: 'bg-green-600 border-green-600 text-white',
    unchecked: 'bg-background border-input hover:border-green-600/50',
  },
  info: {
    checked: 'bg-blue-600 border-blue-600 text-white',
    unchecked: 'bg-background border-input hover:border-blue-600/50',
  },
  warning: {
    checked: 'bg-yellow-500 border-yellow-500 text-white',
    unchecked: 'bg-background border-input hover:border-yellow-500/50',
  },
};

/**
 * Checkbox component for selection controls.
 * Visually hides the native input while maintaining accessibility,
 * rendering a custom styled checkmark when checked.
 *
 * @example
 * <Checkbox
 *   checked={true}
 *   variant="circle"
 *   size="lg"
 *   color="destructive"
 *   onCheckedChange={(checked) => console.log(checked)}
 * />
 */
export const Checkbox: React.FC<CheckboxProps> = (props) => {
  const {
    className,
    checked,
    onCheckedChange,
    disabled,
    variant = 'default',
    size = 'md',
    color = 'primary',
    ...remainingProps
  } = props;

  /** Reference to the hidden input element */
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Handles pointer down events to prevent focus loss.
   * @param e - The pointer event.
   */
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
  };

  /**
   * Handles click events to toggle the checkbox state.
   * @param e - The mouse event.
   */
  const handleClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (disabled) return;
    e.stopPropagation();
    const input = inputRef.current;
    if (input) {
      const newState: boolean = !input.checked;
      input.checked = newState;
      input.dispatchEvent(new Event('change', {bubbles: true}));
      onCheckedChange?.(newState);
    }
  };

  /**
   * Handles keyboard events to toggle the checkbox state via Spacebar.
   * @param e - The keyboard event.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      e.stopPropagation();
      const input = inputRef.current;
      if (input) {
        const newState: boolean = !input.checked;
        input.checked = newState;
        input.dispatchEvent(new Event('change', {bubbles: true}));
        onCheckedChange?.(newState);
      }
    }
  };

  const currentColorClass = checked ? colorClasses[color].checked : colorClasses[color].unchecked;


  return (
    <div className="flex items-center gap-2 mb-1">
      <div
        className={cn(
          'relative inline-flex items-center justify-center ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 select-none shrink-0',
          variantClasses[variant],
          sizeClasses[size],
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          className,
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        tabIndex={disabled ? undefined : 0}
        role="checkbox"
        aria-checked={checked || false}
        aria-disabled={disabled || false}
        aria-label={props['aria-label'] || 'Checkbox'}
      >
        <input
          size={props?.size as any}
          ref={inputRef}
          type="checkbox"
          checked={checked || false}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            onCheckedChange?.(e.target.checked);
          }}
          disabled={disabled}
          className="sr-only absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          {...remainingProps}
        />

        {/* Visual Indicator */}
        <div
          className={cn(
            'flex items-center justify-center w-full h-full border pointer-events-none',
            variantClasses[variant],
            'transition-colors duration-200 ease-in-out',
            currentColorClass,
          )}
        >
          {checked && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={iconSizeClasses[size]}
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          )}
        </div>
      </div>

      {props?.label && (
        <Label
          className={cn(
            'font-normal cursor-pointer',
            labelSizeClasses[size],
            disabled && 'cursor-not-allowed opacity-50',
            props?.labelOptions?.className,
          )}
          {...(props?.labelOptions ?? {})}
          onClick={(e) => handleClick(e as unknown as React.MouseEvent<HTMLDivElement>)}
        >
          {props.label}
        </Label>
      )}
    </div>
  );
};

export default Checkbox;
