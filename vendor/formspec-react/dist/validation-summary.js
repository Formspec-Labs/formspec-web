'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** @filedesc ValidationSummary — the shared summary rows, each a link to its field, in the default look. */
import { useRef, useEffect, useMemo } from 'react';
import { readValidationSummaryRows, } from '@formspec-org/layout';
import { useFormspecContext } from './context';
import { useChromeText } from './use-chrome-text';
import { useHeadingLevel } from './heading-level';
import { useSignal } from './use-signal';
import { focusFieldIn } from './use-focus-field';
/**
 * The validation summary in the default look: a heading with the count, then every finding as a link to
 * its field. Which findings, in what words, and where each links are the shared reader's
 * (`@formspec-org/layout`) — the same rows the web component's adapters draw — fed from this provider's
 * engine, its latest submit and its touch gate. Jumping lands the focus the way the renderer's own field
 * focus does: disclosures opened, hidden tab or wizard step revealed.
 */
export function ValidationSummary({ comp, results: resultsProp, source: sourceProp = 'submit', severityFilter = ['error', 'warning'], autoFocus = true, className, }) {
    const { engine, touchedVersion, latestSubmit } = useFormspecContext();
    const chrome = useChromeText();
    const Heading = `h${useHeadingLevel()}`;
    const containerRef = useRef(null);
    // Reading the signals here re-renders on every change they carry: touch, submit, live validation.
    const touched = useSignal(touchedVersion) > 0;
    const submitted = useSignal(latestSubmit);
    useSignal(engine.structureVersion);
    const rows = useMemo(() => {
        const effective = comp ?? {
            source: sourceProp,
            // The standalone `live` mode has always shown the live report at once, before any touch.
            mode: 'continuous',
            showFieldErrors: true,
            jumpLinks: true,
        };
        const own = resultsProp ? resultsProp : null;
        const readerSource = {
            submitted: own ?? submitted?.validationReport?.results ?? (submitted ? [] : null),
            touched: comp ? touched : true,
            live: () => engine.getValidationReport({ profile: 'live' }).results,
            message: (result) => (own ? result.message : engine.resolveValidationMessage(result)) ?? '',
            field: (path) => {
                const vm = engine.getFieldVM(path);
                return vm ? { label: vm.label.value, controlId: vm.id || null } : null;
            },
            chrome,
        };
        return readValidationSummaryRows(effective, readerSource, { showFieldErrorsByDefault: true })
            .filter((row) => severityFilter.includes(row.severity));
    }, [comp, sourceProp, resultsProp, submitted, touched, engine, chrome, severityFilter]);
    const errors = rows.filter((r) => r.severity === 'error');
    const warnings = rows.filter((r) => r.severity !== 'error');
    const hasErrors = errors.length > 0;
    const hasWarnings = warnings.length > 0;
    // Auto-focus the summary container when errors appear
    useEffect(() => {
        if (autoFocus && hasErrors && containerRef.current) {
            containerRef.current.focus();
        }
    }, [autoFocus, hasErrors]);
    if (!hasErrors && !hasWarnings)
        return null;
    const summaryClassName = className
        ? `formspec-validation-summary formspec-validation-summary--visible ${className}`
        : 'formspec-validation-summary formspec-validation-summary--visible';
    const headerText = hasErrors
        ? chrome(errors.length === 1 ? 'validationSummary.fixOne' : 'validationSummary.fixMany', { count: errors.length })
        : chrome(warnings.length === 1 ? 'validationSummary.reviewOne' : 'validationSummary.reviewMany', { count: warnings.length });
    const jump = (row) => (event) => {
        event.preventDefault();
        const scope = containerRef.current?.closest('.formspec-theme-scope') ?? document.body;
        if (row.jumpPath)
            focusFieldIn(scope, row.jumpPath);
    };
    const renderRows = (items) => (_jsx(_Fragment, { children: items.map((r, i) => {
            const severityIcon = r.severity === 'warning' ? '!' : r.severity === 'info' ? 'i' : '✕';
            return (_jsxs("div", { className: `formspec-shape-${r.severity || 'error'}`, children: [_jsx("span", { className: "formspec-shape-icon", "aria-hidden": "true", children: severityIcon }), r.jumpHref ? (_jsx("a", { href: r.jumpHref, className: "formspec-validation-summary-link", onClick: jump(r), children: r.text })) : (_jsx("span", { children: r.text }))] }, i));
        }) }));
    // role="alert" when errors are present (assertive), role="status" for warnings-only (polite)
    const containerRole = hasErrors ? 'alert' : 'status';
    return (_jsxs("div", { ref: containerRef, tabIndex: -1, role: containerRole, className: summaryClassName, children: [_jsx(Heading, { className: "formspec-validation-summary-title", children: headerText }), renderRows(errors), renderRows(warnings)] }));
}
