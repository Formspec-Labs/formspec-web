/** @filedesc Component-document tree planner: slots, repeats, custom components, theme pages. */
import { mergeBreakpointNamespace } from '@formspec-org/types';
import { resolvePresentation } from './theme-resolver.js';
import { resolveResponsiveProps } from './responsive.js';
import { interpolateParams } from './params.js';
import { classifyComponent, extractProps, gridPlacementStyleFromLayout, normalizeCssClass, preparePlanContext, resolveCssClasses, resolveGridTracks, resolveStyleTokens, resolveTokenInContext, } from './node-utils.js';
import { planDefinitionItem } from './planner-definition-fallback.js';
import { componentTreeOwnsPages, findComponentNodeByPath, findNodeByBindPath, } from './planner-path-utils.js';
import { applyGeneratedPageMode } from './planner-page-mode.js';
import { buildThemePageNodes, collectAssignedTopLevelKeys, withoutThemePages, } from './planner-theme-pages.js';
const UI_GRAPH_POLICY_SCHEMA_ID = 'https://formspec.org/schemas/uiGraphPolicy/0.1';
export function planComponentTree(tree, ctx, prefix = '', customComponentStack, applyThemePages = prefix === '', graphPathSegments = []) {
    const planCtx = preparePlanContext(ctx);
    if (!customComponentStack)
        customComponentStack = new Set();
    if (applyThemePages && !prefix && planCtx.theme?.pages?.length && !componentTreeOwnsPages(tree)) {
        const themed = planThemePagesFromComponentTree(tree, planCtx, customComponentStack);
        if (themed) {
            return finalizeRouteProjectionRoot(applyGeneratedPageMode(themed, themed.component, planCtx), planCtx, prefix, graphPathSegments);
        }
    }
    const comp = resolveResponsiveProps(tree, planCtx.activeBreakpoint ?? null, mergeBreakpointNamespace(planCtx.theme?.breakpoints, planCtx.componentDocument?.breakpoints));
    const componentType = comp.component;
    const customComponents = planCtx.componentDocument?.components;
    if (customComponents?.[componentType]) {
        if (customComponentStack.has(componentType)) {
            return {
                id: planCtx.nextId('err'),
                component: 'Text',
                category: 'display',
                props: { text: `[Recursive component: ${componentType}]` },
                cssClasses: [],
                children: [],
            };
        }
        const customDef = customComponents[componentType];
        const template = JSON.parse(JSON.stringify(customDef.tree));
        interpolateParams(template, (comp.params ?? comp));
        customComponentStack.add(componentType);
        const result = planComponentTree(template, planCtx, prefix, customComponentStack, false, null);
        customComponentStack.delete(componentType);
        return finalizeRouteProjectionRoot(result, planCtx, prefix, graphPathSegments);
    }
    const bindKey = comp.bind;
    const fullBindPath = bindKey
        ? (prefix ? `${prefix}.${bindKey}` : bindKey)
        : undefined;
    const item = fullBindPath ? planCtx.findItem(fullBindPath) : null;
    const isRepeatGroup = item?.type === 'group' && item.repeatable === true
        && componentType !== 'DataTable' && componentType !== 'Accordion';
    const props = extractProps(comp);
    if (componentType === 'TextInput' && item?.type === 'field' && item.dataType === 'text' && props.maxLines == null) {
        props.maxLines = 3;
    }
    for (const prop of ['gap', 'rowGap', 'padding', 'background', 'border', 'radius', 'elevation']) {
        if (props[prop] !== undefined)
            props[prop] = resolveTokenInContext(props[prop], planCtx);
    }
    if (props.columns !== undefined) {
        props.columns = resolveGridTracks(props.columns, planCtx);
    }
    const gridPlacementStyle = gridPlacementStyleFromLayout(comp.layout);
    const authoredStyle = resolveStyleTokens(comp.style, planCtx);
    const node = {
        id: planCtx.nextId(componentType.toLowerCase()),
        component: componentType,
        category: classifyComponent(componentType),
        props,
        style: gridPlacementStyle || authoredStyle
            ? { ...(gridPlacementStyle ?? {}), ...(authoredStyle ?? {}) }
            : undefined,
        cssClasses: resolveCssClasses(comp, planCtx),
        children: [],
    };
    const nextGraphPathSegments = componentGraphPathSegments(comp, graphPathSegments);
    if (planCtx.componentGraph && nextGraphPathSegments) {
        const graphIdentity = componentGraphIdentityForNode(comp, planCtx, nextGraphPathSegments);
        if (graphIdentity)
            node.componentGraphIdentity = graphIdentity;
    }
    if (comp.accessibility && typeof comp.accessibility === 'object') {
        node.accessibility = { ...comp.accessibility };
    }
    if (fullBindPath) {
        node.bindPath = fullBindPath;
    }
    if (item && item.type === 'field') {
        const fieldItem = item;
        node.fieldItem = {
            key: fieldItem.key ?? bindKey,
            label: fieldItem.label ?? bindKey,
            hint: fieldItem.hint,
            dataType: fieldItem.dataType,
            extensions: fieldItem.extensions,
        };
        const itemDesc = {
            key: bindKey,
            type: 'field',
            dataType: fieldItem.dataType,
        };
        const tier1 = {
            formPresentation: planCtx.formPresentation,
            itemPresentation: fieldItem.presentation,
        };
        const presentation = resolvePresentation(planCtx.theme, itemDesc, tier1);
        node.presentation = presentation;
        node.labelPosition = presentation.labelPosition ?? 'top';
        const presClasses = normalizeCssClass(presentation.cssClass);
        if (presClasses.length > 0) {
            const union = new Set([...node.cssClasses, ...presClasses]);
            node.cssClasses = [...union];
        }
    }
    if (item && item.type === 'display') {
        if (props.text == null) {
            props.text = item.label ?? '';
        }
        delete props.bind;
    }
    if (comp.when) {
        node.when = comp.when;
        node.whenPrefix = prefix;
        if (comp.fallback) {
            node.fallback = comp.fallback;
        }
    }
    if (isRepeatGroup && fullBindPath) {
        node.repeatGroup = bindKey;
        node.repeatPath = fullBindPath;
        node.isRepeatTemplate = true;
    }
    const SELF_MANAGED_GROUP_COMPONENTS = new Set(['DataTable', 'Accordion']);
    if (fullBindPath && item?.type === 'group' && !SELF_MANAGED_GROUP_COMPONENTS.has(componentType)) {
        node.scopeChange = true;
    }
    const childPrefix = isRepeatGroup && fullBindPath
        ? `${fullBindPath}[0]`
        : (fullBindPath && item?.type === 'group' ? fullBindPath : prefix);
    if (Array.isArray(comp.children)) {
        for (const child of comp.children) {
            node.children.push(planComponentTree(child, planCtx, childPrefix, customComponentStack, false, nextGraphPathSegments));
        }
    }
    if (applyThemePages) {
        return finalizeRouteProjectionRoot(applyGeneratedPageMode(node, componentType, planCtx), planCtx, prefix, graphPathSegments);
    }
    return finalizeRouteProjectionRoot(node, planCtx, prefix, graphPathSegments);
}
function stringProp(value, key) {
    const raw = value[key];
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}
function componentNodePathSegment(node) {
    return stringProp(node, 'nodeId') ?? stringProp(node, 'bind') ?? stringProp(node, 'id');
}
function componentGraphPathSegments(node, parentSegments) {
    if (parentSegments === null)
        return null;
    const segment = componentNodePathSegment(node);
    return segment ? [...parentSegments, segment] : null;
}
function componentGraphIdentityForNode(node, ctx, pathSegments) {
    const scope = ctx.componentGraph;
    if (!scope || pathSegments.length === 0)
        return undefined;
    return {
        component: scope.component,
        surface: scope.surface,
        route: scope.route,
        nodePath: `/${pathSegments.join('/')}`,
        ...(stringProp(node, 'id') ? { id: stringProp(node, 'id') } : {}),
        ...(stringProp(node, 'nodeId') ? { nodeId: stringProp(node, 'nodeId') } : {}),
    };
}
function isRouteProjectionRoot(prefix, graphPathSegments) {
    return prefix === '' && graphPathSegments !== null && graphPathSegments.length === 0;
}
function finalizeRouteProjectionRoot(node, ctx, prefix, graphPathSegments) {
    return isRouteProjectionRoot(prefix, graphPathSegments)
        ? projectUiGraphRoutePolicy(node, ctx)
        : node;
}
function projectUiGraphRoutePolicy(node, ctx) {
    const projection = uiGraphRoutePolicyProjection(ctx);
    if (projection) {
        node.uiGraphRoutePolicy = projection;
    }
    return node;
}
function uiGraphRoutePolicyProjection(ctx) {
    const scope = ctx.componentGraph;
    const hostEvidence = ctx.hostEvidence;
    const evidence = hostEvidence?.uiGraphPolicies;
    const validatedPolicySources = validatedUiGraphPolicyEvidenceSources(hostEvidence?.appGraphReport);
    if (!scope || !Array.isArray(evidence) || evidence.length === 0 || validatedPolicySources.size === 0) {
        return undefined;
    }
    const matches = [];
    for (const [index, entry] of evidence.entries()) {
        if (!isUiGraphPolicyProjectionEvidenceLike(entry))
            continue;
        const evidenceSlot = `hostEvidence.uiGraphPolicies[${index}]`;
        if (validatedPolicySources.get(evidenceSlot) !== entry.source) {
            continue;
        }
        if (entry.schemaId !== UI_GRAPH_POLICY_SCHEMA_ID) {
            continue;
        }
        const document = entry.document;
        if (!isUiGraphPolicyDocumentLike(document))
            continue;
        if (!targetSurfaceMatches(document.targetSurface, scope.surface))
            continue;
        for (const routePolicy of document.routePolicies) {
            if (routePolicy.routeId !== scope.route)
                continue;
            matches.push({
                schemaId: entry.schemaId,
                source: entry.source,
                targetSurface: { ...document.targetSurface },
                routeId: routePolicy.routeId,
                ...(routePolicy.a11y ? { a11y: { ...routePolicy.a11y } } : {}),
                ...(routePolicy.responsive ? {
                    responsive: {
                        ...routePolicy.responsive,
                        ...(routePolicy.responsive.collapseOrder
                            ? { collapseOrder: [...routePolicy.responsive.collapseOrder] }
                            : {}),
                    },
                } : {}),
            });
        }
    }
    return matches.length === 1 ? matches[0] : undefined;
}
function validatedUiGraphPolicyEvidenceSources(report) {
    if (!report
        || typeof report !== 'object'
        || report.ok !== true
        || !Array.isArray(report.phases)
        || !Array.isArray(report.evidenceResults)) {
        return new Map();
    }
    const phases = new Map();
    for (const phase of report.phases) {
        if (!isAppGraphPhaseLike(phase) || phases.has(phase.phase)) {
            return new Map();
        }
        phases.set(phase.phase, phase.status);
    }
    if (phases.get('schema') !== 'completed' || phases.get('cross-artifact') !== 'completed') {
        return new Map();
    }
    const sourcesBySlot = new Map();
    const seenEvidenceSlots = new Set();
    for (const result of report.evidenceResults) {
        if (!isAppGraphEvidenceResultLike(result) || seenEvidenceSlots.has(result.evidenceSlot)) {
            return new Map();
        }
        seenEvidenceSlots.add(result.evidenceSlot);
        if (isCompletedUiGraphPolicyEvidenceResult(result)) {
            sourcesBySlot.set(result.evidenceSlot, result.source);
        }
    }
    return sourcesBySlot;
}
function isAppGraphPhaseLike(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const phase = value;
    return typeof phase.phase === 'string' && typeof phase.status === 'string';
}
function isAppGraphEvidenceResultLike(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const result = value;
    return typeof result.evidenceSlot === 'string'
        && typeof result.schemaId === 'string'
        && typeof result.source === 'string';
}
function isCompletedUiGraphPolicyEvidenceResult(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const result = value;
    return result.schemaId === UI_GRAPH_POLICY_SCHEMA_ID
        && result.status === 'completed'
        && result.ok === true
        && typeof result.evidenceSlot === 'string'
        && typeof result.source === 'string';
}
function isUiGraphPolicyProjectionEvidenceLike(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const evidence = value;
    return typeof evidence.schemaId === 'string' && typeof evidence.source === 'string' && 'document' in value;
}
function isUiGraphPolicyDocumentLike(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const document = value;
    const targetSurface = document.targetSurface;
    if (document.$formspecUiGraphPolicy !== '0.1'
        || !targetSurface
        || typeof targetSurface !== 'object'
        || Array.isArray(targetSurface)
        || typeof targetSurface.url !== 'string'
        || ('version' in targetSurface && typeof targetSurface.version !== 'string')
        || !Array.isArray(document.routePolicies)) {
        return false;
    }
    return document.routePolicies.every(isUiGraphRoutePolicyLike);
}
function isUiGraphRoutePolicyLike(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const routePolicy = value;
    if (typeof routePolicy.routeId !== 'string')
        return false;
    if ('a11y' in routePolicy) {
        if (!routePolicy.a11y || typeof routePolicy.a11y !== 'object' || Array.isArray(routePolicy.a11y)) {
            return false;
        }
        const a11y = routePolicy.a11y;
        if ('landmark' in a11y
            && !['main', 'navigation', 'complementary', 'region'].includes(String(a11y.landmark))) {
            return false;
        }
        if ('keyboardNavigation' in a11y && typeof a11y.keyboardNavigation !== 'boolean') {
            return false;
        }
    }
    if ('responsive' in routePolicy) {
        if (!routePolicy.responsive
            || typeof routePolicy.responsive !== 'object'
            || Array.isArray(routePolicy.responsive)) {
            return false;
        }
        const responsive = routePolicy.responsive;
        if ('minColumns' in responsive && typeof responsive.minColumns !== 'number') {
            return false;
        }
        if ('collapseOrder' in responsive && !Array.isArray(responsive.collapseOrder)) {
            return false;
        }
        if (Array.isArray(responsive.collapseOrder)
            && !responsive.collapseOrder.every((slot) => typeof slot === 'string')) {
            return false;
        }
    }
    return true;
}
function targetSurfaceMatches(policySurface, scopeSurface) {
    return policySurface.url === scopeSurface.url;
}
function planThemePagesFromComponentTree(tree, ctx, customComponentStack) {
    const baseCtx = withoutThemePages(ctx);
    const root = planComponentTree(tree, baseCtx, '', customComponentStack, false);
    const pageNodes = buildThemePageNodes((regionPath) => {
        const componentNode = findComponentNodeByPath(ctx.items, tree, regionPath);
        if (!componentNode) {
            return null;
        }
        return planComponentTree(componentNode, baseCtx, '', customComponentStack, false, null);
    }, ctx.items, ctx);
    if (pageNodes.length === 0) {
        return null;
    }
    const assignedTopLevelKeys = collectAssignedTopLevelKeys(ctx.items, ctx.theme?.pages);
    const unassigned = ctx.items
        .filter((item) => !assignedTopLevelKeys.has(item.key))
        .map((item) => {
        const componentNode = findComponentNodeByPath(ctx.items, tree, item.key);
        return componentNode
            ? planComponentTree(componentNode, baseCtx, '', customComponentStack, false, null)
            : planDefinitionItem(item, baseCtx, '');
    });
    return {
        ...root,
        children: [...pageNodes, ...unassigned],
    };
}
export { findNodeByBindPath };
