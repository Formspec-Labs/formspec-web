import { jsx as _jsx } from "react/jsx-runtime";
/** @filedesc Native Screener completion policy and host acceptance boundary. */
import { useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { FormspecScreener } from '@formspec-org/react';
import { resolveScreenerDetermination } from '@formspec-org/surface';
/** Keep answer state mounted across Locale and host port replacement. */
export function NativeScreenerSlot(props) {
    const mode = props.policy?.mode ?? 'stateless';
    const key = props.policy?.mode === 'host-required' ? props.policy.selectionKey : undefined;
    const complete = props.policy?.mode === 'host-required' ? props.policy.complete : undefined;
    const epoch = useMemo(() => ({ active: true, pending: new Set() }), [mode, key, complete, props.document, props.runtimeGeneration, props.visitId]);
    const live = useRef(epoch);
    live.current = epoch;
    useLayoutEffect(() => {
        epoch.active = true;
        return () => { epoch.active = false; for (const controller of epoch.pending)
            controller.abort(); epoch.pending.clear(); };
    }, [epoch]);
    const latest = useRef(props);
    latest.current = props;
    const onDetermination = useCallback((determination, answers, evaluationTime, context) => {
        const props = latest.current;
        const stale = () => !epoch.active || live.current !== epoch || context.signal.aborted;
        const refused = (reason, retry) => ({ status: 'refused', reason, ...(retry ? { retry } : {}) });
        if (stale())
            return refused('screener-completion-stale');
        // This snapshot remains private even when a host mutates its request.
        const input = structuredClone({ document: props.document, allowedTargets: [...props.allowedTargets], determination, answers, evaluationTime });
        const qualify = () => resolveScreenerDetermination({ ...input, nowIso: new Date().toISOString() });
        const result = qualify();
        if (result.status === 'refused')
            return refused(result.reason, 'new-act');
        const navigate = () => {
            if (stale())
                return refused('screener-completion-stale');
            const fresh = qualify();
            if (fresh.status === 'refused')
                return refused(fresh.reason, 'new-act');
            return props.navigate?.(result.target) ?? refused('screener-navigation-unavailable');
        };
        const destination = props.checkTarget?.(result.target);
        if (destination?.status === 'refused')
            return destination;
        if (mode === 'stateless')
            return navigate();
        if (!destination)
            return refused('screener-destination-check-unavailable');
        if (!key)
            return refused('screener-completion-selection-unavailable');
        if (!complete)
            return refused('screener-completion-host-unavailable');
        const controller = new AbortController();
        const abort = () => controller.abort();
        context.signal.addEventListener('abort', abort, { once: true });
        epoch.pending.add(controller);
        const cleanup = () => { epoch.pending.delete(controller); context.signal.removeEventListener('abort', abort); };
        const finish = (disposition) => {
            if (controller.signal.aborted || stale())
                return refused('screener-completion-stale');
            return disposition.status === 'accepted' ? navigate() : disposition;
        };
        try {
            const disposition = complete({ ...structuredClone(input), completionId: context.completionId,
                selectionKey: key, screenerRef: structuredClone(props.screenerRef), target: result.target,
                route: structuredClone(props.route), slotId: props.slotId,
                runtimeGeneration: props.runtimeGeneration, visitId: props.visitId, signal: controller.signal });
            if ('then' in disposition)
                return Promise.resolve(disposition).then(finish).finally(cleanup);
            cleanup();
            return finish(disposition);
        }
        catch (error) {
            cleanup();
            throw error;
        }
    }, [epoch, mode, key, complete]);
    return _jsx(FormspecScreener, { screenerDocument: props.document, localeDocuments: props.localeDocuments, activeLocale: props.activeLocale, completionKey: `${mode}/${key ?? ''}`, onDetermination: onDetermination });
}
