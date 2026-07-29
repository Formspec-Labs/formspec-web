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
import { useLayoutEffect, useRef } from 'react';
import { emitMergedThemeCssVars } from '@formspec-org/layout';
import { resolveRouteTitleLevel, resolveSurfaceStrings, } from '@formspec-org/surface';
import { Heading } from './heading.js';
import { SurfaceSlotFrame, } from './SurfaceSlot.js';
import { SurfaceTransitions } from './SurfaceTransitions.js';
export function SurfaceRouteView({ plan, strings, dataSourceLoader, authorizeDataSource, validateDataSourcePayload, widgetActionExecutor, widgetActionOutcomeStore, widgetActionCoordinator, runtimeGeneration, onWidgetActionReport, onRuntimeDiagnosticsChange, renderDefinitionForm, showExperienceNeeds, showThemeNotice = false, responseActionsDocuments, onFireTransition, onAdvance, }) {
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
    const titleLevel = resolveRouteTitleLevel(plan.headingBaseLevel);
    const titleText = handle.route.title ?? handle.routeId;
    const titleId = `fs-surface-title-${handle.routeId}`;
    return (_jsxs("article", { ref: container, className: `fs-surface-route fs-surface-route--${grant.admitsTenantTheme ? 'branded' : 'platform'}`, "data-route": handle.routeId, "data-surface": handle.surfaceId, "data-route-class": handle.route.routeClass ?? 'unclassified', "data-tenant-theme": grant.admitsTenantTheme ? 'admitted' : 'refused', "data-tenant-token-count": grant.tenantTokenKeys.length, ...(titleLevel === undefined
            ? { 'aria-label': titleText }
            : { 'aria-labelledby': titleId }), children: [titleLevel !== undefined && (_jsx(Heading, { level: titleLevel, className: "fs-surface-route__title", id: titleId, children: titleText })), showThemeNotice && (_jsx("p", { className: `fs-surface-themenote fs-surface-themenote--${grant.posture}`, "data-probe": "theme-note", children: grant.reason })), _jsx("div", { className: "fs-surface-route__slots", children: plan.slots.map((slotPlan) => (_jsx(SurfaceSlotFrame, { plan: slotPlan, grant: grant, route: route, strings: text, dataSourceLoader: dataSourceLoader, authorizeDataSource: authorizeDataSource, validateDataSourcePayload: validateDataSourcePayload, showExperienceNeeds: showExperienceNeeds, responseActionsDocuments: responseActionsDocuments, transitions: plan.transitions, widgetActionExecutor: widgetActionExecutor, widgetActionOutcomeStore: widgetActionOutcomeStore, widgetActionCoordinator: widgetActionCoordinator, runtimeGeneration: runtimeGeneration, onWidgetActionReport: onWidgetActionReport, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, renderDefinitionForm: renderDefinitionForm, onActionCompleted: (action) => {
                        // The form's own submit ran under Response Actions authority and
                        // reported success. THAT is what advances the route — not the
                        // click that started it.
                        const supplied = plan.transitions.filter((candidate) => candidate.status === 'supplied-by-slot' &&
                            (candidate.trigger === action.id ||
                                candidate.trigger === action.intent));
                        if (supplied.length === 1 && supplied[0])
                            onAdvance?.(supplied[0]);
                    }, onAdvance: onAdvance }, slotPlan.slotId))) }), _jsx(SurfaceTransitions, { from: handle, transitions: plan.transitions, strings: text, ...(onFireTransition ? { onFire: onFireTransition } : {}), ...(onAdvance ? { onAdvance } : {}) })] }));
}
