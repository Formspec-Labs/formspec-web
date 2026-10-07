'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Private provider feedback with one originating form-content outlet. */
import { createContext, useContext, useId, useLayoutEffect, useMemo } from 'react';
import { signal } from '@preact/signals-core';
import { preactReactiveRuntime } from '@formspec-org/engine';
import { actionContentFingerprint } from './action-feedback-freshness.js';
import { needTraceAttrs } from './projection-metadata.js';
import { useChromeText } from './use-chrome-text.js';
import { useSignal } from './use-signal.js';
const STATUS_KEYS = {
    completed: 'action.completed', blocked: 'action.blocked', failed: 'action.failed',
    deferred: 'action.deferred', unresolved: 'action.unresolved',
};
export function actionResultMessage(chrome, feedback) {
    if (feedback.phase === 'idle')
        return '';
    if (feedback.phase === 'pending')
        return chrome('action.inProgress');
    if (feedback.intent === 'save-draft' && (feedback.status === 'failed' || feedback.status === 'unresolved')) {
        return chrome('draft.saveUnconfirmed');
    }
    return chrome('action.status', { status: chrome(STATUS_KEYS[feedback.status]) });
}
/** No response, payload, findings, translated copy or saved flag enters this store. */
export function createActionFeedbackStore(engine) {
    const state = signal(undefined);
    const outlets = new Set();
    let active = false;
    let generation = 0;
    let token = 0;
    let epoch = 0;
    let fingerprint;
    function refresh() {
        const current = actionContentFingerprint(engine);
        if (current !== fingerprint || current === undefined) {
            epoch++;
            fingerprint = current;
            state.value = undefined;
        }
        return current !== undefined;
    }
    return {
        state,
        connect() {
            active = true;
            generation++;
            const stop = preactReactiveRuntime.effect(() => { refresh(); });
            return () => { active = false; generation++; stop(); state.value = undefined; };
        },
        register(outlet) {
            outlets.add(outlet);
            return () => {
                outlets.delete(outlet);
                if (state.peek()?.ticket.outlet === outlet) {
                    token++;
                    state.value = undefined;
                }
            };
        },
        start(outlet, intent, candidates) {
            const next = ++token;
            state.value = undefined;
            if (!active || !outlets.has(outlet) || !refresh())
                return undefined;
            if (intent !== undefined && intent.length > 256)
                return undefined;
            if (candidates.length > 128 || candidates.some(anchor => typeof anchor !== 'string')
                || candidates.reduce((size, anchor) => size + anchor.length, 0) > 8192)
                return undefined;
            const anchors = Object.freeze((needTraceAttrs(candidates)['data-need-anchors'] ?? '').split(' ').filter(Boolean));
            const ticket = { token: next, generation, epoch, outlet };
            state.value = { ticket, anchors, feedback: { phase: 'pending', intent } };
            return ticket;
        },
        settle(ticket, status) {
            if (!ticket || !active || !refresh())
                return;
            const owned = state.peek();
            if (!owned || ticket.token !== token || ticket.generation !== generation
                || ticket.epoch !== epoch || !outlets.has(ticket.outlet))
                return;
            state.value = { ...owned, feedback: { phase: 'settled', status,
                    intent: owned.feedback.phase === 'idle' ? undefined : owned.feedback.intent } };
        },
    };
}
const StoreContext = createContext(undefined);
const OutletContext = createContext(undefined);
export function ActionFeedbackProvider({ engine, responseId, renderInstanceId, children }) {
    const store = useMemo(() => createActionFeedbackStore(engine), [engine, responseId, renderInstanceId]);
    useLayoutEffect(() => store.connect(), [store]);
    return _jsx(StoreContext.Provider, { value: store, children: children });
}
export function useActionFeedbackOutlet() { return useContext(OutletContext); }
/** The outlet lives outside recursive When branches and announces only its origin. */
export function ActionFeedbackContent({ children }) {
    const store = useContext(StoreContext);
    const id = useId();
    useLayoutEffect(() => store?.register(id), [store, id]);
    const outlet = useMemo(() => store ? { id, store } : undefined, [id, store]);
    return _jsxs(OutletContext.Provider, { value: outlet, children: [children, store && _jsx(ActionFeedbackStatus, { store: store, id: id })] });
}
function ActionFeedbackStatus({ store, id }) {
    const owned = useSignal(store.state);
    const chrome = useChromeText();
    const current = owned?.ticket.outlet === id ? owned : undefined;
    return _jsx("div", { id: id, className: "formspec-action-status", role: "status", "aria-live": "polite", "aria-atomic": "true", ...needTraceAttrs(current?.anchors), children: actionResultMessage(chrome, current?.feedback ?? { phase: 'idle' }) });
}
