import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @filedesc `SurfaceApp` — a bundle's Surfaces, running.
 *
 * This is the piece that did not exist. Every `SurfaceDocument` consumer in the
 * stack was authoring-side (`studio-core`'s kernel, the MCP wireframe verbs) or
 * validation-side (the app-graph validator, `formspec-lint`); the one
 * rendering-adjacent consumer never opened a Surface document at all. So the
 * closed slot taxonomy, the route-class vocabulary, the route graph and the
 * transition triggers were authored, enforced, and read by nothing at render
 * time.
 *
 * ## Every diagnostic reaches the host, whatever stage produced it
 *
 * `surface-shell-spec.md` §7.1. This component previously aggregated only the
 * bundle, composition, registry and theme-construction diagnostics; the route
 * plan and the transition plan were computed inside a child and their
 * diagnostics **discarded**, so `SLOT-BINDING-INCOMPLETE`,
 * `STATIC-IMAGE-NO-ALT`, `EMBED-ROUTE-*`, `WIDGET-*`, per-slot
 * `BUNDLE-DOCUMENT-MISSING` and every `TRANSITION-UNFIREABLE` reached the
 * screen and never `onDiagnostics`. Per-route stages produce most of the code
 * set, so that delivered the minority of it.
 *
 * The fix is structural rather than an extra call: `planMatchedRoute` composes
 * the grant, the slot plan and the transition plan in the core and returns one
 * diagnostic list, and this component unions it with the app-construction list
 * and the route-resolution list in one memo. There is no second place a
 * diagnostic could be computed and dropped.
 *
 * ## Composition order, and why the theme authority is built first
 *
 * {@link useSurfaceApp} builds the theme authority **once, from the bundle**, and
 * hands back a `grantFor` that is the only route into the tenant Theme. The
 * tenant Theme is never a prop of anything below this line, so a slot renderer
 * cannot reach it by accident and a future prop cannot restore it by mistake.
 * That is the structural half of THEME-ROUTE-CLASS.
 *
 * ## Navigation is a port, not a router
 *
 * `location` and `onNavigate` are props. This package ships
 * BrowserSurfaceApp for hosts that want the address bar, and stays out
 * of the way of hosts that already have a router — which every host of any size
 * does. A shell that owned history would be a shell that could not be embedded.
 */
import { presentedRouteTitle } from './title-presentation.js';
import { useHostAppearance } from './browser-appearance.js';
import { deriveSurfaceRuntimeGeneration } from "./runtime-generation.js";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, } from "react";
import { canonicalFiniteJson, composeSurfaceApp, createThemeAuthority, createWidgetRegistry, documentRootContaminationDiagnostic, flattenRegistryEntries, generationNeedAnchors, matchRoute, mergeNeedAnchors, planMatchedRoute, resolveSurfaceStrings, routeHref, } from "@formspec-org/surface";
import { SurfaceRouteView } from "./SurfaceRoute.js";
import { createWidgetActionCoordinator } from "./widget-action-runtime.js";
import { diagnosticListsEqual, useDiagnosticDelivery, } from "./diagnostic-delivery.js";
import { needTraceAttributes } from "./need-trace.js";
import { useSurfaceThemeTokens } from "./surface-theme.js";
export function navigateAfterCompletedAction(transition, routeParams, transitionBindingsOrNavigate, maybeNavigate) {
    if (!transition.target)
        return "refused";
    const onNavigate = typeof transitionBindingsOrNavigate === "function"
        ? transitionBindingsOrNavigate
        : maybeNavigate;
    if (!onNavigate)
        return "refused";
    const transitionBindings = typeof transitionBindingsOrNavigate === "function"
        ? undefined
        : transitionBindingsOrNavigate;
    const nextParams = { ...routeParams };
    for (const [targetParam, bindingName] of Object.entries(transition.params ?? {})) {
        const routeValue = routeParams[bindingName];
        const actionValue = transitionBindings?.[bindingName];
        const admitted = [routeValue, actionValue].filter((value) => typeof value === "string" && value.length > 0);
        if (admitted.length === 0)
            return "refused";
        const value = admitted[0];
        if (admitted.some((candidate) => candidate !== value))
            return "refused";
        nextParams[targetParam] = value;
    }
    const destination = routeHref(transition.target, nextParams);
    if (destination.refusal !== undefined)
        return "refused";
    const navigation = onNavigate(destination.href);
    const disposition = (accepted) => accepted === false ? "refused" : "advanced";
    return typeof navigation === "object" && navigation !== null && typeof navigation.then === "function"
        ? navigation.then(disposition)
        : disposition(navigation);
}
export function useSurfaceApp(input) {
    const { bundle, surfaceLabel, tokenAliases, platformTheme, widgetModules } = input;
    return useMemo(() => {
        const compositionOptions = {
            ...(surfaceLabel ? { surfaceLabel } : {}),
            entrySurface: bundle.entrySurface,
        };
        const app = composeSurfaceApp(bundle.surfaces, compositionOptions);
        const registry = flattenRegistryEntries(bundle.registries);
        const themeAuthority = createThemeAuthority({
            tenantTheme: bundle.tenantTheme,
            platformTheme,
            tokenAliases,
        });
        const widgets = createWidgetRegistry({
            modules: widgetModules ?? [],
            registryEntries: registry.entries,
        });
        return {
            app,
            themeAuthority,
            widgets,
            registryEntries: registry.entries,
            diagnostics: [
                ...bundle.diagnostics,
                ...app.diagnostics,
                ...registry.diagnostics,
                ...themeAuthority.diagnostics,
            ],
        };
    }, [bundle, surfaceLabel, tokenAliases, platformTheme, widgetModules]);
}
/**
 * Inline `--formspec-*` custom properties on the document root, in a DOM
 * medium. Read, never removed: §4.5's no-scrubbing rule.
 */
function documentRootFormspecProperties() {
    if (typeof document === "undefined")
        return [];
    const style = document.documentElement.style;
    const properties = [];
    for (let index = 0; index < style.length; index += 1) {
        const property = style[index];
        if (property?.startsWith("--formspec-"))
            properties.push(property);
    }
    return properties;
}
const DEFAULT_NAVIGATION_SCOPE = "default";
let routeInstanceSequence = 0;
function allocateRouteInstanceId() {
    routeInstanceSequence += 1;
    return `formspec-route-instance:${routeInstanceSequence}`;
}
function routeNavigationScope(handle) {
    return handle.route.navigation?.scope ?? DEFAULT_NAVIGATION_SCOPE;
}
export function SurfaceApp(props) {
    return _jsx(SurfaceAppView, { ...props, model: useSurfaceApp(props) });
}
/** Shared rendering for controlled hosts and the maintained browser binding. */
export function SurfaceAppView(props) {
    const { model, browser } = props;
    const { bundle, location, onNavigate, onDiagnostics } = props;
    const setDocumentTitle = props.setDocumentTitle ?? true;
    const widgetActionCoordinator = useRef(createWidgetActionCoordinator());
    const appRoot = useRef(null);
    const main = useRef(null);
    const hostAppearance = useHostAppearance(appRoot, browser !== undefined);
    const formSession = browser && { ...browser, appearance: hostAppearance ?? browser.appearance };
    const strings = useMemo(() => typeof props.strings === "function"
        ? props.strings
        : resolveSurfaceStrings(props.strings), [props.strings]);
    const resolution = useMemo(() => browser?.addressAvailable === false
        ? { match: undefined, diagnostics: [] }
        : matchRoute(model.app, location), [model.app, location, browser?.addressAvailable]);
    const activeNavigationScope = resolution.match
        ? routeNavigationScope(resolution.match.handle)
        : DEFAULT_NAVIGATION_SCOPE;
    // Keep the route plan and its data inputs stable across equivalent parameter objects.
    const routeParamsKey = canonicalFiniteJson(props.routeParams ?? {});
    const routeParams = useMemo(() => JSON.parse(routeParamsKey), [routeParamsKey]);
    const navigationParams = useMemo(() => browser && resolution.match
        ? { ...routeParams, ...resolution.match.params }
        : routeParams, [browser !== undefined, resolution.match, routeParams]);
    const runtimeGeneration = useMemo(() => deriveSurfaceRuntimeGeneration({
        sessionGeneration: props.sessionGeneration,
        location,
        app: model.app,
        routeParams,
    }), [model.app, location, routeParams, props.sessionGeneration]);
    const routeInstance = useRef(undefined);
    if (!resolution.match) {
        routeInstance.current = undefined;
    }
    else if (routeInstance.current?.generation !== runtimeGeneration) {
        routeInstance.current = {
            generation: runtimeGeneration,
            id: allocateRouteInstanceId(),
        };
    }
    // A native Screener completion belongs to this mounted composition and visit.
    const screenerVisit = useMemo(() => ({ id: allocateRouteInstanceId(), active: false }), [model.app, runtimeGeneration]);
    const liveScreenerVisit = useRef(screenerVisit);
    liveScreenerVisit.current = screenerVisit;
    useLayoutEffect(() => {
        screenerVisit.active = true;
        return () => { screenerVisit.active = false; };
    }, [screenerVisit]);
    const routePlan = useMemo(() => {
        if (!resolution.match)
            return undefined;
        return planMatchedRoute({
            handle: resolution.match.handle,
            app: model.app,
            params: { ...routeParams, ...resolution.match.params },
            experiences: bundle.experiences,
            screenerHandles: bundle.screenerHandles,
            experienceHandles: bundle.experienceHandles,
            definitions: bundle.definitions,
            registryEntries: model.registryEntries,
            widgets: model.widgets,
            dataSources: bundle.dataSources,
            mappings: bundle.mappings,
            surfaceRef: bundle.surfaceRefs?.get(resolution.match.handle.surface),
            responseActions: bundle.responseActions,
            themeAuthority: model.themeAuthority,
            hasExecutor: props.onFireTransition !== undefined,
            hasWidgetActionExecutor: props.widgetActionExecutor !== undefined,
            evaluateCondition: props.evaluateTransitionCondition,
            headingBaseLevel: props.headingBaseLevel ?? 2,
            staticAssetResolver: props.staticAssetResolver,
            strings,
        });
    }, [
        resolution,
        model,
        bundle,
        routeParams,
        props.onFireTransition,
        props.widgetActionExecutor,
        props.evaluateTransitionCondition,
        props.headingBaseLevel,
        props.staticAssetResolver,
        strings,
    ]);
    useSurfaceThemeTokens(appRoot, browser ? routePlan?.grant.themeDocument ?? props.platformTheme : undefined);
    // One pure destination resolver is shared by preflight and navigation.
    const screenerDestination = (target) => {
        if (!screenerVisit.active || liveScreenerVisit.current !== screenerVisit || !routePlan)
            return { status: 'refused', reason: 'screener-generation-stale' };
        const matches = model.app.routes.filter(handle => `surface:${handle.routeId}` === target);
        if (matches.length !== 1 || matches[0].pathCollides)
            return { status: 'refused', reason: 'screener-target-not-unique' };
        const destination = routeHref(matches[0], routePlan.params);
        return destination.refusal ? { status: 'refused', reason: destination.refusal } : { status: 'accepted', href: destination.href };
    };
    const [runtimeDiagnosticsByScope, setRuntimeDiagnosticsByScope] = useState(() => new Map());
    const onRuntimeDiagnosticsChange = useCallback((scope, next) => {
        setRuntimeDiagnosticsByScope((previous) => {
            const current = previous.get(scope);
            if (current?.generation === runtimeGeneration &&
                diagnosticListsEqual(current.diagnostics, next)) {
                return previous;
            }
            if (next.length === 0 && current === undefined)
                return previous;
            const updated = new Map(previous);
            if (next.length === 0) {
                updated.delete(scope);
            }
            else {
                updated.set(scope, {
                    generation: runtimeGeneration,
                    diagnostics: next,
                });
            }
            return updated;
        });
    }, [runtimeGeneration]);
    const runtimeDiagnostics = useMemo(() => [...runtimeDiagnosticsByScope.values()]
        .filter((entry) => entry.generation === runtimeGeneration)
        .flatMap((entry) => entry.diagnostics), [runtimeDiagnosticsByScope, runtimeGeneration]);
    const navigationDiagnostics = useMemo(() => model.app.routes
        .filter((handle) => handle.route.navigation?.visible !== false &&
        routeNavigationScope(handle) === activeNavigationScope)
        .flatMap((handle) => routeHref(handle, navigationParams).diagnostics), [activeNavigationScope, model.app, navigationParams]);
    // Read after the route's `useLayoutEffect` has emitted its own tokens, so a
    // property found here is one something ELSE wrote globally. `join` is the
    // dependency so a re-render with the same root state does not loop.
    const [rootProperties, setRootProperties] = useState("");
    useEffect(() => {
        const observed = documentRootFormspecProperties().join(",");
        setRootProperties((previous) => previous === observed ? previous : observed);
    });
    const diagnostics = useMemo(() => {
        const rootDiagnostic = documentRootContaminationDiagnostic(rootProperties === "" ? [] : rootProperties.split(","));
        return [
            ...model.diagnostics,
            ...resolution.diagnostics,
            ...navigationDiagnostics,
            ...(routePlan?.diagnostics ?? []),
            ...runtimeDiagnostics,
            ...(rootDiagnostic ? [rootDiagnostic] : []),
        ];
    }, [
        model.diagnostics,
        resolution,
        navigationDiagnostics,
        routePlan,
        runtimeDiagnostics,
        rootProperties,
    ]);
    useDiagnosticDelivery(diagnostics, onDiagnostics);
    useEffect(() => {
        const deliver = props.onCurrentRouteStateChange;
        if (!deliver)
            return;
        if (!routePlan) {
            deliver(undefined);
            return;
        }
        deliver({
            surface: routePlan.handle.surface,
            surfaceId: routePlan.handle.surfaceId,
            ...(routePlan.surfaceRef === undefined
                ? {}
                : { surfaceRef: routePlan.surfaceRef }),
            routeId: routePlan.handle.routeId,
            routeInstanceId: routeInstance.current.id,
        });
        return () => deliver(undefined);
    }, [props.onCurrentRouteStateChange, routePlan, runtimeGeneration]);
    const appTitle = props.appTitle ?? bundle.title;
    const entryPath = browser?.entryPath;
    const entryHref = entryPath === undefined || !props.resolveNavigationHref
        ? entryPath
        : props.resolveNavigationHref(entryPath);
    const brandTrace = needTraceAttributes(generationNeedAnchors(bundle.manifest));
    const routeTitle = browser && routePlan ? presentedRouteTitle(routePlan.handle, props.resolveRouteTitle) : undefined;
    const title = routeTitle && appTitle ? `${routeTitle} – ${appTitle}` : routeTitle ?? appTitle;
    const match = resolution.match;
    const routeIdentity = browser && JSON.stringify([browser.previewScope, match
            ? [match.handle.surfaceId, match.handle.routeId, match.params]
            : location]);
    const previousRoute = useRef(undefined);
    useLayoutEffect(() => {
        const previous = previousRoute.current;
        previousRoute.current = routeIdentity;
        if (routeIdentity === undefined || previous === undefined || routeIdentity === previous || browser?.anchor)
            return;
        const target = main.current?.querySelector('.fs-surface-route__title, h1, [role="heading"][aria-level="1"]') ?? main.current;
        target?.setAttribute('tabindex', '-1');
        target?.focus({ preventScroll: true });
    }, [routeIdentity, browser?.anchor]);
    return (_jsxs("div", { ref: appRoot, className: "fs-surface-app", "data-fs-appearance": formSession?.appearance, lang: browser ? props.activeLocale : undefined, dir: browser && props.activeLocale ? browser.direction : undefined, ...brandTrace, children: [setDocumentTitle && title && _jsx(SurfaceDocumentTitle, { title: title }), (props.header !== undefined || appTitle || browser) && (_jsx("header", { className: "fs-surface-header", children: _jsxs("div", { className: "fs-surface-header__inner", children: [props.header ?? (appTitle && (entryPath !== undefined && entryHref !== undefined
                            ? _jsx("a", { className: "fs-surface-brand", href: entryHref, ...brandTrace, onClick: event => {
                                    if (!isPlainLinkClick(event))
                                        return;
                                    event.preventDefault();
                                    onNavigate(entryPath);
                                }, children: appTitle })
                            : _jsx("span", { className: "fs-surface-brand", ...brandTrace, children: appTitle }))), browser && (browser.editionPicker || hostAppearance === undefined) && (_jsxs("div", { className: "fs-surface-masthead-controls", children: [browser.editionPicker, hostAppearance === undefined && browser.appearancePicker] })), browser && _jsx("p", { className: "fs-surface-save-notice", role: "status", children: browser.saveNotice })] }) })), _jsxs("div", { className: "fs-surface-shell", children: [_jsx(SurfaceNav, { app: model.app, location: location, routeParams: navigationParams, onNavigate: onNavigate, resolveNavigationHref: props.resolveNavigationHref, label: props.navigationLabel ?? strings("navigationLabel"), menuLabel: props.navigationLabel ?? strings("navigationLabel"), resolveRouteTitle: props.resolveRouteTitle }), _jsx("main", { ref: main, className: "fs-surface-main", children: routePlan ? (_jsx(SurfaceRouteView, { plan: routePlan, formSession: formSession, screenerCompletion: props.screenerCompletion, screenerInstanceId: screenerVisit.id, localeDocuments: props.localeDocuments ?? props.bundle.localeDocuments, activeLocale: props.activeLocale, resolveRouteTitle: props.resolveRouteTitle, strings: strings, dataSourceLoader: props.dataSourceLoader, dataSourceRevision: props.dataSourceRevision, authorizeDataSource: props.authorizeDataSource, validateDataSourcePayload: props.validateDataSourcePayload, widgetActionExecutor: props.widgetActionExecutor, widgetActionOutcomeStore: props.widgetActionOutcomeStore, widgetActionCoordinator: widgetActionCoordinator.current, runtimeGeneration: runtimeGeneration, onWidgetActionReport: props.onWidgetActionReport, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, renderDefinitionForm: props.renderDefinitionForm, definitionActionInvoker: props.definitionActionInvoker, resolveSemanticControlScope: props.resolveSemanticControlScope, resolveSemanticOutputScope: props.resolveSemanticOutputScope, onDefinitionActionResult: props.onDefinitionActionResult, showExperienceNeeds: props.showExperienceNeeds, showThemeNotice: props.showThemeNotice, responseActionsDocuments: bundle.responseActions, referencesDocuments: bundle.references ?? [], ontologyDocuments: bundle.ontologies ?? [], onFireTransition: props.onFireTransition, checkScreenerTarget: screenerDestination, onScreenerTarget: (target) => {
                                const destination = screenerDestination(target);
                                if (destination.status === 'refused')
                                    return destination;
                                if (browser) {
                                    const dispose = (navigated) => navigated
                                        ? { status: 'accepted' }
                                        : { status: 'refused', reason: 'screener-navigation-unavailable' };
                                    const navigated = browser.navigate(destination.href);
                                    return typeof navigated === 'boolean' ? dispose(navigated) : navigated.then(dispose);
                                }
                                onNavigate(destination.href);
                                return { status: 'accepted' };
                            }, onAdvance: (transition, outcome) => {
                                // Reached only after the action reported success. The shell
                                // navigates; it never decides that the action succeeded.
                                // Defensive final boundary. Planning withholds collision-targeted
                                // transition controls, and this check prevents a future or
                                // slot-supplied path from publishing the same refused address.
                                return browser
                                    ? navigateAfterCompletedAction(transition, routePlan.params, outcome?.transitionBindings, browser.navigate)
                                    : navigateAfterCompletedAction(transition, routePlan.params, outcome?.transitionBindings, onNavigate);
                            } }, browser ? runtimeGeneration : `${routePlan.handle.surfaceId}/${routePlan.handle.routeId}`)) : (props.renderNotFound?.(location) ?? _jsx(NotFound, { strings: strings })) })] }), props.footer] }));
}
function SurfaceDocumentTitle({ title }) {
    useLayoutEffect(() => {
        const previous = document.title;
        document.title = title;
        return () => { document.title = previous; };
    }, [title]);
    return null;
}
function isPlainLinkClick(event) {
    return !event.defaultPrevented && event.button === 0 &&
        !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
}
export function SurfaceNav({ app, location, routeParams, onNavigate, resolveNavigationHref, label, menuLabel, resolveRouteTitle, }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const activeMatch = matchRoute(app, location).match;
    const activeRoute = activeMatch?.handle;
    const activeNavigationScope = activeRoute
        ? routeNavigationScope(activeRoute)
        : DEFAULT_NAVIGATION_SCOPE;
    const groups = app.groups
        .map((group) => ({
        ...group,
        needAnchors: generationNeedAnchors(group.routes[0]?.surface),
        routes: group.routes
            .map((handle, declarationOrder) => ({ handle, declarationOrder }))
            .filter(({ handle }) => handle.route.navigation?.visible !== false &&
            routeNavigationScope(handle) === activeNavigationScope)
            .sort((left, right) => {
            const leftOrder = left.handle.route.navigation?.order;
            const rightOrder = right.handle.route.navigation?.order;
            if (leftOrder === undefined && rightOrder === undefined) {
                return left.declarationOrder - right.declarationOrder;
            }
            if (leftOrder === undefined)
                return 1;
            if (rightOrder === undefined)
                return -1;
            return (leftOrder - rightOrder ||
                left.declarationOrder - right.declarationOrder);
        })
            .map(({ handle }) => handle),
    }))
        .filter((group) => group.routes.length > 0);
    useEffect(() => {
        setMenuOpen(false);
    }, [location]);
    if (groups.length === 0)
        return null;
    const showGroupLabels = groups.length > 1;
    const navigationNeedAnchors = mergeNeedAnchors(...groups.flatMap((group) => [
        group.needAnchors,
        ...group.routes.map((handle) => mergeNeedAnchors(generationNeedAnchors(handle.route.navigation), generationNeedAnchors(handle.route))),
    ]));
    return (_jsxs("nav", { className: "fs-surface-nav", "aria-label": label ?? "Pages in this app", "data-navigation-scope": activeNavigationScope, "data-menu-open": menuOpen ? "true" : "false", children: [_jsxs("button", { className: "fs-surface-nav__toggle", type: "button", "aria-expanded": menuOpen, onClick: () => setMenuOpen((open) => !open), ...needTraceAttributes(navigationNeedAnchors), children: [_jsx("span", { children: menuLabel ?? label ?? "Pages in this app" }), _jsx("span", { "aria-hidden": "true", children: menuOpen ? "×" : "☰" })] }), _jsx("div", { className: "fs-surface-nav__content", children: groups.map((group) => (_jsxs("div", { className: "fs-surface-nav__group", children: [showGroupLabels && (_jsx("p", { className: "fs-surface-nav__label", ...needTraceAttributes(group.needAnchors), children: group.label })), _jsx("ul", { className: "fs-surface-nav__list", children: group.routes.map((handle, index) => {
                                const { href, refusal } = routeHref(handle, routeParams ?? {});
                                const navigationLabel = handle.route.navigation?.label ??
                                    presentedRouteTitle(handle, resolveRouteTitle);
                                const navigationAnchors = generationNeedAnchors(handle.route.navigation);
                                const traceAttributes = needTraceAttributes(handle.route.navigation?.label === undefined
                                    ? mergeNeedAnchors(navigationAnchors, generationNeedAnchors(handle.route))
                                    : navigationAnchors);
                                const navigationHref = refusal
                                    ? undefined
                                    : resolveNavigationHref ? resolveNavigationHref(href) : href;
                                const unavailableReason = refusal === "collision"
                                    ? "route-collision"
                                    : refusal === "parameters"
                                        ? "route-params"
                                        : navigationHref === undefined ? "browser-path" : undefined;
                                return (_jsx("li", { children: unavailableReason ? (_jsx("span", { role: "link", "data-nav-route": handle.routeId, "data-nav-unavailable": unavailableReason, "aria-disabled": "true", ...traceAttributes, children: navigationLabel })) : (_jsx("a", { href: navigationHref, "data-nav-route": handle.routeId, "aria-current": activeMatch?.handle === handle &&
                                            handle.markers.every(({ name }) => activeMatch.params[name] === routeParams?.[name])
                                            ? "page" : undefined, ...traceAttributes, onClick: (event) => {
                                            if (!isPlainLinkClick(event))
                                                return;
                                            event.preventDefault();
                                            setMenuOpen(false);
                                            onNavigate(href);
                                        }, children: navigationLabel })) }, `${handle.surfaceId}/${handle.routeId}/${index}`));
                            }) })] }, group.surfaceId))) })] }));
}
function NotFound({ strings }) {
    return (_jsxs("div", { className: "fs-surface-notfound", "data-probe": "route-not-found", children: [_jsx("h1", { children: strings("notFoundTitle") }), _jsx("p", { children: strings("notFoundBody") })] }));
}
