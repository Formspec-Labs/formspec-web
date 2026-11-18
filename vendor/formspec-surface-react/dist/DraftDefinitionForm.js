import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Open, resume and explicitly restart the native Surface form's draft. */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { resolveSurfaceStrings } from '@formspec-org/surface';
import { deriveDraftSubject } from './draft-session.js';
const fallbackStrings = resolveSurfaceStrings();
export function DraftDefinitionForm({ input, session, children, }) {
    const [loaded, setLoaded] = useState();
    const open = loaded?.session === session ? loaded.result : undefined;
    const [attempt, setAttempt] = useState(0);
    const [decision, setDecision] = useState();
    const [recovering, setRecovering] = useState(false);
    const [notice, setNotice] = useState();
    const latest = useRef(input);
    const recoveryBusy = useRef(false);
    const live = useRef(false);
    const recoveryGroup = useRef(null);
    const recoveryButton = useRef(null);
    const form = useRef(null);
    const returnToForm = useRef(false);
    const messageId = useId();
    const promptId = useId();
    const strings = input.draftStrings ?? fallbackStrings;
    const definition = input.plan.definition;
    const status = open?.status;
    const conflict = open?.status === 'ready' && open.writer.conflict;
    const canRestart = status === 'version-mismatch' && !!session.restart;
    const selected = canRestart ? 'restart' : decision?.action;
    const confirming = decision?.action === selected && decision?.confirming;
    useLayoutEffect(() => {
        latest.current = input;
    });
    useLayoutEffect(() => {
        live.current = true;
        return () => { live.current = false; };
    }, []);
    useLayoutEffect(() => {
        if (conflict || canRestart)
            recoveryButton.current?.focus();
        else if (status === 'ready' && returnToForm.current) {
            returnToForm.current = false;
            form.current?.focus();
        }
    }, [conflict, canRestart, decision, status]);
    useLayoutEffect(() => {
        if (notice?.kind === 'draftConflict' && notice.focusConflict)
            recoveryGroup.current?.focus();
    }, [notice]);
    useEffect(() => {
        let active = true;
        let release;
        const opening = latest.current;
        const ready = async () => {
            const subject = opening.responseSubject && opening.plan.subject
                ? { ...opening.plan.subject, id: opening.responseSubject.id }
                : await deriveDraftSubject(opening.plan.subject);
            if (!active)
                return;
            const key = { scope: session.scope, definitionUrl: definition.url, subject };
            const acquired = session.acquire(key, opening, (kind, options) => {
                setNotice({ kind, ...options });
                latest.current.reportSave?.(kind);
            });
            release = acquired.release;
            const result = await acquired.result;
            if (active)
                setLoaded({ session, result });
        };
        void ready().catch(() => { if (active)
            setLoaded({ session, result: { status: 'unavailable' } }); });
        return () => { active = false; release?.(); };
    }, [session, definition, attempt, input.draftSeed]);
    async function restart() {
        if (open?.status !== 'version-mismatch' || !session.restart)
            return;
        try {
            const result = await session.restart(open.key, open.revision);
            if (!live.current)
                return;
            if (result.status !== 'discarded')
                latest.current.reportSave?.(result.status === 'conflict' ? 'draftConflict' : 'saveFailed');
            if (result.status === 'discarded' || result.status === 'conflict') {
                setLoaded(undefined);
                setAttempt(value => value + 1);
            }
        }
        catch {
            if (live.current)
                latest.current.reportSave?.('saveFailed');
        }
    }
    async function recover(action) {
        if (recoveryBusy.current)
            return;
        recoveryBusy.current = true;
        setRecovering(true);
        returnToForm.current = true;
        try {
            if (action === 'restart')
                await restart();
            else if (open?.status === 'ready' && !await open.writer.resolveConflict(action) && live.current) {
                latest.current.reportSave?.('draftConflict');
            }
        }
        finally {
            recoveryBusy.current = false;
            if (live.current) {
                setRecovering(false);
                setDecision(open?.status === 'ready' && open.writer.conflict ? { action, confirming: false } : undefined);
            }
        }
    }
    if (!open || open.status === 'loading') {
        return _jsx("p", { className: "fs-surface-loading", role: "status", "aria-busy": "true", children: strings('transitionPending') });
    }
    const message = strings(conflict ? 'draftConflict' : 'draftVersionMismatch');
    const prompt = selected === 'load' ? strings('draftDiscardPrompt')
        : selected === 'keep' ? strings('draftOverwritePrompt') : undefined;
    const primaryAction = conflict ? 'load' : 'restart';
    const controls = (conflict || canRestart) && (_jsxs("div", { ref: recoveryGroup, role: "group", "aria-labelledby": messageId, tabIndex: -1, children: [_jsx("p", { id: messageId, children: message }), confirming && selected ? _jsxs(_Fragment, { children: [prompt && _jsx("p", { id: promptId, children: prompt }), _jsx("button", { ref: recoveryButton, type: "button", "aria-disabled": recovering, "aria-describedby": prompt ? `${messageId} ${promptId}` : messageId, onClick: () => void recover(selected), children: strings(selected === 'restart' ? 'draftConfirmRestart'
                            : selected === 'load' ? 'draftConfirmDiscard' : 'draftConfirmOverwrite') }), _jsx("button", { type: "button", "aria-disabled": recovering, onClick: () => {
                            if (!recoveryBusy.current)
                                setDecision({ action: selected, confirming: false });
                        }, children: strings(conflict ? 'draftCancel' : 'draftKeep') })] }) : _jsxs(_Fragment, { children: [_jsx("button", { ref: selected === primaryAction ? recoveryButton : undefined, type: "button", "aria-describedby": messageId, onClick: () => setDecision({ action: primaryAction, confirming: true }), children: strings(conflict ? 'draftLoadNewer' : 'draftRestart') }), conflict && _jsx("button", { ref: selected === 'keep' ? recoveryButton : undefined, type: "button", "aria-describedby": messageId, onClick: () => setDecision({ action: 'keep', confirming: true }), children: strings('draftKeepChanges') })] })] }));
    if (open.status === 'ready')
        return _jsxs(_Fragment, { children: [controls, _jsx("div", { ref: form, role: "form", "aria-label": definition.title, tabIndex: -1, children: children(open.engine, open.writer) })] });
    if (open.status !== 'version-mismatch')
        return _jsx("p", { children: strings('draftUnavailable') });
    return controls || _jsx("p", { children: message });
}
