/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2026 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

/**
 * @module components/ui/ScrollArea
 * @description Scrollable region component using Radix UI ScrollArea.
 *
 * Provides a customizable scrollable region with optional corner and viewport.
 * Supports horizontal, vertical, or both scroll directions.
 *
 * ## Usage
 *
 * ```tsx
 * import { ScrollArea } from '@/components/ui/scroll-area';
 *
 * <ScrollArea className="h-[200px] w-[350px] rounded-md border">
 *   <div className="p-4">
 *     {content.map((item) => (
 *       <div key={item.id}>{item.content}</div>
 *     ))}
 *   </div>
 * </ScrollArea>
 * ```
 *
 * ## Props
 *
 * - `type` - Scroll type: 'auto', 'always', 'hover', or 'scroll'
 * - `scrollHideDelay` - Delay in ms before scrollbars hide
 * - `orientation` - Scroll orientation: 'horizontal', 'vertical', or undefined for both
 * - `dir` - Text direction: 'ltr' or 'rtl'
 */

import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

import {cn} from '#/lib/utils';

const ScrollArea = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({className, children, ...props}, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar/>
    <ScrollAreaPrimitive.Corner/>
  </ScrollAreaPrimitive.Root>
));

ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({className, orientation = 'vertical', ...props}, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border"/>
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));

ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export {ScrollArea, ScrollBar};
