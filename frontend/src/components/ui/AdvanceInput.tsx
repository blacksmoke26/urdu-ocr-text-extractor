/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import React, {
  useEffect,
  useRef,
  useState,
  useId,
  forwardRef,
  type RefObject,
} from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  Copy,
  CreditCard,
  DollarSign,
  Eye,
  EyeOff,
  Hash,
  Loader2,
  type LucideProps,
  Phone,
  X,
  Tag as TagIcon,
} from 'lucide-react';

// utils
import {cn} from '#/lib/utils';

/**
 * Defines the size variants for input components.
 */
export type InputSize = 'sm' | 'md' | 'lg';

/**
 * Defines the visual variant styles for input components.
 */
export type InputVariant = 'outline' | 'filled' | 'ghost' | 'otp';

/**
 * Defines predefined input format presets for formatting and validation.
 */
export type FormatPreset = 'phone' | 'credit-card' | 'ssn' | 'currency' | 'date' | 'none';

/**
 * Mode of the input component.
 */
export type InputMode = 'text' | 'tags';

/**
 * Comprehensive props interface for an advanced input component.
 * We explicitly omit conflicting properties from standard HTML input attributes and redefine them.
 */
export interface AdvancedInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'size' | 'defaultValue' | 'value' | 'prefix' | 'suffix' | 'onChange' | 'onFocus' | 'onBlur' | 'onKeyDown'
> {
  /**
   * Label text for the input field
   */
  label?: string;

  /**
   * Error message to display below the input
   */
  error?: string;

  /**
   * Helper text for additional guidance or examples
   */
  helperText?: string;

  /**
   * Input size variant
   * @default 'md'
   */
  size?: InputSize;

  /**
   * Visual variant of the input
   * @default 'outline'
   */
  variant?: InputVariant;

  /**
   * Border radius variant
   * @default 'md'
   */
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'full';

  /**
   * Icon to render on the left side of the input
   */
  leftIcon?: React.ReactNode;

  /**
   * Icon to render on the right side of the input
   */
  rightIcon?: React.ReactNode;

  /**
   * Static text or element to render on the left side (prefix)
   */
  prefix?: React.ReactNode;

  /**
   * Static text or element to render on the right side (suffix)
   */
  suffix?: React.ReactNode;

  /**
   * Predefined input format
   * @default 'none'
   */
  format?: FormatPreset;

  /**
   * Regular expression to validate input (optional)
   */
  inputRegex?: RegExp;

  /**
   * Function to format input value
   */
  formatter?(value: string): string;

  /**
   * Enable masked input (e.g., for passwords)
   * @default false
   */
  masked?: boolean;

  /**
   * Character to use for masking
   * @default '•'
   */
  maskChar?: string;

  /**
   * Restrict input to numeric values only
   * @default false
   */
  allowNumericOnly?: boolean;

  /**
   * Enable clear button
   * @default false
   */
  allowClear?: boolean;

  /**
   * Enable copy button
   * @default false
   */
  allowCopy?: boolean;

  /**
   * Show character count
   * @default false
   */
  showCharCount?: boolean;

  /**
   * Show password toggle button
   * @default false
   */
  showPasswordToggle?: boolean;

  /**
   * Convert input to uppercase
   * @default false
   */
  uppercase?: boolean;

  /**
   * Convert input to lowercase
   * @default false
   */
  lowercase?: boolean;

  /**
   * Maximum allowed length of input
   */
  maxLength?: number;

  /**
   * Number of remaining characters before triggering warning color
   * @default 10
   */
  charsRemainingWarning?: number;

  /**
   * Enable shaking animation when limit is reached
   * @default false
   */
  shakeOnLimitReach?: boolean;

  /**
   * Loading state
   * @default false
   */
  loading?: boolean;

  /**
   * Success state
   * @default false
   */
  success?: boolean;

  /**
   * Disabled state
   * @default false
   */
  disabled?: boolean;

  /**
   * Debounce time in milliseconds for input changes
   * @default 300
   */
  debounceMs?: number;

  /**
   * Auto-select text on focus
   * @default false
   */
  autoSelectOnFocus?: boolean;

  /**
   * Input Mode (Text or Tags)
   * @default 'text'
   */
  mode?: InputMode;

  /**
   * Suggestions list for autocomplete (native datalist)
   */
  suggestions?: string[];

  /**
   * Callback for Enter key press
   */
  onEnterPress?(): void;

  /**
   * Callback for copy button click
   */
  onCopyClick?(value: string): void;

  /**
   * Callback for clear button click
   */
  onClearClick?(): void;

  /**
   * Callback for tag removal (only active in 'tags' mode)
   */
  onTagRemove?(index: number, value: string): void;

  /**
   * Callback for value change. Handles both string and string[] (tags)
   */
  onValueChange?(value: string | string[]): void;

  /**
   * Default value (supports string or string[])
   */
  defaultValue?: string | string[];

  /**
   * Controlled value (supports string or string[])
   */
  value?: string | string[];

  /**
   * Override for onChange
   */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;

  /**
   * Override for onFocus
   */
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;

  /**
   * Override for onBlur
   */
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;

  /**
   * Override for onKeyDown
   */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

// --- Format Preset Implementations ---
const formatParsers: Record<FormatPreset, (val: string) => string> = {
  none: (val) => val,
  phone: (val) => {
    const digits = val.replace(/\D/g, '');
    const x = digits.match(/(\d{0,3})(\d{0,3})(\d{0,4})/);
    if (!x) return digits;
    return !x[2] ? x[1] : `(${x[1]}) ${x[2]}${x[3] ? `-${x[3]}` : ''}`;
  },
  'credit-card': (val) => {
    const v = val.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts: string[] = [];
    for (let i = 0, len = match.length; i < len; i += 4) parts.push(match.substring(i, i + 4));
    return parts.length ? parts.join(' ') : v;
  },
  ssn: (val) => {
    const v = val.replace(/\D/g, '').match(/(\d{0,3})(\d{0,2})(\d{0,4})/);
    if (!v) return val;
    return !v[2] ? v[1] : `${v[1]}-${v[2]}${v[3] ? `-${v[3]}` : ''}`;
  },
  currency: (val) => {
    const num = val.replace(/[^0-9.]/g, '');
    if (!num) return '';
    const parts = num.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `$${parts.join('.')}`;
  },
  date: (val) => {
    const v = val.replace(/\D/g, '').match(/(\d{0,2})(\d{0,2})(\d{0,4})/);
    if (!v) return val;
    return !v[2] ? v[1] : `${v[1]}${v[3] ? `/${v[2]}${v[3] ? `/${v[3]}` : ''}` : `/${v[2]}`}`;
  },
};

const sizeStyles: Record<InputSize, string> = {
  sm: 'h-8 px-2 text-xs',
  md: 'h-10 px-3 py-2 text-sm',
  lg: 'h-12 px-4 py-3 text-base',
};

const radiusStyles: Record<NonNullable<AdvancedInputProps['radius']>, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

const variantStyles: Record<InputVariant, string> = {
  outline: 'border border-input bg-background',
  filled: 'border-2 border-transparent bg-muted focus:bg-background focus:border-input',
  ghost: 'border-0 bg-transparent focus:bg-muted/50',
  otp: 'border-2 border-input text-center !tracking-[0.5em] font-mono bg-background',
};

/**
 * Advanced Input Component supporting Text and Tags modes.
 */
export const AdvancedInput = forwardRef<HTMLInputElement, AdvancedInputProps>(
  (
    {
      className,
      type = 'text',
      label,
      error,
      helperText,
      size = 'md',
      variant = 'outline',
      radius = 'md',
      leftIcon,
      rightIcon,
      prefix,
      suffix,
      format = 'none',
      inputRegex,
      formatter,
      masked = false,
      maskChar = '•',
      allowNumericOnly = false,
      allowClear = true,
      allowCopy = false,
      showCharCount = false,
      showPasswordToggle: forcePasswordToggle,
      uppercase = false,
      lowercase = false,
      maxLength,
      charsRemainingWarning = 10,
      shakeOnLimitReach = false,
      loading = false,
      success = false,
      disabled = false,
      debounceMs,
      autoSelectOnFocus = false,
      mode = 'text',
      suggestions,
      onEnterPress,
      onCopyClick,
      onClearClick,
      onTagRemove,
      onValueChange,
      value: controlledValue,
      onChange,
      onFocus,
      onBlur,
      onKeyDown,
      defaultValue = '',
      ...props
    },
    ref,
  ) => {
    // Unique ID for datalist association
    const datalistId = useId();

    // --- State Management ---
    const [internalValue, setInternalValue] = useState<string | string[]>(String(defaultValue ?? ''));
    const [isFocused, setIsFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState<'idle' | 'copied'>('idle');
    const [isShaking, setIsShaking] = useState(false);
    const [tagInputBuffer, setTagInputBuffer] = useState('');

    const inputRef = useRef<HTMLInputElement>(null);
    const shakeTimeoutRef = useRef<NodeJS.Timeout>(undefined);
    const debounceTimeoutRef = useRef<NodeJS.Timeout>(undefined);

    // Ref merging helper
    const setRefs = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as RefObject<any>).current = node;
      }
    };

    // --- Derived Logic ---
    const isTagsMode = mode === 'tags';

    const rawValue = controlledValue !== undefined ? controlledValue : internalValue;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const tags = isTagsMode ? (Array.isArray(rawValue) ? rawValue : String(rawValue).split(',').filter(Boolean)) : [];
    const currentValue = isTagsMode ? tagInputBuffer : String(rawValue ?? '');

    const hasValue = isTagsMode ? tags.length > 0 : currentValue.length > 0;
    const length = isTagsMode ? tags.join(',').length : currentValue.length;

    const remaining = maxLength ? maxLength - length : Infinity;
    const isLimitReached = maxLength && length >= maxLength;
    const isNearLimit = maxLength && remaining > 0 && remaining <= charsRemainingWarning;

    // --- Icon Logic ---
    const getAutoIcon = (): React.FC<LucideProps> | null => {
      if (format === 'credit-card') return CreditCard;
      if (format === 'currency') return DollarSign;
      if (format === 'phone') return Phone;
      if (format === 'date') return Calendar;
      if (format === 'ssn') return Hash;
      if (isTagsMode) return TagIcon;
      return null;
    };

    const AutoIcon = getAutoIcon();

    // --- Effects ---

    useEffect(() => {
      if (debounceMs && onValueChange) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = setTimeout(() => {
          onValueChange(isTagsMode ? tags : currentValue);
        }, debounceMs);
      }
      return () => clearTimeout(debounceTimeoutRef.current);
    }, [currentValue, tags, debounceMs, onValueChange, isTagsMode]);

    useEffect(() => {
      if (shakeOnLimitReach && isLimitReached) {
        setIsShaking(true);
        clearTimeout(shakeTimeoutRef.current);
        shakeTimeoutRef.current = setTimeout(() => setIsShaking(false), 400);
      }
    }, [length, shakeOnLimitReach, isLimitReached]);

    // --- Handlers ---

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      if (autoSelectOnFocus && !isTagsMode && e.target.select) {
        e.target.select();
      }
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      if (isTagsMode && tagInputBuffer.trim()) {
        addTag(tagInputBuffer.trim());
      }
      onBlur?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let newValue = e.target.value;

      if (!isTagsMode) {
        if (inputRegex) {
          try {
            const invertedRegex = new RegExp(`[^${inputRegex.source.replace(/\\/g, '')}]`, 'g');
            newValue = newValue.replace(invertedRegex, '');
          } catch (err) {
            console.warn('Invalid Regex', err);
          }
        }

        if (allowNumericOnly && !inputRegex) {
          newValue = newValue.replace(/[^0-9]/g, '');
        }

        if (uppercase) newValue = newValue.toUpperCase();
        if (lowercase) newValue = newValue.toLowerCase();

        if (formatter) {
          newValue = formatter(newValue);
        } else if (format !== 'none') {
          newValue = formatParsers[format](newValue);
        }

        if (maxLength && newValue.length > maxLength) {
          newValue = newValue.slice(0, maxLength);
        }
      } else {
        setTagInputBuffer(newValue);
      }

      if (controlledValue === undefined) {
        if (!isTagsMode) {
          setInternalValue(newValue);
        }
      }

      const syntheticEvent = {...e, target: {...e.target, value: newValue}};
      onChange?.(syntheticEvent);
    };

    const addTag = (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const newTags = [...tags, trimmed];
      setTagInputBuffer('');
      if (controlledValue === undefined) setInternalValue(newTags);
      onValueChange?.(newTags);
    };

    const removeTag = (index: number) => {
      const newTags = tags.filter((_, i) => i !== index);
      if (controlledValue === undefined) setInternalValue(newTags);
      onValueChange?.(newTags);
      onTagRemove?.(index, tags[index]);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);

      if (e.key === 'Enter') {
        if (isTagsMode) {
          e.preventDefault();
          addTag(tagInputBuffer);
        } else {
          onEnterPress?.();
        }
      }

      if (isTagsMode && e.key === 'Backspace' && tagInputBuffer === '' && tags.length > 0) {
        e.preventDefault();
        removeTag(tags.length - 1);
      }
    };

    const handleClear = () => {
      if (controlledValue === undefined) {
        setInternalValue(isTagsMode ? [] : '');
        setTagInputBuffer('');
      }
      onClearClick?.();
      inputRef.current?.focus();
    };

    const handleCopy = async () => {
      try {
        const textToCopy = isTagsMode ? tags.join(', ') : currentValue;
        await navigator.clipboard.writeText(textToCopy);
        setCopyFeedback('copied');
        onCopyClick?.(textToCopy);
        setTimeout(() => setCopyFeedback('idle'), 2000);
      } catch (err) {
        console.error('Failed to copy', err);
      }
    };

    // --- Visual Helpers ---

    const getBorderColor = () => {
      if (error) return 'border-destructive focus-visible:ring-destructive';
      if (success) return 'border-green-500 focus-visible:ring-green-500';
      if (isFocused) return 'border-primary ring-primary';
      return '';
    };

    const getCounterColor = () => {
      if (error) return 'text-destructive';
      if (isLimitReached) return 'text-destructive font-bold';
      if (isNearLimit) return 'text-amber-500 font-semibold';
      return 'text-muted-foreground';
    };

    // Common base props for input
    const commonBaseProps = {
      id: props.id,
      name: props.name,
      placeholder: props.placeholder,
      autoComplete: props.autoComplete,
      disabled: disabled || loading,
      className: cn(
        'flex w-full ring-offset-background transition-all duration-200',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
      ),
      ...props,
    };

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            className={cn(
              'text-sm font-medium leading-none transition-colors',
              isFocused ? 'text-primary' : 'text-muted-foreground',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            {label}
          </label>
        )}

        <div
          className={cn(
            'relative group transition-all duration-200 flex items-center',
            isShaking && 'animate-shake',
            isTagsMode && 'h-auto min-h-[2.5rem] py-1',
          )}
        >
          {/* Left Icon/Prefix */}
          {((leftIcon || AutoIcon) && !isTagsMode) && variant !== 'otp' && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10">
              {leftIcon || (AutoIcon && <AutoIcon className="h-4 w-4"/>)}
            </div>
          )}

          {/* Text Prefix (Static) */}
          {prefix && !isTagsMode && (
            <div
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10 text-sm">
              {prefix}
            </div>
          )}

          {/* Main Input Area */}
          {isTagsMode ? (
            <div
              className={cn(
                'flex flex-wrap items-center w-full gap-1.5 p-1.5 transition-all duration-200',
                'ring-offset-background focus-within:ring-2 focus-within:ring-offset-2',
                'focus-within:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-50',
                sizeStyles[size],
                radiusStyles[radius],
                variantStyles[variant],
                getBorderColor(),
                !error && !success && 'hover:border-primary/50',
                (leftIcon || AutoIcon) && (size === 'sm' ? 'pl-8' : 'pl-10'),
                (rightIcon || hasValue || loading) && (size === 'sm' ? 'pr-8' : 'pr-10'),
                className,
              )}
              onClick={() => inputRef.current?.focus()}
            >
              {/* Left Icon support in Tags Mode */}
              {(leftIcon || AutoIcon) && (
                <div className="flex items-center text-muted-foreground pointer-events-none pl-1">
                  {leftIcon || (AutoIcon && <AutoIcon className="h-4 w-4"/>)}
                </div>
              )}

              {tags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20 animate-in fade-in zoom-in-95 duration-200"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTag(index);
                    }}
                    className="hover:text-destructive transition-colors rounded-full p-0.5 hover:bg-destructive/10"
                  >
                    <X className="h-3 w-3"/>
                  </button>
                </span>
              ))}

              <input
                ref={setRefs}
                type="text"
                value={tagInputBuffer}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
                list={suggestions ? datalistId : undefined}
                className="flex-1 bg-transparent border-none outline-none text-sm min-w-[60px] text-foreground placeholder:text-muted-foreground h-full py-1"
              />
            </div>
          ) : (
            <input
              ref={setRefs}
              type={type === 'password' || masked ? (showPassword ? 'text' : 'password') : type}
              value={currentValue}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
              maxLength={maxLength}
              inputMode={format === 'phone' || allowNumericOnly ? 'tel' : 'text'}
              list={suggestions ? datalistId : undefined}
              {...commonBaseProps}
              className={cn(
                commonBaseProps.className,
                'file:border-0 file:bg-transparent file:text-sm file:font-medium',
                sizeStyles[size],
                radiusStyles[radius],
                variantStyles[variant],
                getBorderColor(),
                !error && !success && variant !== 'otp' && 'hover:border-primary/50',
                (leftIcon || AutoIcon || prefix) && variant !== 'otp' && (size === 'sm' ? 'pl-8' : 'pl-10'),
                (rightIcon || hasValue || loading || type === 'password' || masked || suffix) && variant !== 'otp' && (size === 'sm' ? 'pr-8' : 'pr-10'),
                variant === 'otp' && 'text-center tracking-widest uppercase',
                className,
              )}
            />
          )}

          {/* Text Suffix (Static) */}
          {suffix && !isTagsMode && (
            <div
              className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10 text-sm">
              {suffix}
            </div>
          )}

          {/* Right Actions */}
          <div className={cn(
            'absolute bottom-2 inset-y-0 right-0 flex items-center pr-2 gap-1 z-10',
            variant === 'otp' && 'hidden',
            isTagsMode && 'items-start pt-1.5',
          )}>
            {loading && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin"/>}
            {!loading && rightIcon && !isTagsMode &&
              <div className="text-muted-foreground pointer-events-none">{rightIcon}</div>}

            {masked && !isTagsMode && (
              <button
                type="button" onClick={() => setShowPassword(p => !p)}
                className="rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                tabIndex={-1}>
                {showPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
              </button>
            )}

            {type === 'password' && !loading && !isTagsMode && (
              <button
                type="button" onClick={() => setShowPassword(p => !p)}
                className="rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                tabIndex={-1}>
                {showPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
              </button>
            )}

            {!loading && allowClear && hasValue && (
              <button
                type="button" onClick={handleClear}
                className={cn('relative rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50', 'opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all', hasValue && 'opacity-100')}
                tabIndex={-1}>
                <X className="h-4 w-4"/>
              </button>
            )}

            {!loading && allowCopy && hasValue && (
              <button
                type="button" onClick={handleCopy}
                className={cn('rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50', 'opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all', hasValue && 'opacity-100')}
                tabIndex={-1}>
                {copyFeedback === 'copied' ? <Check className="h-4 w-4 text-green-500"/> : <Copy className="h-4 w-4"/>}
              </button>
            )}
          </div>

          {/* Character Count: Remaining / Total */}
          {showCharCount && (maxLength || isFocused || isNearLimit) && (
            <div className={cn(
              'absolute bottom-1 right-2 pointer-events-none z-10 transition-opacity duration-200',
              isTagsMode ? 'bottom-1' : 'bottom-0',
            )}>
              <span
                className={cn('text-[10px] px-5 relative -top-[0.02rem] rounded transition-colors bg-background/80 backdrop-blur-sm', getCounterColor())}>
                {maxLength ? `${remaining} / ${maxLength}` : length}
              </span>
            </div>
          )}
        </div>

        {/* Autocomplete Suggestions (Native Datalist) */}
        {suggestions && suggestions.length > 0 && (
          <datalist id={datalistId}>
            {suggestions.map((s, i) => (
              <option key={i} value={s}/>
            ))}
          </datalist>
        )}

        {/* Footer */}
        <div className={cn(
          'flex items-start gap-1.5 px-1 transition-all duration-300 overflow-hidden',
          (error || helperText) ? 'h-5' : 'h-0 opacity-0',
        )}>
          {error && (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5"/>
              <p className="text-xs text-destructive font-medium animate-in fade-in slide-in-from-top-1">{error}</p>
            </>
          )}
          {!error && helperText && (
            <p className="text-xs text-muted-foreground animate-in fade-in slide-in-from-top-1">{helperText}</p>
          )}
          {!error && !helperText && success && <Check className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5"/>}
        </div>
      </div>
    );
  },
);

AdvancedInput.displayName = 'AdvancedInput';
