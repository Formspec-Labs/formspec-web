/** @filedesc Definition-items fallback planner when no component document is provided. */
import { widgetTokenToComponent } from '@formspec-org/types';
import { resolvePresentation, resolveWidget } from './theme-resolver.js';
import { getDefaultComponent } from './defaults.js';
import { gridPlacementStyleFromLayout, normalizeCssClass, preparePlanContext } from './node-utils.js';
import { findItemAtPath, findItemPathByKey, getParentPath, } from './planner-path-utils.js';
import { applyDefinitionPageMode, emitPageModePages, } from './planner-page-mode.js';
import { buildThemePageNodes, collectAssignedTopLevelKeys } from './planner-theme-pages.js';
export function planDefinitionFallback(items, ctx, prefix = '', applyThemePages = prefix === '') {
    const planCtx = preparePlanContext(ctx);
    if (applyThemePages && !prefix && planCtx.theme?.pages?.length) {
        const themed = planThemePagesFromDefinitionItems(items, planCtx);
        if (themed.length > 0) {
            return themed;
        }
    }
    const nodes = [];
    for (const item of items) {
        nodes.push(planDefinitionItem(item, planCtx, prefix));
    }
    return !prefix ? applyDefinitionPageMode(nodes, planCtx) : nodes;
}
export function planDefinitionItem(item, ctx, prefix = '') {
    const planCtx = preparePlanContext(ctx);
    const key = item.key || item.name || 'item';
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const itemDesc = {
        key,
        type: item.type,
        dataType: item.dataType,
    };
    const tier1 = {
        formPresentation: planCtx.formPresentation,
        itemPresentation: item.presentation,
    };
    const presentation = resolvePresentation(planCtx.theme, itemDesc, tier1);
    if (item.type === 'group') {
        const isRepeat = item.repeatable === true;
        const groupNode = {
            id: planCtx.nextId('group'),
            component: 'Stack',
            category: 'layout',
            props: { title: item.label || key, bind: key },
            style: gridPlacementStyleFromLayout(item.presentation?.layout),
            cssClasses: normalizeCssClass(presentation.cssClass),
            children: [],
            bindPath: fullPath,
            scopeChange: true,
        };
        if (isRepeat) {
            groupNode.repeatGroup = key;
            groupNode.repeatPath = fullPath;
            groupNode.isRepeatTemplate = true;
        }
        const childPrefix = isRepeat ? `${fullPath}[0]` : fullPath;
        if (Array.isArray(item.children)) {
            groupNode.children = planDefinitionFallback(item.children, planCtx, childPrefix, false);
        }
        return groupNode;
    }
    if (item.type === 'field') {
        const fieldItem = item;
        const isAvailable = planCtx.isComponentAvailable ?? (() => true);
        const themeWidget = resolveWidget(presentation, isAvailable);
        const tier1Widget = widgetTokenToComponent(fieldItem.presentation?.widgetHint);
        const widget = themeWidget || tier1Widget || getDefaultComponent(fieldItem);
        const { widgetHint: _, cssClass: _c, labelPosition: _l, ...presentationProps } = fieldItem.presentation ?? {};
        const fieldProps = { bind: key, ...presentationProps };
        if (widget === 'TextInput' && fieldItem.dataType === 'text' && !fieldProps.maxLines) {
            fieldProps.maxLines = 3;
        }
        return {
            id: planCtx.nextId('field'),
            component: widget,
            category: 'field',
            props: fieldProps,
            style: gridPlacementStyleFromLayout(fieldItem.presentation?.layout),
            cssClasses: normalizeCssClass(presentation.cssClass),
            children: [],
            bindPath: fullPath,
            fieldItem: {
                key: key,
                label: item.label ?? key,
                hint: fieldItem.hint,
                dataType: fieldItem.dataType,
                options: fieldItem.options,
                optionSet: fieldItem.optionSet,
                extensions: fieldItem.extensions,
            },
            presentation,
            labelPosition: presentation.labelPosition ?? 'top',
        };
    }
    const displayItem = item;
    const displayWidget = widgetTokenToComponent(displayItem.presentation?.widgetHint) ?? 'Text';
    const { widgetHint: _wh, cssClass: _dc, labelPosition: _dl, ...displayPresentationProps } = displayItem.presentation ?? {};
    const displayNode = {
        id: planCtx.nextId('display'),
        component: displayWidget,
        category: 'display',
        props: { text: item.label || '', ...displayPresentationProps },
        style: gridPlacementStyleFromLayout(displayItem.presentation?.layout),
        cssClasses: normalizeCssClass(presentation.cssClass),
        children: [],
    };
    if (displayItem.relevant) {
        displayNode.when = displayItem.relevant;
        displayNode.whenPrefix = prefix;
    }
    return displayNode;
}
function planThemePagesFromDefinitionItems(items, ctx) {
    const pageNodes = buildThemePageNodes((regionPath) => {
        const item = findItemAtPath(items, regionPath);
        if (!item)
            return null;
        const parentPath = getParentPath(regionPath);
        return planDefinitionItem(item, ctx, parentPath);
    }, items, ctx);
    if (pageNodes.length === 0) {
        return [];
    }
    const assignedTopLevelKeys = collectAssignedTopLevelKeys(items, ctx.theme?.pages);
    const unassigned = items
        .filter((item) => !assignedTopLevelKeys.has(item.key))
        .map((item) => planDefinitionItem(item, ctx, ''));
    const pageMode = ctx.formPresentation?.pageMode;
    if ((pageMode === 'wizard' || pageMode === 'tabs') && pageNodes.length > 0) {
        const pages = pageNodes.map((pn) => ({
            id: typeof pn.props?.id === 'string' ? pn.props.id : undefined,
            title: String(pn.props?.title || ''),
            children: pn.children,
        }));
        return emitPageModePages(unassigned, pages, ctx.nextId);
    }
    return [...pageNodes, ...unassigned];
}
export { findItemAtPath, findItemPathByKey };
