import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Mount an admitted Surface with browser navigation, Locale, and a shared masthead. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { canonicalFiniteJson, matchRoute, responseSourceLoader, routeHref } from '@formspec-org/surface';
import { SurfaceAppView, useSurfaceApp } from './SurfaceApp.js';
import { pushBrowserAddress, splitSurfaceLocation, surfaceBrowserLocation, useSurfaceBrowserAddress, } from './browser-location.js';
import { useBrowserAppearance } from './browser-appearance.js';
import { resolveBrowserLocale } from './browser-locale.js';
import { createDraftSession } from './draft-session.js';
import { fenceDraftWidgetActions } from './draft-widget-action.js';
import { readSessionDraft } from './draft-data-source.js';
function isBrowserPort(port) {
    return !!port && 'subscribe' in port && 'restart' in port;
}
function samePreviewSession(previous, current) {
    const before = previous.adapters;
    const after = current.adapters;
    return previous.scope === current.scope && previous.bundle === current.bundle &&
        before.draftStorage?.port === after.draftStorage?.port && before.responses === after.responses &&
        before.draftStorage?.author?.id === after.draftStorage?.author?.id &&
        before.draftStorage?.author?.name === after.draftStorage?.author?.name &&
        before.sessionGeneration === after.sessionGeneration;
}
export function BrowserSurfaceApp(input) {
    const previewEditions = input.previewEditions;
    if (previewEditions && (!previewEditions.length || new Set(previewEditions.map(entry => entry.scope)).size !== previewEditions.length ||
        previewEditions.some(entry => !entry.scope)))
        throw new Error('Preview editions require distinct, non-empty draft scopes.');
    if (previewEditions?.some(({ scope, adapters }) => adapters.draftStorage && scope !== adapters.draftStorage.scope)) {
        throw new Error('Preview edition and storage scopes must match.');
    }
    const mode = input.adapters?.mode ?? (previewEditions ? 'hash' : 'history');
    const basePath = input.bundle ? input.adapters.basePath ?? '/' : '/';
    const browser = surfaceBrowserLocation(mode, basePath);
    const { address, routeAddress, anchor, currentRouteAddress } = useSurfaceBrowserAddress(mode);
    const location = browser.read(routeAddress);
    const query = location?.query ?? new URLSearchParams();
    const requestedScope = previewEditions ? query.get('edition') : null;
    const edition = previewEditions?.find(option => option.scope === requestedScope) ?? previewEditions?.[0];
    const bundle = edition?.bundle ?? input.bundle;
    const props = edition?.adapters ?? input.adapters ?? {};
    const { beforeLeave, draftStorage, checkpointPorts, responses, withResponseLoader } = props;
    const previewScope = edition?.scope;
    const port = draftStorage?.port;
    const localPort = isBrowserPort(port) ? port : undefined;
    const author = draftStorage?.author;
    // Native history can leave a dirty editor without running controlled navigation.
    // Keep its writer until the host replaces the edition's storage or identity.
    const [retained, retain] = useState(() => ({ editions: previewEditions, sessions: new Map() }));
    if (retained.editions !== previewEditions && (retained.editions?.length !== previewEditions?.length ||
        retained.editions?.some(previous => !previewEditions?.some(current => samePreviewSession(previous, current))))) {
        const sessions = new Map();
        for (const previous of retained.editions ?? []) {
            const session = retained.sessions.get(previous.scope);
            if (session && previewEditions?.some(current => samePreviewSession(previous, current))) {
                sessions.set(previous.scope, session);
            }
        }
        retain({ editions: previewEditions, sessions });
    }
    const checkpoint = useRef({ checkpointPorts, previewEditions });
    useLayoutEffect(() => { checkpoint.current = { checkpointPorts, previewEditions }; }, [checkpointPorts, previewEditions]);
    const liveSessions = useMemo(() => new Map(), [port, responses, props.sessionGeneration, author?.id, author?.name]);
    const sessions = previewEditions ? retained.sessions : liveSessions;
    const scope = draftStorage?.scope ?? previewScope;
    const drafts = useMemo(() => {
        if (!scope || !port)
            return undefined;
        const retained = sessions.get(scope);
        if (retained)
            return retained;
        const session = createDraftSession({ scope, port, responses, definitions: bundle.definitions, ...(author && { author }) }, localPort, input => {
            const current = checkpoint.current;
            const ports = current.previewEditions ? current.previewEditions.find(entry => entry.scope === scope)?.adapters.checkpointPorts : current.checkpointPorts;
            return ports?.(input) ?? input.ports;
        });
        sessions.set(scope, session);
        return session;
    }, [scope, port, responses, bundle.definitions, sessions, localPort, author?.id, author?.name]);
    const attachedSessions = useRef(undefined);
    useEffect(() => {
        attachedSessions.current = sessions;
        return () => {
            attachedSessions.current = undefined;
            queueMicrotask(() => {
                for (const [scope, session] of sessions) {
                    if (attachedSessions.current?.get(scope) !== session)
                        session.dispose();
                }
            });
        };
    }, [sessions]);
    const [draftRevision, setDraftRevision] = useState(0);
    useEffect(() => localPort?.subscribe(() => setDraftRevision(revision => revision + 1)), [localPort]);
    const dataSourceLoader = useMemo(() => {
        if (!drafts && !responses && !withResponseLoader)
            return props.dataSourceLoader;
        const baseline = props.dataSourceLoader ?? (() => ({ status: 'unavailable', reason: 'Data source unavailable' }));
        const readResponse = responses && responseSourceLoader(responses);
        const load = request => {
            if (drafts && request.descriptor.source.runtime.delivery === 'draft')
                return readSessionDraft(drafts, bundle.definitions, request);
            return readResponse && request.responseSelection ? readResponse(request) : baseline(request);
        };
        return withResponseLoader ? withResponseLoader(load) : load;
    }, [drafts, responses, withResponseLoader, bundle.definitions, props.dataSourceLoader]);
    const model = useSurfaceApp({ ...props, bundle });
    const entry = model.app.entry ? routeHref(model.app.entry, props.routeParams) : undefined;
    const entryPath = entry?.refusal === undefined ? entry?.href : undefined;
    const atEntry = location?.path === '' ||
        (location?.path === '/' && matchRoute(model.app, '/').refusal === 'unmatched');
    const path = requestedScope === null || requestedScope === previewScope
        ? atEntry ? edition?.initialPath ?? entryPath : location?.path
        : undefined;
    const baseRouteParamsKey = canonicalFiniteJson(props.routeParams ?? {});
    const lastSeenParamsRef = useRef({
        scope: previewScope,
        generation: props.sessionGeneration,
        baseParamsKey: baseRouteParamsKey,
        params: {},
    });
    if (lastSeenParamsRef.current.scope !== previewScope
        || lastSeenParamsRef.current.generation !== props.sessionGeneration
        || lastSeenParamsRef.current.baseParamsKey !== baseRouteParamsKey) {
        lastSeenParamsRef.current = {
            scope: previewScope,
            generation: props.sessionGeneration,
            baseParamsKey: baseRouteParamsKey,
            params: {},
        };
    }
    const currentPathMatch = path !== undefined ? matchRoute(model.app, path).match : undefined;
    if (currentPathMatch) {
        const matchedEntries = Object.entries(currentPathMatch.params);
        if (matchedEntries.some(([key, value]) => lastSeenParamsRef.current.params[key] !== value)) {
            lastSeenParamsRef.current = {
                ...lastSeenParamsRef.current,
                params: { ...lastSeenParamsRef.current.params, ...currentPathMatch.params },
            };
        }
    }
    const lastSeenParams = lastSeenParamsRef.current.params;
    const localeDocuments = props.localeDocuments ?? bundle.localeDocuments;
    const locale = useMemo(() => resolveBrowserLocale(bundle, localeDocuments), [bundle, localeDocuments]);
    const { preference, appearance, choose } = useBrowserAppearance();
    const [save, setSave] = useState();
    const request = useRef(0);
    const visit = useMemo(() => ({}), [address, bundle, drafts, previewScope, props.sessionGeneration]);
    const currentVisit = useRef(undefined);
    useLayoutEffect(() => {
        currentVisit.current = visit;
        return () => { currentVisit.current = undefined; };
    }, [visit]);
    const widgetActionExecutor = useMemo(() => drafts && props.widgetActionExecutor
        ? fenceDraftWidgetActions(props.widgetActionExecutor, drafts, bundle.definitions, () => currentVisit.current === visit && window.location.href === address)
        : props.widgetActionExecutor, [drafts, props.widgetActionExecutor, bundle.definitions, visit, address]);
    function resolveHref(href, scope = previewScope) {
        const { path, query } = splitSurfaceLocation(href);
        if (scope !== undefined)
            query.set('edition', scope);
        else
            query.delete('edition');
        return browser.href(path, query);
    }
    function navigate(href, scope = previewScope) {
        const isCurrent = () => currentVisit.current === visit && window.location.href === address;
        if (!isCurrent())
            return false;
        const destination = splitSurfaceLocation(href);
        const leaving = destination.path !== path || scope !== previewScope;
        const target = resolveHref(href, scope);
        if (target === undefined)
            return false;
        const attempt = ++request.current;
        if (!leaving || (!beforeLeave && !drafts))
            return pushBrowserAddress(target, leaving);
        return (async () => {
            try {
                return (!beforeLeave || await beforeLeave({ path, previewScope })) &&
                    request.current === attempt && isCurrent() &&
                    (!drafts || await drafts.leave()) &&
                    request.current === attempt && isCurrent() && pushBrowserAddress(target, true);
            }
            catch {
                // The writer reports the failed save. The current visit stays active.
                return false;
            }
        })();
    }
    function switchEdition(scope) {
        const selected = previewEditions?.find(option => option.scope === scope);
        if (!selected || scope === previewScope)
            return;
        navigate(selected.initialPath, scope);
    }
    function sectionDestination(slot, section) {
        const search = new URLSearchParams(query);
        search.set('slot', slot);
        search.set('section', section);
        search.delete('field');
        return `${path}?${search}`;
    }
    return _jsx(SurfaceAppView, { ...props, bundle: bundle, model: model, location: path ?? '', dataSourceLoader: dataSourceLoader, widgetActionExecutor: widgetActionExecutor, dataSourceRevision: request => {
            const ownerRevision = props.dataSourceRevision?.(request);
            const tracksDraft = drafts && (request.descriptor.source.runtime.delivery === 'draft' ||
                (responses && request.responseSelection !== undefined));
            if (!tracksDraft)
                return ownerRevision;
            if (ownerRevision === undefined)
                return draftRevision;
            return typeof ownerRevision === 'string' || Number.isFinite(ownerRevision)
                ? JSON.stringify([draftRevision, ownerRevision]) : ownerRevision;
        }, onNavigate: navigate, resolveNavigationHref: resolveHref, activeLocale: locale.activeLocale || undefined, strings: locale.strings, browser: {
            addressAvailable: path !== undefined,
            appearance,
            direction: locale.direction,
            entryPath,
            lastSeenParams,
            anchor,
            previewScope,
            drafts,
            draftRevision,
            navigate,
            reportSave: notice => {
                // Ignore an old edition's result even when Back changes the address during a write.
                const currentScope = previewEditions
                    ? browser.read(currentRouteAddress())?.query.get('edition') ?? previewEditions[0].scope
                    : undefined;
                if (currentScope === previewScope && currentVisit.current === visit) {
                    setSave({ scope: previewScope, generation: props.sessionGeneration, notice });
                    if (!localPort && drafts && notice === 'saved')
                        setDraftRevision(revision => revision + 1);
                }
            },
            workspace: {
                slot: query.get('slot') ?? undefined,
                activeSection: query.get('section') ?? undefined,
                focusField: query.get('field') ?? undefined,
                focusAcknowledgement: query.get('acknowledge') ?? undefined,
                hrefForSection: (slot, section) => resolveHref(sectionDestination(slot, section)),
                onActiveSectionChange: (slot, section) => navigate(sectionDestination(slot, section)),
            },
            editionPicker: previewEditions && previewEditions.length > 1 && (_jsxs("label", { children: [locale.strings('previewEditionLabel'), _jsx("select", { "data-surface-edition": "", value: previewScope, onChange: event => switchEdition(event.currentTarget.value), children: previewEditions.map(option => _jsx("option", { value: option.scope, children: option.bundle.title ?? option.scope }, option.scope)) })] })),
            appearancePicker: (_jsxs("label", { children: [locale.strings('appearanceLabel'), _jsxs("select", { "data-surface-appearance": "", value: preference, onChange: event => choose(event.currentTarget.value), children: [_jsx("option", { value: "system", children: locale.strings('appearanceSystem') }), _jsx("option", { value: "light", children: locale.strings('appearanceLight') }), _jsx("option", { value: "dark", children: locale.strings('appearanceDark') })] })] })),
            saveNotice: save && save.scope === previewScope && save.generation === props.sessionGeneration
                ? save.notice === 'submitted'
                    ? (localPort ? 'Submitted in this browser.' : 'Submitted.')
                    : save.notice === 'cleared'
                        ? ''
                        : locale.strings(save.notice)
                : '',
            saveNoticeLive: !(save && save.scope === previewScope && save.generation === props.sessionGeneration && save.notice === 'submitted'),
        }, sessionGeneration: JSON.stringify([previewScope, props.sessionGeneration]) });
}
