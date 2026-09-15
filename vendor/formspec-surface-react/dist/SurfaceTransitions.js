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
export function SurfaceTransitions({ from, transitions, strings, onFire, onAdvance, }) {
    // A `supplied-by-slot` transition already has its control on the page — the
    // form's own submit button. Drawing a second one beside it would give a person
    // two things that look like the same act.
    const shown = transitions.filter((transition) => transition.status !== 'supplied-by-slot' &&
        transition.status !== 'condition-false');
    if (shown.length === 0)
        return null;
    const text = strings ?? resolveSurfaceStrings();
    return (_jsx("div", { className: "fs-surface-transitions", "data-probe": "transitions", children: shown.map((transition) => (_jsx(SurfaceTransition, { from: from, transition: transition, strings: text, ...(onFire ? { onFire } : {}), ...(onAdvance ? { onAdvance } : {}) }, `${transition.trigger}->${transition.to}`))) }));
}
function SurfaceTransition({ from, transition, strings, onFire, onAdvance, }) {
    const [pending, setPending] = useState(false);
    const [failure, setFailure] = useState(undefined);
    if (transition.status !== 'fireable' || !onFire) {
        return (_jsx("p", { className: "fs-surface-transition fs-surface-transition--blocked", "data-transition-status": transition.status, ...(transition.status === 'unfireable'
                ? { 'data-transition-unfireable-reason': transition.unfireableReason }
                : {}), "data-probe": "transition-blocked", role: "status", ...needTraceAttributes(transition.needAnchors), children: transition.reason }));
    }
    const label = transition.target?.route.title ?? transition.to;
    const renderedAnchors = mergeNeedAnchors(transition.needAnchors, transition.target
        ? generationNeedAnchors(transition.target.route)
        : []);
    return (_jsxs("div", { className: "fs-surface-transition", "data-transition-status": transition.status, "data-probe": "transition-fireable", ...needTraceAttributes(renderedAnchors), children: [_jsx("button", { type: "button", className: "fs-surface-transition__button", disabled: pending, onClick: () => {
                    setPending(true);
                    setFailure(undefined);
                    void onFire(transition, from)
                        .then((outcome) => {
                        if (outcome.advanced)
                            onAdvance?.(transition, outcome);
                        else
                            setFailure(outcome.reason ?? strings('transitionFailed'));
                    })
                        .catch((error) => {
                        setFailure(error instanceof Error ? error.message : String(error));
                    })
                        .finally(() => setPending(false));
                }, children: pending ? strings('transitionPending') : strings('transitionContinue', { target: label }) }), failure && (_jsx("p", { className: "fs-surface-transition__failure", role: "alert", children: failure }))] }));
}
