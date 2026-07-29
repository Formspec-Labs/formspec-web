import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @filedesc `SurfaceSlot` — one planned slot, rendered — and `SurfaceSlotFrame`,
 * the ONE place a slot's own title becomes a heading.
 *
 * The dispatch already happened: `@formspec-org/surface`'s `planRoute` turned a
 * `slotType` into a typed `SlotPlan`, exhaustively and without React in scope.
 * This file binds each plan variant to elements and nothing else, which is why
 * a second renderer (web component, server-side) needs a file this size rather
 * than a re-implementation of the taxonomy.
 *
 * ## Why the frame is a component and not two inline expressions
 *
 * `surface-shell-spec.md` §8.3 item 10: "Where a decision — whether to render a
 * slot's own title, which level a title takes — is made in more than one code
 * path, those paths MUST agree; divergent duplicates of the same rule are how a
 * fixed defect reappears one nesting level down." It did: the top-level path
 * suppressed a slot title only for `kind: heading`, and the embed path
 * suppressed it for **all** `static-content` kinds, throwing away the authored
 * title of every `text`, `image` and `divider` slot inside an embed — the exact
 * bug the top-level path had already been fixed to remove. The embed path also
 * rendered the title at the HOST slot's base rather than the child's, so an
 * embedded title sat at the same rank as its host while its content sat one
 * deeper. {@link SurfaceSlotFrame} is both paths now.
 */
import { useCallback, useEffect, useRef, useState, } from 'react';
import { FormspecForm } from '@formspec-org/react';
import { loadWidgetDataInputs, responseActionsDocumentForDefinition, surfaceDiagnostic, } from '@formspec-org/surface';
import { Heading, nextLevel } from './heading.js';
import { allocateWidgetActionInvocationId, createWidgetActionCoordinator, responseActionsDocumentForAction, } from './widget-action-runtime.js';
import { WidgetEmptyState } from './widgets/empty-state.js';
/** The action that is safe to use for route advancement, or no action. */
export function completedFormAction(result) {
    if (result.status !== 'completed')
        return undefined;
    if (!result.resolution.resolved || !result.resolution.action)
        return undefined;
    if (result.detail?.validationReport?.valid !== true)
        return undefined;
    return result.resolution.action;
}
/**
 * True when the slot's own binding already produces the heading for its
 * content, so a slot-level title on top of it would be two headings for one
 * piece of content.
 *
 * Every other slot type — INCLUDING a `text`, `image` or `divider` static slot
 * — keeps its authored title. Dropping it for the whole slot type silently
 * threw away authored content: the spike bundle's `applyReassurance` slot is
 * `kind: text` titled "Before you start", and the title vanished.
 */
export function rendersOwnHeading(plan) {
    return plan.slotType === 'static-content' && plan.content?.kind === 'heading';
}
/**
 * The wrapper every slot renders inside, at every nesting depth: the element,
 * the data attributes a probe reads, and the slot's own title at **the plan's**
 * heading level.
 *
 * `aria-label` is set only when the slot carries an authored title. Labelling a
 * region with a slot id turns machine vocabulary into something a screen reader
 * announces, and a `<section>` with no accessible name is inert rather than a
 * landmark — which is the honest shape for a slot the author did not name.
 */
export function SurfaceSlotFrame(props) {
    const { plan } = props;
    return (_jsxs("section", { className: "fs-surface-slot", "data-slot": plan.slotId, "data-slot-type": plan.slotType, ...(plan.title ? { 'aria-label': plan.title } : {}), children: [plan.title && !rendersOwnHeading(plan) && (_jsx(Heading, { level: plan.headingBaseLevel, className: "fs-surface-slot__title", children: plan.title })), _jsx(SurfaceSlot, { ...props })] }));
}
export function SurfaceSlot({ plan, grant, route, strings, dataSourceLoader, authorizeDataSource, validateDataSourcePayload, showExperienceNeeds = false, responseActionsDocuments, transitions, widgetActionExecutor, widgetActionOutcomeStore, widgetActionCoordinator, runtimeGeneration, onWidgetActionReport, onRuntimeDiagnosticsChange, renderDefinitionForm, onActionCompleted, onAdvance, }) {
    switch (plan.slotType) {
        case 'definition-form': {
            if (plan.status === 'unresolved' || plan.definition === undefined) {
                return _jsx(UnavailableSlot, { children: strings('slotUnavailableDefinitionForm') });
            }
            // This annotation is the compile-time cross-package contract: the
            // generated schema document must pass directly into React's engine seam.
            const responseActionsDocument = responseActionsDocumentForDefinition(responseActionsDocuments ?? [], plan.definitionRef);
            // `themeDocument` comes from the route's grant and never from the bundle
            // directly. On a refusing route that object was built from the platform
            // token registry and never saw a tenant token — which is what makes the
            // boundary structural rather than a styling choice.
            const renderInput = {
                plan: {
                    ...plan,
                    status: 'ready',
                    definition: plan.definition,
                },
                grant,
                route,
                responseActionsDocument,
                onActionCompleted,
            };
            return renderDefinitionForm
                ? renderDefinitionForm(renderInput)
                : renderDefaultDefinitionForm(renderInput);
        }
        case 'experience-unit': {
            const { unit } = plan;
            if (unit.status === 'unresolved') {
                return _jsx(UnavailableSlot, { children: strings('slotUnavailableExperienceUnit') });
            }
            return (_jsxs("div", { className: "fs-surface-unit", "data-experience-unit": unit.unitRef, children: [unit.title && (_jsx(Heading, { level: plan.headingBaseLevel, className: "fs-surface-unit__title", children: unit.title })), showExperienceNeeds && unit.needs.length > 0 && (_jsx("ul", { className: "fs-surface-unit__needs", "data-probe": "experience-needs", children: unit.needs.map((need) => (_jsx("li", { children: need.description ?? need.id }, need.id))) }))] }));
        }
        case 'module-widget': {
            const { resolution, key } = plan;
            if (resolution.status !== 'resolved') {
                return (_jsx(UnavailableSlot, { children: strings(resolution.status === 'unimplemented'
                        ? 'slotUnavailableWidgetUnimplemented'
                        : 'slotUnavailableWidgetUndeclared', { widgetName: key.widgetName, moduleId: key.moduleId }) }));
            }
            // A resolved-but-undeclared widget still renders — the host supplied a
            // component. `WIDGET-UNDECLARED` is already in the plan's diagnostics
            // (§3.3): a shell MAY render it, and MUST say it did.
            return (_jsx(SurfaceWidgetSlot, { plan: plan, grant: grant, route: route, strings: strings, dataSourceLoader: dataSourceLoader, authorizeDataSource: authorizeDataSource, validateDataSourcePayload: validateDataSourcePayload, responseActionsDocuments: responseActionsDocuments ?? [], transitions: transitions ?? [], widgetActionExecutor: widgetActionExecutor, widgetActionOutcomeStore: widgetActionOutcomeStore, widgetActionCoordinator: widgetActionCoordinator, runtimeGeneration: runtimeGeneration ?? `${route.surfaceId}/${route.routeId}`, onWidgetActionReport: onWidgetActionReport, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, onAdvance: onAdvance }));
        }
        case 'static-content': {
            const { content } = plan;
            if (content === undefined) {
                return _jsx(UnavailableSlot, { children: strings('slotUnavailableStaticContent') });
            }
            switch (content.kind) {
                case 'heading':
                    return (_jsx(Heading, { level: content.level, className: "fs-surface-static-heading", children: content.content }));
                case 'text':
                    return _jsx("p", { className: "fs-surface-static-text", children: content.content });
                case 'image':
                    return (_jsx("img", { className: "fs-surface-static-image", src: content.src, alt: content.alt, ...(content.decorative ? { role: 'presentation' } : {}) }));
                case 'divider':
                    // Presentational only: no accessible name, not focusable, and
                    // `content` is not rendered as text even when non-empty (§3.4.2).
                    return _jsx("hr", { className: "fs-surface-static-divider" });
            }
            return null;
        }
        case 'embed-route': {
            if (plan.status !== 'ready') {
                return (_jsx(UnavailableSlot, { children: strings(plan.status === 'cycle'
                        ? 'slotUnavailableEmbedCycle'
                        : 'slotUnavailableEmbedUnresolved') }));
            }
            // Embedded content paints on the HOST route's surface, so it renders under
            // the host's grant — an embedded route cannot restore branding the host
            // refuses. Headings step down a level, which `planRoute` already decided;
            // this renders the level it was handed and re-derives nothing.
            return (_jsx("div", { className: "fs-surface-embed", "data-embed-route": plan.routeRef, "data-embed-mode": plan.mode, children: plan.slots.map((child) => (_jsx(SurfaceSlotFrame, { plan: child, grant: grant, route: route, strings: strings, dataSourceLoader: dataSourceLoader, authorizeDataSource: authorizeDataSource, validateDataSourcePayload: validateDataSourcePayload, showExperienceNeeds: showExperienceNeeds, responseActionsDocuments: responseActionsDocuments, transitions: transitions, widgetActionExecutor: widgetActionExecutor, widgetActionOutcomeStore: widgetActionOutcomeStore, widgetActionCoordinator: widgetActionCoordinator, runtimeGeneration: runtimeGeneration, onWidgetActionReport: onWidgetActionReport, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, renderDefinitionForm: renderDefinitionForm, onActionCompleted: onActionCompleted, onAdvance: onAdvance }, child.slotId))) }));
        }
        case 'unknown':
            return _jsx(UnavailableSlot, { children: strings('slotUnavailableStaticContent') });
    }
}
export function renderDefaultDefinitionForm({ plan, grant, responseActionsDocument, onActionCompleted, }) {
    return (_jsx(FormspecForm, { definition: plan.definition, themeDocument: grant.themeDocument, registryEntries: [...plan.registryEntries], responseActionsDocument: responseActionsDocument ?? null, emitThemeTokens: false, ...(onActionCompleted
            ? {
                // `onSubmit` requests the renderer's declared submit control. It is
                // a no-op because durable effects have not reached a terminal yet.
                onSubmit: () => { },
                onActionResult: (result) => {
                    const action = completedFormAction(result);
                    if (action)
                        onActionCompleted(action);
                },
            }
            : {}) }));
}
const EMPTY_WIDGET_DATA = Object.freeze({});
const READY_WITH_NO_DATA = {
    status: 'ready',
    data: EMPTY_WIDGET_DATA,
    degradedInputs: [],
    diagnostics: [],
};
function SurfaceWidgetSlot({ plan, grant, route, strings, dataSourceLoader, authorizeDataSource, validateDataSourcePayload, responseActionsDocuments, transitions, widgetActionExecutor, widgetActionOutcomeStore, widgetActionCoordinator, runtimeGeneration, onWidgetActionReport, onRuntimeDiagnosticsChange, onAdvance, }) {
    const [delivery, setDelivery] = useState(plan.dataInputs.length === 0 ? READY_WITH_NO_DATA : { status: 'loading' });
    const activeGeneration = useRef(runtimeGeneration);
    activeGeneration.current = runtimeGeneration;
    const localActionCoordinator = useRef(createWidgetActionCoordinator());
    const actionCoordinator = widgetActionCoordinator ?? localActionCoordinator.current;
    const navigatedInvocations = useRef(new Set());
    const dataDiagnosticScope = `widget-data:${runtimeGeneration}:${plan.slotId}`;
    useEffect(() => {
        let current = true;
        if (plan.dataInputs.length > 0)
            setDelivery({ status: 'loading' });
        onRuntimeDiagnosticsChange?.(dataDiagnosticScope, []);
        void loadWidgetDataInputs({
            inputs: plan.dataInputs,
            context: {
                surfaceId: route.surfaceId,
                surfaceRef: route.surfaceRef,
                routeId: route.routeId,
                slotId: plan.slotId,
                moduleId: plan.key.moduleId,
                widgetName: plan.key.widgetName,
                params: route.params,
                sessionGeneration: runtimeGeneration,
            },
            loader: dataSourceLoader,
            authorize: authorizeDataSource,
            validatePayload: validateDataSourcePayload,
            site: {
                surfaceId: route.surfaceId,
                routeId: route.routeId,
                slotId: plan.slotId,
            },
        }).then((result) => {
            if (!current)
                return;
            setDelivery(result);
            onRuntimeDiagnosticsChange?.(dataDiagnosticScope, result.diagnostics);
        });
        return () => {
            current = false;
            onRuntimeDiagnosticsChange?.(dataDiagnosticScope, []);
        };
    }, [
        authorizeDataSource,
        dataDiagnosticScope,
        dataSourceLoader,
        onRuntimeDiagnosticsChange,
        plan.dataInputs,
        plan.key.moduleId,
        plan.key.widgetName,
        plan.slotId,
        route.params,
        route.routeId,
        route.surfaceId,
        route.surfaceRef,
        runtimeGeneration,
        validateDataSourcePayload,
    ]);
    const reportRefusal = useCallback((invocationId, outputName, code, message, details) => {
        onRuntimeDiagnosticsChange?.(`widget-action:${runtimeGeneration}:${plan.slotId}:${invocationId}`, [
            surfaceDiagnostic(code, message, {
                surfaceId: route.surfaceId,
                routeId: route.routeId,
                slotId: plan.slotId,
            }, details),
        ]);
        onWidgetActionReport?.({
            invocationId,
            outputName,
            navigation: code === 'WIDGET-ACTION-TRANSITION-AMBIGUOUS'
                ? 'ambiguous'
                : 'not-attempted',
        });
    }, [
        onRuntimeDiagnosticsChange,
        onWidgetActionReport,
        plan.slotId,
        route.routeId,
        route.surfaceId,
        runtimeGeneration,
    ]);
    const emitAction = useCallback((outputName) => {
        const declared = plan.actionOutputs.filter((output) => output.name === outputName);
        if (declared.length !== 1) {
            const invocationId = allocateWidgetActionInvocationId();
            reportRefusal(invocationId, outputName, 'WIDGET-ACTION-OUTPUT-UNDECLARED', `Widget "${plan.key.widgetName}" emitted undeclared output "${outputName}".`, {
                moduleId: plan.key.moduleId,
                widgetName: plan.key.widgetName,
                outputName,
                declarationCount: declared.length,
            });
            return;
        }
        const actionRef = declared[0]?.actionRef;
        if (!actionRef) {
            const invocationId = allocateWidgetActionInvocationId();
            reportRefusal(invocationId, outputName, 'WIDGET-ACTION-OUTPUT-UNMAPPED', `Declared widget output "${outputName}" has no Surface action binding.`, {
                moduleId: plan.key.moduleId,
                widgetName: plan.key.widgetName,
                outputName,
            });
            return;
        }
        const document = responseActionsDocumentForAction(responseActionsDocuments, actionRef);
        if (!document) {
            const invocationId = allocateWidgetActionInvocationId();
            reportRefusal(invocationId, outputName, 'WIDGET-ACTION-REF-UNRESOLVED', `Widget output "${outputName}" maps to action "${actionRef}", which does not resolve exactly once.`, {
                moduleId: plan.key.moduleId,
                widgetName: plan.key.widgetName,
                outputName,
                actionRef,
            });
            return;
        }
        if (!widgetActionExecutor) {
            const invocationId = allocateWidgetActionInvocationId();
            onWidgetActionReport?.({
                invocationId,
                actionRef,
                outputName,
                navigation: 'not-attempted',
            });
            return;
        }
        const source = {
            moduleId: plan.key.moduleId,
            widgetName: plan.key.widgetName,
            slotId: plan.slotId,
            route,
            outputName,
        };
        const emittedGeneration = runtimeGeneration;
        const emission = actionCoordinator.emit({
            generation: emittedGeneration,
            document,
            actionRef,
            source,
            executor: widgetActionExecutor,
            outcomeStore: widgetActionOutcomeStore,
        });
        if (!emission.started)
            return;
        void emission.completion
            .then(({ invocationId, result }) => {
            if (activeGeneration.current !== emittedGeneration) {
                onWidgetActionReport?.({
                    invocationId,
                    actionRef,
                    outputName,
                    result,
                    navigation: 'obsolete-generation',
                });
                return;
            }
            const action = completedFormAction(result);
            if (!action || action.id !== actionRef) {
                onWidgetActionReport?.({
                    invocationId,
                    actionRef,
                    outputName,
                    result,
                    navigation: 'none',
                });
                return;
            }
            const eligible = transitions.filter((transition) => transition.status === 'supplied-by-slot' &&
                transition.actionId === action.id);
            if (eligible.length > 1) {
                reportRefusal(invocationId, outputName, 'WIDGET-ACTION-TRANSITION-AMBIGUOUS', `Completed widget action "${action.id}" selects more than one eligible transition. Navigation was refused.`, {
                    actionRef,
                    outputName,
                    targets: eligible.map((transition) => transition.to),
                });
                return;
            }
            const transition = eligible[0];
            if (!transition) {
                onWidgetActionReport?.({
                    invocationId,
                    actionRef,
                    outputName,
                    result,
                    navigation: 'none',
                });
                return;
            }
            if (navigatedInvocations.current.has(invocationId))
                return;
            navigatedInvocations.current.add(invocationId);
            onWidgetActionReport?.({
                invocationId,
                actionRef,
                outputName,
                result,
                navigation: 'advanced',
            });
            onAdvance?.(transition);
        })
            .catch(() => undefined);
    }, [
        onAdvance,
        actionCoordinator,
        onWidgetActionReport,
        plan.actionOutputs,
        plan.key.moduleId,
        plan.key.widgetName,
        plan.slotId,
        reportRefusal,
        responseActionsDocuments,
        route,
        runtimeGeneration,
        transitions,
        widgetActionExecutor,
        widgetActionOutcomeStore,
    ]);
    if (delivery.status === 'loading') {
        return (_jsx("div", { className: "fs-surface-widget-loading", "data-widget-data": "loading", "aria-busy": "true" }));
    }
    if (delivery.status === 'unavailable') {
        const modes = delivery.failures
            .map((failure) => failure.failureMode)
            .filter((mode) => mode !== undefined);
        const emptyState = modes.length > 0 && modes.every((mode) => mode === 'empty-state');
        if (emptyState) {
            return _jsx(WidgetEmptyState, { children: strings('widgetEmpty') });
        }
        return (_jsx("div", { "data-widget-data": "unavailable", "data-widget-failure-mode": modes.join(' '), children: _jsx(UnavailableSlot, { children: strings('slotUnavailableWidgetData') }) }));
    }
    const Widget = plan.resolution.status === 'resolved'
        ? plan.resolution.component
        : undefined;
    if (!Widget) {
        return _jsx(UnavailableSlot, { children: strings('slotUnavailableWidgetData') });
    }
    return (_jsx(Widget, { moduleId: plan.key.moduleId, widgetName: plan.key.widgetName, slot: { id: plan.slotId, title: plan.title }, route: route, headingLevel: plan.headingBaseLevel, config: plan.config ?? {}, data: delivery.data, emitAction: emitAction, admitsTenantTheme: grant.admitsTenantTheme }));
}
function UnavailableSlot({ children }) {
    return (_jsx("p", { className: "fs-surface-unavailable", role: "status", "data-probe": "slot-unavailable", children: children }));
}
export { nextLevel };
