/** @filedesc Opt-in strict validation from every authored render node to an adopted, current Need. */
import { Path, PathSegmentKind, } from '@formspec-org/types';
import { diagnosticSourceForHandle } from './report.js';
import { NEED_ANCHOR } from './needs-coverage.js';
import { compatibleVersionFailure, componentTargetUrl } from './locale-associations.js';
import { registryWidgetEntries, resolvedWidgetContributionFromEntries, widgetShape, } from './surface-widgets.js';
const NEEDS_DOCUMENT_VERSION = '1.0';
const CONFIG_POINTER_PATTERN = /^(?:|\/(?:\*|(?:[^~/]|~[01])+)(?:\/(?:\*|(?:[^~/]|~[01])+))*)$/;
export const RENDERED_NEED_TRACE_CODES = {
    needsUnpaired: 'APP-GRAPH-RENDERED-NEEDS-UNPAIRED',
    missing: 'APP-GRAPH-RENDERED-NEED-MISSING',
    unresolved: 'APP-GRAPH-RENDERED-NEED-UNRESOLVED',
    nonAdopted: 'APP-GRAPH-RENDERED-NEED-NON-ADOPTED',
    stale: 'APP-GRAPH-RENDERED-NEED-STALE',
    redundant: 'APP-GRAPH-RENDERED-NEED-REDUNDANT',
    scopeUnknown: 'APP-GRAPH-RENDERED-NODE-SCOPE-UNKNOWN',
    inventoryInvalid: 'APP-GRAPH-RENDERED-NODE-INVENTORY-INVALID',
    navigationImplicit: 'APP-GRAPH-RENDERED-NAVIGATION-IMPLICIT',
};
function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function stringProp(value, key) {
    const candidate = value?.[key];
    return typeof candidate === 'string' ? candidate : undefined;
}
function escapePointerSegment(segment) {
    return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}
function pairedNeedsDocuments(context) {
    return (context.hostEvidence?.needsDocuments ?? []).filter((evidence) => record(evidence.document)?.$formspecNeeds === NEEDS_DOCUMENT_VERSION);
}
function pairedNeeds(paired) {
    const byId = new Map();
    const roots = [];
    paired.forEach((evidence, evidenceIndex) => {
        const artifactSlot = `hostEvidence.needsDocuments[${evidenceIndex}]`;
        roots.push({
            artifactSlot,
            source: evidence.source,
            jsonPointer: '/needs',
        });
        const needs = record(evidence.document)?.needs;
        if (!Array.isArray(needs))
            return;
        needs.forEach((rawNeed, needIndex) => {
            const need = record(rawNeed);
            const id = stringProp(need, 'id');
            if (!id)
                return;
            const entry = {
                id,
                status: stringProp(need, 'status'),
                revision: typeof need?.revision === 'number' ? need.revision : undefined,
                source: {
                    artifactSlot,
                    source: evidence.source,
                    jsonPointer: `/needs/${needIndex}`,
                },
            };
            byId.set(id, [...(byId.get(id) ?? []), entry]);
        });
    });
    return { byId, roots };
}
function directGenerationAnchors(node, pointer) {
    return generationObjectAnchors(node['x-generation'], `${pointer}/x-generation`);
}
function generationObjectAnchors(generationValue, generationPointer) {
    const generation = record(generationValue);
    const anchors = generation?.anchors;
    if (!Array.isArray(anchors))
        return [];
    return anchors.flatMap((raw, index) => typeof raw === 'string' && raw.startsWith('need:')
        ? [{ raw, pointer: `${generationPointer}/anchors/${index}` }]
        : []);
}
function directConfigAnchors(node, pointer) {
    const anchors = directGenerationAnchors(node, pointer);
    if (Object.prototype.hasOwnProperty.call(node, 'needAnchor')) {
        anchors.push({
            raw: node.needAnchor,
            pointer: `${pointer}/needAnchor`,
        });
    }
    if (Object.prototype.hasOwnProperty.call(node, 'needAnchors')) {
        if (Array.isArray(node.needAnchors)) {
            node.needAnchors.forEach((raw, index) => {
                anchors.push({
                    raw,
                    pointer: `${pointer}/needAnchors/${index}`,
                });
            });
        }
        else {
            anchors.push({
                raw: node.needAnchors,
                pointer: `${pointer}/needAnchors`,
            });
        }
    }
    return anchors;
}
function sourceIdentity(handle, jsonPointer) {
    return {
        artifactSlot: handle.slot,
        jsonPointer,
        artifactKind: handle.artifactKind,
        source: handle.source,
        ref: handle.ref ? { ...handle.ref } : undefined,
    };
}
function classifiedAnchors(candidates) {
    const anchors = [];
    const invalidAnchors = [];
    for (const candidate of candidates) {
        if (typeof candidate.raw !== 'string') {
            invalidAnchors.push({
                raw: candidate.raw,
                pointer: candidate.pointer,
                reason: 'need-anchor-not-string',
            });
            continue;
        }
        const parsed = NEED_ANCHOR.exec(candidate.raw);
        if (!parsed) {
            invalidAnchors.push({
                raw: candidate.raw,
                pointer: candidate.pointer,
                reason: 'need-anchor-malformed',
            });
            continue;
        }
        anchors.push({
            raw: candidate.raw,
            needId: parsed[1],
            revision: Number(parsed[2]),
            pointer: candidate.pointer,
        });
    }
    return { anchors, invalidAnchors };
}
function nodeLabel(node, fallback) {
    return stringProp(node, 'id')
        ?? stringProp(node, 'key')
        ?? stringProp(node, 'component')
        ?? stringProp(node, 'title')
        ?? stringProp(node, 'label')
        ?? stringProp(node, 'header')
        ?? stringProp(node, 'text')
        ?? stringProp(node, 'content')
        ?? stringProp(node, 'value')
        ?? stringProp(node, 'outputName')
        ?? fallback;
}
function generationNode(handle, kind, pointer, node, fallback) {
    const { anchors, invalidAnchors } = classifiedAnchors(directGenerationAnchors(node, pointer));
    return {
        source: sourceIdentity(handle, pointer),
        kind,
        pointer,
        label: nodeLabel(node, fallback),
        anchors,
        invalidAnchors,
    };
}
function siblingGenerationNode(handle, kind, pointer, node, fallback, generationValue, generationPointer) {
    const { anchors, invalidAnchors } = classifiedAnchors(generationObjectAnchors(generationValue, generationPointer));
    return {
        source: sourceIdentity(handle, pointer),
        kind,
        pointer,
        label: nodeLabel(node, fallback),
        anchors,
        invalidAnchors,
    };
}
function registrySource(entry) {
    return diagnosticSourceForHandle(entry.registry, `/entries/${entry.entryIndex}/widgetShape/renderedConfigNodes`);
}
function failedInventoryNode(handle, kind, pointer, label, code, message, reason, relatedSources = [], details = {}) {
    return {
        source: sourceIdentity(handle, pointer),
        kind,
        pointer,
        label,
        anchors: [],
        invalidAnchors: [],
        failure: {
            code,
            message,
            reason,
            details,
            relatedSources,
        },
    };
}
function decodePointerSegment(segment) {
    return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}
function configMatches(config, configPointer, pointerPattern) {
    if (pointerPattern === '')
        return [{ value: config, pointer: configPointer }];
    if (!pointerPattern.startsWith('/'))
        return [];
    const segments = pointerPattern.slice(1).split('/').map(decodePointerSegment);
    let frontier = [{ value: config, pointer: configPointer }];
    for (const segment of segments) {
        const next = [];
        for (const match of frontier) {
            if (segment === '*') {
                if (Array.isArray(match.value)) {
                    match.value.forEach((value, index) => {
                        next.push({ value, pointer: `${match.pointer}/${index}` });
                    });
                }
                else {
                    const object = record(match.value);
                    if (!object)
                        continue;
                    Object.keys(object).sort().forEach((key) => {
                        next.push({
                            value: object[key],
                            pointer: `${match.pointer}/${escapePointerSegment(key)}`,
                        });
                    });
                }
                continue;
            }
            const object = record(match.value);
            if (object && Object.prototype.hasOwnProperty.call(object, segment)) {
                next.push({
                    value: object[segment],
                    pointer: `${match.pointer}/${escapePointerSegment(segment)}`,
                });
            }
            else if (Array.isArray(match.value) && /^[0-9]+$/.test(segment)) {
                const index = Number(segment);
                if (Object.prototype.hasOwnProperty.call(match.value, index)) {
                    next.push({ value: match.value[index], pointer: `${match.pointer}/${index}` });
                }
            }
        }
        frontier = next;
    }
    return frontier;
}
function inventoriedConfigTraceNodes(handle, binding, config, pointer, entries) {
    const moduleId = stringProp(binding, 'moduleId');
    const widgetName = stringProp(binding, 'widgetName');
    const label = `${moduleId ?? '<missing-module>'}/${widgetName ?? '<missing-widget>'}`;
    const contribution = moduleId && widgetName
        ? resolvedWidgetContributionFromEntries({ moduleId, widgetName }, entries)
        : undefined;
    if (!contribution) {
        return [failedInventoryNode(handle, 'module-widget-config', pointer, label, RENDERED_NEED_TRACE_CODES.scopeUnknown, `Rendered widget '${label}' has no uniquely resolved Registry contribution, so its visible config-node scope cannot be proven.`, 'widget-registry-contribution-unresolved', [], { moduleId, widgetName })];
    }
    const shape = widgetShape(contribution);
    const inventory = shape?.renderedConfigNodes;
    if (!Array.isArray(inventory) || inventory.length === 0) {
        return [failedInventoryNode(handle, 'module-widget-config', pointer, label, RENDERED_NEED_TRACE_CODES.scopeUnknown, `Registry widget '${label}' does not declare widgetShape.renderedConfigNodes, so strict validation cannot know which config objects render.`, 'rendered-config-inventory-missing', [registrySource(contribution)], { moduleId, widgetName, contributionName: contribution.name })];
    }
    if (!stringProp(shape, 'deliveryContractId')) {
        return [failedInventoryNode(handle, 'module-widget-config', pointer, label, RENDERED_NEED_TRACE_CODES.scopeUnknown, `Registry widget '${label}' does not identify the renderer delivery contract that owns its rendered-node inventory.`, 'renderer-delivery-contract-missing', [registrySource(contribution)], { moduleId, widgetName, contributionName: contribution.name })];
    }
    const out = [];
    const claimedPointers = new Map();
    const patternCounts = new Map();
    for (const rawEntry of inventory) {
        const entry = record(rawEntry);
        const pointerPattern = stringProp(entry, 'pointerPattern');
        const kind = stringProp(entry, 'kind');
        if (!entry || pointerPattern === undefined || !kind) {
            return [failedInventoryNode(handle, 'module-widget-config', pointer, label, RENDERED_NEED_TRACE_CODES.inventoryInvalid, `Registry widget '${label}' has an invalid renderedConfigNodes entry.`, 'rendered-config-inventory-entry-invalid', [registrySource(contribution)], { moduleId, widgetName })];
        }
        if (!CONFIG_POINTER_PATTERN.test(pointerPattern)) {
            return [failedInventoryNode(handle, 'module-widget-config', pointer, label, RENDERED_NEED_TRACE_CODES.inventoryInvalid, `Registry widget '${label}' declares invalid rendered config pointer pattern '${pointerPattern}'.`, 'rendered-config-inventory-pattern-invalid', [registrySource(contribution)], { moduleId, widgetName, pointerPattern })];
        }
        patternCounts.set(pointerPattern, (patternCounts.get(pointerPattern) ?? 0) + 1);
        for (const match of configMatches(config, pointer, pointerPattern)) {
            const object = record(match.value);
            if (!object) {
                return [failedInventoryNode(handle, 'module-widget-config', match.pointer, label, RENDERED_NEED_TRACE_CODES.inventoryInvalid, `Registry widget '${label}' inventory pattern '${pointerPattern}' matched a non-object value that cannot carry a direct Need trace.`, 'rendered-config-inventory-match-not-object', [registrySource(contribution)], { moduleId, widgetName, pointerPattern })];
            }
            const priorKind = claimedPointers.get(match.pointer);
            if (priorKind !== undefined) {
                return [failedInventoryNode(handle, 'module-widget-config', match.pointer, label, RENDERED_NEED_TRACE_CODES.inventoryInvalid, `Registry widget '${label}' inventory claims config pointer '${match.pointer}' more than once.`, 'rendered-config-inventory-overlap', [registrySource(contribution)], { moduleId, widgetName, pointerPattern, priorKind, kind })];
            }
            claimedPointers.set(match.pointer, kind);
            const { anchors, invalidAnchors } = classifiedAnchors(directConfigAnchors(object, match.pointer));
            out.push({
                source: sourceIdentity(handle, match.pointer),
                kind,
                pointer: match.pointer,
                label: nodeLabel(object, match.pointer),
                anchors,
                invalidAnchors,
            });
        }
    }
    const duplicatePattern = [...patternCounts].find(([, count]) => count > 1)?.[0];
    if (duplicatePattern !== undefined) {
        return [failedInventoryNode(handle, 'module-widget-config', pointer, label, RENDERED_NEED_TRACE_CODES.inventoryInvalid, `Registry widget '${label}' declares rendered config pattern '${duplicatePattern}' more than once.`, 'rendered-config-inventory-pattern-duplicate', [registrySource(contribution)], { moduleId, widgetName, pointerPattern: duplicatePattern })];
    }
    return out;
}
function surfaceNodes(handle, entries) {
    const document = record(handle.document);
    if (!document)
        return [];
    const out = [
        generationNode(handle, 'surface-document', '', document, stringProp(document, 'title') ?? stringProp(document, 'id') ?? 'Surface'),
    ];
    const routes = document.routes;
    if (!Array.isArray(routes))
        return out;
    routes.forEach((rawRoute, routeIndex) => {
        const route = record(rawRoute);
        if (!route)
            return;
        const routePointer = `/routes/${routeIndex}`;
        out.push(generationNode(handle, 'surface-route', routePointer, route, `routes[${routeIndex}]`));
        const navigation = record(route.navigation);
        if (navigation) {
            out.push(generationNode(handle, 'surface-route-navigation', `${routePointer}/navigation`, navigation, `${nodeLabel(route, `routes[${routeIndex}]`)} navigation`));
        }
        else if (!navigation) {
            out.push(failedInventoryNode(handle, 'surface-route-navigation', `${routePointer}/navigation`, `${nodeLabel(route, `routes[${routeIndex}]`)} implicit navigation`, RENDERED_NEED_TRACE_CODES.navigationImplicit, `Route '${nodeLabel(route, `routes[${routeIndex}]`)}' would render an implicit navigation label. Author an explicit navigation object with its own Need trace; a hidden one (visible: false) needs the trace too, because its scope still shapes shell navigation.`, 'implicit-navigation-derived-from-route'));
        }
        if (Array.isArray(route.slots)) {
            route.slots.forEach((rawSlot, slotIndex) => {
                const slot = record(rawSlot);
                if (!slot)
                    return;
                const slotPointer = `${routePointer}/slots/${slotIndex}`;
                out.push(generationNode(handle, 'surface-slot', slotPointer, slot, `slots[${slotIndex}]`));
                const binding = record(slot.binding);
                if (stringProp(slot, 'slotType') === 'static-content' && binding) {
                    out.push(generationNode(handle, 'surface-static-content', `${slotPointer}/binding`, binding, `${nodeLabel(slot, `slots[${slotIndex}]`)} content`));
                }
                if (stringProp(slot, 'slotType') === 'filing-status' && binding) {
                    const bindingPointer = `${slotPointer}/binding`;
                    out.push(generationNode(handle, 'surface-filing-status-binding', bindingPointer, binding, 'Filing tracker'));
                    if (Array.isArray(binding.groups))
                        binding.groups.forEach((rawGroup, groupIndex) => {
                            const group = record(rawGroup);
                            if (!group)
                                return;
                            const groupPointer = `${bindingPointer}/groups/${groupIndex}`;
                            out.push(generationNode(handle, 'surface-filing-status-group', groupPointer, group, stringProp(group, 'label') ?? `groups[${groupIndex}]`));
                            if (Array.isArray(group.forms))
                                group.forms.forEach((rawEntry, entryIndex) => {
                                    const entry = record(rawEntry);
                                    if (!entry)
                                        return;
                                    out.push(generationNode(handle, 'surface-filing-status-entry', `${groupPointer}/forms/${entryIndex}`, entry, stringProp(entry, 'routeRef') ?? `forms[${entryIndex}]`));
                                });
                        });
                }
                if (stringProp(slot, 'slotType') !== 'module-widget')
                    return;
                const draftReview = record(binding?.draftReview);
                if (draftReview) {
                    out.push(generationNode(handle, 'surface-draft-review-binding', `${slotPointer}/binding/draftReview`, draftReview, 'Draft review'));
                }
                const dataBindings = record(binding?.dataBindings);
                if (dataBindings) {
                    Object.keys(dataBindings).sort().forEach((inputName) => {
                        const dataBinding = record(dataBindings[inputName]);
                        if (!dataBinding)
                            return;
                        out.push(generationNode(handle, 'surface-widget-data-binding', `${slotPointer}/binding/dataBindings/${escapePointerSegment(inputName)}`, dataBinding, inputName));
                    });
                }
                const actionBindings = record(binding?.actionBindings);
                if (actionBindings) {
                    Object.keys(actionBindings).sort().forEach((outputName) => {
                        const actionBinding = record(actionBindings[outputName]);
                        if (!actionBinding)
                            return;
                        out.push(generationNode(handle, 'surface-widget-action-binding', `${slotPointer}/binding/actionBindings/${escapePointerSegment(outputName)}`, actionBinding, outputName));
                    });
                }
                const config = record(binding?.config);
                if (binding && config) {
                    const configPointer = `${slotPointer}/binding/config`;
                    out.push(...inventoriedConfigTraceNodes(handle, binding, config, configPointer, entries));
                }
            });
        }
        if (Array.isArray(route.transitions)) {
            route.transitions.forEach((rawTransition, transitionIndex) => {
                const transition = record(rawTransition);
                if (!transition)
                    return;
                out.push(generationNode(handle, 'surface-transition', `${routePointer}/transitions/${transitionIndex}`, transition, `transitions[${transitionIndex}]`));
            });
        }
    });
    return out;
}
function appManifestNodes(handle) {
    const document = record(handle.document);
    if (!document || stringProp(document, 'title') === undefined)
        return [];
    return [generationNode(handle, 'app-manifest-title', '', document, stringProp(document, 'title') ?? 'App title')];
}
function indexBy(index, key, value) {
    const entries = index.get(key);
    if (entries)
        entries.push(value);
    else
        index.set(key, [value]);
}
function unique(entries) {
    return entries?.length === 1 ? entries[0] : undefined;
}
function optionLocaleKey(prefix, value) {
    return `${prefix}.${value.replace(/[.\\]/g, '\\$&')}.label`;
}
function collectDefinitionItems(handle, items, pointer, form, family, owners, parent, parentPath, setFields) {
    if (!Array.isArray(items))
        return;
    items.forEach((rawItem, index) => {
        const item = record(rawItem);
        if (!item)
            return;
        const itemPointer = `${pointer}/${index}`;
        const node = generationNode(handle, `${family}-item`, itemPointer, item, `items[${index}]`);
        form.nodes.push(node);
        owners.set(node, [parent]);
        const key = stringProp(item, 'key');
        const path = parentPath ? `${parentPath}.${key ?? ''}` : key ?? '';
        if (key) {
            const entry = { node, item, path };
            indexBy(form.itemsByPath, path, entry);
            indexBy(form.itemsByKey, key, entry);
        }
        const setName = stringProp(item, 'optionSet');
        if (setName && item.type === 'field')
            indexBy(setFields, setName, node);
        if (Array.isArray(item.options)) {
            item.options.forEach((rawOption, optionIndex) => {
                const option = record(rawOption);
                if (!option)
                    return;
                const optionNode = generationNode(handle, `${family}-option`, `${itemPointer}/options/${optionIndex}`, option, `options[${optionIndex}]`);
                form.nodes.push(optionNode);
                owners.set(optionNode, [node]);
                const value = stringProp(option, 'value');
                if (key && value !== undefined) {
                    indexBy(form.localizedNodes, optionLocaleKey(`${key}.options`, value), optionNode);
                }
            });
        }
        collectDefinitionItems(handle, item.children, `${itemPointer}/children`, form, family, owners, node, path, setFields);
    });
}
function resolveItems(form, path) {
    // Core §4.3.3 selectors address instances of the same authored item.
    const segmentPattern = /^[a-zA-Z][a-zA-Z0-9_]*(?:\[\*\]|\[@index\s*=\s*[1-9]\d*\])?$/;
    if (!path || !path.split('.').every((segment) => segmentPattern.test(segment)))
        return [];
    const parsed = Path.parse(path);
    let itemPath = '';
    for (const segment of parsed.segments) {
        if (segment.kind === PathSegmentKind.Exact) {
            itemPath = itemPath ? `${itemPath}.${segment.key}` : segment.key;
        }
        else if (!unique(form.itemsByPath.get(itemPath))?.item.repeatable) {
            return [];
        }
    }
    return form.itemsByPath.get(itemPath) ?? [];
}
function targetedOwners(form, path) {
    return path === '#' ? [form.root] : resolveItems(form, path).map(({ node }) => node);
}
function collectFormNodes(handle, family, owners) {
    const document = record(handle.document);
    if (!document)
        return undefined;
    const root = generationNode(handle, `${family}-document`, '', document, family === 'screener' ? 'Screener' : 'Definition');
    const form = {
        root, nodes: [root], itemsByPath: new Map(), itemsByKey: new Map(), localizedNodes: new Map(),
        constraintMessages: new Map(), componentsById: new Map(),
    };
    const setFields = new Map();
    collectDefinitionItems(handle, document.items, '/items', form, family, owners, root, '', setFields);
    if (Array.isArray(document.binds)) {
        const bindsByItemPath = new Map();
        const constraintPaths = new Set();
        document.binds.forEach((rawBind, bindIndex) => {
            const bind = record(rawBind);
            if (!bind)
                return;
            const path = stringProp(bind, 'path');
            const node = generationNode(handle, `${family}-bind`, `/binds/${bindIndex}`, bind, path ?? `binds[${bindIndex}]`);
            form.nodes.push(node);
            const targets = resolveItems(form, path);
            owners.set(node, targets.map((target) => target.node));
            for (const target of targets) {
                indexBy(bindsByItemPath, target.path, node);
                if (typeof bind.constraint === 'string' || typeof bind.constraintMessage === 'string') {
                    constraintPaths.add(target.path);
                }
            }
        });
        // Locale §3.1.4 addresses the effective Bind that Core §4.3.1 merges for the item.
        for (const [path, binds] of bindsByItemPath) {
            if (constraintPaths.has(path))
                form.constraintMessages.set(path, binds);
        }
    }
    if (Array.isArray(document.shapes)) {
        document.shapes.forEach((rawShape, shapeIndex) => {
            const shape = record(rawShape);
            if (!shape)
                return;
            const node = generationNode(handle, `${family}-shape`, `/shapes/${shapeIndex}`, shape, `shapes[${shapeIndex}]`);
            form.nodes.push(node);
            owners.set(node, targetedOwners(form, stringProp(shape, 'target')));
            const id = stringProp(shape, 'id');
            if (id)
                indexBy(form.localizedNodes, `$shape.${id}.message`, node);
        });
    }
    const optionSets = record(document.optionSets);
    if (optionSets) {
        for (const setName of Object.keys(optionSets).sort()) {
            const optionSet = record(optionSets[setName]);
            if (!optionSet || !Array.isArray(optionSet.options))
                continue;
            optionSet.options.forEach((rawOption, optionIndex) => {
                const option = record(rawOption);
                if (!option)
                    return;
                const node = generationNode(handle, `${family}-option`, `/optionSets/${escapePointerSegment(setName)}/options/${optionIndex}`, option, `${setName}.options[${optionIndex}]`);
                form.nodes.push(node);
                owners.set(node, setFields.get(setName) ?? [root]);
                const value = stringProp(option, 'value');
                if (value !== undefined)
                    indexBy(form.localizedNodes, optionLocaleKey(`$optionSet.${setName}`, value), node);
            });
        }
    }
    return form;
}
function themeNodes(handle) {
    const document = record(handle.document);
    if (!document)
        return [];
    return [generationNode(handle, 'theme-document', '', document, stringProp(document, 'name') ?? stringProp(document, 'title') ?? 'Theme')];
}
function responseActionNodes(handle) {
    const out = [];
    const actions = record(handle.document)?.actions;
    if (!Array.isArray(actions))
        return out;
    actions.forEach((rawAction, actionIndex) => {
        const action = record(rawAction);
        if (!action)
            return;
        out.push(generationNode(handle, 'response-action', `/actions/${actionIndex}`, action, `actions[${actionIndex}]`));
    });
    return out;
}
function referenceNodes(handle, form, owners) {
    const document = record(handle.document);
    const references = document?.references;
    const referenceDefs = record(document?.referenceDefs);
    if (!Array.isArray(references))
        return [];
    return references.flatMap((rawReference, referenceIndex) => {
        const reference = record(rawReference);
        if (!reference)
            return [];
        const pointer = `/references/${referenceIndex}`;
        const ref = stringProp(reference, '$ref');
        const key = ref?.match(/^#\/referenceDefs\/([a-zA-Z][a-zA-Z0-9_-]*)$/)?.[1];
        const base = key === undefined ? undefined : record(referenceDefs?.[key]);
        const resolved = base === undefined ? reference : { ...base, ...reference };
        const audience = stringProp(resolved, 'audience');
        if (audience !== 'human' && audience !== 'both')
            return [];
        const { anchors, invalidAnchors } = classifiedAnchors(directGenerationAnchors(reference, pointer));
        const node = {
            source: sourceIdentity(handle, pointer),
            kind: 'reference-entry',
            pointer,
            label: nodeLabel(resolved, `references[${referenceIndex}]`),
            anchors,
            invalidAnchors,
        };
        if (form)
            owners.set(node, targetedOwners(form, stringProp(resolved, 'target')));
        return [node];
    });
}
function dataSourceNodes(handle) {
    const sources = record(handle.document)?.sources;
    if (!Array.isArray(sources))
        return [];
    return sources.flatMap((rawSource, sourceIndex) => {
        const source = record(rawSource);
        if (!source)
            return [];
        return [generationNode(handle, 'data-source', `/sources/${sourceIndex}`, source, `sources[${sourceIndex}]`)];
    });
}
function previewScenarioNodes(handle) {
    const document = record(handle.document);
    if (!document || document.$formspecSurfaceScenario !== '0.1')
        return [];
    const out = [
        generationNode(handle, 'surface-preview-scenario', '', document, 'Surface preview scenario'),
    ];
    const routeParams = record(document.routeParams);
    if (routeParams) {
        out.push(siblingGenerationNode(handle, 'surface-preview-route-params', '/routeParams', routeParams, 'route parameters', document.routeParamsGeneration, '/routeParamsGeneration'));
    }
    const profiles = record(document.profiles);
    if (profiles) {
        Object.keys(profiles).sort().forEach((profileName) => {
            const profile = record(profiles[profileName]);
            if (!profile || !Array.isArray(profile.sources))
                return;
            profile.sources.forEach((rawOutcome, outcomeIndex) => {
                const outcome = record(rawOutcome);
                if (!outcome)
                    return;
                const outcomePointer = (`/profiles/${escapePointerSegment(profileName)}/sources/${outcomeIndex}`);
                const catalogRef = stringProp(outcome, 'catalogRef');
                const sourceRef = stringProp(outcome, 'sourceRef');
                out.push(generationNode(handle, 'surface-preview-source-outcome', outcomePointer, outcome, `${catalogRef ?? '<missing-catalog>'}#${sourceRef ?? '<missing-source>'}`));
            });
        });
    }
    const actions = record(document.actions);
    const defaultOutcome = record(actions?.default);
    if (defaultOutcome) {
        out.push(generationNode(handle, 'surface-preview-action-outcome', '/actions/default', defaultOutcome, 'default action outcome'));
    }
    const byAction = record(actions?.byAction);
    if (byAction) {
        Object.keys(byAction).sort().forEach((actionId) => {
            const outcome = record(byAction[actionId]);
            if (!outcome)
                return;
            out.push(generationNode(handle, 'surface-preview-action-outcome', `/actions/byAction/${escapePointerSegment(actionId)}`, outcome, actionId));
        });
    }
    return out;
}
function collectComponentNodes(handle, value, pointer, out, form, owners, repeatPath) {
    if (Array.isArray(value)) {
        value.forEach((child, index) => collectComponentNodes(handle, child, `${pointer}/${index}`, out, form, owners, repeatPath));
        return;
    }
    const object = record(value);
    if (!object)
        return;
    if (typeof object.component === 'string') {
        const node = generationNode(handle, 'component-node', pointer, object, object.component);
        out.push(node);
        if (form) {
            const id = stringProp(object, 'id');
            if (id)
                indexBy(form.componentsById, id, { node, component: object.component });
            const bind = stringProp(object, 'bind');
            if (bind) {
                // Component §4.4 resolves child paths in the current repeat instance.
                const path = repeatPath ? `${repeatPath}.${bind}` : bind;
                const targets = bind.includes('[') ? [] : resolveItems(form, path);
                owners.set(node, targets.map((target) => target.node));
                const target = unique(targets);
                if (target?.item.type === 'group' && target.item.repeatable === true
                    && (object.component === 'DataTable' || object.component === 'Accordion')) {
                    repeatPath = target.path;
                }
            }
        }
        if (object.component === 'Summary' && Array.isArray(object.items)) {
            object.items.forEach((rawItem, index) => {
                const item = record(rawItem);
                if (!item)
                    return;
                out.push(generationNode(handle, 'component-summary-item', `${pointer}/items/${index}`, item, `Summary.items[${index}]`));
            });
        }
        if (object.component === 'DataTable' && Array.isArray(object.columns)) {
            object.columns.forEach((rawColumn, index) => {
                const column = record(rawColumn);
                if (!column)
                    return;
                out.push(generationNode(handle, 'component-data-table-column', `${pointer}/columns/${index}`, column, `DataTable.columns[${index}]`));
            });
        }
        if (object.component === 'Tabs' && Array.isArray(object.tabLabels)) {
            const labelGeneration = Array.isArray(object.tabLabelGeneration)
                ? object.tabLabelGeneration
                : [];
            object.tabLabels.forEach((rawLabel, index) => {
                const { anchors, invalidAnchors } = classifiedAnchors(generationObjectAnchors(labelGeneration[index], `${pointer}/tabLabelGeneration/${index}`));
                out.push({
                    source: sourceIdentity(handle, `${pointer}/tabLabels/${index}`),
                    kind: 'component-tab-label',
                    pointer: `${pointer}/tabLabels/${index}`,
                    label: typeof rawLabel === 'string' ? rawLabel : `Tabs.tabLabels[${index}]`,
                    anchors,
                    invalidAnchors,
                });
            });
        }
    }
    for (const [key, child] of Object.entries(object)) {
        collectComponentNodes(handle, child, `${pointer}/${escapePointerSegment(key)}`, out, form, owners, repeatPath);
    }
}
function componentNodes(handle, form, owners) {
    const out = [];
    collectComponentNodes(handle, handle.document, '', out, form, owners);
    return out;
}
// Locale §3.1.8 properties owned by a Component node itself.
// Tabs labels, Summary entries and DataTable columns have independent inventory nodes.
const COMPONENT_LOCALE_PROPERTIES = new Map([
    ['Page', ['title', 'description']],
    ['Heading', ['text']], ['Text', ['text']], ['Alert', ['text']], ['Badge', ['text']],
    ['Divider', ['label']], ['ProgressBar', ['label']], ['Card', ['title', 'subtitle']],
    ['Collapsible', ['title']], ['Panel', ['title']], ['ConditionalGroup', ['fallback']],
    ['ActionButton', ['label', 'pendingLabel']], ['Modal', ['title', 'triggerLabel']], ['Popover', ['triggerLabel']],
    ['Select', ['placeholder']], ['NumberInput', ['placeholder']], ['DatePicker', ['placeholder']],
    ['MoneyInput', ['placeholder']], ['TextInput', ['placeholder', 'prefix', 'suffix']],
]);
function localizedOwners(form, key, owners) {
    if (/^\$form\.(title|description)(@[^.]+)?$/.test(key))
        return [form.root];
    if (key.startsWith('$shape.') || key.startsWith('$optionSet.')) {
        const matches = form.localizedNodes.get(key);
        return matches?.length === 1 ? matches : undefined;
    }
    const componentKey = /^\$component\.([^.]+)\.(\w+|labels\[\d+\])(?:@[^.]+)?$/.exec(key);
    if (componentKey) {
        const target = unique(form.componentsById.get(componentKey[1]));
        if (!target || !owners.has(target.node))
            return undefined;
        const property = componentKey[2];
        const localizable = target.component === 'Accordion'
            ? /^labels\[\d+\]$/.test(property)
            : COMPONENT_LOCALE_PROPERTIES.get(target.component)?.includes(property);
        return localizable ? [target.node] : undefined;
    }
    const itemKey = /^([a-zA-Z][a-zA-Z0-9_]*)\.(.+)$/.exec(key);
    if (!itemKey)
        return undefined;
    const [, bareKey, property] = itemKey;
    const item = unique(form.itemsByKey.get(bareKey));
    if (!item || !property)
        return undefined;
    if (property === 'constraintMessage')
        return form.constraintMessages.get(item.path);
    if (/^(label|hint|description)(@[^.]+)?$|^(rowLabel|addLabel|removeLabel|helpLabel|requiredMessage)$|^errors\.[^.]+$/.test(property))
        return [item.node];
    if (property.startsWith('options.') && property.endsWith('.label')) {
        const optionSet = stringProp(item.item, 'optionSet');
        const optionKey = optionSet ? `$optionSet.${optionSet}.${property.slice('options.'.length)}` : key;
        const matches = form.localizedNodes.get(optionKey);
        if (matches?.length !== 1)
            return undefined;
        return optionSet ? [item.node] : matches;
    }
    return undefined;
}
function localeNodes(handle, form, owners) {
    const document = record(handle.document);
    const strings = record(document?.strings);
    const stringGeneration = record(document?.stringGeneration);
    if (!strings)
        return [];
    return Object.keys(strings).sort().map((key) => {
        const { anchors, invalidAnchors } = classifiedAnchors(generationObjectAnchors(stringGeneration?.[key], `/stringGeneration/${escapePointerSegment(key)}`));
        const pointer = `/strings/${escapePointerSegment(key)}`;
        const node = {
            source: sourceIdentity(handle, pointer),
            kind: 'locale-string',
            pointer,
            label: key,
            anchors,
            invalidAnchors,
        };
        const localized = form && localizedOwners(form, key, owners);
        if (localized)
            owners.set(node, localized);
        return node;
    });
}
function handleUrl(handle) {
    return stringProp(record(handle.ref), 'url')
        ?? stringProp(record(handle.identity), 'url')
        ?? stringProp(record(handle.document), 'url');
}
function mountedExperienceUnitIds(context, experience) {
    const experiences = context.handles.filter((handle) => handle.artifactKind === 'experience' && handle.status === 'loaded');
    const experienceUrl = handleUrl(experience);
    const experienceId = stringProp(record(experience.identity), 'id')
        ?? stringProp(record(experience.document), 'id');
    const mounted = new Set();
    for (const surface of context.handles.filter((handle) => handle.artifactKind === 'surface' && handle.status === 'loaded')) {
        const routes = record(surface.document)?.routes;
        if (!Array.isArray(routes))
            continue;
        for (const rawRoute of routes) {
            const slots = record(rawRoute)?.slots;
            if (!Array.isArray(slots))
                continue;
            for (const rawSlot of slots) {
                const slot = record(rawSlot);
                if (stringProp(slot, 'slotType') !== 'experience-unit')
                    continue;
                const binding = record(slot?.binding);
                const unitRef = stringProp(binding, 'unitRef');
                const experienceRef = stringProp(binding, 'experienceRef');
                if (!unitRef)
                    continue;
                if (experienceRef === undefined
                    ? experiences.length === 1
                    : experienceRef === experienceUrl || experienceRef === experienceId) {
                    mounted.add(unitRef);
                }
            }
        }
    }
    return mounted;
}
function experienceUnitTitleNodes(context, handle) {
    const units = record(handle.document)?.units;
    if (!Array.isArray(units))
        return [];
    const mounted = mountedExperienceUnitIds(context, handle);
    return units.flatMap((rawUnit, unitIndex) => {
        const unit = record(rawUnit);
        const unitId = stringProp(unit, 'id');
        const title = stringProp(unit, 'title');
        if (!unit || !unitId || title === undefined || !mounted.has(unitId))
            return [];
        const typedNeedRefs = Array.isArray(unit.needRefs)
            ? unit.needRefs.flatMap((rawRef, refIndex) => {
                const ref = record(rawRef);
                const needId = stringProp(ref, 'id');
                if (!needId)
                    return [];
                const description = stringProp(ref, 'description');
                return [{
                        needId,
                        pointer: `/units/${unitIndex}/needRefs/${refIndex}/id`,
                        ...(description === undefined ? {} : { description }),
                    }];
            })
            : [];
        return [{
                source: sourceIdentity(handle, `/units/${unitIndex}/title`),
                kind: 'experience-unit-title',
                pointer: `/units/${unitIndex}/title`,
                label: title,
                anchors: [],
                invalidAnchors: [],
                typedNeedRefs,
            }];
    });
}
function collectTraceGraph(context, previewScenarios) {
    const registryEntries = registryWidgetEntries(context);
    const handles = context.handles.some((handle) => handle === context.manifest)
        ? context.handles
        : [context.manifest, ...context.handles];
    const owners = new Map();
    const forms = new Map();
    const formsByTarget = new Map();
    for (const handle of handles) {
        const kind = handle.artifactKind;
        if (handle.status !== 'loaded' || (kind !== 'definition' && kind !== 'screener'))
            continue;
        const form = collectFormNodes(handle, kind, owners);
        if (!form)
            continue;
        forms.set(handle, form);
        const document = record(handle.document);
        const url = stringProp(document, 'url');
        const version = stringProp(document, 'version');
        if (url && (!handle.ref?.url || handle.ref.url === url)
            && (!handle.ref?.version || handle.ref.version === version)) {
            indexBy(formsByTarget, `${kind}:${url}`, { form, version });
        }
    }
    const targetForm = (kind, url, target) => {
        if (!url || (kind !== 'definition' && kind !== 'screener'))
            return undefined;
        const candidates = formsByTarget.get(`${kind}:${url}`);
        const compatibleVersions = stringProp(target, 'compatibleVersions');
        return unique(candidates?.filter(({ version }) => !compatibleVersionFailure(compatibleVersions, version)))?.form;
    };
    // Register Component nodes before Locales, regardless of manifest load order.
    const components = new Map();
    for (const handle of handles) {
        if (handle.status !== 'loaded' || handle.artifactKind !== 'component')
            continue;
        const doc = record(handle.document);
        const target = record(doc?.targetDefinition) ?? record(doc?.target);
        components.set(handle, componentNodes(handle, targetForm('definition', componentTargetUrl(doc), target), owners));
    }
    const graphNodes = handles.flatMap((handle) => {
        if (handle.status !== 'loaded' || handle.document === undefined)
            return [];
        switch (handle.artifactKind) {
            case 'appManifest':
                return appManifestNodes(handle);
            case 'surface':
                return surfaceNodes(handle, registryEntries);
            case 'definition':
            case 'screener':
                return forms.get(handle)?.nodes ?? [];
            case 'theme':
                return themeNodes(handle);
            case 'responseActions':
                return responseActionNodes(handle);
            case 'references': {
                const target = record(record(handle.document)?.targetDefinition);
                return referenceNodes(handle, targetForm('definition', stringProp(target, 'url'), target), owners);
            }
            case 'dataSources':
                return dataSourceNodes(handle);
            case 'component':
                return components.get(handle) ?? [];
            case 'locale': {
                const target = record(record(handle.document)?.target);
                return localeNodes(handle, targetForm(stringProp(target, 'kind'), stringProp(target, 'url'), target), owners);
            }
            case 'experience':
                return experienceUnitTitleNodes(context, handle);
            default:
                return [];
        }
    });
    const scenarioNodes = previewScenarios.flatMap((handle) => {
        if (handle.status !== 'loaded' || handle.document === undefined)
            return [];
        return previewScenarioNodes(handle);
    });
    return { nodes: [...graphNodes, ...scenarioNodes], owners };
}
const EMPTY_TRACE = { pins: new Map(), via: new Set(), missingRoots: new Set(), malformed: false };
function unionTraces(traces) {
    const distinct = new Set(traces);
    if (distinct.size <= 1)
        return traces[0] ?? EMPTY_TRACE;
    const pins = new Map();
    const via = new Set();
    const missingRoots = new Set();
    let malformed = false;
    for (const trace of distinct) {
        for (const [pin, id] of trace.pins)
            pins.set(pin, id);
        for (const node of trace.via)
            via.add(node);
        for (const node of trace.missingRoots)
            missingRoots.add(node);
        malformed || (malformed = trace.malformed);
    }
    return { pins, via, missingRoots, malformed };
}
function compareCodePoints(left, right) {
    for (let index = 0; index < left.length && index < right.length;) {
        const a = left.codePointAt(index);
        const b = right.codePointAt(index);
        if (a !== b)
            return a - b;
        index += a > 0xffff ? 2 : 1;
    }
    return left.length - right.length;
}
function compareSources(left, right) {
    return compareCodePoints(left.artifactSlot, right.artifactSlot) || compareCodePoints(left.jsonPointer, right.jsonPointer);
}
function sourceKey(source) {
    return JSON.stringify([source.artifactSlot, source.jsonPointer]);
}
function resolveTraces(nodes, owners) {
    const traces = new Map();
    const redundant = new Set();
    const missingDependents = new Map();
    const effectiveByTrace = new Map();
    function resolve(node) {
        const cached = traces.get(node);
        if (cached)
            return cached;
        const parents = owners.get(node) ?? [];
        const inherited = unionTraces(parents.map(resolve));
        let trace = inherited;
        if (nodeCarriesTrace(node)) {
            const pins = new Map(node.anchors.map((anchor) => [anchor.raw, anchor.needId]));
            for (const ref of node.typedNeedRefs ?? [])
                pins.set(`need:${ref.needId}`, ref.needId);
            const malformed = node.invalidAnchors.length > 0;
            if (!malformed && !inherited.malformed && inherited.missingRoots.size === 0
                && pins.size === inherited.pins.size && [...pins.keys()].every((pin) => inherited.pins.has(pin))) {
                redundant.add(node);
            }
            trace = { ...EMPTY_TRACE, pins, via: new Set([node]), malformed };
        }
        else if (parents.length === 0 && !node.failure) {
            trace = { ...EMPTY_TRACE, missingRoots: new Set([node]) };
        }
        traces.set(node, trace);
        return trace;
    }
    for (const node of nodes) {
        for (const root of resolve(node).missingRoots) {
            if (root === node)
                continue;
            const dependents = missingDependents.get(root);
            if (dependents)
                dependents.push(node.source);
            else
                missingDependents.set(root, [node.source]);
        }
    }
    function effective(node) {
        const trace = resolve(node);
        const cached = effectiveByTrace.get(trace);
        if (cached)
            return cached;
        const sources = new Map();
        for (const { source } of trace.via)
            sources.set(sourceKey(source), source);
        const result = {
            needIds: [...new Set(trace.pins.values())].sort(compareCodePoints),
            via: [...sources.values()].sort(compareSources),
        };
        effectiveByTrace.set(trace, result);
        return result;
    }
    return { effective, redundant, missingDependents };
}
/** Each authored render node, its direct citations, and its effective publication trace. */
export function collectRenderedNeedTraceNodes(context, previewScenarios = []) {
    const { nodes, owners } = collectTraceGraph(context, previewScenarios);
    const traces = resolveTraces(nodes, owners);
    return nodes.map((node) => ({ ...node, effective: traces.effective(node) }));
}
function traceDiagnostic(code, message, node, jsonPointer, reason, details, relatedSources) {
    return {
        code,
        severity: code === RENDERED_NEED_TRACE_CODES.redundant ? 'warning' : 'error',
        phase: 'cross-artifact',
        origin: 'app-graph-validator',
        message,
        primarySource: {
            ...node.source,
            jsonPointer,
        },
        relatedSources: [...relatedSources],
        details: {
            reason,
            renderedNodeKind: node.kind,
            renderedNodeLabel: node.label,
            renderedNodePointer: node.pointer,
            ...details,
        },
    };
}
function validateNode(node, needsById, needsRoots, owners, traces) {
    if (node.failure) {
        return [traceDiagnostic(node.failure.code, node.failure.message, node, node.pointer, node.failure.reason, node.failure.details ?? {}, node.failure.relatedSources ?? [])];
    }
    if (!nodeCarriesTrace(node)) {
        if (owners.get(node)?.length)
            return [];
        return [traceDiagnostic(RENDERED_NEED_TRACE_CODES.missing, node.kind === 'experience-unit-title'
                ? `Rendered ${node.kind} '${node.label}' has no direct typed Need reference.`
                : `Rendered ${node.kind} '${node.label}' has no direct need:<id>@<revision> anchor.`, node, node.pointer, node.kind === 'experience-unit-title'
                ? 'direct-typed-need-ref-missing'
                : 'direct-need-anchor-missing', {}, (traces.missingDependents.get(node) ?? []).sort(compareSources))];
    }
    const diagnostics = [];
    for (const invalid of node.invalidAnchors) {
        diagnostics.push(traceDiagnostic(RENDERED_NEED_TRACE_CODES.unresolved, invalid.reason === 'need-anchor-not-string'
            ? `Rendered ${node.kind} '${node.label}' declares a Need anchor that is not a string.`
            : `Rendered ${node.kind} '${node.label}' declares malformed Need anchor '${String(invalid.raw)}'; expected need:<id>@<revision>.`, node, invalid.pointer, invalid.reason, { anchor: invalid.raw }, needsRoots));
    }
    for (const anchor of node.anchors) {
        const needId = anchor.needId;
        const anchoredRevision = anchor.revision;
        const matches = needsById.get(needId) ?? [];
        if (matches.length !== 1) {
            diagnostics.push(traceDiagnostic(RENDERED_NEED_TRACE_CODES.unresolved, matches.length === 0
                ? `Rendered ${node.kind} '${node.label}' Need anchor '${anchor.raw}' does not resolve in the paired Needs Document.`
                : `Rendered ${node.kind} '${node.label}' Need anchor '${anchor.raw}' is ambiguous across paired Needs Documents.`, node, anchor.pointer, matches.length === 0 ? 'need-id-unresolved' : 'need-id-ambiguous', {
                anchor: anchor.raw,
                needId,
                anchoredRevision,
                matchCount: matches.length,
                knownNeedIds: [...needsById.keys()].sort(),
            }, matches.length > 0 ? matches.map((match) => match.source) : needsRoots));
            continue;
        }
        const need = matches[0];
        if (need.status !== 'adopted') {
            diagnostics.push(traceDiagnostic(RENDERED_NEED_TRACE_CODES.nonAdopted, `Rendered ${node.kind} '${node.label}' Need anchor '${anchor.raw}' resolves to status '${need.status ?? '<absent>'}', not 'adopted'.`, node, anchor.pointer, 'need-not-adopted', {
                anchor: anchor.raw,
                needId,
                needStatus: need.status,
            }, [need.source]));
        }
        if (need.revision !== anchoredRevision) {
            diagnostics.push(traceDiagnostic(RENDERED_NEED_TRACE_CODES.stale, `Rendered ${node.kind} '${node.label}' Need anchor '${anchor.raw}' does not pin the current revision '${need.revision ?? '<absent>'}'.`, node, anchor.pointer, 'need-revision-not-current', {
                anchor: anchor.raw,
                needId,
                anchoredRevision,
                currentRevision: need.revision,
                direction: need.revision === undefined
                    ? 'unknown'
                    : anchoredRevision < need.revision
                        ? 'older'
                        : 'future',
            }, [need.source]));
        }
    }
    for (const needRef of node.typedNeedRefs ?? []) {
        const matches = needsById.get(needRef.needId) ?? [];
        if (matches.length !== 1) {
            diagnostics.push(traceDiagnostic(RENDERED_NEED_TRACE_CODES.unresolved, matches.length === 0
                ? `Rendered ${node.kind} '${node.label}' typed Need reference '${needRef.needId}' does not resolve in the paired Needs Document.`
                : `Rendered ${node.kind} '${node.label}' typed Need reference '${needRef.needId}' is ambiguous across paired Needs Documents.`, node, needRef.pointer, matches.length === 0 ? 'need-id-unresolved' : 'need-id-ambiguous', {
                needId: needRef.needId,
                matchCount: matches.length,
                knownNeedIds: [...needsById.keys()].sort(),
            }, matches.length > 0 ? matches.map((match) => match.source) : needsRoots));
            continue;
        }
        const need = matches[0];
        if (need.status !== 'adopted') {
            diagnostics.push(traceDiagnostic(RENDERED_NEED_TRACE_CODES.nonAdopted, `Rendered ${node.kind} '${node.label}' typed Need reference '${needRef.needId}' resolves to status '${need.status ?? '<absent>'}', not 'adopted'.`, node, needRef.pointer, 'need-not-adopted', {
                needId: needRef.needId,
                needStatus: need.status,
            }, [need.source]));
        }
    }
    if (traces.redundant.has(node)) {
        diagnostics.push(traceDiagnostic(RENDERED_NEED_TRACE_CODES.redundant, `Rendered ${node.kind} '${node.label}' repeats the Need trace it inherits.`, node, node.pointer, 'direct-need-trace-repeats-inherited', {}, []));
    }
    return diagnostics;
}
/**
 * Strict data-only authoring profile.
 *
 * Trace roots and overrides carry direct traces. Other Definition and Screener
 * nodes inherit through the App Graph owner table. The caller pairs a Needs
 * 1.0 document and each trace resolves to an unambiguous, adopted, current Need.
 *
 * This validator is intentionally not part of AppGraph's built-in set. General
 * Needs coverage remains report-only; callers opt into this error-severity
 * profile through `crossArtifactValidators`.
 */
export function validateRenderedNeedTrace(context, previewScenarios = []) {
    const { nodes, owners } = collectTraceGraph(context, previewScenarios);
    return traceDiagnostics(pairedNeedsDocuments(context), nodes, owners, resolveTraces(nodes, owners));
}
function nodeCarriesTrace(node) {
    return node.anchors.length > 0
        || node.invalidAnchors.length > 0
        || (node.typedNeedRefs?.length ?? 0) > 0;
}
/**
 * Run the strict profile under `mode` and return its findings with the
 * report record (Needs spec S10.3) that lets a server check the run instead of
 * re-running it. `definitions` names every loaded Definition the run covered.
 */
export function runRenderedNeedTrace(context, request) {
    const paired = pairedNeedsDocuments(context);
    const { nodes, owners } = collectTraceGraph(context, []);
    const applies = request.mode === 'required' || paired.length > 0 || nodes.some(nodeCarriesTrace);
    const loaded = (kind) => context.handles.filter((handle) => handle.artifactKind === kind && handle.status === 'loaded');
    const covered = (handle) => {
        const url = stringProp(record(handle.document), 'url');
        return url ? [{ url, sha256: request.digest(handle.document) }] : [];
    };
    const definitions = loaded('definition').flatMap((handle) => {
        const url = stringProp(record(handle.document), 'url');
        const version = stringProp(record(handle.document), 'version');
        if (!url || !version)
            return [];
        return [{
                url,
                version,
                sha256: request.digest(handle.document),
                locales: loaded('locale')
                    .filter((locale) => {
                    const target = record(record(locale.document)?.target);
                    return stringProp(target, 'kind') === 'definition' && stringProp(target, 'url') === url;
                })
                    .flatMap(covered),
                components: loaded('component')
                    .filter((component) => componentTargetUrl(record(component.document)) === url)
                    .flatMap(covered),
            }];
    });
    if (!applies)
        return { diagnostics: [], record: { status: 'not-applicable', definitions, nodes: [] } };
    const traces = resolveTraces(nodes, owners);
    const seen = new Set();
    const inventory = [...nodes].sort((left, right) => compareSources(left.source, right.source) || compareCodePoints(left.kind, right.kind)).flatMap((node) => {
        const { source, kind, label } = node;
        const identity = sourceKey(source);
        if (seen.has(identity))
            return [];
        seen.add(identity);
        return [{ source, kind, label, effective: traces.effective(node) }];
    });
    return {
        diagnostics: traceDiagnostics(paired, nodes, owners, traces),
        record: { status: 'completed', definitions, nodes: inventory },
    };
}
function traceDiagnostics(paired, nodes, owners, traces) {
    if (paired.length === 0) {
        const first = nodes[0];
        if (!first)
            return [];
        return [traceDiagnostic(RENDERED_NEED_TRACE_CODES.needsUnpaired, `Strict rendered-Need validation found ${nodes.length} rendered node${nodes.length === 1 ? '' : 's'} but no paired Needs 1.0 document.`, first, first.pointer, 'needs-document-unpaired', { renderedNodeCount: nodes.length }, [])];
    }
    const { byId, roots } = pairedNeeds(paired);
    return nodes.flatMap((node) => validateNode(node, byId, roots, owners, traces));
}
