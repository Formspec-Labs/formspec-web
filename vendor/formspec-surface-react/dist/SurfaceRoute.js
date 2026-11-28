import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @filedesc `SurfaceRouteView` — one route plan, rendered, with its theme
 * boundary.
 *
 * It takes a `SurfaceRoutePlan` and re-derives nothing in it: not the route
 * match, not the theme grant, not the slot dispatch, not the heading level, not
 * the transition state (`surface-shell-spec.md` §8.3 item 1). Three things
 * happen here and nowhere else:
 *
 * 1. **The route title takes the level the composition assigns.** At the
 *    default baseline of 2 it is the page's single `h1`. A host that owns the
 *    page heading passes `headingBaseLevel: 1`, and this renders no title
 *    heading at all rather than a second `h1` under the host's — the shell
 *    honours the baseline it was given (§3.4.1 obligation 3). The level comes
 *    from `resolveRouteTitleLevel` in the core, so this file decides nothing
 *    about the outline.
 *
 * 2. **The grant's tokens are emitted on THIS element, with cleanup** (TB-2).
 *    Scoped, not global. `emitMergedThemeCssVars` is the same helper
 *    `FormspecForm` uses on its own container, used the same correct way:
 *    written on mount, removed on unmount, never on `document.documentElement`.
 *    A refusing route therefore carries the platform values and a branded route
 *    carries the tenant's, and navigating between them leaves no residue.
 *
 *    Deliberately NOT paired with a document-root scrub. A shell that scrubbed
 *    would be manufacturing the property it claims to hold, which is not a
 *    measurement of anything (§4.5). `SurfaceApp` READS the root and reports
 *    `THEME-DOCUMENT-ROOT-CONTAMINATED` instead.
 *
 * 3. **Slots render in authored order.** `slot.position` is an author hint that
 *    v0.1 explicitly gives "no normative position vocabulary", so honouring it
 *    would mean inventing one. Authored order is the only thing defined.
 */
import { presentedRouteTitle } from './title-presentation.js';
import { activeWorkspaceSlot } from './workspace-navigation.js';
import { useCallback, useMemo, useRef, useState } from 'react';
import { generationNeedAnchors, resolveRouteTitleLevel, resolveSurfaceStrings, routeHref, } from '@formspec-org/surface';
import { Heading } from './heading.js';
import { FormStatus, useFormStatusObservations } from './FormStatus.js';
import { SurfaceSlotFrame, } from './SurfaceSlot.js';
import { SurfaceTransitions } from './SurfaceTransitions.js';
import { needTraceAttributes } from './need-trace.js';
import { useSurfaceThemeTokens } from './surface-theme.js';
export function SurfaceRouteView({ plan, formStatus, bandPreferenceScope, resolveRouteTitle, strings, dataSourceLoader, dataSourceRevision, authorizeDataSource, validateDataSourcePayload, widgetActionExecutor, widgetActionOutcomeStore, widgetActionCoordinator, runtimeGeneration, onWidgetActionReport, onRuntimeDiagnosticsChange, onSlotFormEngineChange, onSlotVisibilityChange, renderDefinitionForm, definitionActionInvoker, resolveSemanticControlScope, resolveSemanticOutputScope, onDefinitionActionResult, showExperienceNeeds, showThemeNotice = false, responseActionsDocuments, referencesDocuments, ontologyDocuments, onFireTransition, onAdvance, onScreenerTarget, checkScreenerTarget, screenerInstanceId, screenerCompletion, localeDocuments, activeLocale, formSession, overviewDestination, }) {
    const container = useRef(null);
    const { handle, grant, params } = plan;
    const text = strings ?? resolveSurfaceStrings();
    const port = formSession?.drafts?.port;
    const suppliedReader = formStatus?.readSummaries;
    const readSummaries = useMemo(() => suppliedReader ?? port?.readSummaries.bind(port), [suppliedReader, port]);
    const draftScope = suppliedReader ? formSession?.previewScope : formSession?.drafts?.scope;
    const observedSlots = useMemo(() => plan.bands?.length
        ? [...plan.bands.map(band => band.slot), ...plan.slots] : plan.slots, [plan.bands, plan.slots]);
    const statusReads = useFormStatusObservations(observedSlots, readSummaries, draftScope, formStatus?.revision, runtimeGeneration, formSession?.draftRevision, { loader: dataSourceLoader, authorize: authorizeDataSource, validatePayload: validateDataSourcePayload }, dataSourceRevision);
    const formStatusContext = { ...formStatus, ...statusReads };
    useSurfaceThemeTokens(container, grant.themeDocument);
    const workspace = formSession?.workspace;
    const activeSlot = activeWorkspaceSlot(plan, workspace?.slot);
    const titleLevel = resolveRouteTitleLevel(plan.headingBaseLevel);
    const titleText = presentedRouteTitle(handle, resolveRouteTitle);
    const titleId = `fs-surface-title-${handle.routeId}`;
    const contextEntries = useMemo(() => {
        if (handle.markers.length === 0)
            return [];
        const lowerTitle = titleText.toLowerCase();
        return handle.markers.flatMap((marker) => {
            const value = params[marker.name];
            if (!value || lowerTitle.includes(value.toLowerCase()))
                return [];
            const formattedLabel = marker.name
                .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                .split(/[_\-\s]+/)
                .filter(Boolean)
                .map((part) => (part.length <= 3 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
                .join(' ');
            return [{ name: marker.name, label: formattedLabel, value }];
        });
    }, [handle.markers, params, titleText]);
    const route = {
        surfaceId: handle.surfaceId,
        surfaceRef: plan.surfaceRef,
        routeId: handle.routeId,
        routeClass: handle.route.routeClass,
        title: titleText,
        params,
    };
    const semanticOutputScope = resolveSemanticOutputScope?.({
        plan,
        route,
        runtimeGeneration,
    });
    const hasWidgetSlot = plan.slots.some((slotPlan) => slotPlan.slotType === 'module-widget');
    const hasDecisionFormSlot = plan.slots.some((slotPlan) => slotPlan.slotType === 'definition-form');
    const draftReviewTargetRouteRefs = useMemo(() => {
        const refs = new Set();
        for (const slot of handle.route.slots ?? []) {
            if (slot.slotType !== 'module-widget')
                continue;
            const binding = slot.binding;
            if (typeof binding?.draftReview?.routeRef === 'string') {
                refs.add(binding.draftReview.routeRef);
            }
        }
        return refs;
    }, [handle.route.slots]);
    const isDraftReviewRoute = draftReviewTargetRouteRefs.size > 0;
    const isTransitionToDraftReview = (transition) => Boolean(transition.target?.route.slots?.some((slot) => {
        if (slot.slotType !== 'module-widget')
            return false;
        const binding = slot.binding;
        return Boolean(binding?.draftReview);
    }));
    const reviewTransition = plan.transitions.find((transition) => transition.status === 'fireable' && isTransitionToDraftReview(transition));
    const reviewDestination = useMemo(() => {
        if (!reviewTransition?.target)
            return undefined;
        const nextParams = { ...plan.params };
        for (const [targetParam, bindingName] of Object.entries(reviewTransition.params ?? {})) {
            const value = plan.params[bindingName];
            if (typeof value === 'string' && value.length > 0)
                nextParams[targetParam] = value;
        }
        const resolved = routeHref(reviewTransition.target, nextParams);
        return resolved.refusal === undefined ? resolved.href : undefined;
    }, [reviewTransition, plan.params]);
    const [slotDraftStatus, setSlotDraftStatus] = useState(() => new Map());
    const handleSlotDraftAvailabilityChange = useCallback((slotId, status) => {
        setSlotDraftStatus((previous) => {
            if (status === undefined) {
                if (!previous.has(slotId))
                    return previous;
                const next = new Map(previous);
                next.delete(slotId);
                return next;
            }
            if (previous.get(slotId) === status)
                return previous;
            const next = new Map(previous);
            next.set(slotId, status);
            return next;
        });
    }, []);
    const definitionFormSlots = plan.slots.filter((slot) => slot.slotType === 'definition-form');
    const allFormsBlocked = definitionFormSlots.length > 0 &&
        definitionFormSlots.every((slot) => slotDraftStatus.get(slot.slotId) === 'blocked');
    const anyFormFiled = definitionFormSlots.some((slot) => slotDraftStatus.get(slot.slotId) === 'filed');
    const visibleTransitions = useMemo(() => {
        if (!allFormsBlocked && !anyFormFiled)
            return plan.transitions;
        return plan.transitions.filter((transition) => {
            if (!isTransitionToDraftReview(transition))
                return true;
            // Suppress broken Review CTA on prerequisite-blocked forms (no answers exist),
            // and avoid duplicating the filed summary card's own Review submitted answers link.
            return !allFormsBlocked && !anyFormFiled;
        });
    }, [plan.transitions, allFormsBlocked, anyFormFiled]);
    const routeClass = String(handle.route.routeClass ?? 'unclassified');
    const routeLayout = (routeClass === 'review' && plan.slots.length > 1) ||
        (handle.route.routeClass === 'operation' &&
            hasWidgetSlot &&
            hasDecisionFormSlot)
        ? 'split'
        : undefined;
    return (_jsxs("article", { ref: container, className: `fs-surface-route fs-surface-route--${grant.admitsTenantTheme ? 'branded' : 'platform'}`, "data-route": handle.routeId, "data-surface": handle.surfaceId, "data-route-class": handle.route.routeClass ?? 'unclassified', "data-route-layout": routeLayout, "data-fs-appearance": formSession?.appearance, "data-tenant-theme": grant.admitsTenantTheme ? 'admitted' : 'refused', "data-tenant-token-count": grant.tenantTokenKeys.length, ...needTraceAttributes(generationNeedAnchors(handle.route)), ...(titleLevel === undefined
            ? { 'aria-label': titleText }
            : { 'aria-labelledby': titleId }), children: [titleLevel !== undefined && (_jsx(Heading, { level: titleLevel, className: "fs-surface-route__title", id: titleId, children: titleText })), titleLevel !== undefined && contextEntries.length > 0 && (_jsx("dl", { className: "fs-surface-route__context", "aria-label": "Active record context", children: contextEntries.map((entry) => (_jsxs("div", { className: "fs-surface-route__context-item", "data-route-param": entry.name, children: [_jsx("dt", { children: entry.label }), _jsx("dd", { children: entry.value })] }, entry.name))) })), plan.bands?.map(({ routeId, slot }) => {
                const preference = JSON.stringify([bandPreferenceScope, plan.surfaceRef ?? handle.surfaceId, routeId, slot.slotId]);
                return _jsx(TrackerBand, { preference: preference, title: slot.title?.trim() ? slot.title : text('formStatusMap'), children: _jsx("div", { "data-slot": slot.slotId, "data-slot-type": slot.slotType, ...needTraceAttributes(slot.needAnchors), children: _jsx(FormStatus, { plan: slot.tracker, context: formStatusContext, level: slot.headingBaseLevel, text: text }) }) }, preference);
            }), showThemeNotice && (_jsx("p", { className: `fs-surface-themenote fs-surface-themenote--${grant.posture}`, "data-probe": "theme-note", children: grant.reason })), _jsx("div", { className: "fs-surface-route__slots", children: plan.slots.map((slotPlan) => (_jsx(SurfaceSlotFrame, { plan: slotPlan, formStatus: formStatusContext, screenerCompletion: screenerCompletion, checkScreenerTarget: checkScreenerTarget, onScreenerTarget: onScreenerTarget, screenerInstanceId: screenerInstanceId, localeDocuments: localeDocuments, activeLocale: activeLocale, formSession: formSession, ...(workspace && slotPlan.slotId === activeSlot && {
                        activeSection: workspace.activeSection,
                        ...(workspace.focusField !== undefined && { focusField: workspace.focusField }),
                    }), sectionNavigationActive: slotPlan.slotId === activeSlot, grant: grant, route: route, strings: text, dataSourceLoader: dataSourceLoader, dataSourceRevision: dataSourceRevision, authorizeDataSource: authorizeDataSource, validateDataSourcePayload: validateDataSourcePayload, showExperienceNeeds: showExperienceNeeds, responseActionsDocuments: responseActionsDocuments, referencesDocuments: referencesDocuments, ontologyDocuments: ontologyDocuments, transitions: plan.transitions, widgetActionExecutor: widgetActionExecutor, widgetActionOutcomeStore: widgetActionOutcomeStore, widgetActionCoordinator: widgetActionCoordinator, runtimeGeneration: runtimeGeneration, onWidgetActionReport: onWidgetActionReport, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, onSlotFormEngineChange: onSlotFormEngineChange, onSlotVisibilityChange: onSlotVisibilityChange, overviewDestination: overviewDestination, reviewDestination: reviewDestination, onSlotDraftAvailabilityChange: handleSlotDraftAvailabilityChange, renderDefinitionForm: renderDefinitionForm, definitionActionInvoker: definitionActionInvoker, resolveSemanticControlScope: resolveSemanticControlScope, semanticOutputScope: semanticOutputScope, onDefinitionActionResult: onDefinitionActionResult, onActionCompleted: (action, result) => {
                        // The form's own submit ran under Response Actions authority and
                        // reported success. THAT is what advances the route — not the
                        // click that started it.
                        const supplied = plan.transitions.filter((candidate) => candidate.status === 'supplied-by-slot' &&
                            candidate.actionId === action.id);
                        if (supplied.length === 1 && supplied[0]) {
                            onAdvance?.(supplied[0], result.transitionBindings
                                ? { transitionBindings: result.transitionBindings }
                                : undefined);
                        }
                    }, onAdvance: onAdvance }, slotPlan.slotId))) }), _jsx(SurfaceTransitions, { from: { ...handle, params: plan.params }, transitions: visibleTransitions, strings: text, hasDefinitionForm: hasDecisionFormSlot, draftReviewTargetRouteRefs: isDraftReviewRoute ? draftReviewTargetRouteRefs : undefined, ...(onFireTransition ? { onFire: onFireTransition } : {}), ...(onAdvance ? { onAdvance } : {}) })] }));
}
/** Native disclosure supplies keyboard behavior and a localized default summary for untitled slots. */
function TrackerBand({ preference, title, children }) {
    const key = `formspec.surface.tracker-band.${preference}`;
    const [initiallyExpanded] = useState(() => {
        try {
            return window.localStorage.getItem(key) !== 'closed';
        }
        catch {
            return true;
        }
    });
    return _jsxs("details", { "data-filing-band": "", open: initiallyExpanded, children: [_jsx("summary", { onClick: event => {
                    // Persist before the browser can navigate away. Native toggle events are queued.
                    const open = !event.currentTarget.closest('details')?.open;
                    try {
                        window.localStorage.setItem(key, open ? 'open' : 'closed');
                    }
                    catch { /* The disclosure remains usable when storage is unavailable. */ }
                }, children: title }), children] });
}
