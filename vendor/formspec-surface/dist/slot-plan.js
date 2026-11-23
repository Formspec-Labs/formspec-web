/**
 * @filedesc Slot dispatch — the only place in the stack where a `slotType`
 * becomes something renderable.
 *
 * The taxonomy is closed and shipped (ADR 0150 §6.2), enforced by the schema, by
 * `formspec-lint`, and by the app-graph validator. Until the surface-render-v10
 * spike, **no runtime anywhere read it** (gap ledger `slot-dispatch`).
 *
 * Two shapes make this worth owning centrally rather than re-writing per host:
 *
 * 1. **It is exhaustive, and the compiler holds it.** The switch has no
 *    `default` arm and ends in a `never` check, so a sixth slot type — which
 *    lands through the Registry's `slot-type` contribution category, not through
 *    a schema edit — breaks the build HERE, at the decision site. That is the
 *    same discipline `ROUTE_CLASS_THEME_AUTHORITY` uses.
 * 2. **It plans, it does not render.** A `SlotPlan` is data: a React binding, a
 *    web-component binding, and a server-side pre-renderer all consume the same
 *    plan. Putting the dispatch in one renderer means every other renderer
 *    writes it again and disagrees with the last one.
 *
 * `embed-route` is planned here too, recursively, because it is a composition
 * primitive and leaving it out means the closed taxonomy is not actually closed
 * over. Two properties it must have, both taken from how
 * `ui-graph-policy.ts`'s `widgetBindingsRenderedBy` walks the same edges:
 *
 * - **The host's theme grant carries down every embed edge.** An embedded route
 *   paints on the host's surface (ADR 0150 §6.2), so an embedded `intake` route
 *   inside a `proof` route does NOT get to restore tenant branding. The plan
 *   therefore never re-resolves a grant for embedded content.
 * - **Cycles terminate.** `routeRef` is constrained to a route id, not to an
 *   acyclic graph, so `a` embedding `b` embedding `a` is authorable. The visited
 *   set is a termination requirement, not an optimisation.
 */
import { admitScreenerPresentation } from './screener-slot.js';
import { targetDefinitionMatches } from '@formspec-org/types';
import { parseRouteSubjectKey, resolveDraftReviewTarget, widgetActionScopeMatches } from '@formspec-org/app-graph';
import { surfaceDiagnostic } from './diagnostics.js';
import { resolvePageSequence } from '@formspec-org/layout';
import { formHref, matchRoute, routeHref } from './composition.js';
import { planDraftStart } from './draft-start.js';
import { planFilingStatus } from './filing-status.js';
import { planExperienceUnit, } from './experience-unit.js';
import { planStaticContent, } from './static-content.js';
import { findUniquePlainAction, isStrictPlainRecord, ownDataPropertyValue, } from './transitions.js';
import { dataSourceAvailableToWidget, resolveDataSourceDescriptor, } from './data-source-loader.js';
import { generationNeedAnchors } from './need-trace.js';
import { planDefinitionFormInitialData, } from './definition-form-initial-data.js';
const KNOWN_SLOT_TYPES = {
    'screener': true,
    'filing-status': true,
    'draft-start': true,
    'definition-form': true,
    'experience-unit': true,
    'module-widget': true,
    'static-content': true,
    'embed-route': true,
};
function isTrackerBand(slot, handle) {
    return handle.surface.$formspecSurface === '0.4' && slot.slotType === 'filing-status'
        && ownRecord(slot, 'binding')?.placement === 'band';
}
export function planRoute(context) {
    const diagnostics = [];
    const base = context.headingBaseLevel ?? 2;
    const visited = new Set([context.handle.routeId]);
    const slots = context.handle.route.slots.filter(slot => !isTrackerBand(slot, context.handle)).map(slot => planSlot(slot, context, base, visited, diagnostics));
    const bands = context.handle.surface.routes.flatMap(route => route.slots.filter(slot => isTrackerBand(slot, context.handle)).flatMap(slot => {
        const planned = planSlot(slot, context, base, visited, diagnostics, route);
        return planned.slotType === 'filing-status' ? [{ routeId: route.id, slot: planned }] : [];
    }));
    return { handle: context.handle, slots, bands, diagnostics };
}
function planSlot(slot, context, headingBaseLevel, visitedRoutes, diagnostics, bindingRoute = context.handle.route) {
    const site = {
        surfaceId: context.handle.surfaceId,
        routeId: context.handle.routeId,
        slotId: slot.id,
    };
    const shared = {
        slotId: slot.id,
        needAnchors: generationNeedAnchors(slot),
        headingBaseLevel,
    };
    if (typeof slot.title === 'string')
        shared.title = slot.title;
    if (typeof slot.position === 'string')
        shared.position = slot.position;
    const binding = (slot.binding ?? {});
    const authoredSlotType = slot.slotType;
    if (typeof authoredSlotType !== 'string' ||
        !Object.prototype.hasOwnProperty.call(KNOWN_SLOT_TYPES, authoredSlotType)) {
        diagnostics.push(surfaceDiagnostic('SLOT-TYPE-UNKNOWN', `Slot "${slot.id}" declares slotType ${JSON.stringify(authoredSlotType)}, which this Surface runtime does not recognize. The slot is unavailable.`, site, { slotType: authoredSlotType }));
        return { ...shared, slotType: 'unknown', authoredSlotType };
    }
    switch (slot.slotType) {
        case 'screener': {
            const matches = (context.screenerHandles ?? []).filter(h => h.ref.url === binding.screenerRef);
            const handle = matches.length === 1 ? matches[0] : undefined;
            const allowedTargets = Array.isArray(binding.allowedTargets) && binding.allowedTargets.every(t => typeof t === 'string') ? binding.allowedTargets : [];
            const authored = new Set(handle?.document.evaluation?.flatMap(p => p.routes.map(r => r.target)) ?? []);
            const admission = handle ? admitScreenerPresentation(handle.document) : undefined;
            const reason = context.handle.surface.$formspecSurface !== '0.3' && context.handle.surface.$formspecSurface !== '0.4' ? 'surface-version-unsupported'
                : !handle || !handle.ref.version || handle.document.url !== handle.ref.url || handle.document.version !== handle.ref.version ? 'screener-pin-unresolved'
                    : admission?.status !== 'ready' ? admission?.reason ?? 'presentation-unsupported'
                        : !allowedTargets.length || new Set(allowedTargets).size !== allowedTargets.length || allowedTargets.some(t => !t.startsWith('surface:') || !authored.has(t)) ? 'allowed-target-invalid' : undefined;
            if (reason)
                diagnostics.push(surfaceDiagnostic('SLOT-BINDING-INCOMPLETE', 'The native Screener slot is unavailable.', site, { reason }));
            return { ...shared, slotType: 'screener', ...(handle ? { screener: handle } : {}), allowedTargets, status: reason ? 'unresolved' : 'ready', ...(reason ? { reason } : {}) };
        }
        case 'draft-start': {
            const start = context.filingStatus && planDraftStart(context.filingStatus.app, context.handle, bindingRoute, binding, context.definitions, context.params ?? {});
            if (!start)
                diagnostics.push(surfaceDiagnostic('SLOT-BINDING-INCOMPLETE', 'The new draft target or its parent parameters are unavailable.', site));
            return { ...shared, slotType: 'draft-start', start };
        }
        case 'filing-status': {
            const tracker = context.filingStatus ? planFilingStatus({
                ...context.filingStatus,
                slotId: slot.id,
                dataSources: context.dataSources,
                handle: context.handle,
                bindingRoute,
                binding,
                params: context.params ?? {},
                definitions: context.definitions,
                resolveSubject: resolveFormSubject,
                resolveDefinitionComponent: context.resolveDefinitionComponent,
                surfaceRef: context.surfaceRef,
            }) : { status: 'unresolved', reason: 'route-table-unavailable' };
            if (tracker.status === 'unresolved')
                diagnostics.push(surfaceDiagnostic('SLOT-BINDING-INCOMPLETE', 'The filing tracker cannot resolve its form links.', site, { reason: tracker.reason }));
            else if (tracker.status === 'ready')
                for (const group of tracker.groups)
                    for (const row of group.rows) {
                        if (row.status === 'disabled')
                            diagnostics.push(surfaceDiagnostic('SLOT-BINDING-INCOMPLETE', 'A filing tracker form is unavailable.', site, { reason: row.reason, entry: row.key }));
                    }
            return { ...shared, slotType: 'filing-status', tracker };
        }
        case 'definition-form': {
            const definitionRef = typeof binding.definitionRef === 'string' ? binding.definitionRef : '';
            if (definitionRef === '') {
                diagnostics.push(surfaceDiagnostic('SLOT-BINDING-INCOMPLETE', 'A definition-form slot names no Definition, so there is no form to show.', site));
            }
            const definition = context.definitions.get(definitionRef);
            if (definitionRef !== '' && definition === undefined) {
                diagnostics.push(surfaceDiagnostic('BUNDLE-DOCUMENT-MISSING', `A form on this page points at "${definitionRef}", which this release does not contain.`, { ...site, source: definitionRef }));
            }
            const plan = {
                ...shared,
                slotType: 'definition-form',
                definitionRef,
                registryEntries: context.registryEntries,
                status: definition === undefined ? 'unresolved' : 'ready',
            };
            if (typeof binding.presentation === 'string')
                plan.presentation = binding.presentation;
            if (definition !== undefined) {
                const subject = resolveFormSubject(definition, binding, bindingRoute, context.params ?? {});
                if (subject === false) {
                    diagnostics.push(surfaceDiagnostic('SLOT-BINDING-INCOMPLETE', 'The form cannot open because its filing-unit keys do not match the route parameters.', site, { reason: 'subject-keys-invalid' }));
                    return { ...plan, status: 'unresolved' };
                }
                plan.definition = definition;
                const component = context.resolveDefinitionComponent?.({
                    surfaceRef: context.surfaceRef, routeId: bindingRoute.id, slotId: slot.id, definition,
                });
                if (component)
                    plan.componentDocument = component;
                if (subject)
                    plan.subject = subject;
                const draftReviewHref = context.filingStatus && planDraftReviewHref(context, context.filingStatus.app, bindingRoute.id, slot.id, site, diagnostics);
                if (draftReviewHref !== undefined)
                    plan.draftReviewHref = draftReviewHref;
                if (binding.initialData !== undefined) {
                    const initialData = planDefinitionFormInitialData({
                        binding: binding.initialData,
                        definition,
                        definitionRef,
                        catalogs: context.dataSources ?? [],
                        mappings: context.mappings ?? [],
                        context: {
                            surfaceRef: context.surfaceRef,
                            routeId: context.handle.routeId,
                            slotId: slot.id,
                        },
                    });
                    plan.initialData = initialData;
                    if (initialData.status !== 'ready') {
                        diagnostics.push(surfaceDiagnostic('DEFINITION-FORM-DATA-UNAVAILABLE', `The form in slot "${slot.id}" cannot resolve its initial data: ${initialData.reason}`, site, { reason: initialData.status }));
                    }
                }
            }
            return plan;
        }
        case 'experience-unit': {
            const unitRef = typeof binding.unitRef === 'string' ? binding.unitRef : '';
            const unit = planExperienceUnit({
                unitRef,
                experienceRef: typeof binding.experienceRef === 'string' ? binding.experienceRef : undefined,
                experiences: context.experiences,
                experienceHandles: context.experienceHandles,
            });
            if (unitRef === '') {
                diagnostics.push(surfaceDiagnostic('SLOT-BINDING-INCOMPLETE', 'An experience-unit slot names no unit, so there is nothing to resolve.', site));
            }
            if (unit.status === 'unresolved') {
                // An intra-document miss, NOT a missing document. Reusing
                // `BUNDLE-DOCUMENT-MISSING` here left a host unable to tell an absent
                // Experience document from a present one that has no such unit — two
                // different repairs by two different people. One defect, one code
                // (surface-shell-spec §7.2).
                diagnostics.push(surfaceDiagnostic('EXPERIENCE-UNIT-UNRESOLVED', `This page refers to a step called "${unitRef}", which no Experience document in this release declares.`, site, { unitRef, experienceRef: binding.experienceRef }));
            }
            return { ...shared, slotType: 'experience-unit', unit };
        }
        case 'module-widget': {
            const key = {
                moduleId: typeof binding.moduleId === 'string' ? binding.moduleId : '',
                widgetName: typeof binding.widgetName === 'string' ? binding.widgetName : '',
            };
            const resolution = context.widgets.resolve(key);
            const diagnostic = context.widgets.diagnose(key, resolution, site);
            if (diagnostic)
                diagnostics.push(diagnostic);
            const widgetShape = resolvedWidgetShape(resolution);
            const declaredInputs = Array.isArray(widgetShape?.dataInputs)
                ? widgetShape.dataInputs
                : [];
            const declaredOutputs = Array.isArray(widgetShape?.actionOutputs)
                ? widgetShape.actionOutputs
                : [];
            const dataBindings = ownRecord(binding, 'dataBindings');
            const actionBindings = ownRecord(binding, 'actionBindings');
            const draftReview = Object.hasOwn(binding, 'draftReview')
                ? planDraftReview(context, binding, widgetShape) : undefined;
            const dataInputs = (draftReview ? [] : declaredInputs).map((declared) => {
                const authored = ownRecord(dataBindings, declared.name);
                if (!authored) {
                    return {
                        name: declared.name,
                        required: declared.required,
                        status: 'unbound',
                        reason: 'the Surface binding does not map this declared input',
                    };
                }
                const catalogRef = ownString(authored, 'catalogRef');
                const sourceRef = ownString(authored, 'sourceRef');
                if (catalogRef === undefined || sourceRef === undefined) {
                    return {
                        name: declared.name,
                        required: declared.required,
                        status: 'unresolved',
                        reason: 'the Surface binding does not contain a qualified catalog/source pair',
                    };
                }
                const descriptor = resolveDataSourceDescriptor(context.dataSources ?? [], { catalogRef, sourceRef });
                if (!descriptor) {
                    return {
                        name: declared.name,
                        required: declared.required,
                        status: 'unresolved',
                        reason: `the exact source (${catalogRef}, ${sourceRef}) is not loaded once`,
                    };
                }
                const available = dataSourceAvailableToWidget(descriptor, {
                    surfaceId: context.handle.surfaceId,
                    surfaceRef: context.surfaceRef,
                    routeId: context.handle.routeId,
                    slotId: slot.id,
                    moduleId: key.moduleId,
                    widgetName: key.widgetName,
                    params: {},
                });
                if (!available) {
                    return {
                        name: declared.name,
                        required: declared.required,
                        status: 'unavailable',
                        reason: 'the source availability selector does not cover this widget',
                        descriptor,
                    };
                }
                return {
                    name: declared.name,
                    required: declared.required,
                    status: 'ready',
                    descriptor,
                };
            });
            for (const input of dataInputs) {
                if (input.required && input.status !== 'ready') {
                    diagnostics.push(surfaceDiagnostic('WIDGET-DATA-REQUIRED-UNAVAILABLE', `Required widget input "${input.name}" is unavailable: ${input.reason}.`, site, {
                        moduleId: key.moduleId,
                        widgetName: key.widgetName,
                        inputName: input.name,
                        status: input.status,
                    }));
                }
            }
            const actionOutputs = declaredOutputs.map((declared) => {
                const authored = ownRecord(actionBindings, declared.name);
                const actionRef = authored ? ownString(authored, 'actionRef') : undefined;
                const responseInput = authored && Object.prototype.hasOwnProperty.call(authored, 'responseInput')
                    ? authored.responseInput : undefined;
                const resolved = actionRef === undefined
                    ? undefined
                    : resolveWidgetAction(context.responseActions ?? [], actionRef, responseInput, dataInputs, context.definitions);
                return {
                    name: declared.name,
                    ...(actionRef !== undefined ? { actionRef } : {}),
                    ...(resolved !== undefined ? { action: resolved.action } : {}),
                    ...(resolved?.responseContext ? { responseContext: resolved.responseContext } : {}),
                };
            });
            const plan = {
                ...shared,
                slotType: 'module-widget',
                key,
                dataInputs,
                ...(draftReview && { draftReview }),
                actionOutputs,
                resolution,
            };
            // Configuration stays separate from the qualified runtime input channel.
            // It is passed intact after E604 authoring validation.
            const config = ownRecord(binding, 'config');
            if (config) {
                plan.config = config;
            }
            return plan;
        }
        case 'static-content': {
            const result = planStaticContent({
                binding,
                headingBaseLevel,
                staticAssetResolver: context.staticAssetResolver,
                site,
            });
            diagnostics.push(...result.diagnostics);
            const contentNeedAnchors = generationNeedAnchors(binding);
            return {
                ...shared,
                slotType: 'static-content',
                content: result.plan,
                ...(contentNeedAnchors.length > 0 ? { contentNeedAnchors } : {}),
            };
        }
        case 'embed-route': {
            const routeRef = typeof binding.routeRef === 'string' ? binding.routeRef : '';
            const plan = {
                ...shared,
                slotType: 'embed-route',
                routeRef,
                slots: [],
                status: 'unresolved',
            };
            if (typeof binding.mode === 'string')
                plan.mode = binding.mode;
            if (visitedRoutes.has(routeRef)) {
                diagnostics.push(surfaceDiagnostic('EMBED-ROUTE-CYCLE', `Route "${routeRef}" embeds itself, directly or through another route. The repeat is not rendered.`, site, { routeRef, chain: [...visitedRoutes] }));
                return { ...plan, status: 'cycle' };
            }
            const embeddedMatches = context.handle.surface.routes.filter((route) => route.id === routeRef);
            if (embeddedMatches.length > 1) {
                diagnostics.push(surfaceDiagnostic('ROUTE-HANDLE-AMBIGUOUS', `Route handle "${context.handle.surfaceId}/${routeRef}" names more than one route. The embedded route is unavailable.`, site, { routeRef, paths: embeddedMatches.map((route) => route.path) }));
                return plan;
            }
            const embedded = embeddedMatches[0];
            if (!embedded) {
                diagnostics.push(surfaceDiagnostic('EMBED-ROUTE-UNRESOLVED', `A part of this page embeds route "${routeRef}", which this Surface does not declare.`, site, { routeRef }));
                return plan;
            }
            // The host's grant carries down: nothing re-resolves theme authority for
            // embedded content, so an embedded route cannot restore branding the host
            // route refuses. Heading base drops one level so the embedded content
            // never outranks its host.
            const nested = new Set([...visitedRoutes, routeRef]);
            const nestedBase = Math.min(headingBaseLevel + 1, 6);
            const supplied = ownRecord(binding, 'params') ?? {};
            const params = [];
            for (const [target, source] of Object.entries(supplied)) {
                const value = typeof source === 'string' ? ownString(context.params ?? {}, source) : undefined;
                if (value !== undefined)
                    params.push([target, value]);
            }
            const childContext = { ...context, params: Object.fromEntries(params) };
            const slots = embedded.slots.filter(slot => !isTrackerBand(slot, context.handle)).map((child) => planSlot(child, childContext, nestedBase, nested, diagnostics, embedded));
            return { ...plan, slots, status: 'ready' };
        }
    }
    // No `default` arm, deliberately. A sixth slot type must break the build here
    // rather than fall through to a shrug at runtime.
    return exhaustive(slot.slotType);
}
function exhaustive(value) {
    throw new Error(`Unhandled slot type: ${String(value)}`);
}
function resolveWidgetAction(documents, actionRef, responseInput, inputs, definitions) {
    const match = findUniquePlainAction(documents, actionRef);
    if (!match)
        return undefined;
    const selectedInputs = inputs.filter((input) => input.name === responseInput);
    const selected = selectedInputs.length === 1 ? selectedInputs[0] : undefined;
    const descriptor = selected?.status === 'ready' ? selected.descriptor : undefined;
    const targetProp = ownDataPropertyValue(match.document, 'targetDefinition');
    const target = isStrictPlainRecord(targetProp.value) ? targetProp.value : undefined;
    const targetUrlProp = target ? ownDataPropertyValue(target, 'url') : undefined;
    const targetCompatProp = target ? ownDataPropertyValue(target, 'compatibleVersions') : undefined;
    const targetPin = targetUrlProp?.present && typeof targetUrlProp.value === 'string'
        ? {
            url: targetUrlProp.value,
            ...(targetCompatProp?.present && typeof targetCompatProp.value === 'string' && targetCompatProp.value.length > 0
                ? { compatibleVersions: targetCompatProp.value }
                : {}),
        }
        : undefined;
    const candidates = [...definitions.values()].filter((definition) => targetDefinitionMatches(targetPin, definition));
    const definition = candidates.length === 1 ? candidates[0] : undefined;
    if (!widgetActionScopeMatches({ document: match.document, responseInput, inputs,
        sourceSchema: descriptor?.source.schema, definition }))
        return undefined;
    const scopeProp = ownDataPropertyValue(match.document, 'scope');
    const responseContext = scopeProp.value === 'app' ? undefined
        : descriptor && definition && typeof responseInput === 'string' ? { inputName: responseInput, descriptor, definition } : undefined;
    if (scopeProp.value !== 'app' && !responseContext)
        return undefined;
    const { action } = match;
    const intentProp = ownDataPropertyValue(action, 'intent');
    if (!intentProp.present || typeof intentProp.value !== 'string')
        return undefined;
    const labelProp = ownDataPropertyValue(action, 'label');
    const labelRecord = isStrictPlainRecord(labelProp.value) ? labelProp.value : undefined;
    const literalProp = labelRecord ? ownDataPropertyValue(labelRecord, 'literal') : undefined;
    const refProp = labelRecord ? ownDataPropertyValue(labelRecord, 'ref') : undefined;
    const literal = literalProp?.present && typeof literalProp.value === 'string' && literalProp.value.length > 0
        ? literalProp.value
        : undefined;
    const ref = refProp?.present && typeof refProp.value === 'string' && refProp.value.length > 0
        ? refProp.value
        : undefined;
    const label = literal !== undefined && ref === undefined
        ? { literal }
        : ref !== undefined && literal === undefined
            ? { ref }
            : undefined;
    const needAnchors = generationNeedAnchors(action);
    const metadata = {
        actionRef,
        intent: intentProp.value,
        ...(label !== undefined ? { label } : {}),
        ...(needAnchors.length > 0 ? { needAnchors } : {}),
    };
    return { action: metadata, ...(responseContext ? { responseContext } : {}) };
}
function planDraftReview(context, binding, widgetShape) {
    const target = resolveDraftReviewTarget(context.handle.surface, context.handle.route, binding, widgetShape);
    if (target.status === 'unresolved')
        return target;
    const definition = context.definitions.get(target.definitionRef);
    if (!definition)
        return { status: 'unresolved', reason: 'form-unresolved' };
    const subject = resolveFormSubject(definition, target.formBinding, context.handle.route, context.params ?? {});
    if (subject === false)
        return { status: 'unresolved', reason: 'subject-keys-invalid' };
    let targetFormHref;
    let sections;
    if (context.filingStatus) {
        const review = ownRecord(binding, 'draftReview');
        const routeRef = review && ownString(review, 'routeRef');
        const slotRef = review && ownString(review, 'slotRef');
        const destination = routeRef
            ? context.filingStatus.app.routes.find(candidate => candidate.surface === context.handle.surface && candidate.routeId === routeRef)
            : undefined;
        if (destination && slotRef) {
            const link = routeHref(destination, context.params ?? {});
            if (!link.refusal && matchRoute(context.filingStatus.app, link.href).match?.handle === destination) {
                const theme = context.filingStatus.themeAuthority.grantFor(destination.route, {
                    surfaceId: destination.surfaceId,
                    routeId: destination.routeId,
                }).themeDocument;
                const component = context.resolveDefinitionComponent?.({
                    surfaceRef: context.surfaceRef,
                    routeId: destination.routeId,
                    slotId: slotRef,
                    definition,
                });
                const sequence = resolvePageSequence(definition, {
                    ...(theme ? { theme } : {}),
                    ...(component ? { component } : {}),
                });
                targetFormHref = formHref(link.href, slotRef);
                sections = sequence.map(({ id, fields }) => ({
                    ...(id === undefined ? {} : { id }),
                    fields,
                    href: formHref(link.href, slotRef, id),
                }));
            }
        }
    }
    return {
        status: 'ready',
        definition,
        ...(subject && { subject }),
        ...(targetFormHref !== undefined && { formHref: targetFormHref }),
        ...(sections !== undefined && { sections }),
    };
}
function resolvedWidgetShape(resolution) {
    return resolution.status !== 'undeclared' ? resolution.entry?.widgetShape : undefined;
}
/**
 * The reverse of a draft review's `formHref`: the one review route whose own binding resolves to this form
 * slot. Two or more would make the link a guess, so the slot binding is reported incomplete instead.
 */
function planDraftReviewHref(context, app, routeId, slotId, site, diagnostics) {
    const reviews = app.routes.filter(candidate => candidate.surface === context.handle.surface &&
        (candidate.route.slots ?? []).some(reviewSlot => {
            if (reviewSlot.slotType !== 'module-widget')
                return false;
            const binding = (reviewSlot.binding ?? {});
            const review = ownRecord(binding, 'draftReview');
            if (!review || ownString(review, 'routeRef') !== routeId || ownString(review, 'slotRef') !== slotId)
                return false;
            const key = { moduleId: ownString(binding, 'moduleId') ?? '', widgetName: ownString(binding, 'widgetName') ?? '' };
            const widgetShape = resolvedWidgetShape(context.widgets.resolve(key));
            return resolveDraftReviewTarget(candidate.surface, candidate.route, binding, widgetShape).status === 'ready';
        }));
    if (reviews.length > 1) {
        diagnostics.push(surfaceDiagnostic('SLOT-BINDING-INCOMPLETE', 'More than one review route reviews this form, so its Findings cannot link to one.', site, { reason: 'draft-review-ambiguous', routes: reviews.map(candidate => candidate.routeId) }));
        return undefined;
    }
    const [review] = reviews;
    if (!review)
        return undefined;
    const link = routeHref(review, context.params ?? {});
    return !link.refusal && matchRoute(app, link.href).match?.handle === review ? link.href : undefined;
}
function resolveFormSubject(definition, binding, route, params) {
    const hasBinding = Object.hasOwn(binding, 'subjectKeys');
    if (definition.subject === undefined)
        return hasBinding ? false : undefined;
    const declared = ownRecord(definition, 'subject');
    const declaredKeys = ownRecord(declared, 'keys');
    const type = declared && ownString(declared, 'type');
    if (!declaredKeys || !type)
        return false;
    const mapping = ownRecord(binding, 'subjectKeys');
    if (hasBinding && mapping === undefined)
        return false;
    const entries = Object.keys(declaredKeys);
    if (Object.keys(mapping ?? {}).length !== entries.length)
        return false;
    const declaredParams = new Set(route.params?.map(parameter => parameter.name));
    const keys = [];
    for (const key of entries) {
        const schema = ownRecord(declaredKeys, key);
        const dataType = schema && ownString(schema, 'dataType');
        const parameter = ownString(mapping ?? {}, key);
        if (parameter === undefined || !declaredParams.has(parameter))
            return false;
        const value = ownString(params, parameter);
        if (value === undefined)
            return false;
        const typed = parseRouteSubjectKey(dataType, value);
        if (typed === undefined)
            return false;
        keys.push([key, typed]);
    }
    return Object.freeze({ type, keys: Object.freeze(Object.fromEntries(keys)) });
}
function ownRecord(value, key) {
    if (!value || !Object.prototype.hasOwnProperty.call(value, key))
        return undefined;
    const candidate = value[key];
    return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
        ? candidate
        : undefined;
}
function ownString(value, key) {
    if (!Object.prototype.hasOwnProperty.call(value, key))
        return undefined;
    const candidate = value[key];
    return typeof candidate === 'string' ? candidate : undefined;
}
