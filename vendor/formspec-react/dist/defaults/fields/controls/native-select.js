/** @filedesc Shared native select structure, skin and early value commit for respondent controls. */
'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNativeSelect } from '../../../use-native-select';
/** Commit before a host's bubbling input handler can rerender the old controlled value. */
export function NativeSelectControl({ children, afterControl, className, onValueChange, ...props }) {
    const select = useNativeSelect(onValueChange);
    return _jsxs("div", { className: "formspec-select-wrapper", children: [_jsx("select", { ...props, ...select, className: `formspec-input formspec-select-native${className ? ` ${className}` : ''}`, children: children }), afterControl] });
}
