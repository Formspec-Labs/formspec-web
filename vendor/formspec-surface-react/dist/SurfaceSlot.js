import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { NativeScreenerSlot } from './screener-completion.js';
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
import { currentEffectDataSourcePorts } from './data-source-effect.js';
import { selectDataSourceRevisions } from './data-source-revision.js';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, } from 'react';
import { createFormEngine, createMappingEngine, initFormspecEngineTools, preactReactiveRuntime, resolveResponseActionValidationTuple, responseSubjectId, } from '@formspec-org/engine';
import { FormspecForm } from '@formspec-org/react';
import { resolveFieldReferences, targetDefinitionMatches, } from '@formspec-org/types';
import { canonicalFiniteJson, loadWidgetDataInputs, loadDefinitionFormInitialData, plannedDefinitionFormActionRefs, responseActionsDocumentForDefinition, surfaceDiagnostic, } from '@formspec-org/surface';
import { DraftStart } from './DraftStart.js';
import { DraftDefinitionForm } from './DraftDefinitionForm.js';
import { isPlainLinkClick, withSurfaceQuery } from './browser-location.js';
import { loadDraftReviewInputs } from './draft-review.js';
import { readSubmitEvaluation, summarizeDraftProgress } from './draft-progress.js';
import { Heading, nextLevel } from './heading.js';
import { FilingStatus } from './FilingStatus.js';
import { FormattedReceiptRef, filingStatusLabel } from './receipt-ref.js';
import { routeIdentity } from './widget-api.js';
import { allocateWidgetActionInvocationId, admitSurfaceWidgetActionInput, createWidgetActionCoordinator, responseActionsDocumentForAction, snapshotWidgetResponseContext, normalizeWidgetActionResult, } from './widget-action-runtime.js';
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
/** Successful Response actions follow their resolved Validation Modes policy. */
function completedResponseAction(result) {
    if (result.status !== 'completed')
        return undefined;
    if (!result.resolution.resolved || !result.resolution.action)
        return undefined;
    if (result.detail === null || result.detail === undefined)
        return undefined;
    const action = result.resolution.action;
    let tuple;
    try {
        tuple = resolveResponseActionValidationTuple(action);
    }
    catch {
        return undefined;
    }
    const actual = result.validationTuple;
    if (!actual || actual.profile !== tuple.profile || actual.blocking !== tuple.blocking
        || actual.persistence !== tuple.persistence)
        return undefined;
    const report = result.detail.validationReport;
    if (tuple.profile !== 'off' && typeof report?.valid !== 'boolean')
        return undefined;
    if ((tuple.persistence === 'complete-response' || tuple.blocking === 'block-on-error')
        && report?.valid !== true)
        return undefined;
    return action;
}
/** The completed action whose declared policy permits route advancement. */
export function completedFormAction(result) {
    return completedResponseAction(result);
}
/** App actions need no Response; Response actions follow their resolved policy. */
export function completedWidgetAction(result, document) {
    if (document.scope === 'app') {
        if (result.status !== 'completed')
            return undefined;
        return result.resolution.resolved
            ? result.resolution.action ?? undefined
            : undefined;
    }
    return completedResponseAction(result);
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
export function SurfaceSlot({ plan, filingStatus, grant, route, strings, dataSourceLoader, dataSourceRevision, authorizeDataSource, validateDataSourcePayload, showExperienceNeeds = false, responseActionsDocuments, referencesDocuments, ontologyDocuments, transitions, widgetActionExecutor, widgetActionOutcomeStore, widgetActionCoordinator, runtimeGeneration, onWidgetActionReport, onRuntimeDiagnosticsChange, embedSlotPrefix, onSlotFormEngineChange, onSlotVisibilityChange, overviewDestination, reviewDestination, onSlotDraftAvailabilityChange, renderDefinitionForm, definitionActionInvoker, resolveSemanticControlScope, semanticOutputScope, onDefinitionActionResult, onActionCompleted, onAdvance, onScreenerTarget, checkScreenerTarget, screenerInstanceId, screenerCompletion, localeDocuments, activeLocale, formSession, activeSection, focusField, sectionNavigationActive, }) {
    const reportSectionTitle = formSession?.workspace?.reportSectionTitle;
    const onSectionTitleChange = useCallback((title) => {
        reportSectionTitle?.(plan.slotId, title);
    }, [reportSectionTitle, plan.slotId]);
    const subjectPrefix = surfaceSemanticOutputSubjectRef(route.routeId, plan.slotId);
    const slotSemanticOutputScope = semanticOutputScope && subjectPrefix
        ? { ...semanticOutputScope, subjectPrefix }
        : undefined;
    switch (plan.slotType) {
        case 'draft-start': {
            const start = plan.start;
            const session = formSession?.drafts;
            const navigate = filingStatus?.navigate;
            if (!start || !session?.port.start || !navigate)
                return _jsx(UnavailableSlot, { children: strings('draftUnavailable') });
            const identity = JSON.stringify([runtimeGeneration, route.routeId, plan.slotId, start.destination.routeId,
                start.slotId, start.definitionUrl, start.definitionVersion, start.params, start.subject, session.scope]);
            return _jsx(DraftStart, { plan: start, session: session, navigate: navigate, strings: strings }, identity);
        }
        case 'filing-status':
            return _jsx(FilingStatus, { plan: plan.tracker, context: filingStatus, level: plan.title === undefined ? plan.headingBaseLevel : nextLevel(plan.headingBaseLevel), text: strings });
        case 'screener': {
            if (plan.status !== 'ready' || !plan.screener)
                return _jsx(UnavailableSlot, { children: plan.reason ?? 'screener-unavailable' });
            return _jsx(NativeScreenerSlot, { document: plan.screener.document, screenerRef: { url: plan.screener.ref.url, version: plan.screener.document.version }, allowedTargets: plan.allowedTargets, route: route, slotId: plan.slotId, runtimeGeneration: runtimeGeneration, visitId: screenerInstanceId, policy: screenerCompletion, localeDocuments: localeDocuments, activeLocale: activeLocale, appearance: formSession?.appearance, checkTarget: checkScreenerTarget, navigate: onScreenerTarget }, `${screenerInstanceId ?? runtimeGeneration ?? ''}/${plan.screener.ref.url}/${plan.screener.ref.version}`);
        }
        case 'definition-form': {
            if (plan.status === 'unresolved' || plan.definition === undefined) {
                return _jsx(UnavailableSlot, { children: strings('slotUnavailableDefinitionForm') });
            }
            // Form state belongs to the resolved filing unit, even on the same route and slot.
            const subjectKey = plan.subject && canonicalFiniteJson({
                type: plan.subject.type,
                keys: plan.subject.keys,
            });
            // This annotation is the compile-time cross-package contract: the
            // generated schema document must pass directly into React's engine seam.
            const responseActionsDocument = responseActionsDocumentForDefinition(responseActionsDocuments ?? [], plan.definitionRef);
            // `themeDocument` comes from the route's grant and never from the bundle
            // directly. On a refusing route that object was built from the platform
            // token registry and never saw a tenant token — which is what makes the
            // boundary structural rather than a styling choice.
            const workspace = formSession?.workspace;
            const renderInput = {
                plan: {
                    ...plan,
                    status: 'ready',
                    definition: plan.definition,
                },
                grant,
                route,
                strings,
                responseActionsDocument,
                componentDocument: plan.componentDocument,
                referencesDocuments: referencesDocuments ?? [],
                ontologyDocuments: ontologyDocuments ?? [],
                onDefinitionActionResult,
                onActionCompleted,
                responseActionInvoker: definitionActionInvoker,
                localeDocuments,
                activeLocale,
                onSectionTitleChange,
                ...(sectionNavigationActive && workspace && {
                    activeSection,
                    ...(focusField !== undefined && { focusField }),
                }),
                ...(formSession && {
                    appearance: formSession.appearance,
                    previewScope: formSession.previewScope,
                    draftSession: formSession.drafts,
                    draftStrings: strings,
                    reportSave: formSession.reportSave,
                    overviewDestination: overviewDestination ?? formSession.entryPath,
                    navigate: formSession.navigate ?? filingStatus?.navigate,
                }),
                ...(!formSession && overviewDestination !== undefined && {
                    overviewDestination,
                }),
                ...(filingStatus?.formatHref && { formatHref: filingStatus.formatHref }),
                ...(reviewDestination && { reviewDestination }),
                ...(plan.draftReviewHref !== undefined && { draftReviewDestination: plan.draftReviewHref }),
                ...(onSlotDraftAvailabilityChange && {
                    onDraftAvailabilityChange: (status) => onSlotDraftAvailabilityChange(plan.slotId, status),
                }),
                ...(workspace && {
                    sectionNavigationActive,
                    hrefForSection: section => workspace.hrefForSection(plan.slotId, section),
                    onActiveSectionChange: section => workspace.onActiveSectionChange(plan.slotId, section),
                }),
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
            const slotKey = embedSlotPrefix ? `${embedSlotPrefix}/${plan.slotId}` : plan.slotId;
            const effectiveGeneration = runtimeGeneration ?? `${route.surfaceId}/${route.routeId}`;
            if (plan.initialData && plan.initialData.status !== 'ready') {
                if (!renderInput.draftSession)
                    return _jsx(UnavailableSlot, { children: strings('slotUnavailableWidgetData') });
                return _jsx(DefinitionFormSlot, { input: { ...renderInput, draftSeed: 'unavailable' }, slotKey: slotKey, runtimeGeneration: effectiveGeneration, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, onSlotFormEngineChange: onSlotFormEngineChange, onSlotVisibilityChange: onSlotVisibilityChange, renderDefinitionForm: renderDefinitionForm, semanticOutputScope: slotSemanticOutputScope }, subjectKey);
            }
            if (plan.initialData?.status === 'ready') {
                return (_jsx(DefinitionFormDataSlot, { input: renderInput, slotKey: slotKey, initialDataPlan: plan.initialData, dataSourceLoader: dataSourceLoader, dataSourceRevision: dataSourceRevision, authorizeDataSource: authorizeDataSource, validateDataSourcePayload: validateDataSourcePayload, runtimeGeneration: effectiveGeneration, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, onSlotFormEngineChange: onSlotFormEngineChange, onSlotVisibilityChange: onSlotVisibilityChange, renderDefinitionForm: renderDefinitionForm, semanticOutputScope: slotSemanticOutputScope }, subjectKey));
            }
            return (_jsx(DefinitionFormSlot, { input: renderInput, slotKey: slotKey, runtimeGeneration: effectiveGeneration, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, onSlotFormEngineChange: onSlotFormEngineChange, onSlotVisibilityChange: onSlotVisibilityChange, renderDefinitionForm: renderDefinitionForm, semanticOutputScope: slotSemanticOutputScope }, subjectKey));
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
            return (_jsx(SurfaceWidgetSlot, { plan: plan, grant: grant, route: route, strings: strings, dataSourceLoader: dataSourceLoader, draftSession: plan.draftReview ? formSession?.drafts : undefined, filingStatus: plan.draftReview ? filingStatus : undefined, reportSave: plan.draftReview ? formSession?.reportSave : undefined, localeDocuments: plan.draftReview ? localeDocuments : undefined, activeLocale: plan.draftReview ? activeLocale : undefined, focusAcknowledgement: plan.draftReview ? formSession?.workspace?.focusAcknowledgement : undefined, dataSourceRevision: dataSourceRevision, authorizeDataSource: authorizeDataSource, validateDataSourcePayload: validateDataSourcePayload, responseActionsDocuments: responseActionsDocuments ?? [], transitions: transitions ?? [], widgetActionExecutor: widgetActionExecutor, widgetActionOutcomeStore: widgetActionOutcomeStore, widgetActionCoordinator: widgetActionCoordinator, runtimeGeneration: runtimeGeneration ?? `${route.surfaceId}/${route.routeId}`, onWidgetActionReport: onWidgetActionReport, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, onAdvance: onAdvance, semanticOutputScope: slotSemanticOutputScope }));
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
            return (_jsx("div", { className: "fs-surface-embed", "data-embed-route": plan.routeRef, "data-embed-mode": plan.mode, children: plan.slots.map((child) => (_jsx(SurfaceSlotFrame, { plan: child, filingStatus: filingStatus, grant: grant, route: route, strings: strings, dataSourceLoader: dataSourceLoader, dataSourceRevision: dataSourceRevision, authorizeDataSource: authorizeDataSource, validateDataSourcePayload: validateDataSourcePayload, showExperienceNeeds: showExperienceNeeds, responseActionsDocuments: responseActionsDocuments, referencesDocuments: referencesDocuments, ontologyDocuments: ontologyDocuments, transitions: transitions, widgetActionExecutor: widgetActionExecutor, widgetActionOutcomeStore: widgetActionOutcomeStore, widgetActionCoordinator: widgetActionCoordinator, runtimeGeneration: runtimeGeneration, onWidgetActionReport: onWidgetActionReport, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, embedSlotPrefix: embedSlotPrefix ? `${embedSlotPrefix}/${plan.slotId}` : plan.slotId, onSlotFormEngineChange: onSlotFormEngineChange, onSlotVisibilityChange: onSlotVisibilityChange, overviewDestination: overviewDestination, renderDefinitionForm: renderDefinitionForm, resolveSemanticControlScope: resolveSemanticControlScope, semanticOutputScope: semanticOutputScope, onDefinitionActionResult: onDefinitionActionResult, onActionCompleted: onActionCompleted, screenerCompletion: screenerCompletion, checkScreenerTarget: checkScreenerTarget, onScreenerTarget: onScreenerTarget, screenerInstanceId: screenerInstanceId, localeDocuments: localeDocuments, activeLocale: activeLocale, formSession: formSession && { ...formSession, workspace: undefined }, onAdvance: onAdvance }, child.slotId))) }));
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
export function renderDefaultDefinitionForm(input) {
    return _jsx(DefaultDefinitionFormSlot, { input: input });
}
/**
 * Runs only for a binding that names a Mapping, so only a mapped prefill loads tools WASM
 * (Mapping execution lives there until fs-tco0). A failed load rejects, and the loader reports
 * the slot unavailable instead of dropping the prefill.
 */
async function executeDefinitionFormMapping({ mapping, value, }) {
    await initFormspecEngineTools();
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
function DefinitionFormDataSlot({ input, slotKey, initialDataPlan, dataSourceLoader, dataSourceRevision, authorizeDataSource, validateDataSourcePayload, runtimeGeneration, onRuntimeDiagnosticsChange, onSlotFormEngineChange, onSlotVisibilityChange, renderDefinitionForm, semanticOutputScope, }) {
    const { strings } = input;
    const [delivery, setDelivery] = useState({
        status: 'loading',
    });
    const dirty = useRef(false);
    const activeGeneration = useRef(runtimeGeneration);
    activeGeneration.current = runtimeGeneration;
    const diagnosticScope = `definition-form-data:${runtimeGeneration}:${input.plan.slotId}`;
    const sourceRevisions = selectDataSourceRevisions([{
            descriptor: initialDataPlan.descriptor,
            context: { surfaceId: input.route.surfaceId, surfaceRef: input.route.surfaceRef,
                routeId: input.route.routeId, slotId: input.plan.slotId,
                definitionRef: input.plan.definitionRef, params: input.route.params, subject: input.plan.subject,
                sessionGeneration: runtimeGeneration },
        }], dataSourceRevision);
    useEffect(() => {
        let current = true;
        const requestedGeneration = runtimeGeneration;
        setDelivery((previous) => previous.status === 'ready' ? previous : { status: 'loading' });
        onRuntimeDiagnosticsChange?.(diagnosticScope, []);
        if (sourceRevisions.failures[0]) {
            const diagnostic = surfaceDiagnostic('DEFINITION-FORM-DATA-UNAVAILABLE', 'The host could not select an initial-data revision.', { surfaceId: input.route.surfaceId, routeId: input.route.routeId, slotId: input.plan.slotId }, { catalogRef: sourceRevisions.failures[0].descriptor.catalogRef,
                sourceRef: sourceRevisions.failures[0].descriptor.sourceRef });
            onRuntimeDiagnosticsChange?.(diagnosticScope, [diagnostic]);
            setDelivery(previous => previous.status === 'ready' && dirty.current ? previous
                : { status: 'unavailable', reason: 'unavailable', diagnostics: [diagnostic] });
            return () => { current = false; onRuntimeDiagnosticsChange?.(diagnosticScope, []); };
        }
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
                subject: input.plan.subject,
                sessionGeneration: requestedGeneration,
            },
            ...currentEffectDataSourcePorts(() => current, {
                loader: dataSourceLoader,
                authorize: authorizeDataSource,
                validatePayload: validateDataSourcePayload,
            }),
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
        sourceRevisions.key,
        diagnosticScope,
        initialDataPlan,
        input.plan.definition,
        input.plan.definitionRef,
        input.plan.slotId,
        input.plan.subject,
        input.route.params,
        input.route.routeId,
        input.route.surfaceId,
        input.route.surfaceRef,
        onRuntimeDiagnosticsChange,
        runtimeGeneration,
        validateDataSourcePayload,
    ]);
    if (!input.draftSession) {
        if (delivery.status === 'loading') {
            return _jsx(DefinitionFormLoading, { children: strings('transitionPending') });
        }
        if (delivery.status === 'unavailable') {
            return _jsx(UnavailableSlot, { children: strings('slotUnavailableWidgetData') });
        }
    }
    const hydratedInput = delivery.status === 'ready' ? {
        ...input,
        initialData: {
            ...(delivery.data === undefined ? {} : { data: delivery.data }),
            ...(delivery.selection === undefined ? {} : { selection: delivery.selection }),
            freshness: delivery.freshness,
            ...(delivery.recordId === undefined ? {} : { recordId: delivery.recordId }),
            ...(delivery.generation === undefined ? {} : { generation: delivery.generation }),
            ...(delivery.revision === undefined ? {} : { revision: delivery.revision }),
        },
    } : { ...input, draftSeed: delivery.status };
    return (_jsx("div", { "data-probe": "definition-form-ready", onInputCapture: () => {
            dirty.current = true;
        }, onChangeCapture: () => {
            dirty.current = true;
        }, children: _jsx(DefinitionFormSlot, { input: hydratedInput, slotKey: slotKey, runtimeGeneration: runtimeGeneration, onRuntimeDiagnosticsChange: onRuntimeDiagnosticsChange, onSlotFormEngineChange: onSlotFormEngineChange, onSlotVisibilityChange: onSlotVisibilityChange, renderDefinitionForm: renderDefinitionForm, semanticOutputScope: semanticOutputScope }) }));
}
function DefinitionFormLoading({ children }) {
    return (_jsx("p", { className: "fs-surface-loading", role: "status", "aria-live": "polite", "aria-busy": "true", "data-probe": "definition-form-loading", children: children }));
}
function DefinitionFormSlot({ input, slotKey, runtimeGeneration, onRuntimeDiagnosticsChange, onSlotFormEngineChange, onSlotVisibilityChange, renderDefinitionForm, semanticOutputScope, }) {
    const { plan: { subject }, strings } = input;
    const actionDiagnosticScope = `definition-form-actions:${input.route.surfaceId}/${input.route.routeId}/${slotKey}`;
    const reportedFindings = useRef(new Map());
    const previousScope = useRef(undefined);
    const scopeToken = `${runtimeGeneration}:${actionDiagnosticScope}`;
    if (previousScope.current?.token !== scopeToken
        || previousScope.current?.actions !== input.responseActionsDocument) {
        previousScope.current = { token: scopeToken, actions: input.responseActionsDocument };
        reportedFindings.current.clear();
    }
    useEffect(() => {
        const findings = reportedFindings.current;
        return () => {
            findings.clear();
            onRuntimeDiagnosticsChange?.(actionDiagnosticScope, []);
        };
    }, [actionDiagnosticScope, onRuntimeDiagnosticsChange, runtimeGeneration, input.responseActionsDocument]);
    const handleActionFinding = useCallback((finding) => {
        const key = `${finding.code}:${finding.reason ?? ''}:${finding.target}:${finding.nodeId ?? ''}`;
        if (reportedFindings.current.has(key))
            return;
        reportedFindings.current.set(key, surfaceDiagnostic('BUNDLE-DOCUMENT-SHAPE', `Response Actions finding on slot "${input.plan.slotId}": ${finding.reason ?? finding.code} (${finding.target}).`, {
            surfaceId: input.route.surfaceId,
            routeId: input.route.routeId,
            slotId: input.plan.slotId,
        }, {
            code: finding.code,
            kind: finding.kind,
            target: finding.target,
            ...(finding.reason ? { reason: finding.reason } : {}),
            ...(finding.nodeId ? { nodeId: finding.nodeId } : {}),
        }));
        onRuntimeDiagnosticsChange?.(actionDiagnosticScope, [...reportedFindings.current.values()]);
    }, [actionDiagnosticScope, input.plan.slotId, input.route.routeId, input.route.surfaceId, onRuntimeDiagnosticsChange]);
    // Runtime WASM hashes the keys for hosts that key drafts before an engine exists; the engine derives its own.
    const responseSubject = useMemo(() => {
        if (!subject)
            return undefined;
        try {
            return { ...subject, id: responseSubjectId(subject.type, subject.keys) };
        }
        catch {
            return undefined;
        }
    }, [subject]);
    if (subject && !responseSubject) {
        return _jsx(UnavailableSlot, { children: strings('slotUnavailableWidgetData') });
    }
    const resolvedInput = {
        ...input,
        responseSubject,
        onActionFinding: handleActionFinding,
    };
    return renderDefinitionForm
        ? renderDefinitionForm(resolvedInput)
        : (_jsx(DefaultDefinitionFormSlot, { input: resolvedInput, slotKey: slotKey, onSlotFormEngineChange: onSlotFormEngineChange, onSlotVisibilityChange: onSlotVisibilityChange, semanticOutputScope: semanticOutputScope }));
}
function DefaultDefinitionFormSlot({ input, slotKey = input.plan.slotId, onSlotFormEngineChange, onSlotVisibilityChange, semanticOutputScope, }) {
    if (input.draftSession) {
        const key = JSON.stringify([input.plan.definition.url, input.plan.definition.version,
            input.plan.subject?.type, input.plan.subject?.keys]);
        return _jsx(DraftDefinitionForm, { input: input, session: input.draftSession, children: (engine, writer) => _jsx(DefaultSurfaceDefinitionForm, { ...input, slotKey: slotKey, onSlotFormEngineChange: onSlotFormEngineChange, onSlotVisibilityChange: onSlotVisibilityChange, draftEngine: engine, draftWriter: writer, semanticOutputScope: semanticOutputScope }) }, key);
    }
    return (_jsx(DefaultSurfaceDefinitionForm, { ...input, slotKey: slotKey, onSlotFormEngineChange: onSlotFormEngineChange, onSlotVisibilityChange: onSlotVisibilityChange, semanticOutputScope: semanticOutputScope }));
}
function effectiveStyleValue(element, property, camelProp, computed) {
    const computedValue = (computed?.getPropertyValue(property)
        || computed?.[camelProp]
        || '').trim().toLowerCase();
    if (computedValue)
        return computedValue;
    return (element.style.getPropertyValue(property)
        || element.style[camelProp]
        || '').trim().toLowerCase();
}
function hasHiddenContentVisibility(element, computed) {
    return effectiveStyleValue(element, 'content-visibility', 'contentVisibility', computed) === 'hidden';
}
function matchesModalDialog(element) {
    if (element.tagName !== 'DIALOG' || !element.open)
        return false;
    if (typeof element.matches === 'function') {
        try {
            return element.matches(':modal');
        }
        catch {
            return false;
        }
    }
    return false;
}
function isEffectivelyDisabled(element) {
    if (element.disabled)
        return true;
    if (element.getAttribute('aria-disabled') === 'true')
        return true;
    if (typeof element.matches === 'function') {
        try {
            if (element.matches(':disabled'))
                return true;
        }
        catch {
            // Ignore selector engines without :disabled support.
        }
    }
    for (let current = element.parentElement; current; current = current.parentElement) {
        if (current.tagName === 'FIELDSET' && current.disabled) {
            const firstLegend = Array.from(current.children).find((child) => child.tagName === 'LEGEND');
            if (!firstLegend || !firstLegend.contains(element))
                return true;
        }
    }
    return false;
}
function isElementReachable(element, root, visiting = new Set()) {
    if (visiting.has(element))
        return false;
    visiting.add(element);
    const view = element.ownerDocument.defaultView;
    const elementComputed = view?.getComputedStyle(element);
    const computedVisibility = effectiveStyleValue(element, 'visibility', 'visibility', elementComputed);
    if (computedVisibility === 'hidden' || computedVisibility === 'collapse') {
        return false;
    }
    const computedElementInteractivity = (elementComputed?.getPropertyValue('interactivity')
        || elementComputed?.interactivity
        || '').trim().toLowerCase();
    if (computedElementInteractivity === 'inert') {
        return false;
    }
    let current = element;
    let insideForm = true;
    let passedOpenModalDialog = false;
    while (current) {
        if (current === root) {
            insideForm = false;
        }
        const computedStyle = view?.getComputedStyle(current);
        if (!passedOpenModalDialog) {
            if (current.inert || current.hasAttribute('inert')) {
                return false;
            }
            if (effectiveStyleValue(current, 'interactivity', 'interactivity', computedStyle) === 'inert') {
                return false;
            }
        }
        if (insideForm && current !== element) {
            if (current.tagName === 'DIALOG' && !current.open) {
                if (current.hidden
                    || current.style.display.trim().toLowerCase() === 'none'
                    || hasHiddenContentVisibility(current, computedStyle)) {
                    return false;
                }
                const trigger = current.previousElementSibling;
                if (trigger instanceof HTMLElement
                    && trigger.tagName === 'BUTTON'
                    && trigger.classList.contains('formspec-modal-trigger')
                    && !isEffectivelyDisabled(trigger)) {
                    return isElementReachable(trigger, root, visiting);
                }
                return false;
            }
            if (current.classList.contains('formspec-popover-content') && current.hidden) {
                if (current.style.display.trim().toLowerCase() === 'none'
                    || hasHiddenContentVisibility(current, computedStyle)) {
                    return false;
                }
                const trigger = current.previousElementSibling;
                if (trigger instanceof HTMLElement
                    && trigger.tagName === 'BUTTON'
                    && trigger.classList.contains('formspec-popover-trigger')
                    && !isEffectivelyDisabled(trigger)) {
                    return isElementReachable(trigger, root, visiting);
                }
                return false;
            }
            if (current.getAttribute('role') === 'tabpanel' && current.hidden) {
                if (current.style.display.trim().toLowerCase() === 'none'
                    || hasHiddenContentVisibility(current, computedStyle)) {
                    return false;
                }
                const tabId = current.getAttribute('aria-labelledby');
                const tab = tabId
                    ? [...root.querySelectorAll('[role="tab"]')].find((candidate) => candidate.id === tabId) ?? null
                    : null;
                if (tab instanceof HTMLElement
                    && !isEffectivelyDisabled(tab)
                    && isElementReachable(tab, root, visiting)) {
                    current = current.parentElement;
                    continue;
                }
                return false;
            }
            if (current.classList.contains('formspec-wizard-panel') && current.hidden) {
                if (current.style.display.trim().toLowerCase() === 'none'
                    || hasHiddenContentVisibility(current, computedStyle)) {
                    return false;
                }
                current = current.parentElement;
                continue;
            }
        }
        if (current.hidden)
            return false;
        if (effectiveStyleValue(current, 'display', 'display', computedStyle) === 'none')
            return false;
        if (hasHiddenContentVisibility(current, computedStyle))
            return false;
        if (matchesModalDialog(current)) {
            passedOpenModalDialog = true;
        }
        current = current.parentElement;
    }
    return true;
}
function collectMountedReachableActionRefs(root) {
    const refs = new Set();
    for (const button of root.querySelectorAll('button[data-action-ref]')) {
        const actionRef = button.dataset.actionRef;
        if (!actionRef || isEffectivelyDisabled(button))
            continue;
        if (isElementReachable(button, root)) {
            refs.add(actionRef);
        }
    }
    return refs;
}
function DefaultSurfaceDefinitionForm(input) {
    const { plan, grant, strings, initialData, referencesDocuments, responseActionsDocument, semanticControlScope, onDefinitionActionResult, onActionFinding, onActionCompleted, responseActionInvoker, componentDocument, localeDocuments, activeLocale, appearance, responseSubject, slotKey, onSlotFormEngineChange, onSlotVisibilityChange, draftEngine, draftWriter, semanticOutputScope, activeSection, focusField, sectionNavigationActive, hrefForSection, onActiveSectionChange, onSectionTitleChange, } = input;
    // The engine derives its id from type and keys, so those, not a renderer-supplied id, key it.
    const subjectIdentity = JSON.stringify([responseSubject?.type, responseSubject?.keys]);
    const engine = useMemo(() => {
        if (draftEngine)
            return draftEngine;
        try {
            const created = createFormEngine(plan.definition, {
                ...(responseSubject && { responseSubject }),
                ...(initialData?.data !== undefined && {
                    responseData: initialData.data,
                }),
            });
            if (created.hasSubjectRefusal()) {
                created.dispose();
                return undefined;
            }
            return created;
        }
        catch (error) {
            console.warn('Formspec Surface could not create the form engine.', error);
            return undefined;
        }
    }, [draftEngine, initialData?.data, plan.definition, subjectIdentity]);
    useEffect(() => () => { if (!draftEngine)
        engine?.dispose(); }, [draftEngine, engine]);
    const formVisit = useRef(undefined);
    const visit = useMemo(() => ({}), [engine]);
    useLayoutEffect(() => {
        formVisit.current = visit;
        return () => { formVisit.current = undefined; };
    }, [visit]);
    useLayoutEffect(() => {
        if (!engine)
            return;
        for (const locale of localeDocuments ?? []) {
            if (locale.target.kind === 'definition' && targetDefinitionMatches(locale.target, plan.definition)) {
                engine.loadLocale(locale);
            }
        }
        if (activeLocale !== undefined)
            engine.setLocale(activeLocale);
    }, [engine, localeDocuments, activeLocale, plan.definition]);
    useLayoutEffect(() => {
        if (!engine || !onSlotFormEngineChange)
            return;
        onSlotFormEngineChange(slotKey, engine);
        return () => {
            onSlotFormEngineChange(slotKey, undefined);
        };
    }, [engine, onSlotFormEngineChange, slotKey]);
    const formRootRef = useRef(null);
    useLayoutEffect(() => {
        if (!engine || !onSlotVisibilityChange)
            return;
        const root = formRootRef.current;
        if (!root)
            return;
        const matchesMinWidth = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? (minWidth) => window.matchMedia(`(min-width: ${minWidth}px)`).matches
            : undefined;
        const baselineKey = [...plannedDefinitionFormActionRefs(plan.definition, componentDocument, responseActionsDocument, {
                themeDocument: grant.themeDocument,
                ...(matchesMinWidth ? { matchesMinWidth } : {}),
            })].sort().join('\0');
        let disposed = false;
        const measure = () => {
            if (disposed || !formRootRef.current)
                return;
            onSlotVisibilityChange(slotKey, collectMountedReachableActionRefs(formRootRef.current), baselineKey);
        };
        measure();
        const collectAncestors = (node) => {
            const list = [];
            for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
                list.push(ancestor);
            }
            return list;
        };
        const sameAncestors = (a, b) => a.length === b.length && a.every((el, idx) => el === b[idx]);
        let rootObserver;
        let ancestorObserver;
        let reconnectObserver;
        let observedAncestors = [];
        const ancestorAttributeFilter = ['open', 'hidden', 'style', 'class', 'disabled', 'aria-disabled', 'inert'];
        const stopReconnectObserver = () => {
            reconnectObserver?.disconnect();
            reconnectObserver = undefined;
        };
        const syncAncestorObserver = () => {
            if (disposed || typeof MutationObserver !== 'function')
                return;
            if (!root.isConnected) {
                ancestorObserver?.disconnect();
                ancestorObserver = undefined;
                observedAncestors = [];
                if (!reconnectObserver) {
                    const docRoot = root.ownerDocument.documentElement;
                    if (docRoot) {
                        const nextReconnect = new MutationObserver(() => {
                            if (!disposed && root.isConnected) {
                                stopReconnectObserver();
                                syncAncestorObserver();
                                measure();
                            }
                        });
                        nextReconnect.observe(docRoot, { childList: true, subtree: true });
                        reconnectObserver = nextReconnect;
                    }
                }
                return;
            }
            stopReconnectObserver();
            const nextAncestors = collectAncestors(root);
            if (ancestorObserver && sameAncestors(observedAncestors, nextAncestors)) {
                return;
            }
            ancestorObserver?.disconnect();
            ancestorObserver = undefined;
            observedAncestors = nextAncestors;
            if (nextAncestors.length === 0)
                return;
            const nextObserver = new MutationObserver(() => {
                syncAncestorObserver();
                measure();
            });
            for (const ancestor of nextAncestors) {
                nextObserver.observe(ancestor, {
                    attributes: true,
                    childList: true,
                    attributeFilter: ancestorAttributeFilter,
                });
            }
            ancestorObserver = nextObserver;
        };
        if (typeof MutationObserver === 'function') {
            rootObserver = new MutationObserver(() => {
                syncAncestorObserver();
                measure();
            });
            rootObserver.observe(root, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ['open', 'hidden', 'style', 'class', 'disabled', 'aria-disabled', 'inert', 'data-action-ref'],
            });
            syncAncestorObserver();
        }
        const onDialogClose = () => measure();
        root.addEventListener('close', onDialogClose, true);
        const view = root.ownerDocument.defaultView;
        const onViewportResize = () => measure();
        view?.addEventListener('resize', onViewportResize);
        const stopReactive = preactReactiveRuntime.effect(() => {
            engine.getEvaluatedFormState({ profile: 'off' });
            queueMicrotask(measure);
        });
        return () => {
            disposed = true;
            rootObserver?.disconnect();
            ancestorObserver?.disconnect();
            stopReconnectObserver();
            root.removeEventListener('close', onDialogClose, true);
            view?.removeEventListener('resize', onViewportResize);
            stopReactive();
        };
    }, [
        engine,
        onSlotVisibilityChange,
        slotKey,
        plan.definition,
        componentDocument,
        responseActionsDocument,
        grant.themeDocument,
    ]);
    useLayoutEffect(() => () => {
        onSlotVisibilityChange?.(slotKey, undefined, '');
    }, [onSlotVisibilityChange, slotKey]);
    const renderedScope = engine ? semanticOutputScope : undefined;
    useSurfaceSemanticOutputs(renderedScope, renderedScope ? [{ subjectRef: renderedScope.subjectPrefix }] : []);
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
    const [actionBanner, setActionBanner] = useState(undefined);
    const bannerRef = useRef(null);
    useEffect(() => {
        setActionBanner(undefined);
    }, [engine]);
    useEffect(() => {
        if (!actionBanner || !bannerRef.current)
            return;
        bannerRef.current.focus({ preventScroll: false });
        if (typeof bannerRef.current.scrollIntoView === 'function') {
            bannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [actionBanner]);
    // An owed group acknowledgement is accepted on the draft review route; the Findings margin links there.
    const { draftReviewDestination, formatHref, navigate } = input;
    const acknowledgementLink = useMemo(() => draftReviewDestination === undefined ? undefined : (code) => {
        const destination = withSurfaceQuery(draftReviewDestination, 'acknowledge', code);
        const href = formatHref ? formatHref(destination) : destination;
        return href === undefined ? undefined : { href, ...(navigate && { navigate: () => { void navigate(destination); } }) };
    }, [draftReviewDestination, formatHref, navigate]);
    const lastHandledActionResultRef = useRef(undefined);
    const handleActionOutcome = useCallback((result) => {
        if (!engine || lastHandledActionResultRef.current === result)
            return;
        lastHandledActionResultRef.current = result;
        if (result.resolution.action?.intent === 'autosave')
            return;
        if (result.status === 'blocked') {
            const progress = summarizeDraftProgress([], readSubmitEvaluation(engine));
            const errors = progress.form.toFix ?? 0;
            const warnings = progress.form.toCheck ?? 0;
            const missing = progress.form.missing;
            const parts = [];
            if (missing > 0)
                parts.push(`${missing} required ${missing === 1 ? 'question' : 'questions'} unanswered`);
            if (errors > 0)
                parts.push(`${errors} ${errors === 1 ? 'error' : 'errors'} to fix`);
            if (warnings > 0)
                parts.push(`${warnings} ${warnings === 1 ? 'warning' : 'warnings'} to review`);
            const detail = parts.length > 0
                ? `Cannot submit yet: ${parts.join(', ')}. Use the Findings list to jump directly to each item.`
                : 'Cannot submit yet: please review the highlighted items before submitting.';
            setActionBanner({ kind: 'blocked', errors, warnings, missing, detail });
            return;
        }
        if (result.status === 'failed') {
            setActionBanner({
                kind: 'failed',
                detail: result.failureReason || 'This action could not be completed. Please try again.',
            });
            return;
        }
        if (result.status === 'completed') {
            const isSubmitAction = result.validationTuple?.persistence === 'complete-response'
                || result.resolution.action?.intent === 'submit'
                || Boolean(result.detail?.previewFiling);
            if (isSubmitAction) {
                const previewFiling = result.detail?.previewFiling;
                setActionBanner({
                    kind: 'submitted',
                    ...(previewFiling?.receiptRef ? { receiptRef: previewFiling.receiptRef } : {}),
                    ...(previewFiling?.label ? { label: previewFiling.label } : {}),
                });
                input.reportSave?.('submitted');
            }
            else {
                setActionBanner(undefined);
            }
        }
    }, [engine, input.reportSave]);
    if (!engine) {
        return _jsx(UnavailableSlot, { children: strings('slotUnavailableWidgetData') });
    }
    const reviewDest = input.reviewDestination;
    const reviewHref = reviewDest !== undefined
        ? (input.formatHref ? input.formatHref(reviewDest) : reviewDest)
        : undefined;
    const overviewDest = input.overviewDestination;
    const overviewHref = overviewDest !== undefined
        ? (input.formatHref ? input.formatHref(overviewDest) : overviewDest)
        : undefined;
    return (_jsxs("div", { ref: formRootRef, style: { display: 'contents' }, children: [_jsx(FormspecForm, { ...(appearance && { className: `formspec-appearance-${appearance}` }), engine: engine, ...('activeSection' in input && { activeSection }), ...(focusField !== undefined && { focusField }), onActiveSectionChange: onActiveSectionChange, sectionNavigationActive: sectionNavigationActive, hrefForSection: hrefForSection, acknowledgementLink: acknowledgementLink, onSectionTitleChange: onSectionTitleChange, componentDocument: componentDocument, themeDocument: grant.themeDocument, registryEntries: [...plan.registryEntries], resolveFieldHelp: resolveFieldHelp, responseActionsDocument: responseActionsDocument ?? null, ...(onActionFinding ? { onActionFinding } : {}), responseActionInvoker: draftWriter
                    ? input => draftWriter.invoke(input, { invoker: responseActionInvoker, current: () => formVisit.current === visit })
                    : responseActionInvoker ?? null, draftSaveFeedback: draftWriter ? 'external' : undefined, ...(semanticControlScope ? { semanticControlScope } : {}), emitThemeTokens: false, ...(onActionCompleted || onDefinitionActionResult
                    ? {
                        // `onSubmit` requests the renderer's declared submit control. It is
                        // a no-op because durable effects have not reached a terminal yet.
                        onSubmit: () => { },
                        onActionResult: (result) => {
                            handleActionOutcome(result);
                            onDefinitionActionResult?.(result);
                        },
                        ...(onActionCompleted
                            ? {
                                onControlActionResult: (result) => {
                                    handleActionOutcome(result);
                                    const action = completedFormAction(result);
                                    if (action)
                                        onActionCompleted(action, result);
                                },
                            }
                            : {}),
                    }
                    : {}) }), actionBanner && (_jsx("div", { ref: bannerRef, tabIndex: -1, role: actionBanner.kind === 'submitted' ? 'status' : 'alert', className: `fs-surface-action-banner fs-surface-action-banner--${actionBanner.kind}`, "data-action-banner": actionBanner.kind, children: actionBanner.kind === 'submitted' ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "fs-surface-action-banner__title", children: "Submitted" }), _jsxs("p", { className: "fs-surface-action-banner__detail", children: ["Your submission has been recorded.", actionBanner.label ? ` (${actionBanner.label})` : ''] }), actionBanner.receiptRef && (_jsxs("p", { className: "fs-surface-filing__meta", "data-receipt-ref": "", children: ["Receipt reference: ", _jsx(FormattedReceiptRef, { reference: actionBanner.receiptRef })] })), (reviewHref || overviewHref) && (_jsxs("div", { className: "fs-surface-action-banner__actions", children: [reviewDest && reviewHref && (_jsx("a", { className: "fs-surface-action-link fs-surface-action-link--primary", href: reviewHref, onClick: event => {
                                        if (!input.navigate || !isPlainLinkClick(event))
                                            return;
                                        event.preventDefault();
                                        void input.navigate(reviewDest);
                                    }, children: "Review submitted answers" })), overviewDest && overviewHref && (_jsx("a", { className: "fs-surface-action-link fs-surface-action-link--secondary", href: overviewHref, onClick: event => {
                                        if (!input.navigate || !isPlainLinkClick(event))
                                            return;
                                        event.preventDefault();
                                        void input.navigate(overviewDest);
                                    }, children: "Return to overview" }))] }))] })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: "fs-surface-action-banner__title", children: actionBanner.kind === 'blocked' ? 'Submission blocked' : 'Action failed' }), _jsx("p", { className: "fs-surface-action-banner__detail", children: actionBanner.detail })] })) }))] }));
}
const EMPTY_WIDGET_DATA = Object.freeze({});
const READY_WITH_NO_DATA = {
    status: 'ready',
    data: EMPTY_WIDGET_DATA,
    degradedInputs: [],
    diagnostics: [],
};
function SurfaceWidgetSlot({ plan, grant, route, strings, dataSourceLoader, draftSession, filingStatus, reportSave, localeDocuments, activeLocale, focusAcknowledgement, dataSourceRevision, authorizeDataSource, validateDataSourcePayload, responseActionsDocuments, transitions, widgetActionExecutor, widgetActionOutcomeStore, widgetActionCoordinator, runtimeGeneration, onWidgetActionReport, onRuntimeDiagnosticsChange, onAdvance, semanticOutputScope, }) {
    const draftVisit = useMemo(() => plan.draftReview ? {} : undefined, [plan.draftReview, draftSession, runtimeGeneration, localeDocuments, activeLocale]);
    const [settled, setSettled] = useState({
        draftVisit, delivery: plan.dataInputs.length === 0 && !plan.draftReview ? READY_WITH_NO_DATA : { status: 'loading' },
    });
    const delivery = settled.draftVisit === draftVisit ? settled.delivery : { status: 'loading' };
    const [dataLoadAttempt, setDataLoadAttempt] = useState(0);
    const responseContexts = useRef(undefined);
    const activeGeneration = useRef(runtimeGeneration);
    activeGeneration.current = runtimeGeneration;
    useEffect(() => {
        activeGeneration.current = runtimeGeneration;
        return () => {
            // A disposed widget cannot advance the host after its pending terminal arrives.
            if (activeGeneration.current === runtimeGeneration)
                activeGeneration.current = undefined;
        };
    }, [runtimeGeneration]);
    const localActionCoordinator = useRef(createWidgetActionCoordinator());
    const actionCoordinator = widgetActionCoordinator ?? localActionCoordinator.current;
    const navigatedInvocations = useRef(new Set());
    const dataDiagnosticScope = `widget-data:${runtimeGeneration}:${plan.slotId}`;
    const sourceRevisions = selectDataSourceRevisions(plan.dataInputs.flatMap(input => input.status === 'ready' ? [{ descriptor: input.descriptor,
            context: { surfaceId: route.surfaceId, surfaceRef: route.surfaceRef,
                routeId: route.routeId, slotId: plan.slotId, moduleId: plan.key.moduleId,
                widgetName: plan.key.widgetName, params: route.params,
                sessionGeneration: runtimeGeneration } }] : []), dataSourceRevision);
    useEffect(() => {
        let current = true;
        const controller = new AbortController();
        const setDelivery = (delivery) => setSettled({ draftVisit, delivery });
        responseContexts.current = undefined;
        if (plan.dataInputs.length > 0 || plan.draftReview)
            setDelivery({ status: 'loading' });
        onRuntimeDiagnosticsChange?.(dataDiagnosticScope, []);
        const site = { surfaceId: route.surfaceId, routeId: route.routeId, slotId: plan.slotId };
        const load = plan.draftReview ? loadDraftReviewInputs(plan.draftReview, {
            session: draftSession, site, signal: controller.signal, localeDocuments, activeLocale,
        }) : loadWidgetDataInputs({
            inputs: plan.dataInputs.map(input => input.status === 'ready'
                && sourceRevisions.failures.some(failure => failure.descriptor.catalogRef === input.descriptor.catalogRef
                    && failure.descriptor.sourceRef === input.descriptor.sourceRef)
                ? { ...input, status: 'unavailable',
                    reason: `The host could not select a revision for ${input.descriptor.catalogRef} ${input.descriptor.sourceRef}.` }
                : input),
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
            ...currentEffectDataSourcePorts(() => current, {
                loader: dataSourceLoader,
                authorize: authorizeDataSource,
                validatePayload: validateDataSourcePayload,
            }),
            site,
        });
        void load.then(async (result) => {
            if (!current)
                return;
            if (result.status === 'ready') {
                const contexts = new Map();
                try {
                    for (const output of plan.actionOutputs) {
                        const subject = output.responseContext;
                        if (!subject)
                            continue;
                        const captured = snapshotWidgetResponseContext({
                            inputName: subject.inputName,
                            source: { catalogRef: subject.descriptor.catalogRef, sourceRef: subject.descriptor.sourceRef },
                            definition: subject.definition,
                            response: result.data[subject.inputName],
                        });
                        if (!validateDataSourcePayload || !(await validateDataSourcePayload({
                            descriptor: subject.descriptor,
                            context: { surfaceId: route.surfaceId, surfaceRef: route.surfaceRef,
                                routeId: route.routeId, slotId: plan.slotId, moduleId: plan.key.moduleId,
                                widgetName: plan.key.widgetName, params: route.params, sessionGeneration: runtimeGeneration },
                            schema: subject.descriptor.source.schema, value: captured.response,
                        })).valid)
                            throw new TypeError('The immutable Response subject failed canonical validation');
                        contexts.set(output.name, captured);
                    }
                    if (!current)
                        return;
                    responseContexts.current = { generation: runtimeGeneration, values: contexts };
                }
                catch {
                    if (!current)
                        return;
                    const diagnostic = surfaceDiagnostic('WIDGET-DATA-REQUIRED-UNAVAILABLE', 'The qualified Response action subject could not be admitted.', { surfaceId: route.surfaceId, routeId: route.routeId, slotId: plan.slotId });
                    setDelivery({ status: 'unavailable', failures: [{ inputName: 'responseInput', required: true,
                                reason: 'payload-invalid', message: diagnostic.message }], diagnostics: [diagnostic] });
                    onRuntimeDiagnosticsChange?.(dataDiagnosticScope, [diagnostic]);
                    return;
                }
            }
            setDelivery(result);
            onRuntimeDiagnosticsChange?.(dataDiagnosticScope, result.diagnostics);
        });
        return () => {
            current = false;
            controller.abort();
            onRuntimeDiagnosticsChange?.(dataDiagnosticScope, []);
        };
    }, [
        authorizeDataSource,
        dataDiagnosticScope,
        dataSourceLoader,
        draftSession,
        draftVisit,
        localeDocuments,
        activeLocale,
        sourceRevisions.key,
        onRuntimeDiagnosticsChange,
        plan.dataInputs,
        plan.draftReview,
        plan.actionOutputs,
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
        const responseContext = responseContexts.current?.generation === runtimeGeneration
            ? responseContexts.current.values.get(outputName) : undefined;
        const document = declared[0]?.action ? responseActionsDocumentForAction(responseActionsDocuments, actionRef, responseContext) : undefined;
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
        // Hosts admit an emission by exact source identity; the route's presented
        // title is localized text, so it stays out of the source.
        const source = {
            moduleId: plan.key.moduleId,
            widgetName: plan.key.widgetName,
            slotId: plan.slotId,
            route: routeIdentity(route),
            outputName,
        };
        const emittedGeneration = runtimeGeneration;
        const emission = actionCoordinator.emit({
            generation: emittedGeneration,
            document,
            actionRef,
            source,
            ...(responseContext ? { responseContext } : {}),
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
                            : unknownCompletion(result) ? 'outcome-unknown' : 'failed',
                }))
                    .catch(() => ({ status: 'failed' })),
            };
        }
        const completion = emission.completion
            .then(async ({ invocationId, result }) => {
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
                return { status: unknownCompletion(result) ? 'outcome-unknown' : 'failed' };
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
            const navigation = await onAdvance?.(transition, bindingMerge.transitionBindings
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
        const reviewBackDest = plan.draftReview?.status === 'ready' ? plan.draftReview.formHref : undefined;
        const reviewBackHref = reviewBackDest !== undefined
            ? (filingStatus?.formatHref ? filingStatus.formatHref(reviewBackDest) : reviewBackDest)
            : undefined;
        return stateView(technicalFailure ? 'error' : 'unavailable', (_jsxs("div", { "data-widget-data": "unavailable", "data-draft-review-reason": 'draftReviewReason' in delivery ? delivery.draftReviewReason : undefined, "data-widget-failure-mode": modes.join(' '), children: [_jsx(UnavailableSlot, { children: strings('slotUnavailableWidgetData') }), reviewBackDest && reviewBackHref && 'draftReviewReason' in delivery && delivery.draftReviewReason === 'absent' && (_jsx("div", { className: "fs-surface-prerequisite-notice__actions", children: _jsx("a", { className: "fs-surface-action-link fs-surface-action-link--secondary", href: reviewBackHref, onClick: event => {
                            if (!filingStatus?.navigate || !isPlainLinkClick(event))
                                return;
                            event.preventDefault();
                            void filingStatus.navigate(reviewBackDest);
                        }, children: "Back to form" }) }))] })));
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
    const draftReviewReady = plan.draftReview?.status === 'ready' && 'warningGroups' in delivery
        ? { plan: plan.draftReview, delivery }
        : undefined;
    const reviewFiling = draftReviewReady?.delivery.filing;
    const reviewValidation = draftReviewReady?.delivery.validationSummary;
    const reviewFormDest = draftReviewReady?.plan.formHref;
    const reviewFormHref = reviewFormDest !== undefined
        ? (filingStatus?.formatHref ? filingStatus.formatHref(reviewFormDest) : reviewFormDest)
        : undefined;
    const validationParts = [];
    if (reviewValidation) {
        if (reviewValidation.missing > 0) {
            validationParts.push(`${reviewValidation.missing} required ${reviewValidation.missing === 1 ? 'question' : 'questions'} unanswered`);
        }
        if (reviewValidation.toFix > 0) {
            validationParts.push(`${reviewValidation.toFix} ${reviewValidation.toFix === 1 ? 'error' : 'errors'} to fix`);
        }
        if (reviewValidation.toCheck > 0) {
            validationParts.push(`${reviewValidation.toCheck} ${reviewValidation.toCheck === 1 ? 'warning' : 'warnings'} to review`);
        }
    }
    return (_jsxs(_Fragment, { children: [reviewFiling && (_jsxs("section", { className: "fs-surface-filing-banner", "data-filing-status": reviewFiling.status, role: "region", "aria-label": filingStatusLabel(reviewFiling.status, strings), children: [_jsxs("div", { className: "fs-surface-filing-banner__header", children: [_jsx("span", { className: "fs-surface-filing__badge", "data-filing-status": reviewFiling.status, children: filingStatusLabel(reviewFiling.status, strings) }), _jsx("p", { className: "fs-surface-filing-banner__lead", children: draftReviewReady?.delivery.isFiledRecord
                                    ? 'Showing the submitted answers on file.'
                                    : 'Showing your in-progress revision alongside the previous decision.' })] }), _jsxs("p", { className: "fs-surface-filing__meta", "data-receipt-ref": "", children: ["Receipt reference: ", _jsx(FormattedReceiptRef, { reference: reviewFiling.receiptRef })] }), reviewFiling.comments.map((comment, index) => (_jsx("p", { className: "fs-surface-filing__comment", children: comment }, index)))] })), validationParts.length > 0 && (_jsxs("section", { className: "fs-surface-review-validation", role: "region", "aria-label": "Items needing attention", children: [_jsxs("p", { className: "fs-surface-review-validation__summary", children: ["Before submitting: ", validationParts.join(', '), "."] }), reviewFormDest && reviewFormHref && (_jsx("a", { className: "fs-surface-action-link fs-surface-action-link--secondary", href: reviewFormHref, onClick: event => {
                            if (!filingStatus?.navigate || !isPlainLinkClick(event))
                                return;
                            event.preventDefault();
                            void filingStatus.navigate(reviewFormDest);
                        }, children: "Back to form" }))] })), _jsx(Widget, { moduleId: plan.key.moduleId, widgetName: plan.key.widgetName, slot: { id: plan.slotId, title: plan.title }, route: route, headingLevel: plan.headingBaseLevel, config: plan.config ?? {}, data: delivery.data, actions: resolvedActions, emitAction: emitAction, admitsTenantTheme: grant.admitsTenantTheme, semanticOutputScope: semanticOutputScope }), draftReviewReady && draftReviewReady.delivery.warningGroups.length > 0 && draftSession && (_jsx(DraftReviewWarningAcknowledgements, { plan: draftReviewReady.plan, delivery: draftReviewReady.delivery, draftSession: draftSession, filingStatus: filingStatus, reportSave: reportSave, focusAcknowledgement: focusAcknowledgement, onSaved: retryDataLoad }))] }));
}
function DraftReviewWarningAcknowledgements({ plan, delivery, draftSession, filingStatus, reportSave, focusAcknowledgement, onSaved, }) {
    const [savingCode, setSavingCode] = useState(null);
    // Arriving by a Findings link, focus moves on from the route heading to the control that accepts the group,
    // once. With nothing to accept yet it stays on the heading; it is never taken from a control chosen meanwhile.
    const focused = useRef(undefined);
    const accept = useRef(new Map());
    useEffect(() => {
        if (!focusAcknowledgement || focused.current === focusAcknowledgement)
            return;
        const button = accept.current.get(focusAcknowledgement);
        if (!button || button.disabled)
            return;
        focused.current = focusAcknowledgement;
        if (focusIsTheShells(button.ownerDocument))
            button.focus();
    }, [focusAcknowledgement, delivery]);
    const sections = useMemo(() => (plan.sections ?? []).map(sec => ({
        ...(sec.id === undefined ? {} : { id: sec.id }),
        fields: [...sec.fields],
        fieldTemplates: [...sec.fields],
        nodes: [],
        groups: [],
    })), [plan.sections]);
    const acknowledge = async (code, expectedBasis) => {
        if (savingCode !== null)
            return;
        setSavingCode(code);
        try {
            const outcome = await draftSession.acknowledgeWarningGroup({
                definition: plan.definition,
                subject: plan.subject,
                expectedRevision: delivery.revision,
                expectedBasis,
                code,
                sections,
                report: reportSave,
            });
            if (outcome === 'saved' || outcome === 'mismatch')
                onSaved();
        }
        finally {
            setSavingCode(null);
        }
    };
    return (_jsx(_Fragment, { children: delivery.warningGroups.map(group => (_jsxs("fieldset", { className: "fs-surface-review-ack formspec-warning-explanation formspec-warning-acknowledgement", "data-explanation-code": group.code, children: [_jsx("legend", { className: "fs-surface-review-ack__legend", children: group.legend }), _jsxs("div", { className: "fs-surface-review-ack__body", children: [_jsx("ul", { children: group.items.map(item => {
                                const destination = item.jumpHref ?? undefined;
                                const href = destination !== undefined
                                    ? (filingStatus?.formatHref ? filingStatus.formatHref(destination) : destination)
                                    : undefined;
                                return (_jsx("li", { children: destination && href ? (_jsx("a", { href: href, onClick: event => {
                                            if (!filingStatus?.navigate || !isPlainLinkClick(event))
                                                return;
                                            event.preventDefault();
                                            void filingStatus.navigate(destination);
                                        }, children: item.label })) : (_jsx("span", { children: item.label })) }, item.path));
                            }) }), group.addedText && _jsx("p", { className: "formspec-warning-acknowledgement-added", children: group.addedText }), group.removedText && _jsx("p", { className: "formspec-warning-acknowledgement-removed", children: group.removedText }), _jsx("button", { ref: button => {
                                if (button)
                                    accept.current.set(group.code, button);
                                else
                                    accept.current.delete(group.code);
                            }, type: "button", className: "fs-surface-review-ack__button", disabled: group.current || savingCode !== null, onClick: () => void acknowledge(group.code, group.basis ?? ''), children: group.buttonLabel })] })] }, group.code))) }));
}
/** Focus the shell placed on arrival (the route heading or main landmark), or none: not the respondent's choice. */
function focusIsTheShells(document) {
    const active = document.activeElement;
    return !active || active === document.body
        || active.matches('main, .fs-surface-route__title, h1, [role="heading"][aria-level="1"]');
}
function UnavailableSlot({ children }) {
    return (_jsx("p", { className: "fs-surface-unavailable", role: "status", "data-probe": "slot-unavailable", children: children }));
}
/** Forward one closed uncertainty classification; never expose arbitrary failure text. */
function unknownCompletion(result) {
    const invocation = normalizeWidgetActionResult(result);
    return invocation.status === 'failed' && invocation.failureReason === 'completion-outcome-unknown';
}
export { nextLevel };
