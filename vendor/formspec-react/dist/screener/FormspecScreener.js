'use client';
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc FormspecScreener — standalone eligibility gate component. */
import { NativeSelectControl } from '../defaults/fields/controls/native-select';
import { useId } from 'react';
import { screenerOptionLocaleKey } from '@formspec-org/engine/render';
import { useScreener, itemDataType, itemOptions, isItemRequired } from './use-screener';
export function FormspecScreener({ screenerDocument, renderExternalRoute, renderNoMatch, className, ...options }) {
    const screener = useScreener({ ...options, screenerDocument });
    const { chrome, text, direction, localeFinding, translationWarnings } = screener.presentation;
    const items = screener.items;
    const fieldIdPrefix = useId();
    if (!screenerDocument)
        return null;
    if (localeFinding)
        return _jsx("p", { role: "alert", "data-locale-finding": localeFinding, children: chrome('screener.localeFailed') });
    if (screener.routeResult?.routeType === 'external') {
        if (renderExternalRoute) {
            return _jsx(_Fragment, { children: renderExternalRoute(screener.routeResult.route) });
        }
        return (_jsxs("div", { className: cls('formspec-container formspec-screener-routed', className), children: [_jsx("h2", { className: "formspec-heading formspec-screener-heading", children: screener.routeResult.route.label || chrome('screener.externalDefault') }), screener.routeResult.route.target && (_jsx("p", { className: "formspec-screener-routed-target", children: screener.routeResult.route.target })), _jsx("button", { type: "button", className: "formspec-button-primary formspec-screener-continue", onClick: screener.restart, children: chrome('screener.restart') })] }));
    }
    if (screener.routeResult?.routeType === 'none') {
        if (renderNoMatch)
            return _jsx(_Fragment, { children: renderNoMatch() });
        return (_jsxs("div", { className: cls('formspec-container formspec-screener-routed', className), children: [_jsx("h2", { className: "formspec-heading formspec-screener-heading", children: chrome('screener.noMatchTitle') }), _jsx("p", { className: "formspec-screener-routed-target", children: chrome('screener.noMatchBody') }), _jsx("button", { type: "button", className: "formspec-button-primary formspec-screener-continue", onClick: screener.restart, children: chrome('screener.restart') })] }));
    }
    if ((options.onDetermination && screener.state === 'routed') || screener.routeResult?.routeType === 'internal' || screener.skipped) {
        return null;
    }
    return (_jsxs("div", { className: cls('formspec-container formspec-screener', className), "aria-busy": screener.state === 'completing', dir: options.onDetermination || options.activeLocale !== undefined || options.localeDocuments !== undefined ? direction : undefined, children: [_jsx("h2", { className: "formspec-heading formspec-screener-heading", children: text('$form.title', screenerDocument.title || chrome('screener.titleDefault'), screener.answers) }), screenerDocument.description && (_jsx("p", { className: "formspec-screener-intro", children: text('$form.description', screenerDocument.description, screener.answers) })), translationWarnings.length > 0 && _jsx("p", { role: "status", "data-locale-warnings": JSON.stringify(translationWarnings), children: chrome('screener.translationWarning') }), _jsx("div", { className: "formspec-screener-fields", children: items.map((item) => (_jsx(ScreenerField, { fieldIdPrefix: fieldIdPrefix, presentation: screener.presentation, disabled: screener.state === 'completing', explicitBoolean: !!options.onDetermination, item: item, screener: screenerDocument, answers: screener.answers, value: screener.answers[item.key], error: screener.errors[item.key], onChange: (val) => screener.setAnswer(item.key, val) }, item.key))) }), screener.errors.$completion && _jsx("p", { role: "alert", "data-finding": screener.errors.$completion, children: chrome('screener.completionFailed') }), _jsx("button", { type: "button", className: "formspec-button-primary formspec-screener-continue", disabled: screener.state === 'completing', onClick: screener.submit, children: chrome('screener.submit', undefined, screenerDocument.submitLabel) })] }));
}
function ScreenerField({ fieldIdPrefix, presentation, explicitBoolean, disabled, item, screener, answers, value, error, onChange, }) {
    const { chrome, text } = presentation;
    const label = text(`${item.key}.label`, item.label ?? item.key, answers, item.key);
    const id = `${fieldIdPrefix}-${item.key}`;
    const showError = !!error;
    const dt = itemDataType(item);
    const required = isItemRequired(item, screener, answers);
    const renderInput = () => {
        switch (dt) {
            case 'boolean':
                if (explicitBoolean)
                    return _jsxs(_Fragment, { children: [_jsxs("label", { className: "formspec-label", htmlFor: id, children: [label, required && _jsx("span", { className: "formspec-required", "aria-hidden": "true", children: "*" })] }), _jsxs(NativeSelectControl, { disabled: disabled, id: id, value: value === true ? 'yes' : value === false ? 'no' : '', "aria-invalid": showError, "aria-required": required, "aria-describedby": showError ? `${id}-error` : undefined, onChange: e => onChange(e.target.value === '' ? undefined : e.target.value === 'yes'), children: [_jsx("option", { value: "", children: chrome('select.placeholder') }), _jsx("option", { value: "yes", children: chrome('screener.yes') }), _jsx("option", { value: "no", children: chrome('screener.no') })] })] });
                return (_jsxs("div", { className: "formspec-field--inline", children: [_jsx("input", { disabled: disabled, className: "formspec-input", id: id, type: "checkbox", checked: !!value, onChange: (e) => onChange(e.target.checked), "aria-invalid": showError, "aria-required": required, "aria-describedby": showError ? `${id}-error` : undefined }), _jsx("label", { className: "formspec-label", htmlFor: id, children: label })] }));
            case 'choice':
                return (_jsxs(_Fragment, { children: [_jsxs("label", { className: "formspec-label", htmlFor: id, children: [label, required && _jsx("span", { className: "formspec-required", "aria-hidden": "true", children: "*" })] }), _jsxs(NativeSelectControl, { disabled: disabled, id: id, value: typeof value === 'string' || typeof value === 'number' ? String(value) : '', onChange: (e) => onChange(e.target.value), "aria-invalid": showError, "aria-required": required, "aria-describedby": showError ? `${id}-error` : undefined, children: [_jsx("option", { value: "", disabled: true, hidden: true, children: chrome('select.placeholder') }), itemOptions(item).map((c) => (_jsx("option", { value: String(c.value ?? c), children: text(screenerOptionLocaleKey(item.key, String(c.value ?? c)), c.label ?? String(c.value ?? c), answers, item.key) }, String(c.value ?? c))))] })] }));
            case 'integer':
            case 'decimal':
                return (_jsxs(_Fragment, { children: [_jsxs("label", { className: "formspec-label", htmlFor: id, children: [label, required && _jsx("span", { className: "formspec-required", "aria-hidden": "true", children: "*" })] }), _jsx("input", { disabled: disabled, className: "formspec-input", id: id, type: "number", step: dt === 'decimal' ? 'any' : '1', value: value === null || value === undefined ? '' : Number(value), onChange: (e) => onChange(e.target.value === '' ? null : Number(e.target.value)), "aria-invalid": showError, "aria-required": required, "aria-describedby": showError ? `${id}-error` : undefined })] }));
            case 'money': {
                const moneyItem = item;
                return (_jsxs(_Fragment, { children: [_jsxs("label", { className: "formspec-label", htmlFor: id, children: [label, required && _jsx("span", { className: "formspec-required", "aria-hidden": "true", children: "*" })] }), _jsxs("div", { className: "formspec-money-field", children: [_jsx("span", { className: "formspec-money-currency", children: moneyItem.currency || 'USD' }), _jsx("input", { disabled: disabled, className: "formspec-input", id: id, type: "text", inputMode: "decimal", value: typeof value === 'object' && value !== null && !Array.isArray(value)
                                        ? String(value.amount ?? '')
                                        : typeof value === 'string' || typeof value === 'number'
                                            ? String(value)
                                            : '', onChange: (e) => {
                                        const raw = e.target.value;
                                        onChange(raw === ''
                                            ? null
                                            : { amount: Number(raw), currency: moneyItem.currency || 'USD' });
                                    }, "aria-invalid": showError, "aria-required": required, "aria-describedby": showError ? `${id}-error` : undefined })] })] }));
            }
            case 'text':
            case 'string':
            default:
                return (_jsxs(_Fragment, { children: [_jsxs("label", { className: "formspec-label", htmlFor: id, children: [label, required && _jsx("span", { className: "formspec-required", "aria-hidden": "true", children: "*" })] }), _jsx("input", { disabled: disabled, className: "formspec-input", id: id, type: "text", value: typeof value === 'string' ? value : '', onChange: (e) => onChange(e.target.value), "aria-invalid": showError, "aria-required": required, "aria-describedby": showError ? `${id}-error` : undefined })] }));
        }
    };
    return (_jsxs("div", { className: "formspec-field formspec-screener-field", "data-name": item.key, children: [renderInput(), showError && (_jsx("p", { id: `${id}-error`, className: "formspec-error", "aria-live": "polite", children: error }))] }));
}
function cls(base, extra) {
    return extra ? `${base} ${extra}` : base;
}
