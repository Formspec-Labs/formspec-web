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
import { presentedRouteLabel, presentedRouteTitle } from './title-presentation.js';
import { definitionLocaleLookup } from './browser-locale.js';
import { activeWorkspaceSlot } from './workspace-navigation.js';
import { useHostAppearance } from './browser-appearance.js';
import { deriveSurfaceRuntimeGeneration } from "./runtime-generation.js";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, } from "react";
import { canonicalFiniteJson, collectSlotBreakpointThresholds, composeSurfaceApp, createThemeAuthority, createWidgetRegistry, documentRootContaminationDiagnostic, flattenRegistryEntries, generationNeedAnchors, matchRoute, mergeNeedAnchors, planMatchedRoute, resolveSurfaceStrings, routeHref, } from "@formspec-org/surface";
import { SurfaceRouteView } from "./SurfaceRoute.js";
import { createWidgetActionCoordinator } from "./widget-action-runtime.js";
import { diagnosticListsEqual, useDiagnosticDelivery, } from "./diagnostic-delivery.js";
import { needTraceAttributes } from "./need-trace.js";
import { useSurfaceThemeTokens } from "./surface-theme.js";
import { isPlainLinkClick } from "./browser-location.js";
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
    const headerRef = useRef(null);
    const main = useRef(null);
    const hostAppearance = useHostAppearance(appRoot, browser !== undefined);
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
    const lastSeenParamsKey = canonicalFiniteJson(browser?.lastSeenParams ?? {});
    const navigationParams = useMemo(() => browser
        ? {
            ...routeParams,
            ...(browser.lastSeenParams ?? {}),
            ...(resolution.match?.params ?? {}),
        }
        : routeParams, [browser !== undefined, lastSeenParamsKey, resolution.match, routeParams]);
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
    const localeDocuments = props.localeDocuments ?? bundle.localeDocuments;
    const resolveDefinitionLocaleString = useMemo(() => definitionLocaleLookup(localeDocuments, props.activeLocale), [localeDocuments, props.activeLocale]);
    const [breakpointEpoch, setBreakpointEpoch] = useState(0);
    const [slotVisibilityEpoch, setSlotVisibilityEpoch] = useState(0);
    const slotFormEnginesRef = useRef(new Map());
    const slotRenderedActionRefsRef = useRef(new Map());
    const onSlotFormEngineChange = useCallback((slotKey, engine) => {
        if (engine) {
            slotFormEnginesRef.current.set(slotKey, { generation: runtimeGeneration, engine });
        }
        else {
            const current = slotFormEnginesRef.current.get(slotKey);
            if (current?.generation === runtimeGeneration) {
                slotFormEnginesRef.current.delete(slotKey);
            }
            const rendered = slotRenderedActionRefsRef.current.get(slotKey);
            if (rendered?.generation === runtimeGeneration) {
                slotRenderedActionRefsRef.current.delete(slotKey);
            }
        }
    }, [runtimeGeneration]);
    const onSlotVisibilityChange = useCallback((slotKey, nextRefs, baselineKey) => {
        if (nextRefs === undefined) {
            const current = slotRenderedActionRefsRef.current.get(slotKey);
            if (current?.generation === runtimeGeneration) {
                slotRenderedActionRefsRef.current.delete(slotKey);
            }
            return;
        }
        const nextKey = [...nextRefs].sort().join('\0');
        const current = slotRenderedActionRefsRef.current.get(slotKey);
        const recordedKey = current?.generation === runtimeGeneration ? current.key : baselineKey;
        slotRenderedActionRefsRef.current.set(slotKey, {
            generation: runtimeGeneration,
            key: nextKey,
            refs: nextRefs,
        });
        if (recordedKey === nextKey)
            return;
        setSlotVisibilityEpoch((prev) => prev + 1);
    }, [runtimeGeneration]);
    const routePlan = useMemo(() => {
        if (!resolution.match)
            return undefined;
        const matchesMinWidth = (minWidthPx) => typeof window !== "undefined" && typeof window.matchMedia === "function"
            ? window.matchMedia(`(min-width: ${minWidthPx}px)`).matches
            : false;
        const activeSlotFormEngines = new Map();
        for (const [slotKey, entry] of slotFormEnginesRef.current) {
            if (entry.generation === runtimeGeneration) {
                activeSlotFormEngines.set(slotKey, entry.engine);
            }
        }
        const activeSlotRenderedActionRefs = new Map();
        for (const [slotKey, entry] of slotRenderedActionRefsRef.current) {
            if (entry.generation === runtimeGeneration) {
                activeSlotRenderedActionRefs.set(slotKey, entry.refs);
            }
        }
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
            resolveDefinitionComponent: props.resolveDefinitionComponent,
            resolveDefinitionLocaleString,
            responseActions: bundle.responseActions,
            themeAuthority: model.themeAuthority,
            hasExecutor: props.onFireTransition !== undefined,
            hasWidgetActionExecutor: props.widgetActionExecutor !== undefined,
            evaluateCondition: props.evaluateTransitionCondition,
            headingBaseLevel: props.headingBaseLevel ?? 2,
            staticAssetResolver: props.staticAssetResolver,
            strings,
            matchesMinWidth,
            ...(activeSlotFormEngines.size > 0 ? { slotFormEngines: activeSlotFormEngines } : {}),
            ...(activeSlotRenderedActionRefs.size > 0
                ? { slotRenderedActionRefs: activeSlotRenderedActionRefs }
                : {}),
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
        props.resolveDefinitionComponent,
        resolveDefinitionLocaleString,
        strings,
        runtimeGeneration,
        breakpointEpoch,
        slotVisibilityEpoch,
    ]);
    const breakpointThresholdsKey = useMemo(() => {
        if (!routePlan)
            return "";
        return collectSlotBreakpointThresholds(routePlan.slots, routePlan.grant.themeDocument).join(",");
    }, [routePlan]);
    useEffect(() => {
        if (!breakpointThresholdsKey ||
            typeof window === "undefined" ||
            typeof window.matchMedia !== "function") {
            return;
        }
        const thresholds = breakpointThresholdsKey.split(",").map(Number);
        const queries = thresholds.map((minWidth) => window.matchMedia(`(min-width: ${minWidth}px)`));
        let lastSignature = queries.map((mql) => (mql.matches ? "1" : "0")).join("");
        const update = () => {
            const nextSignature = queries.map((mql) => (mql.matches ? "1" : "0")).join("");
            if (nextSignature !== lastSignature) {
                lastSignature = nextSignature;
                setBreakpointEpoch((prev) => prev + 1);
            }
        };
        for (const mql of queries)
            mql.addEventListener("change", update);
        return () => {
            for (const mql of queries)
                mql.removeEventListener("change", update);
        };
    }, [breakpointThresholdsKey]);
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
    const [sectionTitles, setSectionTitles] = useState();
    const reportSectionTitle = useCallback((slot, title) => {
        setSectionTitles(previous => {
            if (previous?.generation !== runtimeGeneration && title === undefined)
                return previous;
            const bySlot = new Map(previous?.generation === runtimeGeneration ? previous.bySlot : []);
            if (bySlot.get(slot) === title)
                return previous;
            if (title === undefined)
                bySlot.delete(slot);
            else
                bySlot.set(slot, title);
            return { generation: runtimeGeneration, bySlot };
        });
    }, [runtimeGeneration]);
    const workspace = browser?.workspace;
    const formSession = browser && {
        ...browser, appearance: hostAppearance ?? browser.appearance,
        workspace: workspace && { ...workspace, reportSectionTitle },
    };
    const activeSlot = activeWorkspaceSlot(routePlan, workspace?.slot);
    const sectionTitle = workspace && activeSlot && sectionTitles?.generation === runtimeGeneration
        ? sectionTitles.bySlot.get(activeSlot) : undefined;
    const appTitle = props.appTitle ?? bundle.title;
    const entryPath = browser?.entryPath;
    const entryHref = entryPath === undefined || !props.resolveNavigationHref
        ? entryPath
        : props.resolveNavigationHref(entryPath);
    const brandTrace = needTraceAttributes(generationNeedAnchors(bundle.manifest));
    const routeTitle = browser && routePlan ? presentedRouteTitle(routePlan.handle, props.resolveRouteTitle) : undefined;
    const title = [sectionTitle, routeTitle, appTitle].filter(Boolean).join(' – ');
    const match = resolution.match;
    const routeIdentity = browser && JSON.stringify([browser.previewScope, match
            ? [match.handle.surfaceId, match.handle.routeId, match.params]
            : location]);
    const previousRoute = useRef(undefined);
    useLayoutEffect(() => {
        const previous = previousRoute.current;
        previousRoute.current = routeIdentity;
        if (routeIdentity === undefined || previous === undefined || routeIdentity === previous || browser?.anchor || browser?.workspace?.focusField)
            return;
        // A section may already have taken focus during its child's layout effect. A form
        // still loading will focus its selected heading when it mounts.
        if (workspace?.activeSection && main.current?.contains(document.activeElement)
            && document.activeElement?.closest('.formspec-workspace__content[data-formspec-section]'))
            return;
        const target = main.current?.querySelector('.fs-surface-route__title, h1, [role="heading"][aria-level="1"]') ?? main.current;
        target?.setAttribute('tabindex', '-1');
        target?.focus({ preventScroll: true });
    }, [routeIdentity, browser?.anchor, browser?.workspace?.focusField, workspace?.activeSection]);
    const overviewDestination = useMemo(() => routePlan
        ? resolveOverviewDestination(model.app, routePlan, browser?.entryPath, navigationParams)
        : browser?.entryPath, [model.app, routePlan, browser?.entryPath, navigationParams]);
    useEffect(() => {
        const rootEl = appRoot.current;
        const headerEl = headerRef.current;
        if (!rootEl)
            return;
        let lastHeaderHeight = "";
        let lastStickyOffset = "";
        const syncHeaderOffset = () => {
            if (!headerEl || typeof window === "undefined") {
                rootEl.style.removeProperty("--fs-surface-header-height");
                rootEl.style.removeProperty("--formspec-sticky-offset");
                lastHeaderHeight = "";
                lastStickyOffset = "";
                return;
            }
            const position = window.getComputedStyle(headerEl).position;
            const isSticky = position === "sticky" || position === "fixed";
            const rect = headerEl.getBoundingClientRect();
            const height = isSticky ? Math.ceil(rect.height) : 0;
            const maxStickyBottom = rect.height + 200;
            const stuckBottom = isSticky
                ? Math.ceil(Math.max(rect.height, Math.min(rect.bottom, maxStickyBottom)))
                : 0;
            const nextHeaderHeight = height > 0 ? `${stuckBottom}px` : "0px";
            const nextStickyOffset = height > 0 ? `${stuckBottom + 16}px` : "0.75rem";
            if (nextHeaderHeight !== lastHeaderHeight) {
                rootEl.style.setProperty("--fs-surface-header-height", nextHeaderHeight);
                lastHeaderHeight = nextHeaderHeight;
            }
            if (nextStickyOffset !== lastStickyOffset) {
                rootEl.style.setProperty("--formspec-sticky-offset", nextStickyOffset);
                lastStickyOffset = nextStickyOffset;
            }
        };
        syncHeaderOffset();
        if (typeof ResizeObserver === "undefined" || !headerEl) {
            if (typeof window !== "undefined") {
                window.addEventListener("resize", syncHeaderOffset);
                window.addEventListener("scroll", syncHeaderOffset, { passive: true });
                return () => {
                    window.removeEventListener("resize", syncHeaderOffset);
                    window.removeEventListener("scroll", syncHeaderOffset);
                };
            }
            return;
        }
        const observer = new ResizeObserver(syncHeaderOffset);
        observer.observe(headerEl);
        window.addEventListener("resize", syncHeaderOffset);
        window.addEventListener("scroll", syncHeaderOffset, { passive: true });
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", syncHeaderOffset);
            window.removeEventListener("scroll", syncHeaderOffset);
        };
    }, [browser, appTitle, props.header]);
    return (_jsxs("div", { ref: appRoot, className: "fs-surface-app", "data-fs-appearance": formSession?.appearance, lang: browser ? props.activeLocale : undefined, dir: browser && props.activeLocale ? browser.direction : undefined, ...brandTrace, children: [_jsx("a", { className: "fs-surface-skip-link", href: "#fs-surface-main", onClick: (event) => {
                    event.preventDefault();
                    main.current?.focus();
                }, children: "Skip to main content" }), setDocumentTitle && title && _jsx(SurfaceDocumentTitle, { title: title }), (props.header !== undefined || appTitle || browser) && (_jsx("header", { ref: headerRef, className: "fs-surface-header", children: _jsxs("div", { className: "fs-surface-header__inner", children: [props.header ?? (appTitle && (entryPath !== undefined && entryHref !== undefined
                            ? _jsx("a", { className: "fs-surface-brand", href: entryHref, ...brandTrace, onClick: event => {
                                    if (!isPlainLinkClick(event))
                                        return;
                                    event.preventDefault();
                                    onNavigate(entryPath);
                                }, children: appTitle })
                            : _jsx("span", { className: "fs-surface-brand", ...brandTrace, children: appTitle }))), browser && (browser.editionPicker || hostAppearance === undefined) && (_jsxs("div", { className: "fs-surface-masthead-controls", children: [browser.editionPicker, hostAppearance === undefined && browser.appearancePicker] })), browser && (_jsx("p", { className: "fs-surface-save-notice", role: browser.saveNoticeLive === false ? undefined : "status", children: browser.saveNotice }))] }) })), _jsxs("div", { className: "fs-surface-shell", children: [_jsx(SurfaceNav, { app: model.app, location: location, routeParams: navigationParams, onNavigate: onNavigate, resolveNavigationHref: props.resolveNavigationHref, label: props.navigationLabel ?? strings("navigationLabel"), menuLabel: props.navigationLabel ?? strings("navigationLabel"), resolveRouteTitle: props.resolveRouteTitle }), _jsx("main", { ref: main, id: "fs-surface-main", tabIndex: -1, className: "fs-surface-main", children: routePlan ? (_jsx(SurfaceRouteView, { plan: routePlan, formSession: formSession, overviewDestination: overviewDestination, bandPreferenceScope: JSON.stringify([bundle.manifest.id, props.viewerPreferenceKey, browser?.previewScope]), filingStatus: {
                                readSummaries: props.readSummaries,
                                revision: props.filingDraftRevision,
                                navigate: (href) => browser ? browser.navigate(href) : onNavigate(href),
                                formatHref: props.resolveNavigationHref,
                                resolveRouteTitle: props.resolveRouteTitle,
                            }, screenerCompletion: props.screenerCompletion, screenerInstanceId: screenerVisit.id, localeDocuments: localeDocuments, activeLocale: props.activeLocale, resolveRouteTitle: props.resolveRouteTitle, strings: strings, dataSourceLoader: props.dataSourceLoader, dataSourceRevision: props.dataSourceRevision, authorizeDataSource: props.authorizeDataSource, validateDataSourcePayload: props.validateDataSourcePayload, widgetActionExecutor: props.widgetActionExecutor, widgetActionOutcomeStore: props.widgetActionOutcomeStore, widgetActionCoordinator: widgetActionCoordinator.current, runtimeGeneration: runtimeGeneration, onWidgetActionReport: props.onWidgetActionReport, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, onSlotFormEngineChange: onSlotFormEngineChange, onSlotVisibilityChange: onSlotVisibilityChange, renderDefinitionForm: props.renderDefinitionForm, definitionActionInvoker: props.definitionActionInvoker, resolveSemanticControlScope: props.resolveSemanticControlScope, resolveSemanticOutputScope: props.resolveSemanticOutputScope, onDefinitionActionResult: props.onDefinitionActionResult, showExperienceNeeds: props.showExperienceNeeds, showThemeNotice: props.showThemeNotice, responseActionsDocuments: bundle.responseActions, referencesDocuments: bundle.references ?? [], ontologyDocuments: bundle.ontologies ?? [], onFireTransition: props.onFireTransition, checkScreenerTarget: screenerDestination, onScreenerTarget: (target) => {
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
function filingStatusGroupRouteRefs(handle, repeatOnly) {
    const refs = [];
    let isFilingHub = false;
    for (const slot of handle.route.slots ?? []) {
        if (slot.slotType !== "filing-status")
            continue;
        const binding = slot.binding;
        if (!binding || typeof binding !== "object" || !Array.isArray(binding.groups))
            continue;
        isFilingHub = true;
        for (const group of binding.groups) {
            if (!group || typeof group !== "object")
                continue;
            const hasRepeat = Boolean(group.repeat);
            if (hasRepeat !== repeatOnly)
                continue;
            const forms = group.forms;
            if (!Array.isArray(forms))
                continue;
            for (const form of forms) {
                const routeRef = form && typeof form === "object"
                    ? form.routeRef
                    : undefined;
                if (typeof routeRef === "string" && routeRef.length > 0) {
                    refs.push(routeRef);
                }
            }
        }
    }
    return { isFilingHub, refs };
}
function hubPathAffinity(hubPath, childPath) {
    const hubSegs = hubPath.split('/').filter(Boolean);
    const childSegs = childPath.split('/').filter(Boolean);
    if (hubSegs.length === 0 || hubSegs.length > childSegs.length)
        return 0;
    for (let i = 0; i < hubSegs.length; i += 1) {
        if (hubSegs[i] !== childSegs[i])
            return 0;
    }
    return hubSegs.length;
}
function hubDraftStartRouteRefs(handle) {
    const refs = [];
    for (const slot of handle.route.slots ?? []) {
        if (slot.slotType !== "draft-start")
            continue;
        const routeRef = slot.binding?.routeRef;
        if (typeof routeRef === "string" && routeRef.length > 0)
            refs.push(routeRef);
    }
    return refs;
}
function resolveOverviewDestination(app, routePlan, fallbackEntryPath, navigationParams) {
    const { handle, params, transitions } = routePlan;
    const effectiveParams = {
        ...navigationParams,
        ...params,
    };
    const scope = routeNavigationScope(handle);
    const resolveCandidateHref = (candidate) => {
        const matchingTransition = transitions.find((transition) => transition.status === "fireable" && transition.target === candidate);
        const nextParams = { ...effectiveParams };
        if (matchingTransition?.params) {
            for (const [targetParam, bindingName] of Object.entries(matchingTransition.params)) {
                const value = effectiveParams[bindingName];
                if (typeof value === "string" && value.length > 0)
                    nextParams[targetParam] = value;
            }
        }
        const resolved = routeHref(candidate, nextParams);
        return resolved.refusal === undefined ? resolved.href : undefined;
    };
    // 1. Explicit navigation.parent when it resolves cleanly in the same surface and scope.
    const explicitParentId = handle.route.navigation?.parent;
    if (typeof explicitParentId === "string" && explicitParentId !== handle.routeId) {
        const parent = app.routes.find((candidate) => candidate.surface === handle.surface &&
            candidate.routeId === explicitParentId &&
            routeNavigationScope(candidate) === scope);
        if (parent) {
            const parentHref = resolveCandidateHref(parent);
            if (parentHref !== undefined)
                return parentHref;
        }
    }
    // 2. Nearest addressable filing-status overview hub in the same surface and scope
    //    (path prefix affinity -> direct reference -> repeat reference -> entry -> declaration order).
    const candidates = [];
    app.routes.forEach((candidate, order) => {
        if (candidate === handle ||
            candidate.surface !== handle.surface ||
            routeNavigationScope(candidate) !== scope) {
            return;
        }
        const nonRepeat = filingStatusGroupRouteRefs(candidate, false);
        const repeat = filingStatusGroupRouteRefs(candidate, true);
        if (!nonRepeat.isFilingHub && !repeat.isFilingHub)
            return;
        const href = resolveCandidateHref(candidate);
        if (href === undefined)
            return;
        const draftStarts = hubDraftStartRouteRefs(candidate);
        const directRef = nonRepeat.refs.includes(handle.routeId) ||
            draftStarts.includes(handle.routeId);
        const repeatRef = repeat.refs.includes(handle.routeId);
        const affinity = hubPathAffinity(candidate.route.path, handle.route.path);
        candidates.push({
            href,
            affinity,
            directRef,
            repeatRef,
            isEntry: candidate === app.entry,
            order,
        });
    });
    if (candidates.length > 0) {
        candidates.sort((a, b) => (b.affinity - a.affinity) ||
            (Number(b.directRef) - Number(a.directRef)) ||
            (Number(b.repeatRef) - Number(a.repeatRef)) ||
            (Number(b.isEntry) - Number(a.isEntry)) ||
            (a.order - b.order));
        return candidates[0].href;
    }
    // 3. Fall back to the surface entry route resolved with active params, then static entryPath.
    if (app.entry && app.entry !== handle && app.entry.surface === handle.surface) {
        const entryHref = resolveCandidateHref(app.entry);
        if (entryHref !== undefined)
            return entryHref;
    }
    return fallbackEntryPath;
}
function buildNavTree(routes) {
    const byId = new Map();
    for (const handle of routes) {
        if (!byId.has(handle.routeId))
            byId.set(handle.routeId, handle);
    }
    const parentOf = new Map();
    const filingHubs = new Set();
    // Pass 1: explicit route.navigation.parent
    for (const handle of routes) {
        const explicitParent = handle.route.navigation?.parent;
        if (typeof explicitParent === "string" && explicitParent !== handle.routeId) {
            const parent = byId.get(explicitParent);
            if (parent && parent !== handle)
                parentOf.set(handle, parent);
        }
    }
    // Pass 2: score filing-status hub candidates (path prefix affinity -> non-repeat -> declared order)
    const candidatesByChild = new Map();
    routes.forEach((hub, hubOrder) => {
        for (const repeatOnly of [false, true]) {
            const { isFilingHub, refs } = filingStatusGroupRouteRefs(hub, repeatOnly);
            if (isFilingHub)
                filingHubs.add(hub);
            for (const routeRef of refs) {
                if (routeRef === hub.routeId)
                    continue;
                const child = byId.get(routeRef);
                if (!child || child === hub || parentOf.has(child))
                    continue;
                const list = candidatesByChild.get(child) ?? [];
                list.push({ hub, nonRepeat: !repeatOnly, affinity: hubPathAffinity(hub.route.path, child.route.path), hubOrder });
                candidatesByChild.set(child, list);
            }
        }
    });
    for (const [child, candidates] of candidatesByChild) {
        candidates.sort((a, b) => (b.affinity - a.affinity) ||
            (Number(b.nonRepeat) - Number(a.nonRepeat)) ||
            (a.hubOrder - b.hubOrder));
        if (candidates[0])
            parentOf.set(child, candidates[0].hub);
    }
    // Break any cycle so every visible route stays reachable in the tree.
    for (const handle of routes) {
        const seen = new Set([handle]);
        let cursor = parentOf.get(handle);
        while (cursor) {
            if (seen.has(cursor)) {
                parentOf.delete(handle);
                break;
            }
            seen.add(cursor);
            cursor = parentOf.get(cursor);
        }
    }
    const nodesByHandle = new Map();
    const allNodes = routes.map((handle, index) => {
        const node = {
            handle,
            index,
            key: `${handle.surfaceId}/${handle.routeId}/${index}`,
            isFilingHub: filingHubs.has(handle),
            children: [],
        };
        nodesByHandle.set(handle, node);
        return node;
    });
    const roots = [];
    for (const node of allNodes) {
        const parentHandle = parentOf.get(node.handle);
        const parentNode = parentHandle ? nodesByHandle.get(parentHandle) : undefined;
        if (parentNode)
            parentNode.children.push(node);
        else
            roots.push(node);
    }
    const hasHubs = allNodes.some((node) => node.children.length > 0);
    const ancestorHubKeys = new Map();
    const recordAncestors = (node, ancestors) => {
        const own = node.children.length > 0 ? [...ancestors, node.key] : ancestors;
        ancestorHubKeys.set(node.handle, own);
        for (const child of node.children) {
            recordAncestors(child, own);
        }
    };
    for (const root of roots)
        recordAncestors(root, []);
    return { roots, hasHubs, ancestorHubKeys };
}
export function SurfaceNav({ app, location, routeParams, onNavigate, resolveNavigationHref, label, menuLabel, resolveRouteTitle, }) {
    const navId = useId();
    const [menuOpen, setMenuOpen] = useState(false);
    const [collapsedHubs, setCollapsedHubs] = useState(() => new Set());
    const activeMatch = matchRoute(app, location).match;
    const activeRoute = activeMatch?.handle;
    const highlightedRoute = useMemo(() => {
        if (!activeRoute)
            return undefined;
        if (activeRoute.route.navigation?.visible !== false)
            return activeRoute;
        for (const slot of activeRoute.route.slots ?? []) {
            if (slot.slotType !== "module-widget")
                continue;
            const binding = slot.binding;
            if (typeof binding?.draftReview?.routeRef === "string") {
                const target = app.routes.find((candidate) => candidate.surface === activeRoute.surface &&
                    candidate.routeId === binding.draftReview.routeRef &&
                    candidate.route.navigation?.visible !== false);
                if (target)
                    return target;
            }
        }
        return activeRoute;
    }, [activeRoute, app.routes]);
    const activeNavigationScope = activeRoute
        ? routeNavigationScope(activeRoute)
        : DEFAULT_NAVIGATION_SCOPE;
    const groups = useMemo(() => app.groups
        .map((group) => {
        const routes = group.routes
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
            .map(({ handle }) => handle);
        return {
            ...group,
            needAnchors: generationNeedAnchors(group.routes[0]?.surface),
            routes,
            tree: buildNavTree(routes),
        };
    })
        .filter((group) => group.routes.length > 0), [app.groups, activeNavigationScope]);
    const activeHubKeys = useMemo(() => {
        if (!highlightedRoute)
            return [];
        for (const group of groups) {
            const keys = group.tree.ancestorHubKeys.get(highlightedRoute);
            if (keys)
                return keys;
        }
        return [];
    }, [highlightedRoute, groups]);
    useEffect(() => {
        setMenuOpen(false);
    }, [location]);
    const previousActiveRouteKey = useRef(undefined);
    const currentActiveRouteKey = activeRoute ? `${activeRoute.surfaceId}/${activeRoute.routeId}` : undefined;
    useEffect(() => {
        if (previousActiveRouteKey.current === currentActiveRouteKey)
            return;
        previousActiveRouteKey.current = currentActiveRouteKey;
        if (activeHubKeys.length === 0)
            return;
        setCollapsedHubs((previous) => {
            if (!activeHubKeys.some((key) => previous.has(key)))
                return previous;
            const next = new Set(previous);
            for (const key of activeHubKeys)
                next.delete(key);
            return next;
        });
    }, [currentActiveRouteKey, activeHubKeys]);
    if (groups.length === 0)
        return null;
    const hasAnyHubs = groups.some((group) => group.tree.hasHubs);
    const showGroupLabels = groups.length > 1;
    const activeNavLabel = activeRoute
        ? presentedRouteLabel(activeRoute, resolveRouteTitle)
        : undefined;
    const toggleHub = (hubKey) => {
        setCollapsedHubs((previous) => {
            const next = new Set(previous);
            if (next.has(hubKey))
                next.delete(hubKey);
            else
                next.add(hubKey);
            return next;
        });
    };
    const navigationNeedAnchors = mergeNeedAnchors(...groups.flatMap((group) => [
        group.needAnchors,
        ...group.routes.map((handle) => mergeNeedAnchors(generationNeedAnchors(handle.route.navigation), generationNeedAnchors(handle.route))),
    ]));
    const renderLink = (handle) => {
        const { href, refusal } = routeHref(handle, routeParams ?? {});
        const navigationLabel = presentedRouteLabel(handle, resolveRouteTitle);
        const navigationAnchors = generationNeedAnchors(handle.route.navigation);
        const traceAttributes = needTraceAttributes(handle.route.navigation?.label === undefined
            ? mergeNeedAnchors(navigationAnchors, generationNeedAnchors(handle.route))
            : navigationAnchors);
        const navigationHref = refusal
            ? undefined
            : resolveNavigationHref
                ? resolveNavigationHref(href)
                : href;
        const unavailableReason = refusal === "collision"
            ? "route-collision"
            : refusal === "parameters"
                ? "route-params"
                : navigationHref === undefined
                    ? "browser-path"
                    : undefined;
        const element = unavailableReason ? (_jsx("span", { role: "link", "data-nav-route": handle.routeId, "data-nav-unavailable": unavailableReason, "aria-disabled": "true", ...traceAttributes, children: navigationLabel })) : (_jsx("a", { href: navigationHref, "data-nav-route": handle.routeId, "aria-current": (activeMatch?.handle === handle || highlightedRoute === handle) &&
                handle.markers.every(({ name }) => activeMatch?.params[name] === routeParams?.[name])
                ? "page"
                : undefined, ...traceAttributes, onClick: (event) => {
                if (!isPlainLinkClick(event))
                    return;
                event.preventDefault();
                setMenuOpen(false);
                onNavigate(href);
            }, children: navigationLabel }));
        return { element, navigationLabel };
    };
    const renderNode = (node, groupIndex) => {
        const { element, navigationLabel } = renderLink(node.handle);
        if (node.children.length === 0) {
            return (_jsx("li", { className: "fs-surface-nav__item", children: element }, node.key));
        }
        const expanded = !collapsedHubs.has(node.key);
        const sublistId = `${navId}-hub-${groupIndex}-${node.index}`;
        const showOverviewBadge = node.isFilingHub && !/\boverview\b/i.test(navigationLabel);
        return (_jsxs("li", { className: "fs-surface-nav__item fs-surface-nav__item--hub", "data-nav-hub": node.handle.routeId, "data-hub-expanded": expanded ? "true" : "false", children: [_jsxs("div", { className: "fs-surface-nav__hub-row", children: [element, _jsxs("button", { type: "button", className: "fs-surface-nav__hub-toggle", "aria-expanded": expanded, "aria-controls": sublistId, "aria-label": `${navigationLabel} pages`, onClick: (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                toggleHub(node.key);
                            }, children: [_jsx("span", { className: "fs-surface-nav__hub-badge", "aria-hidden": "true", children: showOverviewBadge ? "Overview" : String(node.children.length) }), _jsx("span", { className: "fs-surface-nav__hub-chevron", "aria-hidden": "true" })] })] }), _jsx("ul", { id: sublistId, className: "fs-surface-nav__sublist", hidden: !expanded, children: node.children.map((child) => renderNode(child, groupIndex)) })] }, node.key));
    };
    return (_jsxs("nav", { className: "fs-surface-nav", "aria-label": label ?? "Pages in this app", "data-navigation-scope": activeNavigationScope, "data-has-hubs": hasAnyHubs ? "true" : "false", "data-menu-open": menuOpen ? "true" : "false", children: [_jsxs("button", { className: "fs-surface-nav__toggle", type: "button", "aria-expanded": menuOpen, onClick: () => setMenuOpen((open) => !open), ...needTraceAttributes(navigationNeedAnchors), children: [_jsxs("span", { className: "fs-surface-nav__toggle-main", children: [_jsx("span", { className: "fs-surface-nav__toggle-chevron", "aria-hidden": "true", children: menuOpen ? "▾" : "▸" }), _jsx("span", { children: menuLabel ?? label ?? "Pages in this app" })] }), activeNavLabel && (_jsx("span", { className: "fs-surface-nav__toggle-current", children: activeNavLabel }))] }), _jsx("div", { className: "fs-surface-nav__content", children: groups.map((group, groupIndex) => (_jsxs("div", { className: "fs-surface-nav__group", children: [showGroupLabels && (_jsx("p", { className: "fs-surface-nav__label", ...needTraceAttributes(group.needAnchors), children: group.label })), _jsx("ul", { className: "fs-surface-nav__list", children: group.tree.roots.map((node) => renderNode(node, groupIndex)) })] }, group.surfaceId))) })] }));
}
function NotFound({ strings }) {
    return (_jsxs("div", { className: "fs-surface-notfound", "data-probe": "route-not-found", children: [_jsx("h1", { children: strings("notFoundTitle") }), _jsx("p", { children: strings("notFoundBody") })] }));
}
