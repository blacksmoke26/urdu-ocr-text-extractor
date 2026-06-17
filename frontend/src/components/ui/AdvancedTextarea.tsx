/* eslint-disable react-hooks/refs,react-hooks/exhaustive-deps */
/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @version 3.1.1 (Fixed Toolbar & Gutter)
 */

import React, {
  forwardRef,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {Portal} from '@radix-ui/react-portal';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Command,
  Copy,
  Eye,
  Loader2,
  Maximize2,
  Minimize2,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {cn} from '#/lib/utils';

/**
 * Configuration for auto-closing character pairs (brackets, quotes, etc.).
 * Defines the opening and closing characters that wrap selected text or appear
 * automatically when the opening character is typed.
 */
export interface AutoClosingPair {
  /** The opening character (e.g., '{', '"'). */
  open: string;
  /** The closing character (e.g., '}', '"'). */
  close: string;
}

/** Available size presets for the textarea component. */
export type TextareaSize = 'sm' | 'md' | 'lg' | 'xl';

/** Visual style variants for the textarea. */
export type TextareaVariant = 'classic' | 'soft' | 'filled' | 'ghost';

/** Positions where the editor toolbar can be rendered. */
export type ToolbarPosition = 'top' | 'bottom' | 'floating';

/** Layout modes for the editor (e.g., split view for JSON). */
export type EditorLayout = 'default' | 'split';

/**
 * Context object passed to custom toolbar render functions.
 * Provides state and action handlers to interact with the editor.
 */
export interface ToolbarContext {
  /** The current value of the textarea. */
  value: string;
  /** Whether the current value is valid JSON (only applicable in JSON mode). */
  isValidJson: boolean;

  /** Handler to format the current JSON content. */
  onFormat(): void;

  /** Handler to copy the current content to the clipboard. */
  onCopy(): void;

  /** Handler to clear the textarea content. */
  onClear(): void;

  /** Indicates if an async operation (like validation) is in progress. */
  isLoading: boolean;
  /** The current number of characters in the textarea. */
  charCount: number;
  /** The maximum allowed character length. */
  maxLength?: number;

  /** Handler to undo the last change. */
  undo(): void;

  /** Handler to redo the last undone change. */
  redo(): void;

  /** Whether an undo action is available. */
  canUndo: boolean;
  /** Whether a redo action is available. */
  canRedo: boolean;

  /** Toggles the fullscreen mode of the editor. */
  toggleFullscreen(): void;

  /** Whether the editor is currently in fullscreen mode. */
  isFullscreen: boolean;
}

/**
 * Props for the AdvancedTextarea component.
 * Extends standard HTML textarea attributes while omitting 'onChange' (handled internally)
 * and 'size' (redefined by TextareaSize type).
 */
export interface AdvancedTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'size'> {
  /** Label displayed above the textarea. */
  label?: string;
  /** Helper text displayed below the label. */
  description?: string;
  /** Error message to display. */
  error?: string;
  /** Placeholder text when the textarea is empty. */
  placeholder?: string;
  /** Size preset for the textarea dimensions and font size. */
  size?: TextareaSize;
  /** Visual style variant. */
  variant?: TextareaVariant;
  /** Border radius style. */
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  /** Custom class name for the outer wrapper div. */
  wrapperClassName?: string;
  /** Custom class name for the textarea element itself. */
  textareaClassName?: string;
  /** Custom class name for the toolbar. */
  toolbarClassName?: string;

  // Toolbar
  /** Position of the toolbar relative to the editor. */
  toolbarPosition?: ToolbarPosition;

  // Layout
  /** Editor layout mode. */
  layout?: EditorLayout;

  // Autocomplete
  /** List of suggestion strings for autocomplete. */
  suggestions?: string[];

  /** Callback fired when a suggestion is selected. */
  onSuggestionSelect?(suggestion: string): void;

  // Constraints
  /** Maximum number of characters allowed. */
  maxLength?: number;
  /** Whether to display the character count. */
  showCharCount?: boolean;

  // JSON
  /** Enables JSON-specific features (validation, formatting, syntax highlighting). */
  jsonMode?: boolean;
  /** Shows the format button in the toolbar (only if jsonMode is true). */
  showFormatButton?: boolean;

  // Editor Behaviors
  /** Enables auto-closing of brackets and quotes. */
  enableAutoClosing?: boolean;
  /** Custom pairs for auto-closing logic. */
  autoClosingPairs?: AutoClosingPair[];
  /** Enables Tab key support for indentation. */
  enableTabSupport?: boolean;
  /** String used for indentation (e.g., '  ' or '\t'). */
  indentationStr?: string;

  // V3.1 Features
  /** Maximum number of history states to keep. */
  historyLimit?: number;
  /** Enables the command palette (Ctrl/Cmd + K). */
  enableCommandPalette?: boolean;
  /** Shows line numbers in the gutter. */
  showLineNumbers?: boolean;
  /** Explicit width for the line number gutter. */
  gutterWidth?: number | string;

  // Drag & Drop
  /** Enables drag and drop of files into the textarea. */
  enableDragDrop?: boolean;

  /** Callback fired when a file is dropped. */
  onFileDrop?(file: File, content: string): void;

  // UI State
  /** Enables automatic height resizing based on content. */
  autoResize?: boolean;
  /** Shows a loading spinner (often used during async validation). */
  isLoading?: boolean;
  /** Shows the copy button in the toolbar. */
  showCopyButton?: boolean;
  /** Shows the clear button in the toolbar. */
  showClearButton?: boolean;

  // Customization
  /** Custom render function for the toolbar. */
  renderToolbar?(ctx: ToolbarContext): React.ReactNode;

  /** Debounce time in milliseconds for the onChange callback. */
  debounceMs?: number;

  // Events
  /** Callback fired when the value changes. */
  onChange?(value: string): void;

  /** Callback fired when the textarea gains focus. */
  onFocus?(e: React.FocusEvent<HTMLTextAreaElement>): void;

  /** Callback fired when the textarea loses focus. */
  onBlur?(e: React.FocusEvent<HTMLTextAreaElement>): void;

  // Value Control
  /** Controlled value of the textarea. */
  value?: string;
  /** Initial value for uncontrolled usage. */
  defaultValue?: string;
}

// --- Configs ---

/** Tailwind CSS class mappings for size variants. */
const sizes: Record<TextareaSize, string> = {
  sm: 'text-xs px-2 py-1.5',
  md: 'text-sm px-3 py-2',
  lg: 'text-base px-4 py-3',
  xl: 'text-lg px-5 py-4',
};

/** Tailwind CSS class mappings for visual variants. */
const variants: Record<TextareaVariant, string> = {
  classic: 'bg-background border-input focus:border-ring',
  soft: 'bg-gray-50 dark:bg-gray-900/50 border-transparent shadow-sm focus:border-ring',
  filled: 'bg-gray-100 dark:bg-gray-800 border-transparent focus:bg-white dark:focus:bg-black',
  ghost: 'bg-transparent border-transparent hover:bg-gray-50 dark:hover:bg-gray-900/50 focus:bg-gray-50 dark:focus:bg-gray-900/50',
};

/** Tailwind CSS class mappings for border radius options. */
const radii: Record<NonNullable<AdvancedTextareaProps['radius']>, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

const SyntaxHighlighter: React.FC<{ json: string }> = ({json}) => {
  if (!json) return null;
  const formatJson = (str: string) => {
    str = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return str.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      match => {
        let cls = 'text-orange-500';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) cls = 'text-blue-400 font-semibold';
          else cls = 'text-green-400';
        } else if (/true|false/.test(match)) cls = 'text-purple-400';
        else if (/null/.test(match)) cls = 'text-gray-500 italic';
        return `<span class="${cls}">${match}</span>`;
      },
    );
  };
  return (
    <div
      className="font-mono text-sm leading-relaxed bg-gray-900 text-gray-100 p-4 rounded-md overflow-auto whitespace-pre h-full">
      <code dangerouslySetInnerHTML={{__html: formatJson(json)}}/>
    </div>
  );
};

export const AdvancedTextarea = forwardRef<HTMLTextAreaElement, AdvancedTextareaProps>(
  (
    {
      className,
      wrapperClassName,
      label,
      description,
      error,
      maxLength,
      suggestions = [],
      onSuggestionSelect,
      isLoading = false,
      showCopyButton = true,
      showClearButton = true,
      showFormatButton = true,
      showCharCount = false,
      autoResize = true,
      jsonMode = false,
      enableAutoClosing = false,
      autoClosingPairs: customPairs,
      enableTabSupport = false,
      indentationStr = '  ',
      enableDragDrop = false,
      debounceMs = 0,
      renderToolbar,
      toolbarPosition = 'floating',
      layout = 'default',
      historyLimit = 50,
      enableCommandPalette = false,
      showLineNumbers = false,
      gutterWidth, // V3.1 Property
      value: controlledValue,
      defaultValue,
      onChange,
      onFileDrop,
      onFocus,
      onBlur,
      size = 'md',
      variant = 'classic',
      radius = 'md',
      textareaClassName = null,
      ...props
    },
    ref,
  ) => {
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;
    const containerRef = useRef<HTMLDivElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);

    const defaultPairs: AutoClosingPair[] = [
      {open: '{', close: '}'}, {open: '[', close: ']'}, {open: '(', close: ')'},
      {open: '"', close: '"'}, {open: '\'', close: '\''}, {open: '`', close: '`'},
    ];
    const activePairs = customPairs || defaultPairs;

    // --- State ---
    const isControlled = controlledValue !== undefined;
    const [internalValue, setInternalValue] = useState(defaultValue || controlledValue || '');
    const currentValue = isControlled ? controlledValue : internalValue;

    const [open, setOpen] = useState(false);
    const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

    const [isValidJson, setIsValidJson] = useState(false);
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const [history, setHistory] = useState<string[]>([defaultValue || '']);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);

    const debounceTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const skipHistoryUpdateRef = useRef(false);

    // --- History Logic ---
    const pushHistory = useCallback((val: string) => {
      if (skipHistoryUpdateRef.current) {
        skipHistoryUpdateRef.current = false;
        return;
      }
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        if (val === newHistory[newHistory.length - 1]) return prev;
        const updated = [...newHistory, val];
        if (updated.length > historyLimit) updated.shift();
        return updated;
      });
      setHistoryIndex(prev => Math.min(prev + 1, historyLimit - 1));
    }, [historyIndex, historyLimit]);

    // --- Helpers ---

    const triggerChange = useCallback(
      (newValue: string, skipHistory = false) => {
        if (!isControlled) setInternalValue(newValue);

        if (!skipHistory) pushHistory(newValue);

        if (debounceMs > 0) {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => {
            onChange?.(newValue);
          }, debounceMs);
        } else {
          onChange?.(newValue);
        }
      },
      [isControlled, debounceMs, onChange, pushHistory],
    );

    const updateValue = useCallback((newValue: string, cursorPosition?: number) => {
      triggerChange(newValue);
      if (cursorPosition !== undefined && textareaRef.current) {
        requestAnimationFrame(() => {
          textareaRef.current?.setSelectionRange(cursorPosition, cursorPosition);
        });
      }
    }, [triggerChange]);

    const handleUndo = useCallback(() => {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        const val = history[newIndex];
        skipHistoryUpdateRef.current = true;
        triggerChange(val, true);
        if (!isControlled) setInternalValue(val);
      }
    }, [history, historyIndex, isControlled, triggerChange]);

    const handleRedo = useCallback(() => {
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        const val = history[newIndex];
        skipHistoryUpdateRef.current = true;
        triggerChange(val, true);
        if (!isControlled) setInternalValue(val);
      }
    }, [history, historyIndex, isControlled, triggerChange]);

    // --- Effects ---

    // Auto-resize & Line Numbers Sync
    useEffect(() => {
      if (textareaRef.current) {
        if (autoResize) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 400)}px`;
        }
        if (lineNumbersRef.current) {
          lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
        }
      }
    }, [currentValue, autoResize, showLineNumbers]);

    // JSON Validation
    useEffect(() => {
      if (!jsonMode) {
        setIsValidJson(false);
        setJsonError(null);
        return;
      }
      if (!currentValue.trim()) {
        setIsValidJson(false);
        setJsonError(null);
        return;
      }
      try {
        JSON.parse(currentValue);
        setIsValidJson(true);
        setJsonError(null);
      } catch (e) {
        setIsValidJson(false);
        setJsonError(e instanceof Error ? e.message : 'Invalid JSON');
      }
    }, [currentValue, jsonMode]);

    // Suggestions
    useEffect(() => {
      if (suggestions.length > 0 && currentValue.length > 0) {
        const filtered = suggestions.filter(s => s.toLowerCase().includes(currentValue.toLowerCase()));
        setFilteredSuggestions(filtered);
        setOpen(filtered.length > 0);
        setActiveIndex(0);
      } else {
        setOpen(false);
      }
    }, [currentValue, suggestions]);

    // Popup Positioning
    useLayoutEffect(() => {
      if (open && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setPopupStyle({
          position: 'fixed',
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
          zIndex: 9999,
        });
      }
    }, [open]);

    // --- Handlers ---

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      triggerChange(e.target.value);
    };

    const handleScroll = () => {
      if (lineNumbersRef.current && textareaRef.current) {
        lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Command Palette Trigger
      if (enableCommandPalette && (e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCmdPaletteOpen(true);
        return;
      }

      // Undo/Redo Shortcuts
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      const start = textareaRef.current?.selectionStart || 0;
      const end = textareaRef.current?.selectionEnd || 0;

      // Autocomplete
      if (open && filteredSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex(p => (p + 1) % filteredSuggestions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex(p => (p - 1 + filteredSuggestions.length) % filteredSuggestions.length);
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSelectSuggestion(filteredSuggestions[activeIndex]);
          return;
        }
        if (e.key === 'Escape') {
          setOpen(false);
          return;
        }
      }

      // Tab Support
      if (enableTabSupport && e.key === 'Tab') {
        e.preventDefault();
        const inserted = indentationStr;
        const newValue = currentValue.slice(0, start) + inserted + currentValue.slice(end);
        updateValue(newValue, start + inserted.length);
        return;
      }

      // Auto-Closing
      if (enableAutoClosing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const char = e.key;
        const pair = activePairs.find(p => p.open === char);

        if (pair) {
          const isRangeSelection = start !== end;
          if (isRangeSelection) {
            e.preventDefault();
            const selectedText = currentValue.slice(start, end);
            const wrapped = pair.open + selectedText + pair.close;
            updateValue(currentValue.slice(0, start) + wrapped + currentValue.slice(end), start + wrapped.length);
            return;
          } else {
            const nextChar = currentValue[start];
            if (nextChar === pair.close) {
              e.preventDefault();
              textareaRef.current?.setSelectionRange(start + 1, start + 1);
              return;
            }
            e.preventDefault();
            updateValue(currentValue.slice(0, start) + pair.open + pair.close + currentValue.slice(end), start + 1);
            return;
          }
        }
        if (e.key === 'Backspace') {
          const prevChar = currentValue[start - 1];
          const nextChar = currentValue[start];
          const pair = activePairs.find(p => p.open === prevChar && p.close === nextChar);
          if (pair) {
            e.preventDefault();
            updateValue(currentValue.slice(0, start - 1) + currentValue.slice(end + 1), start - 1);
            return;
          }
        }
      }
    };

    const handleFormatJson = () => {
      if (!isValidJson || !currentValue) return;
      try {
        const parsed = JSON.parse(currentValue);
        updateValue(JSON.stringify(parsed, null, indentationStr === '\t' ? '\t' : 2));
      } catch (e) {
        console.error('Failed to format', e);
      }
    };

    const handleClear = () => {
      updateValue('');
      textareaRef.current?.focus();
    };
    const handleCopy = async () => {
      if (textareaRef.current) await navigator.clipboard.writeText(textareaRef.current.value);
    };
    const handleSelectSuggestion = (suggestion: string) => {
      updateValue(suggestion);
      onSuggestionSelect?.(suggestion);
      setOpen(false);
      textareaRef.current?.focus();
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      if (enableDragDrop) setIsDragging(true);
    };
    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      if (enableDragDrop && !e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
    };
    const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (!enableDragDrop || !e.dataTransfer.files.length) return;
      const file = e.dataTransfer.files[0];
      if (file) {
        const text = await file.text();
        updateValue(text);
        onFileDrop?.(file, text);
      }
    };

    const charCount = currentValue.length;
    const isNearLimit = maxLength && charCount >= maxLength * 0.9;
    const isAtLimit = maxLength && charCount >= maxLength;
    const showCount = showCharCount || maxLength !== undefined;

    const commands = useMemo(() => [
      {
        id: 'format',
        label: 'Format Code',
        icon: Sparkles,
        action: handleFormatJson,
        disabled: !jsonMode || !isValidJson,
      },
      {id: 'copy', label: 'Copy Content', icon: Copy, action: handleCopy},
      {id: 'clear', label: 'Clear Content', icon: X, action: handleClear},
      {id: 'undo', label: 'Undo', icon: ChevronLeft, action: handleUndo, disabled: historyIndex <= 0},
      {id: 'redo', label: 'Redo', icon: ChevronRight, action: handleRedo, disabled: historyIndex >= history.length - 1},
      {
        id: 'fullscreen',
        label: isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen',
        icon: isFullscreen ? Minimize2 : Maximize2,
        action: () => setIsFullscreen(!isFullscreen),
      },
    ], [jsonMode, isValidJson, historyIndex, history.length, isFullscreen, handleFormatJson, handleCopy, handleClear, handleUndo, handleRedo]);

    const toolbarContext: ToolbarContext = useMemo(() => ({
      value: currentValue, isValidJson, onFormat: handleFormatJson, onCopy: handleCopy, onClear: handleClear,
      isLoading, charCount, maxLength, undo: handleUndo, redo: handleRedo, canUndo: historyIndex > 0,
      canRedo: historyIndex < history.length - 1, toggleFullscreen: () => setIsFullscreen(f => !f), isFullscreen,
    }), [currentValue, isValidJson, isLoading, charCount, maxLength, handleUndo, handleRedo, historyIndex, history.length, isFullscreen, handleFormatJson, handleCopy, handleClear]);

    const lines = currentValue.split('\n');

    // --- Styles ---
    const gutterStyle = useMemo(() => {
      if (!gutterWidth) return undefined;
      const widthVal = typeof gutterWidth === 'number' ? `${gutterWidth}px` : gutterWidth;
      return {width: widthVal, minWidth: widthVal, maxWidth: widthVal};
    }, [gutterWidth]);

    return (
      <div
        className={cn(
          'w-full h-full space-y-2 relative font-sans transition-all duration-300',
          isFullscreen && 'fixed inset-0 z-[100] bg-background p-4 overflow-hidden',
          wrapperClassName,
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {(label || description) && (
          <div className="space-y-1">
            <label className="text-sm font-medium leading-none flex justify-between">
              {label}
              {error && <span className="text-destructive text-xs">{error}</span>}
            </label>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        )}

        <div
          ref={containerRef}
          className={cn(
            'relative group transition-all h-full duration-200 border rounded-md overflow-hidden',
            variants[variant],
            error || isAtLimit ? 'border-destructive' : 'border-input',
            isDragging && 'ring-2 ring-ring ring-offset-2',
            layout === 'split' && 'flex flex-row',
            isFullscreen && 'h-[calc(100%-40px)]',
          )}
        >
          {/* Toolbar (Top) */}
          {toolbarPosition === 'top' && (
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
              {renderToolbar ? renderToolbar(toolbarContext) : (
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                  {jsonMode ? (isValidJson ? <><Check className="w-3 h-3 text-green-500"/> Valid
                    JSON</> : <>JSON</>) : 'Text'}
                </div>
              )}
              <div className="flex gap-1">
                {enableCommandPalette && <button onClick={() => setIsCmdPaletteOpen(true)}
                                                 className="p-1.5 rounded hover:bg-accent text-muted-foreground">
                  <Command className="w-4 h-4"/></button>}
              </div>
            </div>
          )}

          {/* Editor Area */}
          <div className={cn('relative flex-1 h-full flex min-h-0', layout === 'split' ? 'w-1/2 border-r' : 'w-full')}>

            {jsonMode && toolbarPosition !== 'top' && (
              <div className="absolute top-2 right-2 z-10 pointer-events-none">
                {isValidJson ? (
                  <span
                    className="flex items-center gap-1 text-[10px] font-mono text-green-600 bg-green-50 px-1.5 py-0.5 rounded dark:bg-green-900/20 dark:text-green-400">
                    <Check className="w-2.5 h-2.5"/> Valid
                  </span>
                ) : currentValue ? (
                  <span
                    className="flex items-center gap-1 text-[10px] font-mono text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                    {jsonError ? 'Invalid' : '...'}
                  </span>
                ) : null}
              </div>
            )}

            {/* Line Numbers */}
            {showLineNumbers && (
              <div ref={lineNumbersRef} style={gutterStyle}
                   className={cn('bg-muted/50 text-muted-foreground text-right select-none overflow-hidden py-3 pr-2 text-xs font-mono leading-relaxed flex flex-col items-end shrink-0', !gutterWidth && 'w-10')}>
                {lines.map((_, i) => (
                  <div key={i} className="w-full truncate" title={`Line ${i + 1}`}>{i + 1}</div>
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={currentValue}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onScroll={handleScroll}
              onFocus={onFocus}
              onBlur={(e) => {
                setOpen(false);
                onBlur?.(e);
              }}
              className={cn(
                'flex-1 w-full min-h-0 resize-none bg-transparent border-0 focus-visible:ring-0 p-0 outline-none',
                showLineNumbers ? 'pl-2' : 'px-3',
                (jsonMode || enableAutoClosing) ? 'font-mono' : 'font-sans',
                sizes[size],
                textareaClassName,
              )}
              spellCheck="false"
              style={{minHeight: isFullscreen ? '100%' : ''}}
              {...props}
            />

            {/* Floating Toolbar (Fixed Logic) */}
            {toolbarPosition === 'floating' && !renderToolbar && (
              <div
                className={cn(
                  'absolute bottom-2 right-2 flex items-center gap-2 pointer-events-none z-10 transition-opacity duration-200',
                  props.toolbarClassName,
                )}
              >
                {isLoading && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin"/>}
                {showClearButton && (
                  <button type="button" onClick={handleClear}
                          className="pointer-events-auto text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent/50 transition-colors"
                          title="Clear"><X className="w-3 h-3"/></button>
                )}
                {showCopyButton && (
                  <button type="button" onClick={handleCopy}
                          className="pointer-events-auto text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent/50 transition-colors"
                          title="Copy"><Copy className="w-3 h-3"/></button>
                )}
                {jsonMode && showFormatButton && (
                  <button type="button" onClick={handleFormatJson}
                          className="pointer-events-auto text-blue-600 bg-blue-50 dark:bg-blue-900/20 p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                          title="Format JSON"><Sparkles className="w-3 h-3"/></button>
                )}
                {enableCommandPalette && (
                  <button type="button" onClick={() => setIsCmdPaletteOpen(true)}
                          className="pointer-events-auto text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent/50 transition-colors"
                          title="Command Palette"><Command className="w-3 h-3"/></button>
                )}
                {showCount && (
                  <span
                    className={cn('text-[10px] tabular-nums font-medium', isAtLimit ? 'text-destructive' : 'text-muted-foreground')}>{charCount}/{maxLength || '∞'}</span>
                )}
              </div>
            )}
          </div>

          {/* Preview Area */}
          {layout === 'split' && jsonMode && (
            <div className="w-1/2 bg-gray-50 dark:bg-gray-900/30 p-4 overflow-auto custom-scrollbar">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2 border-b pb-1">
                <Eye className="w-3 h-3"/> Preview
              </div>
              <SyntaxHighlighter json={currentValue}/>
            </div>
          )}

          {/* Toolbar (Bottom) */}
          {toolbarPosition === 'bottom' && (
            <div className="px-3 py-2 border-t bg-muted/50 flex justify-between items-center">
              {renderToolbar ? renderToolbar(toolbarContext) : (
                <div className="text-xs text-muted-foreground">Actions</div>
              )}
              <div className="flex gap-1">
                {showCount && <span
                  className={cn('text-[10px] tabular-nums font-medium', isAtLimit ? 'text-destructive' : 'text-muted-foreground')}>{charCount}/{maxLength || '∞'}</span>}
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {!renderToolbar && showCount && toolbarPosition !== 'bottom' && (
            <div className="absolute bottom-0 left-0 h-0.5 bg-secondary w-full overflow-hidden">
              <div
                className={cn('h-full transition-all duration-300 ease-out', isAtLimit ? 'bg-destructive' : isNearLimit ? 'bg-yellow-500' : 'bg-primary')}
                style={{width: `${Math.min((charCount / (maxLength || 1)) * 100, 100)}%`}}/>
            </div>
          )}
        </div>

        {/* Suggestion Portal */}
        {open && filteredSuggestions.length > 0 && (
          <div style={popupStyle}
               className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-1 animate-in fade-in zoom-in-95 duration-200 z-50">
            <ul className="max-h-60 overflow-auto py-1">
              {filteredSuggestions.map((suggestion, index) => (
                <li key={index} onClick={() => handleSelectSuggestion(suggestion)}
                    className={cn('relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-gray-100 dark:hover:bg-gray-700', index === activeIndex && 'bg-gray-100 dark:bg-gray-700')}>
                  <span className="flex-1 truncate text-gray-900 dark:text-gray-100">{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Command Palette */}
        {enableCommandPalette && (
          <Portal>
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
                 onClick={() => setIsCmdPaletteOpen(false)}/>
            <div
              className="fixed left-[50%] top-[20%] z-50 w-full max-w-lg translate-x-[-50%] bg-popover text-popover-foreground shadow-lg rounded-lg border p-1 animate-in fade-in zoom-in-95">
              <div className="flex items-center border-b px-3 py-2">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50"/>
                <input
                  className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Type a command..." autoFocus/>
              </div>
              <div className="max-h-[300px] overflow-y-auto p-1">
                {commands.map((cmd, idx) => (
                  <button key={cmd.id} onClick={() => {
                    cmd.action();
                    setIsCmdPaletteOpen(false);
                  }} disabled={cmd.disabled}
                          className={cn('flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground', (cmd as Record<string, any>).activeIndex === idx && 'bg-accent text-accent-foreground', cmd.disabled && 'opacity-50 cursor-not-allowed')}>
                    <cmd.icon className="h-4 w-4"/>
                    <span>{cmd.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </Portal>
        )}
      </div>
    );
  },
);

AdvancedTextarea.displayName = 'AdvancedTextarea';
