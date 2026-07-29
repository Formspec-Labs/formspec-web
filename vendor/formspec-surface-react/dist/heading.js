import { jsx as _jsx } from "react/jsx-runtime";
export function Heading({ level, className, id, children }) {
    const Tag = `h${level}`;
    return (_jsx(Tag, { className: className, id: id, children: children }));
}
/** One level down, never past 6. */
export function nextLevel(level) {
    return Math.min(level + 1, 6);
}
