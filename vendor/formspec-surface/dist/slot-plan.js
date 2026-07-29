import { surfaceDiagnostic } from './diagnostics.js';
import { planExperienceUnit } from './experience-unit.js';
import { planStaticContent, } from './static-content.js';
import { dataSourceAvailableToWidget, resolveDataSourceDescriptor, } from './data-source-loader.js';
const KNOWN_SLOT_TYPES = {
    'definition-form': true,
    'experience-unit': true,
    'module-widget': true,
    'static-content': true,
    'embed-route': true,
};
export function planRoute(context) {
    const diagnostics = [];
    const base = context.headingBaseLevel ?? 2;
    const slots = context.handle.route.slots.map((slot) => planSlot(slot, context, base, new Set([context.handle.routeId]), diagnostics));
    return { handle: context.handle, slots, diagnostics };
}
function planSlot(slot, context, headingBaseLevel, visitedRoutes, diagnostics) {
    const site = {
        surfaceId: context.handle.surfaceId,
        routeId: context.handle.routeId,
        slotId: slot.id,
    };
    const shared = { slotId: slot.id, headingBaseLevel };
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
            if (definition !== undefined)
                plan.definition = definition;
            return plan;
        }
        case 'experience-unit': {
            const unitRef = typeof binding.unitRef === 'string' ? binding.unitRef : '';
            const unit = planExperienceUnit({
                unitRef,
                experienceRef: typeof binding.experienceRef === 'string' ? binding.experienceRef : undefined,
                experiences: context.experiences,
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
            const widgetShape = resolution.status !== 'undeclared' ? resolution.entry?.widgetShape : undefined;
            const declaredInputs = Array.isArray(widgetShape?.dataInputs)
                ? widgetShape.dataInputs
                : [];
            const declaredOutputs = Array.isArray(widgetShape?.actionOutputs)
                ? widgetShape.actionOutputs
                : [];
            const dataBindings = ownRecord(binding, 'dataBindings');
            const actionBindings = ownRecord(binding, 'actionBindings');
            const dataInputs = declaredInputs.map((declared) => {
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
                return {
                    name: declared.name,
                    ...(authored && ownString(authored, 'actionRef') !== undefined
                        ? { actionRef: ownString(authored, 'actionRef') }
                        : {}),
                };
            });
            const plan = {
                ...shared,
                slotType: 'module-widget',
                key,
                dataInputs,
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
            return { ...shared, slotType: 'static-content', content: result.plan };
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
            const slots = embedded.slots.map((child) => planSlot(child, context, nestedBase, nested, diagnostics));
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
