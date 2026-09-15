import { jsx as _jsx } from "react/jsx-runtime";
export function Heading({ level, children, ...attributes }) {
    const Tag = `h${level}`;
    return (_jsx(Tag, { ...attributes, children: children }));
}
/** One level down, never past 6. */
export function nextLevel(level) {
    return Math.min(level + 1, 6);
}
