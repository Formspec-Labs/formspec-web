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
import { useCallback, useEffect, useMemo, useRef, useState, } from 'react';
import { createFormEngine, createMappingEngine, } from '@formspec-org/engine';
import { FormspecForm } from '@formspec-org/react';
import { resolveFieldReferences, targetDefinitionMatches, } from '@formspec-org/types';
import { loadWidgetDataInputs, loadDefinitionFormInitialData, responseActionsDocumentForDefinition, surfaceDiagnostic, } from '@formspec-org/surface';
import { Heading, nextLevel } from './heading.js';
import { allocateWidgetActionInvocationId, admitSurfaceWidgetActionInput, createWidgetActionCoordinator, responseActionsDocumentForAction, } from './widget-action-runtime.js';
import { WidgetEmptyState } from './widgets/empty-state.js';
import { ModuleWidgetStateView, widgetDataMatchesEmptyWhen, } from './widget-state.js';
import { needIdTraceAttributes, needTraceAttributes } from './need-trace.js';
import { surfaceSemanticOutputSubjectRef, useSurfaceSemanticOutputs, } from './semantic-output.js';
/**
 * Build a fail-closed resolver from caller-paired object identities.
 * Canonicalization and digest computation stay outside the Surface renderer.
 */
export function createSurfaceSemanticControlScopeResolver(pairing) {
    return (request) => {
        const definitionArtifact = pairing.definitionArtifacts.get(request.plan.definition);
        const responseActionsArtifact = request.responseActionsDocument
            ? pairing.responseActionsArtifacts.get(request.responseActionsDocument)
            : undefined;
        const renderInstanceId = pairing.renderInstanceIdFor(request);
        const responseBinding = pairing.responseBindingFor(request);
        if (!definitionArtifact
            || !renderInstanceId
            || !responseBinding
            || (request.responseActionsDocument && !responseActionsArtifact)) {
            return undefined;
        }
        return {
            registry: pairing.registry,
            renderInstanceId,
            definitionArtifact,
            ...(responseActionsArtifact ? { responseActionsArtifact } : {}),
            responseId: responseBinding.responseId,
            initialResponseRevision: responseBinding.responseRevision,
        };
    };
}
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
 * Widget app actions have no Response to validate. Response-scoped widget
 * actions retain the form completion gate; app scope needs only the successful
 * resolved action terminal because the engine already enforced app validation.
 */
export function completedWidgetAction(result, document) {
    if (document.scope === 'app') {
        if (result.status !== 'completed')
            return undefined;
        return result.resolution.resolved
            ? result.resolution.action ?? undefined
            : undefined;
    }
    if (result.status !== 'completed')
        return undefined;
    if (!result.resolution.resolved || !result.resolution.action)
        return undefined;
    const detail = result.detail;
    if (detail === null ||
        !Object.prototype.hasOwnProperty.call(detail, 'validationReport')) {
        return undefined;
    }
    const validationReport = detail.validationReport;
    if (validationReport?.valid !== true)
        return undefined;
    return result.resolution.action;
}
/**
 * Build the private navigation handoff for one completed app-widget action.
 *
 * The input has already crossed {@link admitSurfaceWidgetActionInput}, so it is
 * a detached frozen JSON object. Only its own top-level non-empty strings can
 * become candidates. Nested values, arbitrary executor detail, and response
 * bodies are absent from this function's inputs and therefore cannot enter the
 * route parameter handoff.
 */
function mergeAppWidgetTransitionBindings(document, input, serviceBindings) {
    const merged = Object.create(null);
    for (const [name, value] of Object.entries(serviceBindings ?? {})) {
        merged[name] = value;
    }
    if (document.scope === 'app' && input && Object.isFrozen(input)) {
        for (const [name, value] of Object.entries(input)) {
            if (typeof value !== 'string' || value.length === 0)
                continue;
            if (Object.prototype.hasOwnProperty.call(merged, name)
                && merged[name] !== value) {
                return { status: 'conflict', bindingName: name };
            }
            merged[name] = value;
        }
    }
    return Object.keys(merged).length === 0
        ? { status: 'ready' }
        : { status: 'ready', transitionBindings: Object.freeze(merged) };
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
    const { plan, showExperienceNeeds = false } = props;
    if (plan.slotType === 'experience-unit' && !showExperienceNeeds) {
        return null;
    }
    const showsAuthoredTitle = plan.title !== undefined &&
        (plan.slotType !== 'experience-unit' || showExperienceNeeds);
    return (_jsxs("section", { className: "fs-surface-slot", "data-slot": plan.slotId, "data-slot-type": plan.slotType, ...needTraceAttributes(plan.needAnchors), ...(showsAuthoredTitle ? { 'aria-label': plan.title } : {}), children: [showsAuthoredTitle && !rendersOwnHeading(plan) && (_jsx(Heading, { level: plan.headingBaseLevel, className: "fs-surface-slot__title", children: plan.title })), _jsx(SurfaceSlot, { ...props })] }));
}
export function SurfaceSlot({ plan, grant, route, strings, dataSourceLoader, authorizeDataSource, validateDataSourcePayload, showExperienceNeeds = false, responseActionsDocuments, referencesDocuments, ontologyDocuments, transitions, widgetActionExecutor, widgetActionOutcomeStore, widgetActionCoordinator, runtimeGeneration, onWidgetActionReport, onRuntimeDiagnosticsChange, renderDefinitionForm, definitionActionInvoker, resolveSemanticControlScope, semanticOutputScope, onDefinitionActionResult, onActionCompleted, onAdvance, }) {
    const subjectPrefix = surfaceSemanticOutputSubjectRef(route.routeId, plan.slotId);
    const slotSemanticOutputScope = semanticOutputScope && subjectPrefix
        ? { ...semanticOutputScope, subjectPrefix }
        : undefined;
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
                referencesDocuments: referencesDocuments ?? [],
                ontologyDocuments: ontologyDocuments ?? [],
                onDefinitionActionResult,
                onActionCompleted,
                responseActionInvoker: definitionActionInvoker,
            };
            const semanticControlScope = resolveSemanticControlScope?.({
                plan: renderInput.plan,
                route,
                responseActionsDocument,
                runtimeGeneration,
            });
            if (semanticControlScope) {
                renderInput.semanticControlScope = semanticControlScope;
            }
            if (plan.initialData && plan.initialData.status !== 'ready') {
                return (_jsx(UnavailableSlot, { children: strings('slotUnavailableWidgetData') }));
            }
            if (plan.initialData?.status === 'ready') {
                return (_jsx(DefinitionFormDataSlot, { input: renderInput, initialDataPlan: plan.initialData, strings: strings, dataSourceLoader: dataSourceLoader, authorizeDataSource: authorizeDataSource, validateDataSourcePayload: validateDataSourcePayload, runtimeGeneration: runtimeGeneration ?? `${route.surfaceId}/${route.routeId}`, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, renderDefinitionForm: renderDefinitionForm, semanticOutputScope: slotSemanticOutputScope }));
            }
            return renderDefinitionForm
                ? renderDefinitionForm(renderInput)
                : (_jsx(DefaultDefinitionFormSlot, { input: renderInput, semanticOutputScope: slotSemanticOutputScope }));
        }
        case 'experience-unit': {
            const { unit } = plan;
            if (unit.status === 'unresolved') {
                return _jsx(UnavailableSlot, { children: strings('slotUnavailableExperienceUnit') });
            }
            return (_jsxs("div", { className: "fs-surface-unit", "data-experience-unit": unit.unitRef, ...needIdTraceAttributes(unit.needs.map((need) => need.id)), children: [showExperienceNeeds && unit.title && (_jsx(Heading, { level: plan.headingBaseLevel, className: "fs-surface-unit__title", children: unit.title })), showExperienceNeeds && unit.needs.length > 0 && (_jsx("ul", { className: "fs-surface-unit__needs", "data-probe": "experience-needs", children: unit.needs.map((need) => (_jsx("li", { children: need.description ?? need.id }, need.id))) }))] }));
        }
        case 'module-widget': {
            const { resolution, key } = plan;
            if (resolution.status !== 'resolved') {
                return (_jsx(UnavailableSlot, { children: strings(resolution.status === 'unimplemented'
                        ? 'slotUnavailableWidgetUnimplemented'
                        : resolution.status === 'incompatible'
                            ? 'slotUnavailableWidgetIncompatible'
                            : 'slotUnavailableWidgetUndeclared', { widgetName: key.widgetName, moduleId: key.moduleId }) }));
            }
            // A resolved-but-undeclared widget still renders — the host supplied a
            // component. `WIDGET-UNDECLARED` is already in the plan's diagnostics
            // (§3.3): a shell MAY render it, and MUST say it did.
            return (_jsx(SurfaceWidgetSlot, { plan: plan, grant: grant, route: route, strings: strings, dataSourceLoader: dataSourceLoader, authorizeDataSource: authorizeDataSource, validateDataSourcePayload: validateDataSourcePayload, responseActionsDocuments: responseActionsDocuments ?? [], transitions: transitions ?? [], widgetActionExecutor: widgetActionExecutor, widgetActionOutcomeStore: widgetActionOutcomeStore, widgetActionCoordinator: widgetActionCoordinator, runtimeGeneration: runtimeGeneration ?? `${route.surfaceId}/${route.routeId}`, onWidgetActionReport: onWidgetActionReport, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, onAdvance: onAdvance, semanticOutputScope: slotSemanticOutputScope }));
        }
        case 'static-content': {
            const { content } = plan;
            if (content === undefined) {
                return _jsx(UnavailableSlot, { children: strings('slotUnavailableStaticContent') });
            }
            return (_jsx(SurfaceStaticContent, { content: content, needAnchors: plan.contentNeedAnchors, routeId: route.routeId, slotId: plan.slotId, semanticOutputScope: slotSemanticOutputScope }));
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
            return (_jsx("div", { className: "fs-surface-embed", "data-embed-route": plan.routeRef, "data-embed-mode": plan.mode, children: plan.slots.map((child) => (_jsx(SurfaceSlotFrame, { plan: child, grant: grant, route: route, strings: strings, dataSourceLoader: dataSourceLoader, authorizeDataSource: authorizeDataSource, validateDataSourcePayload: validateDataSourcePayload, showExperienceNeeds: showExperienceNeeds, responseActionsDocuments: responseActionsDocuments, referencesDocuments: referencesDocuments, ontologyDocuments: ontologyDocuments, transitions: transitions, widgetActionExecutor: widgetActionExecutor, widgetActionOutcomeStore: widgetActionOutcomeStore, widgetActionCoordinator: widgetActionCoordinator, runtimeGeneration: runtimeGeneration, onWidgetActionReport: onWidgetActionReport, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, renderDefinitionForm: renderDefinitionForm, resolveSemanticControlScope: resolveSemanticControlScope, semanticOutputScope: semanticOutputScope, onDefinitionActionResult: onDefinitionActionResult, onActionCompleted: onActionCompleted, onAdvance: onAdvance }, child.slotId))) }));
        }
        case 'unknown':
            return _jsx(UnavailableSlot, { children: strings('slotUnavailableStaticContent') });
    }
}
function SurfaceStaticContent({ content, needAnchors, routeId, slotId, semanticOutputScope, }) {
    const subjectRef = surfaceSemanticOutputSubjectRef(routeId, slotId);
    const semanticValue = content.kind === 'heading' || content.kind === 'text'
        ? content.content
        : content.kind === 'image'
            ? {
                src: content.src,
                alt: content.alt,
                decorative: content.decorative,
            }
            : undefined;
    useSurfaceSemanticOutputs(semanticOutputScope, subjectRef
        ? [{
                subjectRef,
                ...(semanticValue === undefined ? {} : { semanticValue }),
            }]
        : []);
    switch (content.kind) {
        case 'heading':
            return (_jsx(Heading, { level: content.level, className: "fs-surface-static-heading", ...needTraceAttributes(needAnchors), children: content.content }));
        case 'text':
            return (_jsx("p", { className: "fs-surface-static-text", ...needTraceAttributes(needAnchors), children: content.content }));
        case 'image':
            return (_jsx("img", { className: "fs-surface-static-image", src: content.src, alt: content.alt, ...needTraceAttributes(needAnchors), ...(content.decorative ? { role: 'presentation' } : {}) }));
        case 'divider':
            // Presentational only: no accessible name, not focusable, and no
            // semantic value is invented for an authored divider.
            return (_jsx("hr", { className: "fs-surface-static-divider", ...needTraceAttributes(needAnchors) }));
    }
}
export function renderDefaultDefinitionForm({ plan, grant, route, initialData, referencesDocuments, ontologyDocuments, responseActionsDocument, semanticControlScope, onDefinitionActionResult, onActionCompleted, responseActionInvoker, }) {
    return (_jsx(DefaultSurfaceDefinitionForm, { plan: plan, grant: grant, route: route, initialData: initialData, referencesDocuments: referencesDocuments, ontologyDocuments: ontologyDocuments, responseActionsDocument: responseActionsDocument, semanticControlScope: semanticControlScope, onDefinitionActionResult: onDefinitionActionResult, onActionCompleted: onActionCompleted, responseActionInvoker: responseActionInvoker }));
}
function executeDefinitionFormMapping({ mapping, value, }) {
    const result = createMappingEngine(mapping).reverse(value);
    if (result.diagnostics.length > 0) {
        const codes = result.diagnostics.map((diagnostic) => diagnostic.errorCode);
        return {
            status: 'unavailable',
            reason: `Mapping DSL execution reported ${codes.join(', ')}.`,
        };
    }
    return { status: 'mapped', data: result.output };
}
/**
 * Load before first mount. A later generation may refresh a clean form, but a
 * bubbled form edit permanently protects the mounted engine from late data.
 */
function DefinitionFormDataSlot({ input, initialDataPlan, strings, dataSourceLoader, authorizeDataSource, validateDataSourcePayload, runtimeGeneration, onRuntimeDiagnosticsChange, renderDefinitionForm, semanticOutputScope, }) {
    const [delivery, setDelivery] = useState({
        status: 'loading',
    });
    const dirty = useRef(false);
    const activeGeneration = useRef(runtimeGeneration);
    activeGeneration.current = runtimeGeneration;
    const diagnosticScope = `definition-form-data:${runtimeGeneration}:${input.plan.slotId}`;
    useEffect(() => {
        let current = true;
        const requestedGeneration = runtimeGeneration;
        setDelivery((previous) => previous.status === 'ready' ? previous : { status: 'loading' });
        onRuntimeDiagnosticsChange?.(diagnosticScope, []);
        void loadDefinitionFormInitialData({
            plan: initialDataPlan,
            definition: input.plan.definition,
            definitionRef: input.plan.definitionRef,
            context: {
                surfaceId: input.route.surfaceId,
                surfaceRef: input.route.surfaceRef,
                routeId: input.route.routeId,
                slotId: input.plan.slotId,
                definitionRef: input.plan.definitionRef,
                params: input.route.params,
                sessionGeneration: requestedGeneration,
            },
            loader: dataSourceLoader,
            authorize: authorizeDataSource,
            validatePayload: validateDataSourcePayload,
            map: executeDefinitionFormMapping,
            site: {
                surfaceId: input.route.surfaceId,
                routeId: input.route.routeId,
                slotId: input.plan.slotId,
            },
        }).then((result) => {
            if (!current ||
                activeGeneration.current !== requestedGeneration) {
                return;
            }
            onRuntimeDiagnosticsChange?.(diagnosticScope, result.diagnostics);
            setDelivery((previous) => {
                // A delayed refresh cannot replace a form after the person edits it.
                if (previous.status === 'ready' && dirty.current)
                    return previous;
                if (result.status === 'ready')
                    dirty.current = false;
                return result;
            });
        });
        return () => {
            current = false;
            onRuntimeDiagnosticsChange?.(diagnosticScope, []);
        };
    }, [
        authorizeDataSource,
        dataSourceLoader,
        diagnosticScope,
        initialDataPlan,
        input.plan.definition,
        input.plan.definitionRef,
        input.plan.slotId,
        input.route.params,
        input.route.routeId,
        input.route.surfaceId,
        input.route.surfaceRef,
        onRuntimeDiagnosticsChange,
        runtimeGeneration,
        validateDataSourcePayload,
    ]);
    if (delivery.status === 'loading') {
        return (_jsx("p", { className: "fs-surface-loading", role: "status", "aria-live": "polite", "aria-busy": "true", "data-probe": "definition-form-loading", children: strings('transitionPending') }));
    }
    if (delivery.status === 'unavailable') {
        return (_jsx(UnavailableSlot, { children: strings('slotUnavailableWidgetData') }));
    }
    const initialData = {
        data: delivery.data,
        freshness: delivery.freshness,
        ...(delivery.recordId === undefined
            ? {}
            : { recordId: delivery.recordId }),
        ...(delivery.generation === undefined
            ? {}
            : { generation: delivery.generation }),
        ...(delivery.revision === undefined
            ? {}
            : { revision: delivery.revision }),
    };
    const hydratedInput = {
        ...input,
        initialData,
    };
    return (_jsx("div", { "data-probe": "definition-form-ready", onInputCapture: () => {
            dirty.current = true;
        }, onChangeCapture: () => {
            dirty.current = true;
        }, children: renderDefinitionForm
            ? renderDefinitionForm(hydratedInput)
            : (_jsx(DefaultDefinitionFormSlot, { input: hydratedInput, semanticOutputScope: semanticOutputScope })) }));
}
function DefaultDefinitionFormSlot({ input, semanticOutputScope, }) {
    useSurfaceSemanticOutputs(semanticOutputScope, semanticOutputScope
        ? [{ subjectRef: semanticOutputScope.subjectPrefix }]
        : []);
    return renderDefaultDefinitionForm(input);
}
function DefaultSurfaceDefinitionForm({ plan, grant, initialData, referencesDocuments, responseActionsDocument, semanticControlScope, onDefinitionActionResult, onActionCompleted, responseActionInvoker, }) {
    const engine = useMemo(() => {
        const created = createFormEngine(plan.definition);
        if (initialData) {
            // Before any field component subscribes; keeps every saved repeat row.
            created.loadResponseData(initialData.data);
        }
        return created;
    }, [initialData?.data, plan.definition]);
    useEffect(() => () => engine.dispose(), [engine]);
    // Human help is References-spec resolution alone: this form never renders
    // agent-audience entries or Ontology concepts.
    const references = useMemo(() => referencesDocuments.filter((document) => targetDefinitionMatches(document.targetDefinition, plan.definition)), [plan.definition, referencesDocuments]);
    const resolveFieldHelp = useCallback((path) => {
        try {
            return Object.values(resolveFieldReferences(references, path, 'human')).flatMap((entries) => (entries ?? []).flatMap((reference) => reference.title
                ? [{
                        ...(reference.id ? { id: reference.id } : {}),
                        title: reference.title,
                        ...(reference.description
                            ? { description: reference.description }
                            : {}),
                        ...(typeof reference.content === 'string'
                            ? { content: reference.content }
                            : {}),
                        ...(reference.uri ? { uri: reference.uri } : {}),
                        type: reference.type,
                        needAnchors: (reference['x-generation']?.anchors ?? []).filter((anchor) => /^need:[a-zA-Z][a-zA-Z0-9_-]*@[1-9][0-9]*$/.test(anchor)),
                    }]
                : []));
        }
        catch {
            // An unresolvable `$ref` in any document fails closed to no help.
            return [];
        }
    }, [references]);
    return (_jsx(FormspecForm, { engine: engine, themeDocument: grant.themeDocument, registryEntries: [...plan.registryEntries], resolveFieldHelp: resolveFieldHelp, responseActionsDocument: responseActionsDocument ?? null, responseActionInvoker: responseActionInvoker ?? null, ...(semanticControlScope ? { semanticControlScope } : {}), emitThemeTokens: false, ...(onActionCompleted || onDefinitionActionResult
            ? {
                // `onSubmit` requests the renderer's declared submit control. It is
                // a no-op because durable effects have not reached a terminal yet.
                onSubmit: () => { },
                onActionResult: (result) => {
                    onDefinitionActionResult?.(result);
                    const action = completedFormAction(result);
                    if (action)
                        onActionCompleted?.(action, result);
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
function SurfaceWidgetSlot({ plan, grant, route, strings, dataSourceLoader, authorizeDataSource, validateDataSourcePayload, responseActionsDocuments, transitions, widgetActionExecutor, widgetActionOutcomeStore, widgetActionCoordinator, runtimeGeneration, onWidgetActionReport, onRuntimeDiagnosticsChange, onAdvance, semanticOutputScope, }) {
    const [delivery, setDelivery] = useState(plan.dataInputs.length === 0 ? READY_WITH_NO_DATA : { status: 'loading' });
    const [dataLoadAttempt, setDataLoadAttempt] = useState(0);
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
        dataLoadAttempt,
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
    const emitAction = useCallback((outputName, input) => {
        const refused = () => ({
            started: false,
            completion: Promise.resolve({ status: 'refused' }),
        });
        const declared = plan.actionOutputs.filter((output) => output.name === outputName);
        if (declared.length !== 1) {
            const invocationId = allocateWidgetActionInvocationId();
            reportRefusal(invocationId, outputName, 'WIDGET-ACTION-OUTPUT-UNDECLARED', `Widget "${plan.key.widgetName}" emitted undeclared output "${outputName}".`, {
                moduleId: plan.key.moduleId,
                widgetName: plan.key.widgetName,
                outputName,
                declarationCount: declared.length,
            });
            return refused();
        }
        const inputAdmission = admitSurfaceWidgetActionInput(input);
        if (!inputAdmission.accepted) {
            const invocationId = allocateWidgetActionInvocationId();
            reportRefusal(invocationId, outputName, 'WIDGET-ACTION-INPUT-INVALID', `Widget "${plan.key.widgetName}" emitted invalid structured data for output "${outputName}".`, {
                moduleId: plan.key.moduleId,
                widgetName: plan.key.widgetName,
                outputName,
                reason: inputAdmission.reason,
            });
            return refused();
        }
        const actionRef = declared[0]?.actionRef;
        if (!actionRef) {
            const invocationId = allocateWidgetActionInvocationId();
            reportRefusal(invocationId, outputName, 'WIDGET-ACTION-OUTPUT-UNMAPPED', `Declared widget output "${outputName}" has no Surface action binding.`, {
                moduleId: plan.key.moduleId,
                widgetName: plan.key.widgetName,
                outputName,
            });
            return refused();
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
            return refused();
        }
        if (!widgetActionExecutor) {
            const invocationId = allocateWidgetActionInvocationId();
            onWidgetActionReport?.({
                invocationId,
                actionRef,
                outputName,
                navigation: 'not-attempted',
            });
            return refused();
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
            ...(inputAdmission.input === undefined
                ? {}
                : { input: inputAdmission.input }),
            executor: widgetActionExecutor,
            outcomeStore: widgetActionOutcomeStore,
        });
        if (!emission.started) {
            return {
                started: false,
                completion: emission.completion
                    .then(({ result }) => ({
                    status: activeGeneration.current !== emittedGeneration
                        ? 'obsolete'
                        : completedWidgetAction(result, document)?.id === actionRef
                            ? 'completed'
                            : 'failed',
                }))
                    .catch(() => ({ status: 'failed' })),
            };
        }
        const completion = emission.completion
            .then(({ invocationId, result }) => {
            if (activeGeneration.current !== emittedGeneration) {
                onWidgetActionReport?.({
                    invocationId,
                    actionRef,
                    outputName,
                    result,
                    navigation: 'obsolete-generation',
                });
                return { status: 'obsolete' };
            }
            const action = completedWidgetAction(result, document);
            if (!action || action.id !== actionRef) {
                onWidgetActionReport?.({
                    invocationId,
                    actionRef,
                    outputName,
                    result,
                    navigation: 'none',
                });
                return { status: 'failed' };
            }
            const eligible = transitions.filter((transition) => transition.status === 'supplied-by-slot' &&
                transition.actionId === action.id);
            if (eligible.length > 1) {
                reportRefusal(invocationId, outputName, 'WIDGET-ACTION-TRANSITION-AMBIGUOUS', `Completed widget action "${action.id}" selects more than one eligible transition. Navigation was refused.`, {
                    actionRef,
                    outputName,
                    targets: eligible.map((transition) => transition.to),
                });
                return { status: 'failed' };
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
                return { status: 'completed' };
            }
            const bindingMerge = mergeAppWidgetTransitionBindings(document, inputAdmission.input, result.transitionBindings);
            if (bindingMerge.status === 'conflict') {
                reportRefusal(invocationId, outputName, 'WIDGET-ACTION-TRANSITION-AMBIGUOUS', `Completed widget action "${action.id}" supplies conflicting values for transition binding "${bindingMerge.bindingName}". Navigation was refused.`, {
                    actionRef,
                    outputName,
                    bindingName: bindingMerge.bindingName,
                    sources: ['service-output', 'widget-input'],
                });
                return { status: 'failed' };
            }
            if (navigatedInvocations.current.has(invocationId)) {
                return { status: 'completed' };
            }
            navigatedInvocations.current.add(invocationId);
            const navigation = onAdvance?.(transition, bindingMerge.transitionBindings
                ? { transitionBindings: bindingMerge.transitionBindings }
                : undefined);
            onWidgetActionReport?.({
                invocationId,
                actionRef,
                outputName,
                result,
                navigation: navigation === 'advanced' ? 'advanced' : 'none',
            });
            return { status: 'completed' };
        })
            .catch(() => ({ status: 'failed' }));
        return { started: true, completion };
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
    const retryDataLoad = useCallback(() => {
        setDataLoadAttempt((attempt) => attempt + 1);
    }, []);
    const resolvedActions = plan.actionOutputs.flatMap((output) => output.action === undefined
        ? []
        : [{ outputName: output.name, ...output.action }]);
    const stateView = (state, fallback) => (_jsx(ModuleWidgetStateView, { state: state, config: plan.config ?? {}, headingLevel: plan.headingBaseLevel, actions: resolvedActions, emitAction: emitAction, onRetry: retryDataLoad, fallback: fallback }));
    if (delivery.status === 'loading') {
        return stateView('loading', (_jsx("div", { className: "fs-surface-widget-loading", "data-widget-data": "loading", "aria-busy": "true" })));
    }
    if (delivery.status === 'unavailable') {
        const modes = delivery.failures
            .map((failure) => failure.failureMode)
            .filter((mode) => mode !== undefined);
        const emptyState = delivery.failures.length > 0 &&
            delivery.failures.every((failure) => failure.failureMode === 'empty-state');
        if (emptyState) {
            return stateView('empty', _jsx(WidgetEmptyState, { children: strings('widgetEmpty') }));
        }
        const technicalFailure = delivery.failures.some((failure) => failure.reason === 'load-failed' ||
            failure.reason === 'stale-disallowed' ||
            failure.reason === 'payload-invalid');
        return stateView(technicalFailure ? 'error' : 'unavailable', (_jsx("div", { "data-widget-data": "unavailable", "data-widget-failure-mode": modes.join(' '), children: _jsx(UnavailableSlot, { children: strings('slotUnavailableWidgetData') }) })));
    }
    if (widgetDataMatchesEmptyWhen(plan.config ?? {}, delivery.data)) {
        return stateView('empty', _jsx(WidgetEmptyState, { children: strings('widgetEmpty') }));
    }
    const Widget = plan.resolution.status === 'resolved'
        ? plan.resolution.component
        : undefined;
    if (!Widget) {
        return _jsx(UnavailableSlot, { children: strings('slotUnavailableWidgetData') });
    }
    return (_jsx(Widget, { moduleId: plan.key.moduleId, widgetName: plan.key.widgetName, slot: { id: plan.slotId, title: plan.title }, route: route, headingLevel: plan.headingBaseLevel, config: plan.config ?? {}, data: delivery.data, actions: resolvedActions, emitAction: emitAction, admitsTenantTheme: grant.admitsTenantTheme, semanticOutputScope: semanticOutputScope }));
}
function UnavailableSlot({ children }) {
    return (_jsx("p", { className: "fs-surface-unavailable", role: "status", "data-probe": "slot-unavailable", children: children }));
}
export { nextLevel };
