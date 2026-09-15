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
import { useState } from 'react';
import { generationNeedAnchors } from '@formspec-org/surface';
import { needTraceAttributes } from '../need-trace.js';
import { admitSurfaceWidgetActionInput } from '../widget-action-runtime.js';
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
const SAFE_PATH_PART = /^[a-zA-Z0-9_-]+$/;
const SAFE_PAYLOAD_NAME = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const UNSAFE_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function nonEmptyString(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function readRowPath(row, path) {
    if (path === '')
        return row;
    const parts = path.split('.');
    if (parts.some((part) => !SAFE_PATH_PART.test(part) || UNSAFE_PATH_PARTS.has(part))) {
        return undefined;
    }
    let current = row;
    for (const part of parts) {
        if ((typeof current !== 'object' && typeof current !== 'function') ||
            current === null ||
            !Object.prototype.hasOwnProperty.call(current, part)) {
            return undefined;
        }
        current = current[part];
    }
    return current;
}
function selectedRowActionInput(configured, row) {
    if (configured === undefined)
        return { accepted: true };
    const selectors = record(configured);
    if (!selectors)
        return { accepted: false };
    const selected = {};
    for (const [name, candidate] of Object.entries(selectors)) {
        const selector = record(candidate);
        if (!SAFE_PAYLOAD_NAME.test(name) || !selector)
            return { accepted: false };
        const path = selector.path;
        if (typeof path !== 'string')
            return { accepted: false };
        const value = readRowPath(row, path);
        if (value === undefined)
            return { accepted: false };
        selected[name] = value;
    }
    const admission = admitSurfaceWidgetActionInput(selected);
    return admission.accepted
        ? { accepted: true, input: admission.input }
        : { accepted: false };
}
function resolvedRowAction(configured, available) {
    const outputName = nonEmptyString(configured?.outputName);
    if (!outputName)
        return undefined;
    const matches = available.filter((action) => action.outputName === outputName);
    return matches.length === 1 ? matches[0] : undefined;
}
function literalActionLabel(action) {
    const label = action.label;
    return label && 'literal' in label ? nonEmptyString(label.literal) : undefined;
}
function QueueRowActionButton({ action, rowLabel, input, emphasis, pendingLabel, successMessage, failureMessage, anchors, emitAction, }) {
    const [status, setStatus] = useState('idle');
    const label = literalActionLabel(action);
    const visibleLabel = status === 'pending'
        ? pendingLabel ?? label
        : status === 'completed'
            ? successMessage ?? label
            : status === 'failed'
                ? failureMessage ?? label
                : label;
    return (_jsx("button", { className: "fs-surface-queue__action", type: "button", "data-row-action": "", "data-action-output": action.outputName, "data-action-ref": action.actionRef, "data-action-intent": action.intent, "data-action-status": status, "data-emphasis": emphasis, "aria-label": rowLabel ? `${label}: ${rowLabel}` : label, "aria-busy": status === 'pending' ? 'true' : undefined, disabled: status === 'pending', onClick: () => {
            const emission = input === undefined
                ? emitAction(action.outputName)
                : emitAction(action.outputName, input);
            if (!emission)
                return;
            setStatus('pending');
            void emission.completion
                .then((feedback) => {
                setStatus(feedback.status === 'completed'
                    ? 'completed'
                    : feedback.status === 'obsolete'
                        ? 'idle'
                        : 'failed');
            })
                .catch(() => setStatus('failed'));
        }, ...needTraceAttributes(anchors, action.needAnchors), children: _jsx("span", { "aria-live": "polite", children: visibleLabel }) }));
}
export function QueueTable({ config, data, slot, actions = [], emitAction, }) {
    const rows = readRows(data);
    const declared = readColumns(config);
    const columns = declared.length > 0 ? declared : inferColumns(rows);
    const caption = typeof config.caption === 'string' ? config.caption : undefined;
    const emptyMessage = typeof config.emptyMessage === 'string'
        ? config.emptyMessage
        : 'Nothing is waiting. When applications arrive, they appear here.';
    const rowHeaderKey = typeof config.rowHeaderKey === 'string' ? config.rowHeaderKey : columns[0]?.key;
    const rowKey = typeof config.rowKey === 'string' ? config.rowKey : undefined;
    const rowActionConfig = record(config.rowAction);
    const rowActionAnchors = generationNeedAnchors(rowActionConfig);
    const rowAction = rowActionAnchors.length > 0
        ? resolvedRowAction(rowActionConfig, actions)
        : undefined;
    const rowActionLabel = rowAction ? literalActionLabel(rowAction) : undefined;
    const rowActionColumnLabel = nonEmptyString(rowActionConfig?.columnLabel);
    const rowActionEmphasis = rowActionConfig?.emphasis === 'primary' ||
        rowActionConfig?.emphasis === 'danger'
        ? rowActionConfig.emphasis
        : 'secondary';
    const rendersRowAction = rowAction !== undefined &&
        rowActionLabel !== undefined &&
        rowActionColumnLabel !== undefined;
    return (_jsx("div", { className: "fs-surface-queue", "data-widget": "queue-table", "data-row-count": rows.length, children: rows.length === 0 || columns.length === 0 ? (_jsx(WidgetEmptyState, { children: emptyMessage })) : (_jsx("div", { className: "fs-surface-queue__scroll", 
            // A scrolling region needs to be reachable and named, or a keyboard
            // user cannot scroll it at all.
            tabIndex: 0, role: "region", "aria-label": caption ?? slot.title ?? 'Queue', children: _jsxs("table", { className: "fs-surface-queue__table", "data-probe": "queue-table", children: [caption && _jsx("caption", { className: "fs-surface-queue__caption", children: caption }), _jsx("thead", { children: _jsxs("tr", { children: [columns.map((column) => (_jsx("th", { scope: "col", "data-numeric": column.numeric ? 'true' : undefined, children: column.label }, column.key))), rendersRowAction ? (_jsx("th", { scope: "col", "data-action-column": "", ...needTraceAttributes(rowActionAnchors, rowAction.needAnchors), children: rowActionColumnLabel })) : null] }) }), _jsx("tbody", { children: rows.map((row, index) => {
                            const rowLabel = cellText(rowHeaderKey ? row[rowHeaderKey] : undefined);
                            const selectedInput = selectedRowActionInput(rowActionConfig?.payload, row);
                            return (_jsxs("tr", { children: [columns.map((column) => column.key === rowHeaderKey ? (_jsx("th", { scope: "row", children: cellText(row[column.key]) }, column.key)) : (_jsx("td", { "data-numeric": column.numeric ? 'true' : undefined, children: cellText(row[column.key]) }, column.key))), rendersRowAction ? (_jsx("td", { "data-action-column": "", ...needTraceAttributes(rowActionAnchors, rowAction.needAnchors), children: selectedInput.accepted ? (_jsx(QueueRowActionButton, { action: rowAction, rowLabel: rowLabel || undefined, input: selectedInput.input, emphasis: rowActionEmphasis, pendingLabel: nonEmptyString(rowActionConfig?.pendingLabel), successMessage: nonEmptyString(rowActionConfig?.successMessage), failureMessage: nonEmptyString(rowActionConfig?.failureMessage), anchors: rowActionAnchors, emitAction: emitAction })) : null })) : null] }, (rowKey ? cellText(row[rowKey]) : '') ||
                                `row-${index}:${rowLabel}`));
                        }) })] }) })) }));
}
