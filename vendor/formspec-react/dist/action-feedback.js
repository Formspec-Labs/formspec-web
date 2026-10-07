'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Private provider feedback with one originating form-content outlet. */
import { createContext, useContext, useId, useLayoutEffect, useMemo, useRef } from 'react';
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
/** Transient DOM ownership; kept separate from semantic feedback and answer freshness. */
function captureFocusedOrigin(source, onCancel) {
    if (!source || !source.ownerDocument.hasFocus() || source.ownerDocument.activeElement !== source)
        return undefined;
    const document = source.ownerDocument;
    const window = document.defaultView;
    let eligible = true;
    const cancel = () => { eligible = false; dispose(); onCancel(); };
    const focusIn = (event) => { if (event.target !== source)
        cancel(); };
    // Removal can leave BODY focused without an explicit blur. A connected-source blur is intentional.
    const focusOut = () => { if (source.isConnected)
        cancel(); };
    const keyDown = (event) => { if (event.key === 'Tab')
        cancel(); };
    const pointerDown = (event) => { if (event.target !== source && !source.contains(event.target))
        cancel(); };
    const visibility = () => { if (document.visibilityState === 'hidden')
        cancel(); };
    function dispose() {
        document.removeEventListener('focusin', focusIn, true);
        source.removeEventListener('focusout', focusOut);
        document.removeEventListener('keydown', keyDown, true);
        document.removeEventListener('pointerdown', pointerDown, true);
        document.removeEventListener('visibilitychange', visibility);
        window?.removeEventListener('blur', cancel);
    }
    document.addEventListener('focusin', focusIn, true);
    source.addEventListener('focusout', focusOut);
    document.addEventListener('keydown', keyDown, true);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('visibilitychange', visibility);
    window?.addEventListener('blur', cancel);
    return {
        dispose,
        recover(target) {
            dispose(); // Retire before our own focusin; never repeat on Locale or later branch changes.
            if (!eligible || source.isConnected || !target.isConnected || target.ownerDocument !== document
                || !document.hasFocus() || document.visibilityState === 'hidden'
                || (document.activeElement && document.activeElement !== document.body && document.activeElement !== document.documentElement))
                return;
            for (let ancestor = target; ancestor; ancestor = ancestor.parentElement) {
                const style = window?.getComputedStyle(ancestor);
                if (ancestor.tagName === 'DETAILS' && !ancestor.hasAttribute('open')
                    && !ancestor.querySelector('summary')?.contains(target))
                    return;
                if (ancestor.hidden || ancestor.hasAttribute('inert') || ancestor.getAttribute('aria-hidden') === 'true'
                    || style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse')
                    return;
            }
            target.focus({ preventScroll: true });
        },
    };
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
    let focusOrigin;
    function retireFocus() { focusOrigin?.dispose(); focusOrigin = undefined; }
    function refresh() {
        const current = actionContentFingerprint(engine);
        if (current !== fingerprint || current === undefined) {
            epoch++;
            fingerprint = current;
            state.value = undefined;
            retireFocus();
        }
        return current !== undefined;
    }
    return {
        state,
        connect() {
            active = true;
            generation++;
            const stop = preactReactiveRuntime.effect(() => { refresh(); });
            return () => { active = false; generation++; stop(); state.value = undefined; retireFocus(); };
        },
        register(outlet) {
            outlets.add(outlet);
            return () => {
                outlets.delete(outlet);
                if (state.peek()?.ticket.outlet === outlet) {
                    token++;
                    state.value = undefined;
                    retireFocus();
                }
            };
        },
        start(outlet, intent, candidates, source) {
            retireFocus();
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
            focusOrigin = captureFocusedOrigin(source, () => { focusOrigin = undefined; });
            state.value = { ticket, anchors, feedback: { phase: 'pending', intent } };
            return ticket;
        },
        recoverFocus(ticket, target) {
            if (!active || !refresh())
                return;
            const owned = state.peek();
            if (!owned || owned.ticket !== ticket || owned.feedback.phase !== 'settled')
                return;
            const origin = focusOrigin;
            focusOrigin = undefined;
            if (owned.feedback.status === 'completed')
                origin?.recover(target);
            else
                origin?.dispose();
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
    const target = useRef(null);
    const owned = useSignal(store.state);
    const chrome = useChromeText();
    const current = owned?.ticket.outlet === id ? owned : undefined;
    useLayoutEffect(() => {
        if (current && target.current)
            store.recoverFocus(current.ticket, target.current);
    });
    return _jsx("div", { ref: target, tabIndex: -1, id: id, className: "formspec-action-status", role: "status", "aria-live": "polite", "aria-atomic": "true", ...needTraceAttrs(current?.anchors), children: actionResultMessage(chrome, current?.feedback ?? { phase: 'idle' }) });
}
