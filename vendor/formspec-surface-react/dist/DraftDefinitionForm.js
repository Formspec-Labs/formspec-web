import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Open, resume and explicitly restart the native Surface form's draft. */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { resolveSurfaceStrings } from '@formspec-org/surface';
import { isPlainLinkClick } from './browser-location.js';
import { deriveDraftSubject } from './draft-session.js';
import { FormattedReceiptRef, filingStatusLabel } from './receipt-ref.js';
const fallbackStrings = resolveSurfaceStrings();
function filingBannerLead(status) {
    switch (status) {
        case 'returned':
            return 'This filing was returned for revision. Review the feedback below, update your answers, and resubmit.';
        case 'reopened':
            return 'This filing was reopened for updates. Review any notes below before resubmitting.';
        case 'accepted':
            return 'This filing has been accepted.';
        case 'closed-without-acceptance':
            return 'This filing was closed without acceptance.';
        case 'filed':
            return 'This form has been submitted.';
    }
}
export function DraftDefinitionForm({ input, session, children, }) {
    const [loaded, setLoaded] = useState();
    const open = loaded?.session === session ? loaded.result : undefined;
    const [attempt, setAttempt] = useState(0);
    const [allowReviseFiled, setAllowReviseFiled] = useState(false);
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
        if (canRestart && !decision)
            recoveryGroup.current?.focus();
        else if (conflict || canRestart)
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
        const report = latest.current.onDraftAvailabilityChange;
        if (!open || open.status === 'loading') {
            report?.('loading');
        }
        else if (open.status === 'ready') {
            report?.('ready');
        }
        else if (open.status === 'filed') {
            report?.('filed');
            latest.current.reportSave?.('cleared');
        }
        else {
            report?.('blocked');
        }
    }, [open?.status]);
    useEffect(() => {
        const report = latest.current.onDraftAvailabilityChange;
        return () => { report?.(undefined); };
    }, []);
    const acquiredRef = useRef(undefined);
    useEffect(() => {
        let active = true;
        let release;
        const opening = latest.current;
        const ready = async () => {
            // The planned subject names the subject; a renderer-supplied id never keys the draft.
            const subject = await deriveDraftSubject(opening.plan.subject);
            if (!active)
                return;
            const key = { scope: session.scope, definitionUrl: definition.url, subject };
            const currentInput = latest.current;
            const acquired = session.acquire(key, {
                ...opening,
                responseActionsDocument: currentInput.responseActionsDocument,
                onActionFinding: (finding) => latest.current.onActionFinding?.(finding),
            }, (kind, options) => {
                setNotice({ kind, ...options });
                latest.current.reportSave?.(kind);
            }, () => {
                if (!active)
                    return;
                setLoaded(undefined);
                setAttempt(value => value + 1);
            }, allowReviseFiled ? { allowReviseFiled: true } : undefined);
            acquiredRef.current = acquired;
            release = () => {
                if (acquiredRef.current === acquired)
                    acquiredRef.current = undefined;
                acquired.release();
            };
            const result = await acquired.result;
            if (active)
                setLoaded({ session, result });
        };
        void ready().catch(() => { if (active)
            setLoaded({ session, result: { status: 'unavailable' } }); });
        return () => { active = false; release?.(); };
    }, [session, definition, attempt, input.draftSeed, allowReviseFiled]);
    useEffect(() => {
        if (acquiredRef.current) {
            const finding = acquiredRef.current.setActions(input.responseActionsDocument);
            if (finding)
                latest.current.onActionFinding?.(finding);
            return;
        }
        if (open?.status !== 'ready')
            return;
        const finding = session.syncActions(open.writer, input.responseActionsDocument);
        if (finding)
            latest.current.onActionFinding?.(finding);
    }, [open, session, input.responseActionsDocument]);
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
            else if (open?.status === 'ready') {
                const result = await open.writer.resolveConflict(action);
                if (live.current && result === 'reopen') {
                    session.discardForReopen(open.writer);
                }
                else if (live.current && !result)
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
    const navigate = input.navigate;
    const formatHref = input.formatHref;
    const overviewDest = input.overviewDestination;
    const overviewHref = overviewDest !== undefined ? (formatHref ? formatHref(overviewDest) : overviewDest) : undefined;
    const reviewDest = input.reviewDestination;
    const reviewHref = reviewDest !== undefined ? (formatHref ? formatHref(reviewDest) : reviewDest) : undefined;
    if (open.status === 'filed') {
        const filing = open.filing;
        const badgeLabel = filingStatusLabel(filing.status, strings);
        return (_jsxs("section", { className: "fs-surface-filed-summary", "data-filing-status": filing.status, "aria-labelledby": messageId, children: [_jsxs("div", { className: "fs-surface-filed-summary__header", children: [_jsx("span", { className: "fs-surface-filing__badge", "data-filing-status": filing.status, children: badgeLabel }), _jsx("p", { id: messageId, className: "fs-surface-filed-summary__lead", children: filingBannerLead(filing.status) })] }), _jsxs("p", { className: "fs-surface-filing__meta fs-surface-filed-summary__receipt", "data-receipt-ref": "", children: ["Receipt reference: ", _jsx(FormattedReceiptRef, { reference: filing.receiptRef })] }), filing.sample && (_jsx("p", { className: "fs-surface-filing__meta", children: strings(filing.sample === 'fixture' ? 'formStatusFixture' : 'formStatusPreviewSubmit') })), filing.comments.length > 0 && (_jsx("div", { className: "fs-surface-filed-summary__comments", children: filing.comments.map((comment, index) => (_jsx("p", { className: "fs-surface-filing__comment", children: comment }, index))) })), _jsxs("div", { className: "fs-surface-filed-summary__actions", children: [reviewDest && reviewHref && (_jsx("a", { className: "fs-surface-action-link fs-surface-action-link--primary", href: reviewHref, onClick: event => {
                                if (!navigate || !isPlainLinkClick(event))
                                    return;
                                event.preventDefault();
                                void navigate(reviewDest);
                            }, children: "Review submitted answers" })), open.canRevise && (_jsx("button", { type: "button", className: "fs-surface-action-button fs-surface-action-button--secondary", onClick: () => {
                                returnToForm.current = true;
                                setAllowReviseFiled(true);
                            }, children: "Revise filing" })), overviewDest && overviewHref && (_jsx("a", { className: "fs-surface-action-link fs-surface-action-link--quiet", href: overviewHref, onClick: event => {
                                if (!navigate || !isPlainLinkClick(event))
                                    return;
                                event.preventDefault();
                                void navigate(overviewDest);
                            }, children: "Return to overview" }))] })] }));
    }
    if (open.status === 'ready') {
        const filing = open.filing;
        const showFilingBanner = Boolean(filing && (filing.status === 'returned'
            || filing.status === 'reopened'
            || filing.comments.length > 0
            || allowReviseFiled));
        return _jsxs(_Fragment, { children: [controls, showFilingBanner && filing && (_jsxs("section", { className: "fs-surface-filing-banner", "data-filing-status": filing.status, role: "region", "aria-label": filingStatusLabel(filing.status, strings), children: [_jsxs("div", { className: "fs-surface-filing-banner__header", children: [_jsx("span", { className: "fs-surface-filing__badge", "data-filing-status": filing.status, children: filingStatusLabel(filing.status, strings) }), _jsx("p", { className: "fs-surface-filing-banner__lead", children: allowReviseFiled && (filing.status === 'filed' || filing.status === 'accepted')
                                        ? 'Revising a submitted filing. Your previously filed answers are loaded below.'
                                        : filingBannerLead(filing.status) })] }), _jsxs("p", { className: "fs-surface-filing__meta", "data-receipt-ref": "", children: ["Receipt reference: ", _jsx(FormattedReceiptRef, { reference: filing.receiptRef })] }), filing.comments.map((comment, index) => (_jsx("p", { className: "fs-surface-filing__comment", children: comment }, index)))] })), _jsx("div", { ref: form, role: "form", "aria-label": definition.title, tabIndex: -1, children: children(open.engine, open.writer) })] });
    }
    if (open.status === 'pin-unavailable') {
        const target = open.prerequisiteTitle ?? open.instance;
        const detail = open.requiresAccepted
            ? `Waiting for an accepted "${target}" before this form can be started.`
            : `Waiting for "${target}" to be filed before this form can be started.`;
        return (_jsxs("section", { className: "fs-surface-prerequisite-notice", "data-draft-status": "pin-unavailable", role: "status", children: [_jsx("p", { className: "fs-surface-prerequisite-notice__title", children: strings('draftUnavailable') }), _jsx("p", { className: "fs-surface-prerequisite-notice__detail", children: detail }), overviewDest && overviewHref && (_jsx("div", { className: "fs-surface-prerequisite-notice__actions", children: _jsx("a", { className: "fs-surface-action-link fs-surface-action-link--secondary", href: overviewHref, onClick: event => {
                            if (!navigate || !isPlainLinkClick(event))
                                return;
                            event.preventDefault();
                            void navigate(overviewDest);
                        }, children: "Return to overview" }) }))] }));
    }
    if (open.status !== 'version-mismatch') {
        return (_jsxs("section", { className: "fs-surface-prerequisite-notice", "data-draft-status": open.status, role: "status", children: [_jsx("p", { className: "fs-surface-prerequisite-notice__title", children: strings('draftUnavailable') }), overviewDest && overviewHref && (_jsx("div", { className: "fs-surface-prerequisite-notice__actions", children: _jsx("a", { className: "fs-surface-action-link fs-surface-action-link--secondary", href: overviewHref, onClick: event => {
                            if (!navigate || !isPlainLinkClick(event))
                                return;
                            event.preventDefault();
                            void navigate(overviewDest);
                        }, children: "Return to overview" }) }))] }));
    }
    return controls || _jsx("p", { children: message });
}
