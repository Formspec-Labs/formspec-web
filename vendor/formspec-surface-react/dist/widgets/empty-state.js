import { jsx as _jsx } from "react/jsx-runtime";
export function WidgetEmptyState({ children }) {
    return (_jsx("p", { className: "fs-surface-empty", "data-widget-empty": "true", role: "status", children: children }));
}
