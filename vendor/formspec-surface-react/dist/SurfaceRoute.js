import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLayoutEffect, useRef } from 'react';
import { emitMergedThemeCssVars } from '@formspec-org/layout';
import { generationNeedAnchors, resolveRouteTitleLevel, resolveSurfaceStrings, } from '@formspec-org/surface';
import { Heading } from './heading.js';
import { SurfaceSlotFrame, } from './SurfaceSlot.js';
import { SurfaceTransitions } from './SurfaceTransitions.js';
import { needTraceAttributes } from './need-trace.js';
export function SurfaceRouteView({ plan, strings, dataSourceLoader, dataSourceRevision, authorizeDataSource, validateDataSourcePayload, widgetActionExecutor, widgetActionOutcomeStore, widgetActionCoordinator, runtimeGeneration, onWidgetActionReport, onRuntimeDiagnosticsChange, renderDefinitionForm, definitionActionInvoker, resolveSemanticControlScope, resolveSemanticOutputScope, onDefinitionActionResult, showExperienceNeeds, showThemeNotice = false, responseActionsDocuments, referencesDocuments, ontologyDocuments, onFireTransition, onAdvance, }) {
    const container = useRef(null);
    const { handle, grant, params } = plan;
    const text = strings ?? resolveSurfaceStrings();
    useLayoutEffect(() => {
        const element = container.current;
        if (!element)
            return;
        const tokens = grant.themeDocument.tokens;
        emitMergedThemeCssVars(element, { themeTokens: tokens ?? {} });
        return () => {
            for (let index = element.style.length - 1; index >= 0; index -= 1) {
                const property = element.style[index];
                if (property?.startsWith('--formspec-'))
                    element.style.removeProperty(property);
            }
        };
    }, [grant]);
    const route = {
        surfaceId: handle.surfaceId,
        surfaceRef: plan.surfaceRef,
        routeId: handle.routeId,
        routeClass: handle.route.routeClass,
        params,
    };
    const semanticOutputScope = resolveSemanticOutputScope?.({
        plan,
        route,
        runtimeGeneration,
    });
    const titleLevel = resolveRouteTitleLevel(plan.headingBaseLevel);
    const titleText = handle.route.title ?? handle.routeId;
    const titleId = `fs-surface-title-${handle.routeId}`;
    return (_jsxs("article", { ref: container, className: `fs-surface-route fs-surface-route--${grant.admitsTenantTheme ? 'branded' : 'platform'}`, "data-route": handle.routeId, "data-surface": handle.surfaceId, "data-route-class": handle.route.routeClass ?? 'unclassified', "data-tenant-theme": grant.admitsTenantTheme ? 'admitted' : 'refused', "data-tenant-token-count": grant.tenantTokenKeys.length, ...needTraceAttributes(generationNeedAnchors(handle.route)), ...(titleLevel === undefined
            ? { 'aria-label': titleText }
            : { 'aria-labelledby': titleId }), children: [titleLevel !== undefined && (_jsx(Heading, { level: titleLevel, className: "fs-surface-route__title", id: titleId, children: titleText })), showThemeNotice && (_jsx("p", { className: `fs-surface-themenote fs-surface-themenote--${grant.posture}`, "data-probe": "theme-note", children: grant.reason })), _jsx("div", { className: "fs-surface-route__slots", children: plan.slots.map((slotPlan) => (_jsx(SurfaceSlotFrame, { plan: slotPlan, grant: grant, route: route, strings: text, dataSourceLoader: dataSourceLoader, dataSourceRevision: dataSourceRevision, authorizeDataSource: authorizeDataSource, validateDataSourcePayload: validateDataSourcePayload, showExperienceNeeds: showExperienceNeeds, responseActionsDocuments: responseActionsDocuments, referencesDocuments: referencesDocuments, ontologyDocuments: ontologyDocuments, transitions: plan.transitions, widgetActionExecutor: widgetActionExecutor, widgetActionOutcomeStore: widgetActionOutcomeStore, widgetActionCoordinator: widgetActionCoordinator, runtimeGeneration: runtimeGeneration, onWidgetActionReport: onWidgetActionReport, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, renderDefinitionForm: renderDefinitionForm, definitionActionInvoker: definitionActionInvoker, resolveSemanticControlScope: resolveSemanticControlScope, semanticOutputScope: semanticOutputScope, onDefinitionActionResult: onDefinitionActionResult, onActionCompleted: (action, result) => {
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
