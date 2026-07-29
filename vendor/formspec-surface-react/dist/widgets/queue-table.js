import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @filedesc `QueueTable` — the operator's work list.
 *
 * A queue table is the most obvious candidate for a first-party widget: every
 * operator surface in every tenant needs one. It is also the widget the platform
 * was furthest from having, because a table is nothing without rows. Surface
 * 0.2 now supplies them only through Registry-declared named Data Sources
 * inputs; configuration remains a separate channel.
 *
 * So the contract is narrow and honest: **it renders whatever rows it is given.**
 * Columns come from `binding.config` when the author declared them, and from the
 * rows' own keys when they did not. No rows means an empty state that says the
 * queue is empty — not four plausible applications with invented rents and
 * invented waiting times, which is what the surface-render-v10 spike drew and
 * recorded as its most convincing lie.
 *
 * Accessibility is not optional in an operator tool that people use all day: a
 * real `<caption>`, `scope` on every header, a row header per row, and a scroll
 * container that is focusable and labelled so the table can be reached by
 * keyboard when it overflows.
 */
import { Heading } from '../heading.js';
import { WidgetEmptyState } from './empty-state.js';
function readColumns(config) {
    if (!Array.isArray(config.columns))
        return [];
    return config.columns.flatMap((entry) => {
        if (typeof entry !== 'object' || entry === null)
            return [];
        const row = entry;
        if (typeof row.key !== 'string' || row.key === '')
            return [];
        const label = typeof row.label === 'string' ? row.label : row.key;
        return row.numeric === true
            ? [{ key: row.key, label, numeric: true }]
            : [{ key: row.key, label }];
    });
}
/** Column set derived from the rows themselves, in first-seen key order. */
function inferColumns(rows) {
    const keys = [];
    for (const row of rows) {
        for (const key of Object.keys(row))
            if (!keys.includes(key))
                keys.push(key);
    }
    return keys.map((key) => ({ key, label: key }));
}
function readRows(data) {
    if (Array.isArray(data))
        return data.filter((row) => typeof row === 'object' && row !== null);
    if (typeof data === 'object' && data !== null && Array.isArray(data.rows)) {
        return (data.rows ?? []).filter((row) => typeof row === 'object' && row !== null);
    }
    return [];
}
function cellText(value) {
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    return JSON.stringify(value);
}
export function QueueTable({ config, data, headingLevel, slot }) {
    const rows = readRows(data);
    const declared = readColumns(config);
    const columns = declared.length > 0 ? declared : inferColumns(rows);
    const caption = typeof config.caption === 'string' ? config.caption : undefined;
    const emptyMessage = typeof config.emptyMessage === 'string'
        ? config.emptyMessage
        : 'Nothing is waiting. When applications arrive, they appear here.';
    const rowHeaderKey = typeof config.rowHeaderKey === 'string' ? config.rowHeaderKey : columns[0]?.key;
    return (_jsxs("div", { className: "fs-surface-queue", "data-widget": "queue-table", "data-row-count": rows.length, children: [slot.title && (_jsx(Heading, { level: headingLevel, className: "fs-surface-queue__title", children: slot.title })), rows.length === 0 || columns.length === 0 ? (_jsx(WidgetEmptyState, { children: emptyMessage })) : (_jsx("div", { className: "fs-surface-queue__scroll", 
                // A scrolling region needs to be reachable and named, or a keyboard
                // user cannot scroll it at all.
                tabIndex: 0, role: "region", "aria-label": caption ?? slot.title ?? 'Queue', children: _jsxs("table", { className: "fs-surface-queue__table", "data-probe": "queue-table", children: [caption && _jsx("caption", { className: "fs-surface-queue__caption", children: caption }), _jsx("thead", { children: _jsx("tr", { children: columns.map((column) => (_jsx("th", { scope: "col", "data-numeric": column.numeric ? 'true' : undefined, children: column.label }, column.key))) }) }), _jsx("tbody", { children: rows.map((row, index) => (_jsx("tr", { children: columns.map((column) => column.key === rowHeaderKey ? (_jsx("th", { scope: "row", children: cellText(row[column.key]) }, column.key)) : (_jsx("td", { "data-numeric": column.numeric ? 'true' : undefined, children: cellText(row[column.key]) }, column.key))) }, cellText(rowHeaderKey ? row[rowHeaderKey] : undefined) || `row-${index}`))) })] }) }))] }));
}
