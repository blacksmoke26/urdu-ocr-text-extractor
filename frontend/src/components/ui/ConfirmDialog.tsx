/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2026 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import * as React from 'react';
import {AlertTriangle} from 'lucide-react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';

// ui components
import {Button} from './Button';

/**
 * Props for the ConfirmDialog component, defining customizable elements and text.
 * @example
 * <ConfirmDialog
 *   title="Are you sure?"
 *   description="This action cannot be undone."
 *   confirmCaption="Proceed"
 *   cancelCaption="Cancel"
 *   triggerElement={<button>Confirm Action</button>}
 * />
 */
export interface ConfirmDialogProps {
  /** Optional. The title of the confirmation dialog */
  title?: string;
  /** Optional. The descriptive text displayed in the dialog body */
  description?: string;
  /** Optional. The label for the cancel button. Defaults to "Cancel" */
  cancelCaption?: string;
  /** Optional. The label for the confirm button. Defaults to "Confirm" */
  confirmCaption?: string;
  /** Optional. The element that triggers the dialog. Should be a clickable React node (e.g., a button) */
  triggerElement?: React.ReactNode;

  /** Optional. The callback function to execute when the confirm button is clicked */
  onConfirmClick?(): void;

  /** Optional. The callback function to execute when the cancel button is clicked */
  onCancelClick?(): void;
}

/**
 * A confirmation dialog component that wraps the `AlertDialog` UI library component, allowing
 * users to confirm or cancel an action with customizable titles, descriptions, and buttons.
 * @example
 * <ConfirmDialog
 *   title="Are you sure?"
 *   description="This action cannot be undone."
 *   triggerElement={<Button>Confirm</Button>}
 *   cancelCaption="No, thanks"
 *   confirmCaption="Yes, proceed"
 * />
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = (props) => {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger>
        {props.triggerElement ?? <Button variant="destructive">Confirm</Button>}
      </AlertDialog.Trigger>
      <AlertDialog.Content>
        <AlertDialog.Title>{props?.title ?? 'Confirm'}</AlertDialog.Title>
        <AlertDialog.Description>
          {props?.description ?? 'Are you sure?'}
        </AlertDialog.Description>

        <div className="flex gap-3 justify-end">
          <AlertDialog.Action>
            <Button variant="destructive" size="sm" onClick={() => props?.onConfirmClick?.()}>
              {props?.confirmCaption ?? 'Confirm'}
            </Button>
          </AlertDialog.Action>
          <AlertDialog.Cancel>
            <Button size="sm" onClick={() => props?.onCancelClick?.()}>
              {props?.cancelCaption ?? 'Cancel'}
            </Button>
          </AlertDialog.Cancel>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
};

/**
 * Props for the ConfirmDialogAdvanced component, defining the state and behavior of an advanced confirmation dialog.
 */
export interface ConfirmDialogAdvancedProps {
  /** Controls whether the dialog is currently open or closed */
  open: boolean;
  /** The title text displayed in the dialog header */
  title: string;
  /** The descriptive message or body text of the dialog */
  description: string;
  /** Optional. The label for the confirm button. Defaults to "Confirm" */
  confirmCaption?: string;
  /** Optional. The label for the cancel button. Defaults to "Cancel" */
  cancelCaption?: string;

  /** The callback function to execute when the confirm button is clicked */
  onConfirmClick(): void;

  /** The callback function to execute when the open state of the dialog changes */
  onOpenChange(open: boolean): void;
}

// Confirm Dialog
export const ConfirmDialogAdvanced: React.FC<ConfirmDialogAdvancedProps> = (props) => {
  const {
    open,
    onOpenChange,
    title,
    description,
    confirmCaption = 'Confirm',
    cancelCaption = 'Cancel',
    onConfirmClick,
  } = props;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 backdrop-blur-sm"/>
        <Dialog.Content
          className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out rounded-lg dark:bg-gray-900 dark:border-gray-700">
          <div className="flex flex-col space-y-2 text-center sm:text-left">
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500"/> {title}
              </Dialog.Title>
            </div>
            <Dialog.Description className="text-sm text-gray-500 dark:text-gray-400">
              {description}
            </Dialog.Description>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4">
            <Button variant="destructive" size="sm" onClick={onConfirmClick}>{confirmCaption}</Button>
            <Dialog.Close asChild>
              <Button size="sm" className="mt-2 sm:mt-0">{cancelCaption}</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
