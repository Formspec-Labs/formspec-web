/** @filedesc Wizard/tabs page-mode materialization for definition and component plans. */
import { createNodeIdGenerator } from './node-utils.js';
export function emitPageModePages(orphans, pages, nextId = createNodeIdGenerator()) {
    if (pages.length === 0) {
        return orphans;
    }
    const pageNodes = pages.map((page, index) => ({
        id: nextId('page'),
        component: 'Section',
        category: 'layout',
        props: {
            ...(page.id ? { id: page.id } : {}),
            title: page.title || `Page ${index + 1}`,
        },
        cssClasses: [],
        children: page.children,
    }));
    return [...pageNodes, ...buildFallbackSections(orphans, nextId)];
}
function buildFallbackSections(orphans, nextId) {
    if (orphans.length === 0) {
        return [];
    }
    return [{
            id: nextId('fallback-section'),
            component: 'Section',
            category: 'layout',
            props: { title: 'Additional Items' },
            cssClasses: [],
            children: orphans,
        }];
}
export function buildDefinitionPages(nodes, items) {
    const pages = [];
    const orphans = [];
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const node = nodes[index];
        if (!node)
            continue;
        if (item?.type !== 'group') {
            orphans.push(node);
            continue;
        }
        const title = String(item.label || node.props.title || node.props.bind || item.key || `Page ${pages.length + 1}`);
        pages.push({
            title,
            children: [stripTitleFromGroupNode(node)],
        });
    }
    for (let index = items.length; index < nodes.length; index += 1) {
        orphans.push(nodes[index]);
    }
    return { orphans, pages };
}
export function applyDefinitionPageMode(nodes, ctx) {
    const pageMode = ctx.formPresentation?.pageMode;
    if (pageMode !== 'wizard' && pageMode !== 'tabs') {
        return nodes;
    }
    const { orphans, pages } = buildDefinitionPages(nodes, ctx.items);
    if (pages.length === 0) {
        return nodes;
    }
    return emitPageModePages(orphans, pages, ctx.nextId);
}
export function applyGeneratedPageMode(rootNode, componentType, ctx) {
    const pageMode = ctx.formPresentation?.pageMode;
    if (pageMode !== 'wizard' && pageMode !== 'tabs') {
        return rootNode;
    }
    if (componentType === 'Section') {
        return {
            id: ctx.nextId('root'),
            component: 'Stack',
            category: 'layout',
            props: {},
            cssClasses: [],
            pageMode,
            children: [rootNode],
        };
    }
    if (componentType !== 'Stack' && componentType !== 'Root') {
        return rootNode;
    }
    if (!Array.isArray(rootNode.children) || rootNode.children.length === 0) {
        return rootNode;
    }
    if (rootNode.children.some((child) => child.component === 'Section')) {
        const orphans = rootNode.children.filter((node) => node.component !== 'Section');
        const pages = rootNode.children.filter((node) => node.component === 'Section');
        return {
            ...rootNode,
            pageMode,
            children: [...pages, ...buildFallbackSections(orphans, ctx.nextId)],
        };
    }
    if (!isStudioGeneratedComponentDoc(ctx.componentDocument)) {
        return rootNode;
    }
    const topLevelNodes = rootNode.children.slice(0, ctx.items.length);
    const preservedExtras = rootNode.children.slice(ctx.items.length);
    const orphanChildren = [];
    const pages = [];
    for (let index = 0; index < ctx.items.length; index += 1) {
        const item = ctx.items[index];
        const node = topLevelNodes[index];
        if (!node)
            continue;
        if (item?.type === 'group') {
            const title = String(item.label || node.props.title || node.props.bind || item.key || `Page ${pages.length + 1}`);
            pages.push({
                title,
                children: [stripTitleFromGroupNode(node)],
            });
        }
        else {
            orphanChildren.push(node);
        }
    }
    if (pages.length === 0) {
        return rootNode;
    }
    return {
        ...rootNode,
        pageMode,
        children: [...emitPageModePages(orphanChildren, pages, ctx.nextId), ...preservedExtras],
    };
}
export function isStudioGeneratedComponentDoc(doc) {
    if (!doc || typeof doc !== 'object')
        return false;
    return doc['x-studio-generated'] === true || doc.$formspecComponent == null;
}
export function stripTitleFromGroupNode(node) {
    if (node.component !== 'Stack') {
        return node;
    }
    const { title: _title, ...restProps } = node.props;
    return {
        ...node,
        props: restProps,
    };
}
