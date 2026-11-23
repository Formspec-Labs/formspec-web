import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @filedesc Transition affordances — and the refusal that is the default.
 *
 * The call is recorded in `@formspec-org/surface`'s `transitions.ts`: the shell
 * does **not** own a default "continue" trigger. `surface-spec.md` §5.1 says a
 * router "MUST NOT infer success from a click, a rendered button, or a
 * validation summary", and a shell-supplied Continue button is that inference
 * wearing a label.
 *
 * So this renders a control only for a `fireable` transition — one whose trigger
 * resolves against a loaded Response Actions document AND for which the host
 * supplied an executor. Pressing it does not navigate; it asks the executor to
 * run the action, and navigation happens only if the executor reports the action
 * succeeded.
 *
 * Every other status renders a sentence saying what is missing. That sentence is
 * the product: a signed bundle describing an app that cannot leave its first
 * page is a fact worth putting on the page, for the person stuck on it and for
 * the author who signed it.
 */
import { useState } from 'react';
import { generationNeedAnchors, mergeNeedAnchors, resolveSurfaceStrings, } from '@formspec-org/surface';
import { needTraceAttributes } from './need-trace.js';
export function SurfaceTransitions({ from, transitions, strings, hasDefinitionForm, draftReviewTargetRouteRefs, onFire, onAdvance, }) {
    // A `supplied-by-slot` transition already has its control on the page — the
    // form's own submit button. Drawing a second one beside it would give a person
    // two things that look like the same act.
    const shown = transitions.filter((transition) => transition.status !== 'supplied-by-slot' &&
        transition.status !== 'condition-false');
    if (shown.length === 0)
        return null;
    const text = strings ?? resolveSurfaceStrings();
    const usesDefaultContinueTemplate = text('transitionContinue', { target: '__TARGET__' }) === 'Continue to __TARGET__';
    return (_jsx("div", { className: "fs-surface-transitions", "data-probe": "transitions", children: shown.map((transition, index) => {
            const isBackToReviewedForm = Boolean(draftReviewTargetRouteRefs?.has(transition.to));
            const secondary = Boolean(hasDefinitionForm || index > 0);
            return (_jsx(SurfaceTransition, { from: from, transition: transition, strings: text, secondary: secondary, backToForm: isBackToReviewedForm && usesDefaultContinueTemplate, usesDefaultContinueTemplate: usesDefaultContinueTemplate, ...(onFire ? { onFire } : {}), ...(onAdvance ? { onAdvance } : {}) }, `${transition.trigger}->${transition.to}`));
        }) }));
}
function SurfaceTransition({ from, transition, strings, secondary, backToForm, usesDefaultContinueTemplate, onFire, onAdvance, }) {
    const [pending, setPending] = useState(false);
    const [failure, setFailure] = useState(undefined);
    if (transition.status !== 'fireable' || !onFire) {
        return (_jsx("p", { className: "fs-surface-transition fs-surface-transition--blocked", "data-transition-status": transition.status, ...(transition.status === 'unfireable'
                ? { 'data-transition-unfireable-reason': transition.unfireableReason }
                : {}), "data-probe": "transition-blocked", role: "status", ...needTraceAttributes(transition.needAnchors), children: transition.reason }));
    }
    const rawLabel = transition.target?.route.title ?? transition.to;
    const targetLabel = usesDefaultContinueTemplate
        ? rawLabel.replace(/^The\s+/, 'the ')
        : rawLabel;
    const buttonText = pending
        ? strings('transitionPending')
        : backToForm
            ? 'Back to form'
            : strings('transitionContinue', { target: targetLabel });
    const renderedAnchors = mergeNeedAnchors(transition.needAnchors, transition.target
        ? generationNeedAnchors(transition.target.route)
        : []);
    return (_jsxs("div", { className: "fs-surface-transition", "data-transition-status": transition.status, "data-probe": "transition-fireable", ...needTraceAttributes(renderedAnchors), children: [_jsx("button", { type: "button", className: secondary
                    ? 'fs-surface-transition__button fs-surface-transition__button--secondary'
                    : 'fs-surface-transition__button', disabled: pending, onClick: () => {
                    setPending(true);
                    setFailure(undefined);
                    void onFire(transition, from)
                        .then((outcome) => {
                        if (outcome.advanced)
                            return onAdvance?.(transition, outcome);
                        setFailure(outcome.reason ?? strings('transitionFailed'));
                        return undefined;
                    })
                        .catch((error) => {
                        setFailure(error instanceof Error ? error.message : String(error));
                    })
                        .finally(() => setPending(false));
                }, children: buttonText }), failure && (_jsx("p", { className: "fs-surface-transition__failure", role: "alert", children: failure }))] }));
}
