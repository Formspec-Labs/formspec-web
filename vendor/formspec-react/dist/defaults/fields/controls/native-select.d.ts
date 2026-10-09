import React from 'react';
export interface NativeSelectControlProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    afterControl?: React.ReactNode;
}
/** A semantic native select using the maintained wrapper and input primitives. */
export declare function NativeSelectControl({ children, afterControl, className, ...props }: NativeSelectControlProps): import("react/jsx-runtime").JSX.Element;
