import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Mount an admitted Surface with browser navigation, Locale, and a shared masthead. */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { composeSurfaceApp, matchRoute, routeHref } from '@formspec-org/surface';
import { SurfaceAppView, useSurfaceApp } from './SurfaceApp.js';
import { pushBrowserAddress, splitSurfaceLocation, surfaceBrowserLocation, useSurfaceBrowserAddress, } from './browser-location.js';
import { useBrowserAppearance } from './browser-appearance.js';
import { resolveBrowserLocale } from './browser-locale.js';
export function BrowserSurfaceApp({ mode = 'history', basePath = '/', beforeLeave, previewEditions, ...props }) {
    const browser = surfaceBrowserLocation(mode, basePath);
    const { address, routeAddress, anchor, currentRouteAddress } = useSurfaceBrowserAddress(mode);
    const location = browser.read(routeAddress);
    const query = location?.query ?? new URLSearchParams();
    const requestedScope = previewEditions ? query.get('edition') : null;
    const edition = previewEditions?.find(option => option.scope === requestedScope) ?? previewEditions?.[0];
    const bundle = edition?.bundle ?? props.bundle;
    const previewScope = edition?.scope;
    const model = useSurfaceApp({ ...props, bundle });
    const entry = model.app.entry ? routeHref(model.app.entry, props.routeParams) : undefined;
    const entryPath = entry?.refusal === undefined ? entry?.href : undefined;
    const atEntry = location?.path === '' ||
        (location?.path === '/' && matchRoute(model.app, '/').refusal === 'unmatched');
    const path = requestedScope === null || requestedScope === previewScope
        ? atEntry ? entryPath : location?.path
        : undefined;
    const localeDocuments = props.localeDocuments ?? bundle.localeDocuments;
    const locale = useMemo(() => resolveBrowserLocale(bundle, localeDocuments), [bundle, localeDocuments]);
    const { preference, appearance, choose } = useBrowserAppearance();
    const [save, setSave] = useState();
    const request = useRef(0);
    const visit = useMemo(() => ({}), [address, bundle, props.sessionGeneration]);
    const currentVisit = useRef(undefined);
    useLayoutEffect(() => {
        currentVisit.current = visit;
        return () => { currentVisit.current = undefined; };
    }, [visit]);
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
        if (!leaving || !beforeLeave)
            return pushBrowserAddress(target, leaving);
        return (async () => {
            try {
                return await beforeLeave({ path, previewScope }) &&
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
        const { entry } = composeSurfaceApp(selected.bundle.surfaces, { entrySurface: selected.bundle.entrySurface });
        const target = entry ? routeHref(entry, props.routeParams) : undefined;
        if (target && !target.refusal)
            navigate(target.href, scope);
    }
    function sectionDestination(slot, section) {
        const search = new URLSearchParams(query);
        search.set('slot', slot);
        search.set('section', section);
        return `${path}?${search}`;
    }
    if (previewEditions && (new Set(previewEditions.map(option => option.scope)).size !== previewEditions.length ||
        previewEditions.some(option => !option.scope))) {
        throw new Error('Preview editions require distinct, non-empty draft scopes.');
    }
    return _jsx(SurfaceAppView, { ...props, bundle: bundle, model: model, location: path ?? '', onNavigate: navigate, resolveNavigationHref: resolveHref, activeLocale: locale.activeLocale || undefined, strings: locale.strings, browser: {
            addressAvailable: path !== undefined,
            appearance,
            direction: locale.direction,
            entryPath,
            anchor,
            previewScope,
            navigate,
            reportSave: notice => {
                // Ignore an old edition's result even when Back changes the address during a write.
                const currentScope = previewEditions
                    ? browser.read(currentRouteAddress())?.query.get('edition') ?? previewEditions[0].scope
                    : undefined;
                if (currentScope === previewScope)
                    setSave({ scope: previewScope, notice });
            },
            workspace: {
                slot: query.get('slot') ?? undefined,
                activeSection: query.get('section') ?? undefined,
                hrefForSection: (slot, section) => resolveHref(sectionDestination(slot, section)),
                onActiveSectionChange: (slot, section) => navigate(sectionDestination(slot, section)),
            },
            editionPicker: previewEditions && previewEditions.length > 1 && (_jsxs("label", { children: [locale.strings('previewEditionLabel'), _jsx("select", { "data-surface-edition": "", value: previewScope, onChange: event => switchEdition(event.currentTarget.value), children: previewEditions.map(option => _jsx("option", { value: option.scope, children: option.bundle.title ?? option.scope }, option.scope)) })] })),
            appearancePicker: (_jsxs("label", { children: [locale.strings('appearanceLabel'), _jsxs("select", { "data-surface-appearance": "", value: preference, onChange: event => choose(event.currentTarget.value), children: [_jsx("option", { value: "system", children: locale.strings('appearanceSystem') }), _jsx("option", { value: "light", children: locale.strings('appearanceLight') }), _jsx("option", { value: "dark", children: locale.strings('appearanceDark') })] })] })),
            saveNotice: save && save.scope === previewScope ? locale.strings(save.notice) : '',
        }, sessionGeneration: JSON.stringify([previewScope, props.sessionGeneration]) });
}
