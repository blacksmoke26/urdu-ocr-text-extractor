/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2026 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

/**
 * @module components/ui/Dialog
 * @description Dialog component for modal dialogs using Radix UI primitives.
 *
 * Provides accessible modal dialog functionality with:
 * - Full screen overlay with backdrop blur
 * - Focus trap and keyboard navigation (ESC to close)
 * - Click outside to close (configurable)
 * - Animations for open/close
 * - Multiple size variants (sm, md, lg, xl, full)
 * - Positioning variants (center, top, bottom)
 * - Scroll behavior control (inside/outside)
 * - Visual variants (default, destructive)
 */

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {cva, type VariantProps} from 'class-variance-authority';
import {X, AlertTriangle, Info, CheckCircle, AlertCircle} from 'lucide-react';
import {cn} from '#/lib/utils';

// ----------------------------------------------------------------------
// Types & Interfaces
// ----------------------------------------------------------------------

/**
 * Base props for Dialog content components that aren't the primitive itself.
 */
type BaseDivProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Props for the Dialog Content component extending Radix props and custom features.
 */
interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogVariants> {
  /** Controls whether the dialog closes when clicking outside. Defaults to false (preserves existing behavior). */
  closeOnInteractOutside?: boolean;
  /** Controls whether the close button (X) is visible. Defaults to true. */
  showCloseButton?: boolean;
  /** Controls scroll behavior: 'inside' scrolls content within dialog, 'outside' scrolls the page. */
  scrollBehavior?: 'inside' | 'outside';
}

// ----------------------------------------------------------------------
// Variants
// ----------------------------------------------------------------------

const dialogVariants = cva(
  'fixed left-[50%] top-[50%] z-50 grid w-full gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg',
  {
    variants: {
      size: {
        sm: 'max-w-sm translate-x-[-50%] translate-y-[-50%]',
        md: 'max-w-lg translate-x-[-50%] translate-y-[-50%]',
        lg: 'max-w-2xl translate-x-[-50%] translate-y-[-50%]',
        xl: 'max-w-4xl translate-x-[-50%] translate-y-[-50%]',
        full: 'h-screen w-screen max-w-none translate-x-[-50%] translate-y-[-50%] rounded-none border-0',
        responsive: 'w-[95%] max-w-lg translate-x-[-50%] translate-y-[-50%] sm:max-w-xl',
      },
      position: {
        center: 'data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]',
        top: 'top-[10%] translate-y-0 data-[state=closed]:slide-out-to-top-[10%] data-[state=open]:slide-in-from-top-[10%]',
        bottom: 'top-[90%] -translate-y-full data-[state=closed]:slide-out-to-bottom-[10%] data-[state=open]:slide-in-from-bottom-[10%]',
      },
      variant: {
        default: 'border-border',
        destructive: 'border-destructive/50 bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: {
      size: 'md',
      position: 'center',
      variant: 'default',
    },
  },
);

// ----------------------------------------------------------------------
// Sub-Components
// ----------------------------------------------------------------------

const Dialog = DialogPrimitive.Root;

/**
 * Dialog Trigger Component
 * @description Button that opens the dialog when clicked.
 */
const DialogTrigger = DialogPrimitive.Trigger;

/**
 * Dialog Portal Component
 * @description Renders the dialog content into a different part of the DOM.
 */
const DialogPortal = DialogPrimitive.Portal;

/**
 * Dialog Close Component
 * @description A button that closes the dialog. Can be used explicitly if default close button is hidden.
 */
const DialogClose = DialogPrimitive.Close;

/**
 * Dialog Overlay Component
 * @description The backdrop behind the dialog content.
 */
const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({className, ...props}, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// ----------------------------------------------------------------------
// Main Content Component
// ----------------------------------------------------------------------

/**
 * Dialog Content Component
 * @description The main modal container. Handles sizing, positioning, and interaction prevention.
 */
const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      className,
      children,
      size = 'md',
      position = 'center',
      variant = 'default',
      closeOnInteractOutside = false, // Defaults to false to match existing code's strictness
      showCloseButton = true,
      scrollBehavior = 'inside',
      onInteractOutside: onUserInteractOutside,
      onPointerDownOutside: onUserPointerDownOutside,
      ...props
    },
    ref,
  ) => {
    /**
     * Handles interaction outside the dialog.
     * Combines user callback with the prop-based prevention logic.
     */
    const handleInteractOutside = (e: Event) => {
      if (!closeOnInteractOutside) {
        e.preventDefault();
      }
      onUserInteractOutside?.(e as any);
    };

    /**
     * Handles pointer down outside (usually click).
     * Combines user callback with the prop-based prevention logic.
     */
    const handlePointerDownOutside = (e: Event) => {
      if (!closeOnInteractOutside) {
        e.preventDefault();
      }
      onUserPointerDownOutside?.(e as any);
    };

    return (
      <DialogPortal>
        <DialogOverlay/>
        <DialogPrimitive.Content
          ref={ref}
          className={cn(dialogVariants({size, position, variant}), className)}
          onInteractOutside={handleInteractOutside}
          onPointerDownOutside={handlePointerDownOutside}
          data-scroll={scrollBehavior}
          {...props}
        >
          {children}

          {showCloseButton && (
            <DialogPrimitive.Close
              className={cn(
                'absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground',
                variant === 'destructive' && 'hover:bg-destructive/20 hover:text-destructive',
              )}
            >
              <X className="h-4 w-4"/>
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

/**
 * Dialog Header Component
 * @description Container for the title and description at the top of the dialog.
 */
const DialogHeader = ({className, ...props}: BaseDivProps) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left',
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

/**
 * Dialog Footer Component
 * @description Container for action buttons at the bottom of the dialog.
 */
const DialogFooter = ({className, ...props}: BaseDivProps) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

/**
 * Dialog Title Component
 * @description The accessible title of the dialog.
 */
const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({className, ...props}, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

/**
 * Dialog Description Component
 * @description The accessible description text of the dialog.
 */
const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({className, ...props}, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

/**
 * Dialog Body Component
 * @description A scrollable area for the main content of the dialog.
 * Works best when used with `scrollBehavior="inside"`.
 */
const DialogBody = React.forwardRef<HTMLDivElement, BaseDivProps>(
  ({className, ...props}, ref) => (
    <div
      ref={ref}
      className={cn('flex-1 overflow-y-auto py-2', className)}
      {...props}
    />
  ),
);
DialogBody.displayName = 'DialogBody';

// ----------------------------------------------------------------------
// Compound Components (Feature: Alert Dialog styles)
// ----------------------------------------------------------------------

interface DialogTitleIconProps extends BaseDivProps {
  variant?: 'default' | 'info' | 'warning' | 'success' | 'destructive';
}

const iconMap = {
  default: null,
  info: <Info className="h-6 w-6 text-blue-500"/>,
  warning: <AlertTriangle className="h-6 w-6 text-yellow-500"/>,
  success: <CheckCircle className="h-6 w-6 text-green-500"/>,
  destructive: <AlertCircle className="h-6 w-6 text-destructive"/>,
};

/**
 * Dialog Title Icon Component
 * @description Displays an icon alongside the dialog title, typically used for alerts or status messages.
 */
export const DialogTitleIcon = ({className, variant = 'default', ...props}: DialogTitleIconProps) => {
  if (variant === 'default') return null;

  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      {iconMap[variant]}
    </div>
  );
};
DialogTitleIcon.displayName = 'DialogTitleIcon';

// ----------------------------------------------------------------------
// Exports
// ----------------------------------------------------------------------

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogBody,
};

export type {DialogContentProps, DialogTitleIconProps};
