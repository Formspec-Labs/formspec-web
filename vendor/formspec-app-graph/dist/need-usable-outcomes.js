/** @filedesc Advisory matching from Experience Need completion declarations to statically usable outputs. */
import { diagnosticSourceForHandle } from './report.js';
import { collectRenderedNeedTraceNodes, } from './rendered-need-trace.js';
import { resolvedActionIds, responseActionReferences, } from './response-action-resolution.js';
import { handlesByKind, moduleIsAdmitted, ownProp, record, recordArray, registryWidgetEntries, resolvedWidgetContributionFromEntries, stringProp, surfaceWidgetSlots, widgetShape, } from './surface-widgets.js';
const NEEDS_DOCUMENT_VERSION = '1.0';
export const NEED_USABLE_OUTCOME_CODES = {
    missing: 'APP-GRAPH-NEED-USABLE-OUTCOME-MISSING',
    proseOnly: 'APP-GRAPH-NEED-USABLE-OUTCOME-PROSE-ONLY',
    cantTell: 'APP-GRAPH-NEED-USABLE-OUTCOME-CANT-TELL',
};
export const NEED_COMPLETION_SHAPES = [
    'action',
    'submitted-definition',
    'resource',
    'navigation',
    'observable-result',
];
const COMPLETION_SHAPES = new Set(NEED_COMPLETION_SHAPES);
const PROSE_COMPONENTS = new Set([
    'Alert',
    'Badge',
    'Divider',
    'Heading',
    'Text',
]);
const OBSERVABLE_COMPONENTS = new Set([
    ...PROSE_COMPONENTS,
    'DataTable',
    'ProgressBar',
    'Summary',
    'ValidationSummary',
]);
const PROSE_NODE_KINDS = new Set([
    'app-manifest-title',
    'component-tab-label',
    'definition-document',
    'definition-option',
    'experience-unit-title',
    'locale-string',
    'surface-document',
    'surface-route',
    'surface-slot',
    'surface-static-content',
    'theme-document',
]);
const PROSE_CONFIG_KEYS = new Set([
    'body',
    'description',
    'emptyMessage',
    'eyebrow',
    'id',
    'kind',
    'message',
    'needAnchor',
    'needAnchors',
    'state',
    'text',
    'title',
    'type',
    'x-generation',
]);
const PROSE_CONFIG_TEXT_KEYS = new Set([
    'body',
    'description',
    'emptyMessage',
    'eyebrow',
    'message',
    'text',
    'title',
]);
function allHandles(context) {
    return context.handles.some((handle) => handle === context.manifest)
        ? context.handles
        : [context.manifest, ...context.handles];
}
function handleUrl(handle) {
    return stringProp(record(handle.ref), 'url')
        ?? stringProp(record(handle.identity), 'url')
        ?? stringProp(record(handle.document), 'url');
}
function manifestAssociations(context, artifactKind) {
    const manifest = record(context.manifest.document);
    const singular = (key, defaultHandle) => {
        const ref = record(ownProp(manifest, key));
        const url = stringProp(ref, 'url');
        const version = stringProp(ref, 'version');
        const membershipHandle = stringProp(ref, 'handle') ?? defaultHandle;
        return url ? [{
                url,
                ...(version ? { version } : {}),
                ...(membershipHandle ? { handle: membershipHandle } : {}),
                pointer: `/${key}`,
            }] : [];
    };
    const plural = (key) => recordArray(ownProp(manifest, key)).flatMap((ref, index) => {
        const url = stringProp(ref, 'url');
        if (!url)
            return [];
        const version = stringProp(ref, 'version');
        const membershipHandle = stringProp(ref, 'handle');
        return [{
                url,
                ...(version ? { version } : {}),
                ...(membershipHandle ? { handle: membershipHandle } : {}),
                pointer: `/${key}/${index}`,
            }];
    });
    switch (artifactKind) {
        case 'definition':
            return plural('definitions');
        case 'experience':
            return singular('experience');
        case 'responseActions':
            return [...singular('responseActions'), ...plural('responseActionDocuments')];
        case 'component':
            return [...singular('component', 'default'), ...plural('components')];
        case 'references':
            return [...singular('references'), ...plural('referenceDocuments')];
        case 'registry':
            return plural('registries');
        case 'surface':
            return plural('surfaces');
        default:
            return [];
    }
}
function associationForHandle(context, handle) {
    const ref = record(handle.ref);
    const url = stringProp(ref, 'url');
    if (!url)
        return undefined;
    const associations = manifestAssociations(context, handle.artifactKind);
    const refHandle = stringProp(ref, 'handle');
    if (refHandle) {
        const matches = associations.filter((association) => association.url === url && association.handle === refHandle);
        return matches.length === 1 ? matches[0] : undefined;
    }
    const matches = associations.filter((association) => association.url === url);
    if (matches.length === 1)
        return matches[0];
    const refVersion = stringProp(ref, 'version');
    if (!refVersion)
        return undefined;
    const versionMatches = matches.filter((association) => association.version === refVersion);
    return versionMatches.length === 1 ? versionMatches[0] : undefined;
}
function handleIsManifested(context, handle) {
    if (handle === context.manifest || handle.artifactKind === 'appManifest')
        return true;
    if (handle.status !== 'loaded')
        return false;
    const association = associationForHandle(context, handle);
    if (!association)
        return false;
    const loadedForAssociation = context.handles.filter((candidate) => candidate.status === 'loaded'
        && candidate.artifactKind === handle.artifactKind
        && associationForHandle(context, candidate)?.pointer === association.pointer);
    return loadedForAssociation.length === 1 && loadedForAssociation[0] === handle;
}
function manifestedHandlesByKind(context, artifactKind) {
    return handlesByKind(context.handles, artifactKind).filter((handle) => handleIsManifested(context, handle));
}
function manifestedRegistryEntries(context) {
    return registryWidgetEntries(context).filter((entry) => handleIsManifested(context, entry.registry));
}
function manifestedResponseActionReferences(context) {
    return responseActionReferences(manifestedHandlesByKind(context, 'responseActions'));
}
function valueAtPointer(document, pointer) {
    if (pointer === '')
        return document;
    if (!pointer.startsWith('/'))
        return undefined;
    let value = document;
    for (const encoded of pointer.slice(1).split('/')) {
        const token = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
        if (Array.isArray(value) && /^[0-9]+$/.test(token)) {
            const index = Number(token);
            if (!Object.prototype.hasOwnProperty.call(value, index))
                return undefined;
            value = value[index];
            continue;
        }
        const object = record(value);
        if (!object || !Object.prototype.hasOwnProperty.call(object, token))
            return undefined;
        value = object[token];
    }
    return value;
}
function handleForNode(context, node) {
    const matches = allHandles(context).filter((handle) => handle.status === 'loaded'
        && handle.slot === node.source.artifactSlot
        && (node.source.artifactKind === undefined
            || handle.artifactKind === node.source.artifactKind)
        && (node.source.source === undefined
            || handle.source === node.source.source));
    return matches.length === 1 ? matches[0] : undefined;
}
function pairedNeedsDocuments(context) {
    return (context.hostEvidence?.needsDocuments ?? []).filter((evidence) => record(evidence.document)?.$formspecNeeds === NEEDS_DOCUMENT_VERSION);
}
function pairedNeeds(paired) {
    const byId = new Map();
    paired.forEach((evidence, evidenceIndex) => {
        const artifactSlot = `hostEvidence.needsDocuments[${evidenceIndex}]`;
        recordArray(ownProp(record(evidence.document), 'needs')).forEach((need, needIndex) => {
            const id = stringProp(need, 'id');
            if (!id)
                return;
            const candidate = {
                id,
                status: stringProp(need, 'status'),
                revision: typeof ownProp(need, 'revision') === 'number'
                    ? ownProp(need, 'revision')
                    : undefined,
                source: {
                    artifactSlot,
                    source: evidence.source,
                    jsonPointer: `/needs/${needIndex}`,
                },
            };
            byId.set(id, [...(byId.get(id) ?? []), candidate]);
        });
    });
    return byId;
}
function completionDeclarations(context) {
    return manifestedHandlesByKind(context, 'experience').flatMap((experience) => recordArray(ownProp(record(experience.document), 'units')).flatMap((unit, unitIndex) => recordArray(ownProp(unit, 'needRefs')).flatMap((needRef, refIndex) => {
        const needId = stringProp(needRef, 'id');
        const shape = stringProp(record(ownProp(needRef, 'completion')), 'shape');
        if (!needId || !shape || !COMPLETION_SHAPES.has(shape))
            return [];
        return [{
                experience,
                unitIndex,
                ...(stringProp(unit, 'id') ? { unitId: stringProp(unit, 'id') } : {}),
                refIndex,
                needId,
                shape: shape,
            }];
    })));
}
function surfaceRoutes(context) {
    return manifestedHandlesByKind(context, 'surface').flatMap((surface) => recordArray(ownProp(record(surface.document), 'routes')).map((route, routeIndex) => ({
        surface,
        route,
        routeIndex,
    })));
}
function routeHasDefinition(route, targetDefinition) {
    return recordArray(ownProp(route, 'slots')).some((slot) => stringProp(slot, 'slotType') === 'definition-form'
        && stringProp(record(ownProp(slot, 'binding')), 'definitionRef') === targetDefinition);
}
function definitionResolves(context, targetDefinition) {
    return manifestedHandlesByKind(context, 'definition').filter((definition) => handleUrl(definition) === targetDefinition).length === 1;
}
function definitionForUrl(context, targetDefinition) {
    const matches = manifestedHandlesByKind(context, 'definition').filter((definition) => handleUrl(definition) === targetDefinition);
    return matches.length === 1 ? matches[0] : undefined;
}
function routesForDefinition(context, targetDefinition) {
    if (!definitionResolves(context, targetDefinition))
        return [];
    return surfaceRoutes(context).filter(({ route }) => routeHasDefinition(route, targetDefinition));
}
function routeTargetsForComponent(context, component) {
    if (!handleIsManifested(context, component))
        return [];
    const document = record(component.document);
    const targetDefinition = stringProp(record(ownProp(document, 'targetDefinition')), 'url');
    if (targetDefinition && !definitionResolves(context, targetDefinition))
        return [];
    const targetsValue = ownProp(document, 'targetSurfaceRoutes');
    if (!Array.isArray(targetsValue)) {
        return targetDefinition ? routesForDefinition(context, targetDefinition) : [];
    }
    const routes = [];
    for (const target of recordArray(targetsValue)) {
        const surfaceTarget = record(ownProp(target, 'surface'));
        const surfaceUrl = stringProp(surfaceTarget, 'url');
        const surfaceVersion = stringProp(surfaceTarget, 'version');
        const routeId = stringProp(target, 'route');
        if (!surfaceUrl || !routeId)
            continue;
        const surfaces = manifestedHandlesByKind(context, 'surface').filter((surface) => handleUrl(surface) === surfaceUrl
            && (surfaceVersion === undefined
                || surface.ref?.version === surfaceVersion
                || surface.identity?.version === surfaceVersion));
        if (surfaces.length !== 1)
            continue;
        const surface = surfaces[0];
        const matchingRoutes = recordArray(ownProp(record(surface.document), 'routes'))
            .flatMap((route, routeIndex) => stringProp(route, 'id') === routeId
            ? [{ surface, route, routeIndex }]
            : []);
        if (matchingRoutes.length !== 1)
            continue;
        const route = matchingRoutes[0];
        const slotId = stringProp(target, 'slot');
        if (slotId
            && recordArray(ownProp(route.route, 'slots')).filter((slot) => stringProp(slot, 'id') === slotId).length !== 1) {
            continue;
        }
        if (targetDefinition && !routeHasDefinition(route.route, targetDefinition))
            continue;
        routes.push(route);
    }
    return routes;
}
function actionValue(action) {
    return record(valueAtPointer(action.handle.document, `/actions/${action.actionIndex}`));
}
function uniqueAction(context, actionId) {
    const matches = manifestedResponseActionReferences(context).actions.filter((action) => action.id === actionId);
    if (matches.length !== 1)
        return undefined;
    const action = matches[0];
    const value = actionValue(action);
    return value ? { action, value } : undefined;
}
function uniqueWidgetAction(context, actionId) {
    const resolved = uniqueAction(context, actionId);
    return resolved?.action.scope === 'app' ? resolved : undefined;
}
function componentNodeBlocker(handle, pointer) {
    if (pointer !== '/tree' && !pointer.startsWith('/tree/')) {
        return 'component-template-not-mounted';
    }
    const segments = pointer.slice(1).split('/');
    let value = handle.document;
    for (const encoded of segments) {
        const token = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
        if (Array.isArray(value) && /^[0-9]+$/.test(token)) {
            const index = Number(token);
            if (!Object.prototype.hasOwnProperty.call(value, index))
                return 'component-node-unresolved';
            value = value[index];
        }
        else {
            const object = record(value);
            if (!object || !Object.prototype.hasOwnProperty.call(object, token)) {
                return 'component-node-unresolved';
            }
            value = object[token];
        }
        if (ownProp(record(value), 'when') !== undefined) {
            return 'component-ancestor-runtime-condition';
        }
    }
    return undefined;
}
function componentControl(context, handle, pointer, value) {
    if (stringProp(value, 'component') !== 'ActionButton')
        return { candidate: false };
    const blocker = componentNodeBlocker(handle, pointer);
    if (blocker) {
        return { candidate: true, reason: blocker };
    }
    const actionRef = stringProp(value, 'actionRef');
    if (!actionRef)
        return { candidate: true, reason: 'component-action-ref-missing' };
    const resolved = uniqueAction(context, actionRef);
    if (!resolved)
        return { candidate: true, reason: 'component-action-ref-unresolved' };
    const routes = routeTargetsForComponent(context, handle);
    if (routes.length === 0) {
        return { candidate: true, reason: 'component-action-unmounted' };
    }
    return {
        candidate: true,
        control: {
            action: resolved.action,
            actionValue: resolved.value,
            routes,
            source: 'component-action-button',
        },
    };
}
function owningWidget(surface, pointer) {
    const match = pointer.match(/^\/routes\/([0-9]+)\/slots\/([0-9]+)\/binding\/config(?:\/|$)/);
    if (!match)
        return undefined;
    const routeIndex = Number(match[1]);
    const slotIndex = Number(match[2]);
    return surfaceWidgetSlots(surface).find((widget) => widget.routeIndex === routeIndex && widget.slotIndex === slotIndex);
}
function declaredOutputCount(context, widget, outputName) {
    if (context.moduleResolution && !moduleIsAdmitted(context, widget.moduleId))
        return undefined;
    const contribution = resolvedWidgetContributionFromEntries(widget, manifestedRegistryEntries(context));
    if (!contribution)
        return undefined;
    return recordArray(ownProp(widgetShape(contribution), 'actionOutputs'))
        .filter((output) => stringProp(output, 'name') === outputName)
        .length;
}
function widgetControl(context, handle, pointer, value) {
    if (handle.artifactKind !== 'surface')
        return { candidate: false };
    const outputName = stringProp(value, 'outputName');
    if (!outputName)
        return { candidate: false };
    const widget = owningWidget(handle, pointer);
    if (!widget)
        return { candidate: true, reason: 'widget-action-unmounted' };
    if (declaredOutputCount(context, widget, outputName) !== 1) {
        return { candidate: true, reason: 'widget-action-output-unresolved' };
    }
    const actionRef = stringProp(record(ownProp(record(ownProp(widget.binding, 'actionBindings')), outputName)), 'actionRef');
    if (!actionRef)
        return { candidate: true, reason: 'widget-action-binding-missing' };
    const resolved = uniqueWidgetAction(context, actionRef);
    if (!resolved)
        return { candidate: true, reason: 'widget-action-ref-unresolved' };
    const literalLabel = stringProp(record(ownProp(resolved.value, 'label')), 'literal');
    if (!literalLabel || literalLabel.trim().length === 0) {
        return { candidate: true, reason: 'widget-action-label-unresolved' };
    }
    return {
        candidate: true,
        control: {
            action: resolved.action,
            actionValue: resolved.value,
            routes: [{
                    surface: widget.surface,
                    route: widget.route,
                    routeIndex: widget.routeIndex,
                }],
            source: 'module-widget-output',
        },
    };
}
function controlForNode(context, node, handle, value) {
    if (!handle)
        return { candidate: false };
    const component = handle.artifactKind === 'component'
        ? componentControl(context, handle, node.pointer, value)
        : { candidate: false };
    if (component.candidate)
        return component;
    return widgetControl(context, handle, node.pointer, value);
}
function targetRouteForTransition(routes, transition) {
    if (ownProp(transition, 'when') !== undefined)
        return undefined;
    const to = stringProp(transition, 'to');
    if (!to)
        return undefined;
    const targets = routes.filter((route) => stringProp(route, 'id') === to);
    if (targets.length !== 1)
        return undefined;
    const target = targets[0];
    const requiredParams = recordArray(ownProp(target, 'params'))
        .flatMap((param) => stringProp(param, 'name') ?? []);
    const supplied = record(ownProp(transition, 'params'));
    if (requiredParams.some((name) => !Object.prototype.hasOwnProperty.call(supplied ?? {}, name))) {
        return undefined;
    }
    return target;
}
function actionHasEligibleTransition(context, mount, actionId) {
    const references = manifestedResponseActionReferences(context);
    const routes = recordArray(ownProp(record(mount.surface.document), 'routes'));
    const transitions = recordArray(ownProp(mount.route, 'transitions')).filter((transition) => {
        const trigger = stringProp(transition, 'trigger');
        const actionIds = trigger ? resolvedActionIds(trigger, references) : undefined;
        return actionIds?.includes(actionId) && targetRouteForTransition(routes, transition);
    });
    return transitions.length === 1;
}
function responseActionHasBrowserResource(value) {
    return recordArray(ownProp(value, 'effects')).some((effect) => stringProp(effect, 'type') === 'browserResource');
}
function submittedDefinitionControl(context, control) {
    if (control.action.intent !== 'submit' || !control.action.targetDefinition)
        return false;
    return (definitionResolves(context, control.action.targetDefinition)
        && control.routes.some(({ route }) => routeHasDefinition(route, control.action.targetDefinition)));
}
function defaultDefinitionSubmitControl(context, node, handle, value) {
    if (node.kind !== 'response-action'
        || !handle
        || handle.artifactKind !== 'responseActions'
        || stringProp(value, 'intent') !== 'submit') {
        return false;
    }
    const targetDefinition = stringProp(record(ownProp(record(handle.document), 'targetDefinition')), 'url');
    if (!targetDefinition || !definitionResolves(context, targetDefinition))
        return false;
    const matchingDocuments = manifestedHandlesByKind(context, 'responseActions').filter((candidate) => stringProp(record(ownProp(record(candidate.document), 'targetDefinition')), 'url') === targetDefinition);
    if (matchingDocuments.length !== 1 || matchingDocuments[0] !== handle)
        return false;
    const submitActions = recordArray(ownProp(record(handle.document), 'actions')).filter((action) => stringProp(action, 'intent') === 'submit' && stringProp(action, 'id'));
    return (submitActions.length === 1
        && submitActions[0] === value
        && routesForDefinition(context, targetDefinition).length > 0);
}
function referenceValue(handle, value) {
    if (!value)
        return undefined;
    const ref = stringProp(value, '$ref');
    if (!ref)
        return value;
    const key = ref.match(/^#\/referenceDefs\/([a-zA-Z][a-zA-Z0-9_-]*)$/)?.[1];
    if (!key)
        return undefined;
    const base = record(ownProp(record(ownProp(record(handle.document), 'referenceDefs')), key));
    return base ? { ...base, ...value } : undefined;
}
function definitionItemPaths(items, rawPrefix = '', canonicalPrefix = '') {
    const paths = new Set();
    for (const item of recordArray(items)) {
        const key = stringProp(item, 'key');
        if (!key)
            continue;
        const rawPath = rawPrefix ? `${rawPrefix}.${key}` : key;
        const repeatable = ownProp(item, 'repeatable') === true || ownProp(item, 'repeat') !== undefined;
        const canonicalSegment = repeatable ? `${key}[*]` : key;
        const canonicalPath = canonicalPrefix
            ? `${canonicalPrefix}.${canonicalSegment}`
            : canonicalSegment;
        paths.add(rawPath);
        paths.add(canonicalPath);
        for (const child of definitionItemPaths(ownProp(item, 'children'), rawPath, canonicalPath)) {
            paths.add(child);
        }
    }
    return paths;
}
function referenceTargetResolves(context, targetDefinition, target) {
    if (target === '#')
        return definitionResolves(context, targetDefinition);
    const definition = definitionForUrl(context, targetDefinition);
    return Boolean(definition
        && definitionItemPaths(ownProp(record(definition.document), 'items')).has(target));
}
function mountedUsableReference(context, handle, value) {
    if (!handle || handle.artifactKind !== 'references')
        return false;
    const resolved = referenceValue(handle, value);
    if (!resolved)
        return false;
    const audience = stringProp(resolved, 'audience');
    if (audience !== 'human' && audience !== 'both')
        return false;
    if (stringProp(resolved, 'uri') === undefined
        && ownProp(resolved, 'content') === undefined) {
        return false;
    }
    const targetDefinition = stringProp(record(ownProp(record(handle.document), 'targetDefinition')), 'url');
    const target = stringProp(resolved, 'target');
    return Boolean(targetDefinition
        && target
        && referenceTargetResolves(context, targetDefinition, target)
        && routesForDefinition(context, targetDefinition).length > 0);
}
const PINNED_ROUTE_MARKER = /^\{[A-Za-z][A-Za-z0-9_]*\}$/;
function routePathPatternKey(path) {
    const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
    return normalized
        .split('/')
        .map((segment) => PINNED_ROUTE_MARKER.test(segment) ? '@param' : segment)
        .join('/');
}
function routePathCollides(context, route) {
    const path = stringProp(route, 'path');
    if (!path)
        return true;
    const pattern = routePathPatternKey(path);
    return surfaceRoutes(context).filter(({ route: candidate }) => {
        const candidatePath = stringProp(candidate, 'path');
        return candidatePath && routePathPatternKey(candidatePath) === pattern;
    }).length !== 1;
}
function explicitNavigation(context, node, handle, value) {
    if (node.kind !== 'surface-route-navigation'
        || !handle
        || handle.artifactKind !== 'surface'
        || ownProp(value, 'visible') === false) {
        return false;
    }
    const match = node.pointer.match(/^\/routes\/([0-9]+)\/navigation$/);
    if (!match)
        return false;
    const route = recordArray(ownProp(record(handle.document), 'routes'))[Number(match[1])];
    const path = stringProp(route, 'path');
    return Boolean(route
        && path
        && !path.includes('{')
        && recordArray(ownProp(route, 'params')).length === 0
        && !routePathCollides(context, route));
}
function componentSuppliesActionOnRoute(context, mount, actionIds) {
    return manifestedHandlesByKind(context, 'component').some((component) => {
        const routes = routeTargetsForComponent(context, component);
        if (!routes.some((candidate) => candidate.surface === mount.surface && candidate.route === mount.route)) {
            return false;
        }
        const visit = (candidate, ancestorConditional = false) => {
            if (Array.isArray(candidate)) {
                return candidate.some((value) => visit(value, ancestorConditional));
            }
            const object = record(candidate);
            if (!object)
                return false;
            const conditional = ancestorConditional || ownProp(object, 'when') !== undefined;
            if (stringProp(object, 'component') === 'ActionButton'
                && !conditional
                && actionIds.includes(stringProp(object, 'actionRef') ?? '')) {
                return true;
            }
            return Object.values(object).some((value) => visit(value, conditional));
        };
        return visit(ownProp(record(component.document), 'tree'));
    });
}
function routeHasResolvedWidgetActionSource(context, surface, route, actionIds) {
    return surfaceWidgetSlots(surface).some((widget) => {
        if (widget.route !== route)
            return false;
        const bindings = record(ownProp(widget.binding, 'actionBindings'));
        if (!bindings)
            return false;
        return Object.entries(bindings).some(([outputName, rawBinding]) => {
            const actionRef = stringProp(record(rawBinding), 'actionRef');
            return Boolean(actionRef
                && actionIds.includes(actionRef)
                && uniqueWidgetAction(context, actionRef)
                && declaredOutputCount(context, widget, outputName) === 1);
        });
    });
}
function transitionNavigation(context, node, handle, value) {
    if (node.kind !== 'surface-transition'
        || !handle
        || handle.artifactKind !== 'surface'
        || !value) {
        return false;
    }
    const match = node.pointer.match(/^\/routes\/([0-9]+)\/transitions\/[0-9]+$/);
    if (!match)
        return false;
    const routeIndex = Number(match[1]);
    const routes = recordArray(ownProp(record(handle.document), 'routes'));
    const route = routes[routeIndex];
    if (!route || !targetRouteForTransition(routes, value))
        return false;
    const trigger = stringProp(value, 'trigger');
    const actionIds = trigger
        ? resolvedActionIds(trigger, manifestedResponseActionReferences(context))
        : undefined;
    if (!actionIds || actionIds.length !== 1)
        return false;
    const mount = { surface: handle, route, routeIndex };
    const action = uniqueAction(context, actionIds[0]);
    const definitionSource = Boolean(action?.action.targetDefinition
        && definitionResolves(context, action.action.targetDefinition)
        && routeHasDefinition(route, action.action.targetDefinition));
    return definitionSource
        || routeHasResolvedWidgetActionSource(context, handle, route, actionIds)
        || componentSuppliesActionOnRoute(context, mount, actionIds);
}
function mountedDefinitionDisplay(context, handle, value) {
    if (!handle || handle.artifactKind !== 'definition' || stringProp(value, 'type') !== 'display') {
        return false;
    }
    const definitionUrl = handleUrl(handle);
    return Boolean(definitionUrl && routesForDefinition(context, definitionUrl).length > 0);
}
function renderedWidgetConfigNode(context, handle, node, value) {
    if (!handle || handle.artifactKind !== 'surface' || stringProp(value, 'outputName')) {
        return false;
    }
    const widget = owningWidget(handle, node.pointer);
    if (!widget)
        return false;
    if (context.moduleResolution && !moduleIsAdmitted(context, widget.moduleId))
        return false;
    const contribution = resolvedWidgetContributionFromEntries(widget, manifestedRegistryEntries(context));
    const renderedNodes = ownProp(widgetShape(contribution), 'renderedConfigNodes');
    return Boolean(contribution
        && stringProp(widgetShape(contribution), 'deliveryContractId')
        && Array.isArray(renderedNodes)
        && renderedNodes.length > 0);
}
function observableOutput(context, node, handle, value) {
    if (node.kind === 'surface-static-content')
        return true;
    if (node.kind === 'reference-entry') {
        return mountedUsableReference(context, handle, value);
    }
    if (node.kind === 'definition-item') {
        return mountedDefinitionDisplay(context, handle, value);
    }
    if (node.kind === 'component-node'
        && handle?.artifactKind === 'component'
        && OBSERVABLE_COMPONENTS.has(stringProp(value, 'component') ?? '')
        && componentNodeBlocker(handle, node.pointer) === undefined) {
        return routeTargetsForComponent(context, handle).length > 0;
    }
    return renderedWidgetConfigNode(context, handle, node, value);
}
function proseConfig(value) {
    if (!value)
        return false;
    const keys = Object.keys(value);
    return (keys.length > 0
        && keys.every((key) => PROSE_CONFIG_KEYS.has(key))
        && keys.some((key) => PROSE_CONFIG_TEXT_KEYS.has(key) && typeof ownProp(value, key) === 'string'));
}
function proseOrDecorative(node, value) {
    if (PROSE_NODE_KINDS.has(node.kind))
        return true;
    if (node.kind === 'definition-item'
        && stringProp(value, 'type') === 'display') {
        return true;
    }
    if (node.kind === 'component-node'
        && PROSE_COMPONENTS.has(stringProp(value, 'component') ?? '')) {
        return true;
    }
    return proseConfig(value);
}
function assessCandidate(context, declaration, node) {
    const handle = handleForNode(context, node);
    if (!handle) {
        return { conclusion: 'unknown', reason: 'candidate-artifact-unresolved' };
    }
    if (!handleIsManifested(context, handle)) {
        return { conclusion: 'unknown', reason: 'candidate-artifact-unmanifested' };
    }
    const value = record(handle ? valueAtPointer(handle.document, node.pointer) : undefined);
    const control = controlForNode(context, node, handle, value);
    switch (declaration.shape) {
        case 'action':
            if (control.control) {
                return { conclusion: 'match', reason: control.control.source };
            }
            if (control.candidate) {
                return { conclusion: 'unknown', reason: control.reason ?? 'action-control-unresolved' };
            }
            break;
        case 'submitted-definition':
            if (control.control && submittedDefinitionControl(context, control.control)) {
                return { conclusion: 'match', reason: 'mounted-submit-control' };
            }
            if (defaultDefinitionSubmitControl(context, node, handle, value)) {
                return { conclusion: 'match', reason: 'mounted-default-submit-control' };
            }
            if (control.candidate) {
                return { conclusion: 'unknown', reason: control.reason ?? 'submit-control-unresolved' };
            }
            break;
        case 'resource':
            if (mountedUsableReference(context, handle, value)) {
                return { conclusion: 'match', reason: 'mounted-human-reference' };
            }
            if (control.control && responseActionHasBrowserResource(control.control.actionValue)) {
                return { conclusion: 'match', reason: 'mounted-browser-resource-control' };
            }
            if (control.candidate || node.kind === 'reference-entry') {
                return {
                    conclusion: 'unknown',
                    reason: control.reason ?? 'resource-affordance-unresolved',
                };
            }
            break;
        case 'navigation':
            if (explicitNavigation(context, node, handle, value)) {
                return { conclusion: 'match', reason: 'visible-resolved-route-navigation' };
            }
            if (transitionNavigation(context, node, handle, value)) {
                return { conclusion: 'match', reason: 'resolved-mounted-transition' };
            }
            if (control.control
                && control.control.routes.some((route) => actionHasEligibleTransition(context, route, control.control.action.id))) {
                return { conclusion: 'match', reason: 'mounted-control-with-resolved-transition' };
            }
            if (control.candidate
                || node.kind === 'surface-route-navigation'
                || node.kind === 'surface-transition') {
                return {
                    conclusion: 'unknown',
                    reason: control.reason ?? 'navigation-destination-unresolved',
                };
            }
            break;
        case 'observable-result':
            if (observableOutput(context, node, handle, value)) {
                return { conclusion: 'match', reason: 'mounted-rendered-output' };
            }
            break;
    }
    return proseOrDecorative(node, value)
        ? { conclusion: 'prose', reason: 'prose-or-decorative-output' }
        : { conclusion: 'unknown', reason: 'candidate-shape-not-proven' };
}
function completionSource(declaration) {
    return diagnosticSourceForHandle(declaration.experience, `/units/${declaration.unitIndex}/needRefs/${declaration.refIndex}/completion/shape`);
}
function uniqueSources(sources) {
    const seen = new Set();
    return sources.filter((source) => {
        const key = [
            source.artifactSlot,
            source.artifactKind,
            source.source,
            source.jsonPointer,
            source.ref?.url,
            source.ref?.version,
        ].join('\u0000');
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function advisoryDiagnostic(code, severity, message, declaration, reason, outcome, candidates, relatedSources, extra = {}) {
    return {
        code,
        severity,
        phase: 'cross-artifact',
        origin: 'app-graph-validator',
        message,
        primarySource: completionSource(declaration),
        relatedSources: uniqueSources([
            ...relatedSources,
            ...candidates.map((node) => ({ ...node.source, jsonPointer: node.pointer })),
        ]),
        details: {
            reason,
            outcome,
            needId: declaration.needId,
            completionShape: declaration.shape,
            unitId: declaration.unitId,
            unitIndex: declaration.unitIndex,
            needRefIndex: declaration.refIndex,
            candidateCount: candidates.length,
            candidateKinds: [...new Set(candidates.map((candidate) => candidate.kind))].sort(),
            runtimeAuthorization: 'not-evaluated',
            runtimeApplicability: 'not-evaluated',
            runtimeCompletion: 'not-evaluated',
            ...extra,
        },
    };
}
function cantTell(declaration, reason, candidates, relatedSources, extra = {}) {
    return advisoryDiagnostic(NEED_USABLE_OUTCOME_CODES.cantTell, 'info', `AppGraph cannot prove a mounted, resolved '${declaration.shape}' output for Need '${declaration.needId}' from the loaded static graph.`, declaration, reason, 'cantTell', candidates, relatedSources, extra);
}
/**
 * Advisory usable-outcome profile.
 *
 * Callers opt in through `crossArtifactValidators`. A clean result means only
 * that the loaded static graph contains a directly current-Need-traced output
 * whose mounting and structural shape can be proven. This validator never
 * evaluates authorization, applicability, preconditions, effects, or runtime
 * completion, and it does not change ordinary Needs coverage.
 */
export function validateNeedUsableOutcomes(context) {
    const declarations = completionDeclarations(context);
    if (declarations.length === 0)
        return [];
    const paired = pairedNeedsDocuments(context);
    const needsById = pairedNeeds(paired);
    const nodes = collectRenderedNeedTraceNodes(context);
    const diagnostics = [];
    for (const declaration of declarations) {
        if (paired.length === 0) {
            diagnostics.push(cantTell(declaration, 'needs-document-unpaired', [], []));
            continue;
        }
        const needs = needsById.get(declaration.needId) ?? [];
        if (needs.length !== 1) {
            diagnostics.push(cantTell(declaration, needs.length === 0 ? 'need-id-unresolved' : 'need-id-ambiguous', [], needs.map((need) => need.source), { needMatchCount: needs.length }));
            continue;
        }
        const need = needs[0];
        if (need.status !== 'adopted') {
            diagnostics.push(cantTell(declaration, 'need-not-adopted', [], [need.source], { needStatus: need.status }));
            continue;
        }
        if (!Number.isInteger(need.revision)) {
            diagnostics.push(cantTell(declaration, 'need-current-revision-unknown', [], [need.source]));
            continue;
        }
        const traced = nodes.filter((node) => node.anchors.some((anchor) => anchor.needId === declaration.needId));
        const current = traced.filter((node) => node.anchors.some((anchor) => anchor.needId === declaration.needId && anchor.revision === need.revision));
        if (current.length === 0) {
            const stale = traced.length > 0;
            if (stale) {
                diagnostics.push(cantTell(declaration, 'need-trace-not-current', traced, [need.source], { currentRevision: need.revision }));
            }
            else {
                diagnostics.push(advisoryDiagnostic(NEED_USABLE_OUTCOME_CODES.missing, 'warning', `Need '${declaration.needId}' declares '${declaration.shape}', but no directly Need-traced candidate output exists at current revision ${need.revision}.`, declaration, 'direct-current-need-trace-missing', 'failed', [], [need.source], { currentRevision: need.revision }));
            }
            continue;
        }
        const assessments = current.map((node) => assessCandidate(context, declaration, node));
        if (assessments.some((assessment) => assessment.conclusion === 'match'))
            continue;
        if (assessments.every((assessment) => assessment.conclusion === 'prose')) {
            diagnostics.push(advisoryDiagnostic(NEED_USABLE_OUTCOME_CODES.proseOnly, 'warning', `Need '${declaration.needId}' declares '${declaration.shape}', but its only directly Need-traced output is prose or decorative content rather than a usable affordance.`, declaration, 'direct-output-prose-only', 'failed', current, [need.source], {
                currentRevision: need.revision,
                candidateReasons: assessments.map((assessment) => assessment.reason),
            }));
            continue;
        }
        diagnostics.push(cantTell(declaration, 'candidate-static-shape-unproven', current, [need.source], {
            currentRevision: need.revision,
            candidateReasons: assessments.map((assessment) => assessment.reason),
        }));
    }
    return diagnostics;
}
