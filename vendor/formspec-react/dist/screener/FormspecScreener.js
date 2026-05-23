'use client';
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useScreener, itemDataType, itemOptions, isItemRequired } from './use-screener';
export function FormspecScreener({ screenerDocument, renderExternalRoute, renderNoMatch, className, ...options }) {
    const screener = useScreener({ ...options, screenerDocument });
    const items = screener.items;
    if (!screenerDocument)
        return null;
    if (screener.routeResult?.routeType === 'external') {
        if (renderExternalRoute) {
            return _jsx(_Fragment, { children: renderExternalRoute(screener.routeResult.route) });
        }
        return (_jsxs("div", { className: cls('formspec-screener-routed', className), children: [_jsx("h2", { className: "formspec-screener-heading", children: screener.routeResult.route.label || 'Not Eligible' }), screener.routeResult.route.target && (_jsx("p", { className: "formspec-screener-routed-target", children: screener.routeResult.route.target })), _jsx("button", { type: "button", className: "formspec-screener-continue", onClick: screener.restart, children: "Start Over" })] }));
    }
    if (screener.routeResult?.routeType === 'none') {
        if (renderNoMatch)
            return _jsx(_Fragment, { children: renderNoMatch() });
        return (_jsxs("div", { className: cls('formspec-screener-routed', className), children: [_jsx("h2", { className: "formspec-screener-heading", children: "No matching route" }), _jsx("p", { className: "formspec-screener-routed-target", children: "No matching eligibility route was found." }), _jsx("button", { type: "button", className: "formspec-screener-continue", onClick: screener.restart, children: "Start Over" })] }));
    }
    if (screener.routeResult?.routeType === 'internal' || screener.skipped) {
        return null;
    }
    return (_jsxs("div", { className: cls('formspec-screener', className), children: [_jsx("h2", { className: "formspec-screener-heading", children: screenerDocument.title || 'Eligibility Check' }), screenerDocument.description && (_jsx("p", { className: "formspec-screener-intro", children: screenerDocument.description })), _jsx("div", { className: "formspec-screener-fields", children: items.map((item) => (_jsx(ScreenerField, { item: item, screener: screenerDocument, answers: screener.answers, value: screener.answers[item.key], error: screener.errors[item.key], onChange: (val) => screener.setAnswer(item.key, val) }, item.key))) }), _jsx("button", { type: "button", className: "formspec-screener-continue", onClick: screener.submit, children: screenerDocument.submitLabel || 'Check Eligibility' })] }));
}
function ScreenerField({ item, screener, answers, value, error, onChange, }) {
    const id = `screener-${item.key}`;
    const showError = !!error;
    const dt = itemDataType(item);
    const required = isItemRequired(item, screener, answers);
    const renderInput = () => {
        switch (dt) {
            case 'boolean':
                return (_jsxs("div", { className: "formspec-field--inline", children: [_jsx("input", { id: id, type: "checkbox", checked: !!value, onChange: (e) => onChange(e.target.checked), "aria-invalid": showError }), _jsx("label", { htmlFor: id, children: item.label })] }));
            case 'choice':
                return (_jsxs(_Fragment, { children: [_jsxs("label", { htmlFor: id, children: [item.label, required && _jsx("span", { className: "formspec-required", "aria-hidden": "true", children: "*" })] }), _jsxs("select", { id: id, value: typeof value === 'string' || typeof value === 'number' ? String(value) : '', onChange: (e) => onChange(e.target.value), "aria-invalid": showError, children: [_jsx("option", { value: "", disabled: true, hidden: true, children: "Select\u2026" }), itemOptions(item).map((c) => (_jsx("option", { value: String(c.value ?? c), children: c.label ?? String(c.value ?? c) }, String(c.value ?? c))))] })] }));
            case 'integer':
            case 'decimal':
                return (_jsxs(_Fragment, { children: [_jsxs("label", { htmlFor: id, children: [item.label, required && _jsx("span", { className: "formspec-required", "aria-hidden": "true", children: "*" })] }), _jsx("input", { id: id, type: "number", step: dt === 'decimal' ? 'any' : '1', value: value === null || value === undefined ? '' : Number(value), onChange: (e) => onChange(e.target.value === '' ? null : Number(e.target.value)), "aria-invalid": showError })] }));
            case 'money': {
                const moneyItem = item;
                return (_jsxs(_Fragment, { children: [_jsxs("label", { htmlFor: id, children: [item.label, required && _jsx("span", { className: "formspec-required", "aria-hidden": "true", children: "*" })] }), _jsxs("div", { className: "formspec-money-field", children: [_jsx("span", { className: "formspec-money-currency", children: moneyItem.currency || 'USD' }), _jsx("input", { id: id, type: "text", inputMode: "decimal", value: typeof value === 'object' && value !== null && !Array.isArray(value)
                                        ? String(value.amount ?? '')
                                        : typeof value === 'string' || typeof value === 'number'
                                            ? String(value)
                                            : '', onChange: (e) => {
                                        const raw = e.target.value;
                                        onChange(raw === ''
                                            ? null
                                            : { amount: Number(raw), currency: moneyItem.currency || 'USD' });
                                    }, "aria-invalid": showError })] })] }));
            }
            case 'text':
            case 'string':
            default:
                return (_jsxs(_Fragment, { children: [_jsxs("label", { htmlFor: id, children: [item.label, required && _jsx("span", { className: "formspec-required", "aria-hidden": "true", children: "*" })] }), _jsx("input", { id: id, type: "text", value: typeof value === 'string' ? value : '', onChange: (e) => onChange(e.target.value), "aria-invalid": showError })] }));
        }
    };
    return (_jsxs("div", { className: "formspec-field formspec-screener-field", "data-name": item.key, children: [renderInput(), showError && (_jsx("p", { className: "formspec-error", "aria-live": "polite", children: error }))] }));
}
function cls(base, extra) {
    return extra ? `${base} ${extra}` : base;
}
