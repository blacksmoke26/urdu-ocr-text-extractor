/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2026 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {cn} from '#/lib/utils';

/**
 * Base styles for the tooltip content.
 * Includes z-index, overflow, rounded corners, shadow, and animation states.
 */
const baseStyles =
  'z-50 overflow-hidden rounded-md shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2';

/**
 * Variant styles for the tooltip content.
 * Maps variant names to their respective Tailwind CSS classes.
 */
const variantStyles: Record<string, string> = {
  default:
    'bg-white text-gray-900 border border-gray-200 dark:bg-gray-800 dark:text-gray-50 dark:border-gray-700',
  dark: 'bg-gray-900 text-gray-50 border border-gray-800',
  primary: 'bg-blue-600 text-white border border-blue-600',
  danger: 'bg-red-600 text-white border border-red-600',
  light: 'bg-gray-100 text-gray-900 border border-gray-200',
};

/**
 * Size styles for the tooltip content.
 * Maps size names to their respective padding and text size classes.
 */
const sizeStyles: Record<string, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-base',
};

// --- Types ---
/**
 * Extracts the original props from Radix UI's Tooltip Content component.
 */
type PrimitiveTooltipContentProps = React.ComponentPropsWithoutRef<
  typeof TooltipPrimitive.Content
>;

/**
 * Props for the TooltipMini component.
 * Extends Radix UI's Tooltip Content props, omitting 'title' to avoid conflicts.
 */
export interface TooltipMiniProps
  extends Omit<PrimitiveTooltipContentProps, 'title'> {
  /** The element that triggers the tooltip. */
  children: React.ReactNode;
  /** The text content to display in the tooltip. Takes precedence over `title`. */
  content?: string;
  /** The title or content to display in the tooltip. Can be a string or a React node. */
  title?: string | React.ReactNode;
  /** Additional CSS classes for the tooltip content. */
  className?: string;
  /** Additional CSS classes for the trigger element. */
  triggerClassName?: string;
  /** Whether to show the tooltip arrow. */
  showArrow?: boolean;
  /** Controlled open state of the tooltip. */
  open?: boolean;
  /** Default open state of the tooltip when uncontrolled. */
  defaultOpen?: boolean;
  /** Callback fired when the open state changes. */
  onOpenChange?: (open: boolean) => void;
  /** The preferred side of the trigger to render against. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** The distance in pixels from the trigger. */
  sideOffset?: number;
  /** The preferred alignment of the tooltip relative to the trigger. */
  align?: 'start' | 'center' | 'end';
  /** The offset in pixels along the specified alignment axis. */
  alignOffset?: number;
  /** The delay in milliseconds before the tooltip opens. */
  delayDuration?: number;
  /** Whether the tooltip content can be hovered over. */
  disableHoverableContent?: boolean;
  /** The visual style variant of the tooltip. */
  variant?: 'default' | 'dark' | 'primary' | 'danger' | 'light';
  /** The size variant of the tooltip. */
  size?: 'sm' | 'md' | 'lg';
}

// --- Component ---

export const TooltipMini = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  TooltipMiniProps
>((props, ref) => {
  const {
    children,
    content,
    title,
    className,
    triggerClassName,
    variant = 'default',
    size = 'md',
    showArrow = true,
    open,
    defaultOpen,
    onOpenChange,
    side = 'top',
    align = 'center',
    sideOffset = 4,
    alignOffset = 0,
    delayDuration = 200,
    disableHoverableContent = false,
    ...restProps // These are the remaining Radix props (without 'title', 'content', etc.)
  } = props;

  // Use 'content' if provided, otherwise fall back to 'title'
  const tooltipContent = content !== undefined ? content : title;

  /**
   * Determines the appropriate CSS classes for the tooltip arrow based on the variant.
   * @returns The CSS class string for the arrow.
   */
  const getArrowClass = () => {
    switch (variant) {
      case 'dark':
        return 'fill-gray-900 text-gray-900';
      case 'primary':
        return 'fill-blue-600 text-blue-600';
      case 'danger':
        return 'fill-red-600 text-red-600';
      case 'light':
        return 'fill-gray-100 text-gray-100';
      case 'default':
      default:
        return 'fill-white dark:fill-gray-800 text-white dark:text-gray-800';
    }
  };

  /**
   * Renders the content of the tooltip.
   * Returns null if content is undefined or null.
   * Wraps string content in a paragraph tag.
   * @returns The rendered tooltip content or null.
   */
  const renderContent = () => {
    if (tooltipContent === null || tooltipContent === undefined) return null;

    // Changed font-medium to font-normal as requested
    return typeof tooltipContent === 'string' ? (
      <p className="font-normal leading-snug text-xs">{tooltipContent}</p>
    ) : (
      tooltipContent
    );
  };

  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        delayDuration={delayDuration}
        disableHoverableContent={disableHoverableContent}
      >
        <TooltipPrimitive.Trigger asChild className={triggerClassName}>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            ref={ref}
            side={side}
            align={align}
            sideOffset={sideOffset}
            alignOffset={alignOffset}
            className={cn(
              baseStyles,
              variantStyles[variant],
              sizeStyles[size],
              className,
            )}
            {...restProps} // Spread the remaining props (safe, because we extracted 'title' above)
          >
            {renderContent()}
            {showArrow && (
              <TooltipPrimitive.Arrow
                className={getArrowClass()}
                width={10}
                height={5}
              />
            )}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
});

TooltipMini.displayName = 'TooltipMini';

export default TooltipMini;
