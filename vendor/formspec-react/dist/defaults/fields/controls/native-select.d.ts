import React from 'react';
export interface NativeSelectControlProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'onInput'> {
    afterControl?: React.ReactNode;
    onValueChange?: (value: string) => void;
}
/** Commit before a host's bubbling input handler can rerender the old controlled value. */
export declare function NativeSelectControl({ children, afterControl, className, onValueChange, ...props }: NativeSelectControlProps): import("react/jsx-runtime").JSX.Element;
