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
import { useMemo, useRef } from 'react';
import { generationNeedAnchors, resolveRouteTitleLevel, resolveSurfaceStrings, } from '@formspec-org/surface';
import { Heading } from './heading.js';
import { useFilingDraftObservations } from './FilingStatus.js';
import { SurfaceSlotFrame, } from './SurfaceSlot.js';
import { SurfaceTransitions } from './SurfaceTransitions.js';
import { needTraceAttributes } from './need-trace.js';
import { useSurfaceThemeTokens } from './surface-theme.js';
export function SurfaceRouteView({ plan, filingStatus, resolveRouteTitle, strings, dataSourceLoader, dataSourceRevision, authorizeDataSource, validateDataSourcePayload, widgetActionExecutor, widgetActionOutcomeStore, widgetActionCoordinator, runtimeGeneration, onWidgetActionReport, onRuntimeDiagnosticsChange, renderDefinitionForm, definitionActionInvoker, resolveSemanticControlScope, resolveSemanticOutputScope, onDefinitionActionResult, showExperienceNeeds, showThemeNotice = false, responseActionsDocuments, referencesDocuments, ontologyDocuments, onFireTransition, onAdvance, onScreenerTarget, checkScreenerTarget, screenerInstanceId, screenerCompletion, localeDocuments, activeLocale, formSession, }) {
    const container = useRef(null);
    const { handle, grant, params } = plan;
    const text = strings ?? resolveSurfaceStrings();
    const port = formSession?.drafts?.port;
    const suppliedReader = filingStatus?.readSummaries;
    const readSummaries = useMemo(() => suppliedReader ?? port?.readSummaries.bind(port), [suppliedReader, port]);
    const draftScope = suppliedReader ? formSession?.previewScope : formSession?.drafts?.scope;
    const observe = useFilingDraftObservations(plan.slots, readSummaries, draftScope, filingStatus?.revision, runtimeGeneration, formSession?.draftRevision);
    const filingStatusContext = filingStatus && { ...filingStatus, observe };
    useSurfaceThemeTokens(container, grant.themeDocument);
    const workspace = formSession?.workspace;
    const activeSlot = activeWorkspaceSlot(plan, workspace?.slot);
    const titleLevel = resolveRouteTitleLevel(plan.headingBaseLevel);
    const titleText = presentedRouteTitle(handle, resolveRouteTitle);
    const titleId = `fs-surface-title-${handle.routeId}`;
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
    const routeClass = String(handle.route.routeClass ?? 'unclassified');
    const routeLayout = (routeClass === 'review' && plan.slots.length > 1) ||
        (handle.route.routeClass === 'operation' &&
            hasWidgetSlot &&
            hasDecisionFormSlot)
        ? 'split'
        : undefined;
    return (_jsxs("article", { ref: container, className: `fs-surface-route fs-surface-route--${grant.admitsTenantTheme ? 'branded' : 'platform'}`, "data-route": handle.routeId, "data-surface": handle.surfaceId, "data-route-class": handle.route.routeClass ?? 'unclassified', "data-route-layout": routeLayout, "data-fs-appearance": formSession?.appearance, "data-tenant-theme": grant.admitsTenantTheme ? 'admitted' : 'refused', "data-tenant-token-count": grant.tenantTokenKeys.length, ...needTraceAttributes(generationNeedAnchors(handle.route)), ...(titleLevel === undefined
            ? { 'aria-label': titleText }
            : { 'aria-labelledby': titleId }), children: [titleLevel !== undefined && (_jsx(Heading, { level: titleLevel, className: "fs-surface-route__title", id: titleId, children: titleText })), showThemeNotice && (_jsx("p", { className: `fs-surface-themenote fs-surface-themenote--${grant.posture}`, "data-probe": "theme-note", children: grant.reason })), _jsx("div", { className: "fs-surface-route__slots", children: plan.slots.map((slotPlan) => (_jsx(SurfaceSlotFrame, { plan: slotPlan, filingStatus: filingStatusContext, screenerCompletion: screenerCompletion, checkScreenerTarget: checkScreenerTarget, onScreenerTarget: onScreenerTarget, screenerInstanceId: screenerInstanceId, localeDocuments: localeDocuments, activeLocale: activeLocale, formSession: formSession, ...(workspace && slotPlan.slotId === activeSlot && { activeSection: workspace.activeSection }), sectionNavigationActive: slotPlan.slotId === activeSlot, grant: grant, route: route, strings: text, dataSourceLoader: dataSourceLoader, dataSourceRevision: dataSourceRevision, authorizeDataSource: authorizeDataSource, validateDataSourcePayload: validateDataSourcePayload, showExperienceNeeds: showExperienceNeeds, responseActionsDocuments: responseActionsDocuments, referencesDocuments: referencesDocuments, ontologyDocuments: ontologyDocuments, transitions: plan.transitions, widgetActionExecutor: widgetActionExecutor, widgetActionOutcomeStore: widgetActionOutcomeStore, widgetActionCoordinator: widgetActionCoordinator, runtimeGeneration: runtimeGeneration, onWidgetActionReport: onWidgetActionReport, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, renderDefinitionForm: renderDefinitionForm, definitionActionInvoker: definitionActionInvoker, resolveSemanticControlScope: resolveSemanticControlScope, semanticOutputScope: semanticOutputScope, onDefinitionActionResult: onDefinitionActionResult, onActionCompleted: (action, result) => {
                        // The form's own submit ran under Response Actions authority and
                        // reported success. THAT is what advances the route — not the
                        // click that started it.
                        const supplied = plan.transitions.filter((candidate) => candidate.status === 'supplied-by-slot' &&
                            (candidate.trigger === action.id ||
                                candidate.trigger === action.intent));
                        if (supplied.length === 1 && supplied[0]) {
                            onAdvance?.(supplied[0], result.transitionBindings
                                ? { transitionBindings: result.transitionBindings }
                                : undefined);
                        }
                    }, onAdvance: onAdvance }, slotPlan.slotId))) }), _jsx(SurfaceTransitions, { from: { ...handle, params: plan.params }, transitions: plan.transitions, strings: text, ...(onFireTransition ? { onFire: onFireTransition } : {}), ...(onAdvance ? { onAdvance } : {}) })] }));
}
