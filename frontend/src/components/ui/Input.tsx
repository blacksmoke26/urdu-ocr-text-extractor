/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2026 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import React, {forwardRef, type KeyboardEvent, useEffect, useImperativeHandle, useRef, useState} from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import {Slot} from '@radix-ui/react-slot';
import {AlertCircle, Check, ChevronDown, Copy, Eye, EyeOff, Loader2} from 'lucide-react';
import {cn} from '#/lib/utils';


/**
 * Types for the design system
 */
export type InputSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'plain';
export type InputVariant = 'default' | 'filled' | 'floating' | 'ghost';
export type InputColor = 'default' | 'primary' | 'secondary' | 'destructive' | 'success';
export type MaskPattern = 'phone' | 'credit-card' | 'date' | 'numeric' | 'custom';

/**
 * Configuration Maps for styling
 */

// 1. Input Size Dimensions
const SIZES: Record<InputSize, string> = {
  xs: 'h-8 px-2.5 py-1.5 text-xs',
  sm: 'h-9 px-3 py-1.5 text-sm',
  md: 'h-10 px-3 py-2 text-sm',
  lg: 'h-11 px-4 py-2.5 text-base',
  xl: 'h-14 px-5 py-3 text-lg',
  plain: 'h-auto px-0 py-0 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none',
};

// 2. Icon Sizing
const ICON_SIZES: Record<InputSize, string> = {
  xs: 'h-3 w-3',
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
  xl: 'h-6 w-6',
  plain: 'h-4 w-4',
};

// 3. Label Font Sizes (Specifically for the Floating Label)
const LABEL_SIZES: Record<InputSize, string> = {
  xs: 'text-[10px]',
  sm: 'text-xs',
  md: 'text-xs',
  lg: 'text-sm',
  xl: 'text-base',
  plain: 'text-sm',
};

/**
 * FLOATING_OFFSETS IMPLEMENTATION
 *
 * This map defines the geometry for the floating label animation.
 * - `idle`: The top position when the input is empty and unfocused (visually centered).
 * - `active`: The transform/translate logic to move the label to the top border and scale it down.
 */
const FLOATING_OFFSETS: Record<InputSize, { idle: string; active: string }> = {
  xs: {
    idle: 'top-[10px]',
    active: '-translate-y-[135%] scale-75',
  },
  sm: {
    idle: 'top-[11px]',
    active: '-translate-y-[130%] scale-75',
  },
  md: {
    idle: 'top-[13px]',
    active: '-translate-y-[125%] scale-75',
  },
  lg: {
    idle: 'top-[15px]',
    active: '-translate-y-[120%] scale-75',
  },
  xl: {
    idle: 'top-[18px]',
    active: '-translate-y-[115%] scale-75',
  },
  plain: {
    idle: 'top-0',
    active: '',
  },
};

// Variant Styling
const VARIANTS: Record<InputVariant, { base: string; input: string; label?: string }> = {
  default: {
    base: 'bg-background border-input',
    input: 'border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-ring',
  },
  filled: {
    base: 'bg-muted/50 border-transparent',
    input: 'border-transparent focus:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
  },
  floating: {
    base: 'bg-background border-input',
    input: 'border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    label: 'bg-background', // Label needs background to hide border line behind it
  },
  ghost: {
    base: 'bg-transparent border-transparent',
    input: 'border-transparent hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground focus-visible:ring-0',
  },
};

// Color Theming
const COLORS: Record<InputColor, { ring: string; border: string; text?: string }> = {
  default: {ring: 'focus-visible:ring-ring', border: 'border-input'},
  primary: {ring: 'focus-visible:ring-primary', border: 'border-input focus-visible:border-primary'},
  secondary: {ring: 'focus-visible:ring-secondary', border: 'border-input focus-visible:border-secondary'},
  destructive: {
    ring: 'focus-visible:ring-destructive',
    border: 'border-input focus-visible:border-destructive',
    text: 'text-destructive',
  },
  success: {ring: 'focus-visible:ring-green-500', border: 'border-input focus-visible:border-green-500'},
};

/**
 * Advanced Input component props
 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'color'> {
  variant?: InputVariant;
  size?: InputSize;
  color?: InputColor;
  label?: string;
  description?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isLoading?: boolean;
  enablePasswordToggle?: boolean;
  maxLength?: number;
  showCharCount?: boolean;
  containerClassName?: string;
  showFooter?: boolean;
  noVisibleRing?: boolean;

  // --- ADVANCED FEATURES ---
  suggestions?: string[];
  mask?: MaskPattern;
  maskChar?: string;
  maskPlaceholder?: string;
  autoClosingPairs?: boolean;
  allowCopy?: boolean;

  onCopy?(): void;

  onRightIconClick?(): void;

  onSuggestionSelect?(value: string): void;
}

/**
 * Input Component
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      type = 'text',
      variant = 'default',
      size = 'md',
      color = 'default',
      label,
      description,
      error,
      leftIcon,
      rightIcon,
      onRightIconClick,
      showFooter = true,
      isLoading = false,
      enablePasswordToggle = false,
      maxLength,
      showCharCount = false,
      value,
      defaultValue,
      onChange,
      onKeyDown,
      onBlur,
      noVisibleRing = false,

      // Advanced Props
      suggestions = [],
      onSuggestionSelect,
      mask,
      maskChar = '#',
      maskPlaceholder = ' ',
      autoClosingPairs = false,
      allowCopy = false,
      onCopy,
      ...props
    },
    ref,
  ) => {
    // --- Internal State ---
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [isShaking, setIsShaking] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
    const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);

    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionListRef = useRef<HTMLUListElement>(null);

    useImperativeHandle(ref, () => inputRef.current!);

    // --- Logic: Masking & Formatting ---
    const formatValue = (rawValue: string) => {
      if (!mask) return rawValue;
      const digits = rawValue.replace(/\D/g, '');
      if (mask === 'phone') return applyPattern(digits, '(###) ###-####', 10);
      if (mask === 'credit-card') return applyPattern(digits, '#### #### #### ####', 16);
      if (mask === 'date') return applyPattern(digits, '##/##/####', 8);
      if (mask === 'numeric') return digits;
      return applyPattern(digits, maskChar.repeat(mask.length), mask.length);
    };

    const applyPattern = (value: string, pattern: string, maxDigits: number) => {
      let i = 0;
      return pattern.replace(/#/g, () => {
        if (i >= value.length || i >= maxDigits) return maskPlaceholder;
        return value[i++];
      });
    };

    // --- Logic: Auto-closing Pairs ---
    const PAIRS: Record<string, string> = {
      '(': ')', '[': ']', '{': '}', '"': '"', '\'': '\'',
    };

    const handleKeyDownAdvanced = (e: KeyboardEvent<HTMLInputElement>) => {
      if (showSuggestions) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveSuggestionIndex((prev) => (prev + 1) % filteredSuggestions.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveSuggestionIndex((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          selectSuggestion(filteredSuggestions[activeSuggestionIndex]);
        } else if (e.key === 'Escape') {
          setShowSuggestions(false);
        }
      }

      if (autoClosingPairs && !e.shiftKey && PAIRS[e.key]) {
        const input = inputRef.current;
        if (input) {
          const start = input?.selectionStart || 0;
          const end = input?.selectionEnd || 0;
          const currentValue = (value ?? defaultValue) as string;
          const newValue = currentValue.substring(0, start) + e.key + PAIRS[e.key] + currentValue.substring(end);

          if (onChange) onChange({target: {value: newValue}} as React.ChangeEvent<HTMLInputElement>);
          setTimeout(() => input.setSelectionRange(start + 1, start + 1), 0);
          e.preventDefault();
        }
      }
      onKeyDown?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      if (mask) {
        const formatted = formatValue(rawValue);
        e.target.value = formatted;
        if (onChange) onChange({...e, target: {...e.target, value: formatted}} as React.ChangeEvent<HTMLInputElement>);
      } else {
        onChange?.(e);
      }

      if (suggestions.length > 0) {
        const val = e.target.value.toLowerCase();
        if (val.length > 0) {
          const filtered = suggestions.filter(s => s.toLowerCase().includes(val));
          setFilteredSuggestions(filtered);
          setActiveSuggestionIndex(0);
          setShowSuggestions(filtered.length > 0);
        } else {
          setShowSuggestions(false);
        }
      }
    };

    const selectSuggestion = (val: string) => {
      setShowSuggestions(false);
      if (onChange) onChange({target: {value: val}} as React.ChangeEvent<HTMLInputElement>);
      onSuggestionSelect?.(val);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setTimeout(() => setShowSuggestions(false), 200);
      onBlur?.(e);
    };

    const handleCopy = async () => {
      if (inputRef.current) {
        try {
          await navigator.clipboard.writeText(inputRef.current.value);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
          onCopy?.();
        } catch (err) {
          console.error('Failed to copy text: ', err);
        }
      }
    };

    // --- Effects ---
    useEffect(() => {
      if (error) {
        setIsShaking(true);
        const timer = setTimeout(() => setIsShaking(false), 500);
        return () => clearTimeout(timer);
      }
    }, [error]);

    useEffect(() => {
      if (showSuggestions && suggestionListRef.current) {
        const activeItem = suggestionListRef.current.children[activeSuggestionIndex] as HTMLElement;
        if (activeItem) activeItem.scrollIntoView({block: 'nearest'});
      }
    }, [activeSuggestionIndex, showSuggestions]);

    // --- Derived UI ---
    const internalValue = (value !== undefined ? value : defaultValue) as string;
    const hasValue = internalValue && internalValue.length > 0;

    const activeColor = error ? 'destructive' : color;
    const colorStyles = COLORS[activeColor];
    const variantConfig = VARIANTS[variant];
    const sizeClasses = SIZES[size];
    const iconSizeClass = ICON_SIZES[size];

    // Floating Geometry from CONSTANT
    const floatGeom = FLOATING_OFFSETS[size];

    let renderRightIcon = rightIcon;
    if (isLoading) renderRightIcon = <Loader2 className={cn('animate-spin', iconSizeClass)}/>;
    else if (error && !rightIcon && !enablePasswordToggle) renderRightIcon = <AlertCircle className={iconSizeClass}/>;
    else if (enablePasswordToggle && type === 'password') {
      renderRightIcon = isPasswordVisible ? <EyeOff className={iconSizeClass}/> : <Eye className={iconSizeClass}/>;
    } else if (isCopied) renderRightIcon = <Check className={cn('text-green-500', iconSizeClass)}/>;
    else if (allowCopy && !rightIcon) renderRightIcon = <Copy className={iconSizeClass}/>;

    const inputType = (type === 'password' || enablePasswordToggle) && !isPasswordVisible ? 'password' : type;

    const inputClasses = cn(
      'flex w-full rounded-md file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50',
      'ring-offset-background focus-visible:outline-none',
      sizeClasses,
      variantConfig.base,
      noVisibleRing ? '' : variantConfig.input,
      colorStyles.ring,
      error ? 'border-destructive text-destructive' : colorStyles.border,
      leftIcon && (size === 'plain' ? '' : 'pl-9'),
      (renderRightIcon || allowCopy || suggestions.length > 0) && (size === 'plain' ? '' : 'pr-9'),
      variant === 'floating' && 'peer',
      className,
    );

    return (
      <div className={cn('relative w-full', size === 'plain' ? '' : 'space-y-1.5', containerClassName)}>

        {/* Standard Label (Non-Floating) */}
        {label && variant !== 'floating' && variant !== 'default' && (
          <LabelPrimitive.Root
            htmlFor={props.id}
            className={cn(
              'font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
              LABEL_SIZES[size],
              error && 'text-destructive',
            )}
          >
            {label}
          </LabelPrimitive.Root>
        )}

        {/* Input Wrapper */}
        <div className={cn('relative group w-full', isShaking && 'animate-[shake_0.5s_ease-in-out]')}>

          {/* Left Icon */}
          {leftIcon && (
            <div className={cn(
              'absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none group-focus-within:text-foreground transition-colors',
              (size === 'lg' || size === 'xl') && 'left-3',
            )}>
              <Slot className={iconSizeClass}>{leftIcon}</Slot>
            </div>
          )}

          {/* The Input */}
          <input
            ref={inputRef}
            type={inputType}
            value={value}
            defaultValue={defaultValue}
            maxLength={mask ? undefined : maxLength}
            className={inputClasses}
            onChange={handleChange}
            onKeyDown={handleKeyDownAdvanced}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={handleBlur}
            autoComplete="off"
            {...props}
          />

          {/* Floating Label Implementation */}
          {variant === 'floating' && label && (
            <label
              htmlFor={props.id}
              className={cn(
                'absolute left-2.5 origin-[0] transition-all duration-200 pointer-events-none',
                'bg-background px-1', // Mask border

                // 1. Apply IDLE geometry from MAP
                floatGeom.idle,

                // 2. Text Color & Font Size
                LABEL_SIZES[size],
                'text-muted-foreground',
                error && 'text-destructive peer-focus:text-destructive',
                isFocused && 'text-foreground', // Focus color override

                // 3. Idle State (Default)
                'peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100',
                'peer-placeholder-shown:text-inherit', // Inherit text size when idle

                // 4. Active State (Applied via peer-focus OR hasValue)
                'peer-focus:scale-75 peer-focus:text-foreground',
                // We apply the transform manually using the string from MAP because
                // we need to apply it also when 'hasValue' is true (not just on focus)
                (isFocused || hasValue) && floatGeom.active,

                // Color overrides
                error && (isFocused || hasValue) && 'text-destructive',
              )}
            >
              {label}
            </label>
          )}

          {/* Right Actions */}
          <div className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5',
            (size === 'lg' || size === 'xl') && 'right-2',
          )}>
            {suggestions.length > 0 && !isLoading && !error && !rightIcon && !enablePasswordToggle && variant !== 'default' && (
              <div className="pointer-events-none text-muted-foreground pr-1">
                <ChevronDown className={cn(iconSizeClass, 'opacity-50')}/>
              </div>
            )}

            {(renderRightIcon || allowCopy) && variant !== 'default' && (
              <button
                type="button"
                onClick={() => {
                  if (enablePasswordToggle) setIsPasswordVisible(!isPasswordVisible);
                  else if (allowCopy && !rightIcon && !isLoading) handleCopy();
                  else onRightIconClick?.();
                }}
                disabled={isLoading}
                className={cn(
                  'flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-ring disabled:pointer-events-none disabled:opacity-50',
                  size === 'xs' && 'h-6 w-6',
                  size === 'sm' && 'h-7 w-7',
                  size === 'md' && 'h-8 w-8',
                  size === 'lg' && 'h-9 w-9',
                  size === 'xl' && 'h-10 w-10',
                  (enablePasswordToggle || allowCopy || onRightIconClick) && 'cursor-pointer',
                )}
                tabIndex={-1}
              >
                <Slot className={iconSizeClass}>{renderRightIcon}</Slot>
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {showSuggestions && filteredSuggestions.length > 0 && variant !== 'default' && (
            <ul
              ref={suggestionListRef}
              className={cn(
                'absolute z-50 w-full mt-1 bg-popover text-popover-foreground shadow-md rounded-md border py-1 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 zoom-in-95 duration-200',
                LABEL_SIZES[size],
              )}
            >
              {filteredSuggestions.map((suggestion, index) => (
                <li
                  key={index}
                  onClick={() => selectSuggestion(suggestion)}
                  className={cn(
                    'px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground flex items-center justify-between transition-colors',
                    index === activeSuggestionIndex && 'bg-accent text-accent-foreground',
                  )}
                >
                  {suggestion}
                  {index === activeSuggestionIndex && <span className="opacity-50 ml-2">↵</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {showFooter && (
          (variant !== 'default') && (
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="min-h-[1rem]">
                {error ? (
                  <p className={cn(
                    'flex items-center gap-1 animate-in fade-in slide-in-from-top-1',
                    LABEL_SIZES[size],
                    'text-destructive',
                  )}>
                    {error}
                  </p>
                ) : description && (
                  <p className={cn('text-muted-foreground', LABEL_SIZES[size])}>
                    {description}
                  </p>
                )}
              </div>
              {showCharCount && maxLength && (
                <p className={cn(
                  'tabular-nums text-muted-foreground',
                  LABEL_SIZES[size],
                  hasValue && maxLength && String(internalValue ?? '').length >= maxLength && 'text-destructive',
                )}>
                  {String(internalValue ?? '').length}/{maxLength}
                </p>
              )}
            </div>
          )
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
