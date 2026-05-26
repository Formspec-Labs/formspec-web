'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** @filedesc Wizard layout component — multi-step form navigation with soft validation. */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useFormspecContext } from '../../context';
import { componentGraphIdentityAttrs } from '../../projection-metadata.js';
// ---- helpers ----------------------------------------------------------------
/** Collect all bindPaths in a LayoutNode subtree (fields and groups). */
function collectBindPaths(node) {
    const paths = [];
    if (node.bindPath)
        paths.push(node.bindPath);
    for (const child of node.children) {
        paths.push(...collectBindPaths(child));
    }
    return paths;
}
/** Focus the first focusable element inside a container. */
function focusFirstIn(container) {
    if (!container)
        return;
    const el = container.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');
    el?.focus();
}
function cx(...parts) {
    return parts.filter(Boolean).join(' ');
}
// ---- component --------------------------------------------------------------
/**
 * Wizard layout — renders one step at a time with Previous / Next / Submit
 * navigation, optional progress bar, and soft validation on Next.
 *
 * Set `node.props.sidenav` (or `formPresentation.sidenav` on the component
 * document) to show a collapsible step rail; top progress is then hidden
 * (same as the web component).
 */
export function Wizard({ node, children }) {
    const { touchField, engine, onSubmit } = useFormspecContext();
    const stepNodes = node.children; // LayoutNode[] — one per step
    const stepChildren = React.Children.toArray(children); // ReactNode[] — rendered steps
    const totalSteps = stepChildren.length;
    const [currentStep, setCurrentStep] = useState(0);
    const [sidenavCollapsed, setSidenavCollapsed] = useState(false);
    const stepPanelRef = useRef(null);
    const announcerRef = useRef(null);
    const showProgress = node.props?.showProgress !== false;
    const allowSkip = !!node.props?.allowSkip;
    const showSideNav = !!node.props?.sidenav;
    const stepTitle = (idx) => stepNodes[idx]?.props?.title ||
        stepNodes[idx]?.fieldItem?.label ||
        `Step ${idx + 1}`;
    // Soft-touch all fields in the current step to reveal validation errors.
    // Does NOT block navigation — just makes errors visible.
    const touchCurrentStep = useCallback(() => {
        const stepNode = stepNodes[currentStep];
        if (!stepNode)
            return;
        const paths = collectBindPaths(stepNode);
        for (const path of paths) {
            touchField(path);
        }
    }, [currentStep, stepNodes, touchField]);
    /** Returns true if the current step has any validation errors. */
    const currentStepHasErrors = useCallback(() => {
        const stepNode = stepNodes[currentStep];
        if (!stepNode)
            return false;
        const paths = collectBindPaths(stepNode);
        for (const path of paths) {
            const vm = engine.getFieldVM(path);
            if (vm && vm.errors.value.some((e) => e.severity === 'error'))
                return true;
        }
        return false;
    }, [currentStep, stepNodes, engine]);
    const goTo = useCallback((next) => {
        const bounded = Math.max(0, Math.min(totalSteps - 1, next));
        setCurrentStep(bounded);
    }, [totalSteps]);
    const handleNext = useCallback(() => {
        touchCurrentStep();
        if (currentStepHasErrors())
            return; // stay on step — errors are now visible
        if (currentStep < totalSteps - 1) {
            goTo(currentStep + 1);
        }
    }, [touchCurrentStep, currentStepHasErrors, currentStep, totalSteps, goTo]);
    const handlePrev = useCallback(() => {
        if (currentStep > 0)
            goTo(currentStep - 1);
    }, [currentStep, goTo]);
    const handleSkip = useCallback(() => {
        if (currentStep < totalSteps - 1)
            goTo(currentStep + 1);
    }, [currentStep, totalSteps, goTo]);
    // Focus first element in new step and update announcer after step change.
    useEffect(() => {
        focusFirstIn(stepPanelRef.current);
    }, [currentStep]);
    const title = stepTitle(currentStep);
    const isFirst = currentStep === 0;
    const isLast = currentStep === totalSteps - 1;
    const progressRow = showProgress && totalSteps > 1 ? (_jsx("div", { className: cx('formspec-wizard-steps', showSideNav && 'formspec-hidden'), "aria-hidden": "true", children: stepNodes.map((_, idx) => (_jsxs("div", { className: "formspec-wizard-step-wrapper", children: [_jsx("span", { className: cx('formspec-wizard-step', idx === currentStep && 'formspec-wizard-step--active', idx < currentStep && 'formspec-wizard-step--completed'), children: idx < currentStep ? '\u2713' : idx + 1 }), _jsx("span", { className: cx('formspec-wizard-step-label', idx === currentStep && 'formspec-wizard-step-label--active'), children: stepTitle(idx) })] }, stepNodes[idx]?.id ?? idx))) })) : null;
    const stepBody = (_jsxs(_Fragment, { children: [progressRow, _jsxs("div", { className: "formspec-wizard-step-indicator", ref: announcerRef, children: [`Step ${currentStep + 1} of ${totalSteps}: ${title}`, isLast ? ' — final step' : ''] }), _jsx("div", { className: "formspec-wizard-panel", role: "region", "aria-label": title, ref: stepPanelRef, children: stepChildren[currentStep] }), _jsxs("div", { className: "formspec-wizard-nav", children: [_jsx("button", { type: "button", className: "formspec-wizard-prev formspec-button-secondary formspec-focus-ring", "aria-label": "Previous step", disabled: isFirst, "aria-disabled": isFirst, onClick: handlePrev, children: "Previous" }), allowSkip && !isLast && (_jsx("button", { type: "button", className: "formspec-wizard-skip formspec-button-secondary formspec-focus-ring", "aria-label": "Skip this step", onClick: handleSkip, children: "Skip" })), !isLast ? (_jsx("button", { type: "button", className: "formspec-wizard-next formspec-button-primary formspec-focus-ring", "aria-label": "Next step", onClick: handleNext, children: "Next" })) : (_jsx("button", { type: "button", className: "formspec-wizard-submit formspec-button-primary formspec-focus-ring", "aria-label": "Submit form", onClick: () => {
                            touchCurrentStep();
                            if (currentStepHasErrors())
                                return;
                            if (onSubmit) {
                                const response = engine.getResponse({ profile: 'on-submit' });
                                const validationReport = engine.getValidationReport({ profile: 'on-submit' });
                                onSubmit({ response, validationReport });
                            }
                        }, children: "Submit" }))] })] }));
    const rootProps = {
        className: cx('formspec-wizard', showSideNav && 'formspec-wizard--with-sidenav'),
        role: 'group',
        'aria-label': `Wizard: Step ${currentStep + 1} of ${totalSteps}`,
        ...componentGraphIdentityAttrs(node),
    };
    if (!showSideNav) {
        return _jsx("div", { ...rootProps, children: stepBody });
    }
    return (_jsxs("div", { ...rootProps, children: [_jsxs("nav", { className: cx('formspec-wizard-sidenav', sidenavCollapsed && 'formspec-wizard-sidenav--collapsed'), "aria-label": "Form steps", children: [_jsx("button", { type: "button", className: "formspec-wizard-sidenav-toggle formspec-focus-ring", "aria-label": sidenavCollapsed ? 'Expand navigation' : 'Collapse navigation', title: sidenavCollapsed ? 'Expand' : 'Collapse', onClick: () => setSidenavCollapsed((c) => !c), children: _jsx("svg", { "aria-hidden": "true", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", children: sidenavCollapsed ? (_jsx("polyline", { points: "9 18 15 12 9 6" })) : (_jsx("polyline", { points: "15 18 9 12 15 6" })) }) }), _jsx("ol", { className: "formspec-wizard-sidenav-list", children: stepNodes.map((sn, i) => (_jsx("li", { className: cx('formspec-wizard-sidenav-item', i === currentStep && 'formspec-wizard-sidenav-item--active', i < currentStep && 'formspec-wizard-sidenav-item--completed'), children: _jsxs("button", { type: "button", className: "formspec-wizard-sidenav-btn formspec-focus-ring", "aria-current": i === currentStep ? 'step' : 'false', onClick: () => goTo(i), children: [_jsx("span", { className: "formspec-wizard-sidenav-step", children: i < currentStep ? '\u2713' : String(i + 1) }), _jsx("span", { className: "formspec-wizard-sidenav-label", children: stepTitle(i) })] }) }, sn.id ?? i))) })] }), _jsx("div", { className: "formspec-wizard-content", children: stepBody })] }));
}
