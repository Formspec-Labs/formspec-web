/** @filedesc Shared native select structure, skin and focus treatment for all respondent controls. */
'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** A semantic native select using the maintained wrapper and input primitives. */
export function NativeSelectControl({ children, afterControl, className, ...props }) {
    return _jsxs("div", { className: "formspec-select-wrapper", children: [_jsx("select", { ...props, className: `formspec-input formspec-select-native${className ? ` ${className}` : ''}`, children: children }), afterControl] });
}
