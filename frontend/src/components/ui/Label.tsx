/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2026 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import React from 'react';
import {cn} from '#/lib/utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
}

/**
 * Label component for form elements
 * @example
 * <Label htmlFor="my-input">My Input</Label>
 * @developer
 * Provides accessible labeling for form controls with proper styling
 */
export const Label: React.FC<LabelProps> = ({className, children, ...props}) => {
  return (
    <label
      className={cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
};
