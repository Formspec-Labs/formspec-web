'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** @filedesc Display-category LayoutNode rendering (Text, DataTable, Summary, etc.). */
import { useCallback, useState } from 'react';
import { signal as createSignal } from '@preact/signals-core';
import { useFormspecContext, findItemByKey } from './context.js';
import { useSignal } from './use-signal';
import { useRepeatCount } from './use-repeat-count';
import { ValidationSummary } from './validation-summary';
import { componentGraphIdentityAttrs } from './projection-metadata.js';
/**
 * Minimal markdown-to-HTML converter. Handles the subset required by the Text
 * component spec: bold, italic, links, inline code, and newlines.
 */
function simpleMarkdown(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
        const trimmed = url.trim().toLowerCase();
        if (trimmed.startsWith('javascript:') ||
            trimmed.startsWith('data:') ||
            trimmed.startsWith('vbscript:')) {
            return `<span>${linkText}</span>`;
        }
        return `<a href="${url}">${linkText}</a>`;
    })
        .replace(/\n/g, '<br>');
}
const NO_VALUE = createSignal(null);
const NO_READONLY = createSignal(false);
/** Renders a display node — checks for user override before built-in rendering. */
export function DisplayNode({ node }) {
    const { components } = useFormspecContext();
    const text = node.props?.text || node.fieldItem?.label || '';
    const Override = components.display?.[node.component];
    if (Override) {
        return _jsx(Override, { node: node, text: text });
    }
    const cssClass = node.cssClasses?.join(' ') || undefined;
    const style = node.style;
    const graphAttrs = componentGraphIdentityAttrs(node);
    switch (node.component) {
        case 'Heading': {
            const level = node.props?.level || 2;
            const Tag = `h${Math.min(6, Math.max(1, level))}`;
            return _jsx(Tag, { className: cssClass || 'formspec-heading', style: style, ...graphAttrs, children: text });
        }
        case 'Divider':
            return _jsx("hr", { className: cssClass || 'formspec-divider', style: style, ...graphAttrs });
        case 'Alert': {
            const severity = node.props?.severity || 'info';
            const alertRole = severity === 'error' || severity === 'warning' ? 'alert' : 'status';
            const dismissible = node.props?.dismissible === true;
            return (_jsx(DismissibleAlert, { severity: severity, alertRole: alertRole, dismissible: dismissible, text: text, cssClass: cssClass, style: style, metadataAttrs: graphAttrs }));
        }
        case 'Badge': {
            const variant = node.props?.variant || 'default';
            return (_jsx("span", { className: `formspec-badge formspec-badge--${variant}${cssClass ? ' ' + cssClass : ''}`, style: style, ...graphAttrs, children: text }));
        }
        case 'ProgressBar': {
            const bindPath = node.props?.bind;
            const max = node.props?.max ?? 100;
            const showPercent = node.props?.showPercent === true;
            const progressLabel = node.props?.label || 'Progress';
            if (bindPath) {
                return (_jsx(BoundProgressBar, { bind: bindPath, max: max, showPercent: showPercent, progressLabel: progressLabel, cssClass: cssClass, style: style, metadataAttrs: graphAttrs }));
            }
            const value = node.props?.value ?? 0;
            const pct = Math.round((value / max) * 100);
            return (_jsxs("div", { className: `formspec-progress-bar${cssClass ? ' ' + cssClass : ''}`, style: style, ...graphAttrs, children: [_jsx("progress", { value: value, max: max, "aria-label": progressLabel }), showPercent && (_jsxs("span", { className: "formspec-progress-percent", children: [pct, "%"] }))] }));
        }
        case 'Summary': {
            const items = node.props?.items || [];
            return (_jsx(SummaryDisplay, { node: node, items: items, cssClass: cssClass, style: style, metadataAttrs: graphAttrs }));
        }
        case 'DataTable':
            return _jsx(DataTableDisplay, { node: node, cssClass: cssClass, style: style, metadataAttrs: graphAttrs });
        case 'ValidationSummary':
            return _jsx(ValidationSummaryDisplay, {});
        case 'Text':
        default: {
            const format = node.props?.format;
            const bindPath = node.props?.bind;
            const textClassName = `formspec-text${format === 'markdown' ? ' formspec-text--markdown' : ''}${cssClass ? ` ${cssClass}` : ''}`;
            if (format === 'markdown' && !bindPath) {
                return (_jsx("p", { className: textClassName, style: style, ...graphAttrs, dangerouslySetInnerHTML: { __html: simpleMarkdown(text) } }));
            }
            return (_jsx("p", { className: textClassName, style: style, ...graphAttrs, children: bindPath ? _jsx(BoundText, { bind: bindPath }) : text }));
        }
    }
}
function SummaryDisplay({ node: _node, items, cssClass, style, metadataAttrs, }) {
    return (_jsx("dl", { className: `formspec-summary${cssClass ? ' ' + cssClass : ''}`, style: style, ...metadataAttrs, children: items.map((item, i) => (_jsx(SummaryItem, { label: item.label, bind: item.bind }, item.bind || i))) }));
}
function BoundText({ bind }) {
    const { engine } = useFormspecContext();
    const sig = engine.signals[bind] ?? NO_VALUE;
    const rawValue = useSignal(sig);
    return _jsx(_Fragment, { children: rawValue != null ? String(rawValue) : '' });
}
function BoundProgressBar({ bind, max, showPercent, progressLabel, cssClass, style, metadataAttrs }) {
    const { engine } = useFormspecContext();
    const sig = engine.signals[bind] ?? NO_VALUE;
    const rawValue = useSignal(sig);
    const value = typeof rawValue === 'number' ? rawValue : 0;
    const pct = Math.round((value / max) * 100);
    return (_jsxs("div", { className: `formspec-progress-bar${cssClass ? ' ' + cssClass : ''}`, style: style, ...metadataAttrs, children: [_jsx("progress", { value: value, max: max, "aria-label": progressLabel }), showPercent && (_jsxs("span", { className: "formspec-progress-percent", children: [pct, "%"] }))] }));
}
function DismissibleAlert({ severity, alertRole, dismissible, text, cssClass, style, metadataAttrs }) {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed)
        return null;
    return (_jsxs("div", { role: alertRole, className: `formspec-alert formspec-alert--${severity}${dismissible ? ' formspec-alert--dismissible' : ''}${cssClass ? ' ' + cssClass : ''}`, style: style, ...metadataAttrs, children: [text, dismissible && (_jsx("button", { type: "button", className: "formspec-alert-close", "aria-label": "Dismiss", onClick: () => setDismissed(true), children: _jsx("span", { "aria-hidden": "true", children: "\u00D7" }) }))] }));
}
function formatMoney(value, locale = 'en-US') {
    if (value == null)
        return '\u2014';
    if (typeof value === 'object' && value !== null && 'amount' in value) {
        const money = value;
        try {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: money.currency || 'USD',
            }).format(Number(money.amount));
        }
        catch {
            return String(money.amount);
        }
    }
    return String(value);
}
function SummaryItem({ label, bind }) {
    const { engine } = useFormspecContext();
    const rawValue = useSignal(bind ? (engine.signals[bind] ?? NO_VALUE) : NO_VALUE);
    const displayValue = rawValue != null
        ? (typeof rawValue === 'object' && rawValue !== null && 'amount' in rawValue
            ? formatMoney(rawValue)
            : String(rawValue))
        : '\u2014';
    return (_jsxs(_Fragment, { children: [_jsx("dt", { children: label }), _jsx("dd", { children: displayValue })] }));
}
function DataTableCell({ signalPath, column, fieldDef, defaultCurrency, }) {
    const { engine } = useFormspecContext();
    const rawValue = useSignal(engine.signals[signalPath] ?? NO_VALUE);
    const readonly = useSignal(engine.readonlySignals[signalPath] ?? NO_READONLY);
    const isEditable = column.editable !== false;
    const dataType = fieldDef?.dataType || column.type;
    const optionSetEntry = fieldDef?.optionSet
        ? engine.getDefinition()?.optionSets?.[fieldDef.optionSet]
        : undefined;
    const optionSetChoices = optionSetEntry && typeof optionSetEntry === 'object' && 'options' in optionSetEntry
        ? optionSetEntry.options
        : Array.isArray(optionSetEntry)
            ? optionSetEntry
            : undefined;
    const choices = column.choices ?? optionSetChoices ?? fieldDef?.options ?? [];
    const prefix = fieldDef?.prefix;
    const suffix = fieldDef?.suffix;
    const wrapControl = (control) => {
        if (!prefix && !suffix)
            return control;
        return (_jsxs("div", { className: "formspec-datatable-cell-wrapper", children: [prefix ? _jsx("span", { className: "formspec-datatable-prefix", children: prefix }) : null, control, suffix ? _jsx("span", { className: "formspec-datatable-prefix", children: suffix }) : null] }));
    };
    if (!isEditable) {
        let displayValue = rawValue != null ? String(rawValue) : '';
        if (dataType === 'money' && rawValue != null && typeof rawValue === 'object') {
            try {
                const money = rawValue;
                displayValue = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: money.currency || fieldDef?.currency || column.currency || defaultCurrency,
                }).format(Number(money.amount ?? rawValue));
            }
            catch { /* fall through */ }
        }
        else if ((dataType === 'choice' || dataType === 'select') && choices.length > 0) {
            const match = choices.find((c) => c.value === rawValue);
            if (match)
                displayValue = match.label;
        }
        return _jsx("td", { children: displayValue });
    }
    if (dataType === 'boolean') {
        return (_jsx("td", { children: _jsx("input", { className: "formspec-datatable-input", type: "checkbox", checked: !!rawValue, "aria-label": column.header, disabled: readonly, onChange: (e) => engine.setValue(signalPath, e.target.checked) }) }));
    }
    if ((dataType === 'choice' || dataType === 'select') && choices.length > 0) {
        return (_jsx("td", { children: wrapControl(_jsxs("select", { className: "formspec-datatable-input", name: signalPath, value: rawValue != null ? String(rawValue) : '', "aria-label": column.header, disabled: readonly, onChange: (e) => engine.setValue(signalPath, e.target.value || null), children: [_jsx("option", { value: "" }), choices.map((c) => (_jsx("option", { value: c.value, children: c.label ?? c.value }, c.value)))] })) }));
    }
    if (dataType === 'number' || dataType === 'integer' || dataType === 'decimal' || dataType === 'money') {
        const moneyValue = rawValue != null && typeof rawValue === 'object' && 'amount' in rawValue
            ? rawValue.amount
            : undefined;
        const numericDisplay = moneyValue ?? (typeof rawValue === 'number' || typeof rawValue === 'string' ? rawValue : '');
        return (_jsx("td", { children: wrapControl(_jsx("input", { className: "formspec-datatable-input", name: signalPath, type: "number", step: column.step != null ? String(column.step) : (dataType === 'integer' ? '1' : 'any'), min: column.min != null ? String(column.min) : undefined, max: column.max != null ? String(column.max) : undefined, value: numericDisplay, "aria-label": column.header, disabled: readonly, onChange: (e) => {
                    const value = e.target.value.trim();
                    if (!value) {
                        engine.setValue(signalPath, null);
                        return;
                    }
                    const parsed = dataType === 'integer' ? Number.parseInt(value, 10) : Number.parseFloat(value);
                    let next = Number.isFinite(parsed) ? parsed : null;
                    if (typeof next === 'number') {
                        if (column.min != null && next < column.min)
                            next = column.min;
                        if (column.max != null && next > column.max)
                            next = column.max;
                    }
                    if (dataType === 'money' && next != null) {
                        engine.setValue(signalPath, {
                            amount: next,
                            currency: fieldDef?.currency || column.currency || defaultCurrency,
                        });
                    }
                    else {
                        engine.setValue(signalPath, next);
                    }
                } })) }));
    }
    if (dataType === 'date') {
        return (_jsx("td", { children: wrapControl(_jsx("input", { className: "formspec-datatable-input", name: signalPath, type: "date", value: rawValue != null ? String(rawValue) : '', "aria-label": column.header, disabled: readonly, onChange: (e) => engine.setValue(signalPath, e.target.value) })) }));
    }
    return (_jsx("td", { children: wrapControl(_jsx("input", { className: "formspec-datatable-input", name: signalPath, type: "text", value: rawValue != null ? String(rawValue) : '', "aria-label": column.header, disabled: readonly, onChange: (e) => engine.setValue(signalPath, e.target.value) })) }));
}
function DataTableDisplay({ node, cssClass, style, metadataAttrs, }) {
    const { engine } = useFormspecContext();
    const bindKey = node.props?.bind;
    const columns = node.props?.columns || [];
    const allowAdd = node.props?.allowAdd === true;
    const allowRemove = node.props?.allowRemove === true;
    const showRowNumbers = node.props?.showRowNumbers === true;
    const groupItem = bindKey ? findItemByKey(engine.getDefinition().items ?? [], bindKey) : null;
    const fieldByKey = new Map();
    if (groupItem?.type === 'group' && Array.isArray(groupItem.children)) {
        for (const child of groupItem.children) {
            if (child?.type === 'field' && child.key)
                fieldByKey.set(child.key, child);
        }
    }
    const defaultCurrency = engine.getDefinition()?.formPresentation?.defaultCurrency || 'USD';
    const repeatPath = bindKey || '';
    const count = useRepeatCount(repeatPath);
    const handleAdd = useCallback(() => {
        if (repeatPath)
            engine.addRepeatInstance(repeatPath);
    }, [engine, repeatPath]);
    const handleRemove = useCallback((idx) => {
        if (repeatPath)
            engine.removeRepeatInstance(repeatPath, idx);
    }, [engine, repeatPath]);
    if (!bindKey || columns.length === 0) {
        return (_jsx("div", { className: `formspec-data-table-wrapper${cssClass ? ' ' + cssClass : ''}`, style: style, ...metadataAttrs, children: _jsx("table", { className: "formspec-data-table" }) }));
    }
    return (_jsxs("div", { className: `formspec-data-table-wrapper${cssClass ? ' ' + cssClass : ''}`, style: style, ...metadataAttrs, children: [_jsxs("table", { className: "formspec-data-table", children: [node.props?.title && (_jsx("caption", { children: node.props?.title })), _jsx("thead", { children: _jsxs("tr", { children: [showRowNumbers && _jsx("th", { scope: "col", children: "#" }), columns.map((col, ci) => (_jsx("th", { scope: "col", children: col.header }, ci))), allowRemove && (_jsx("th", { scope: "col", children: _jsx("span", { className: "formspec-sr-only", children: "Actions" }) }))] }) }), _jsx("tbody", { children: Array.from({ length: count }, (_, i) => (_jsxs("tr", { children: [showRowNumbers && _jsx("td", { className: "formspec-row-number", children: i + 1 }), columns.map((col, ci) => (_jsx(DataTableCell, { signalPath: `${bindKey}[${i}].${col.bind}`, column: col, fieldDef: fieldByKey.get(col.bind), defaultCurrency: defaultCurrency }, ci))), allowRemove && (_jsx("td", { children: _jsx("button", { type: "button", className: "formspec-datatable-remove formspec-button-danger formspec-focus-ring", "aria-label": `Remove row ${i + 1}`, onClick: () => handleRemove(i), children: "Remove" }) }))] }, i))) })] }), allowAdd && (_jsx("button", { type: "button", className: "formspec-datatable-add formspec-focus-ring", onClick: handleAdd, children: "Add Row" }))] }));
}
function ValidationSummaryDisplay() {
    const { engine, touchedVersion } = useFormspecContext();
    const touched = useSignal(touchedVersion);
    useSignal(engine.structureVersion);
    if (touched === 0) {
        return null;
    }
    const report = engine.getValidationReport({ profile: 'live' });
    const results = report.results.map((r) => ({
        path: r.path || '',
        message: r.message || 'Validation error',
        severity: r.severity || 'error',
    }));
    return _jsx(ValidationSummary, { results: results, autoFocus: false });
}
