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
export function planComponentTree(tree, ctx, prefix = '', customComponentStack, applyThemePages = prefix === '') {
    const planCtx = preparePlanContext(ctx);
    if (!customComponentStack)
        customComponentStack = new Set();
    if (applyThemePages && !prefix && planCtx.theme?.pages?.length && !componentTreeOwnsPages(tree)) {
        const themed = planThemePagesFromComponentTree(tree, planCtx, customComponentStack);
        if (themed) {
            return applyGeneratedPageMode(themed, themed.component, planCtx);
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
        const result = planComponentTree(template, planCtx, prefix, customComponentStack, false);
        customComponentStack.delete(componentType);
        return result;
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
            node.children.push(planComponentTree(child, planCtx, childPrefix, customComponentStack, false));
        }
    }
    if (applyThemePages) {
        return applyGeneratedPageMode(node, componentType, planCtx);
    }
    return node;
}
function planThemePagesFromComponentTree(tree, ctx, customComponentStack) {
    const baseCtx = withoutThemePages(ctx);
    const root = planComponentTree(tree, baseCtx, '', customComponentStack, false);
    const pageNodes = buildThemePageNodes((regionPath) => {
        const componentNode = findComponentNodeByPath(ctx.items, tree, regionPath);
        if (!componentNode) {
            return null;
        }
        return planComponentTree(componentNode, baseCtx, '', customComponentStack, false);
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
            ? planComponentTree(componentNode, baseCtx, '', customComponentStack, false)
            : planDefinitionItem(item, baseCtx, '');
    });
    return {
        ...root,
        children: [...pageNodes, ...unassigned],
    };
}
export { findNodeByBindPath };
