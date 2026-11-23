/** @filedesc Plans renderable sections and stable Item ownership in Core page-authority order. */
import { componentTreeOwnsPages, findItemAtPath, getParentPath } from './planner-path-utils.js';
import { buildThemePageNodes, planComponentTree, planDefinitionFallback, planDefinitionItem, preparePlanContext, } from './planner.js';
import { mergeFormPresentationForPlanning } from './form-presentation.js';
import { UI_STRINGS } from './ui-strings.js';
function stringProp(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function walkNodes(nodes, visit, parents = [], painted = nodes) {
    nodes.forEach((node, index) => {
        const paintedNode = painted[index];
        visit(node, parents, paintedNode);
        if (node.children.length)
            walkNodes(node.children, visit, [...parents, node], paintedNode?.children ?? []);
    });
}
function authoredSection(node, localePrefix) {
    const id = stringProp(node.props.id);
    return { id, title: stringProp(node.props.title), nodes: [node],
        ...(id ? { titleLocaleKey: `${localePrefix}.${id}.title` } : {}) };
}
function splitSections(nodes, page) {
    const sections = [];
    let loose;
    for (const node of nodes) {
        const section = page(node);
        if (section) {
            sections.push(section);
            loose = undefined;
        }
        else {
            if (!loose) {
                loose = { nodes: [], loose: true };
                sections.push(loose);
            }
            loose.nodes.push(node);
        }
    }
    return sections;
}
function removePlacements(nodes, assigned) {
    return nodes.flatMap(node => {
        if (assigned.has(node))
            return [];
        if (!node.children.length)
            return [node];
        const children = removePlacements(node.children, assigned);
        if (!children.length && node.category === 'layout')
            return [];
        return children.length === node.children.length && children.every((child, i) => child === node.children[i])
            ? [node]
            : [{ ...node, children }];
    });
}
function themeSections(nodes, ctx) {
    const byPath = new Map();
    const byTemplate = new Map();
    walkNodes(nodes, (node, parents) => {
        if (!node.bindPath)
            return;
        const placement = { node, parents };
        if (!byPath.has(node.bindPath))
            byPath.set(node.bindPath, placement);
        if (parents.some(parent => parent.isRepeatTemplate || parent.component === 'Accordion')) {
            const key = placementKey(node.bindPath);
            if (!byTemplate.has(key))
                byTemplate.set(key, placement);
        }
    });
    const assigned = new Set();
    const pages = buildThemePageNodes(path => {
        const indexed = path !== placementKey(path);
        const planned = byPath.get(path) ?? byTemplate.get(path);
        if (planned) {
            const { node, parents } = planned;
            const template = parents.some(parent => parent.isRepeatTemplate || parent.component === 'Accordion');
            if (indexed && template)
                return node;
            assigned.add(node);
            return parents.reduceRight((child, parent) => parent.scopeChange || parent.when || parent.isRepeatTemplate
                ? { ...parent, id: ctx.nextId('region-scope'), children: [child] }
                : child, node);
        }
        const item = ctx.findItem(path);
        return item ? planDefinitionItem(item, ctx, getParentPath(path)) : null;
    }, ctx.items, ctx, { preserveBinding: true, retainHiddenRegions: true, retainRegionlessPages: true });
    if (!pages.length)
        return undefined;
    const remaining = removePlacements(nodes, assigned);
    const unassigned = remaining.filter(hasItem);
    const loose = remaining.filter(node => !hasItem(node));
    return [
        ...pages.map(node => authoredSection(node, '$page')),
        ...(loose.length ? [{ nodes: loose, loose: true }] : []),
        ...(unassigned.length ? [{ nodes: unassigned, loose: true, themeRemainder: true }] : []),
    ];
}
function hasItem(node) {
    return !!node.bindPath || node.children.some(hasItem);
}
/** Convert only indices introduced by a template to wildcards. */
function templatePath(path, repeats) {
    let result = path;
    for (const repeat of [...repeats].reverse()) {
        if (result.startsWith(`${repeat}[0]`)) {
            result = `${repeat}[*]${result.slice(repeat.length + 3)}`;
        }
        else if (result.startsWith(`${repeat}.`)) {
            result = `${repeat}[*]${result.slice(repeat.length)}`;
        }
    }
    return result;
}
/** Whether one placement covers every instance of the other placement. */
export function placementCovers(placement, path) {
    if (placement === path)
        return true;
    if (!placement.includes('[*]'))
        return false;
    const parts = placement.split('[*]');
    let rest = path;
    for (const part of parts.slice(0, -1)) {
        if (!rest.startsWith(part))
            return false;
        const index = rest.slice(part.length).match(/^\[(?:\d+|\*)\]/);
        if (!index)
            return false;
        rest = rest.slice(part.length + index[0].length);
    }
    return rest === parts[parts.length - 1];
}
export function placementKey(path) {
    return path.replace(/\[(?:\d+|\*)\]/g, '');
}
function readPlacements(nodes, ctx, fields, groups, repeats = []) {
    for (const node of nodes) {
        const path = node.bindPath;
        const item = path ? ctx.findItem(path) : null;
        const childRepeats = item?.repeatable && path && (node.isRepeatTemplate || node.component === 'Accordion')
            ? [...repeats, path]
            : repeats;
        if (path && item?.type === 'group')
            groups.add(templatePath(path, repeats));
        if (path && node.fieldItem)
            fields.add(templatePath(path, repeats));
        if (path && item?.repeatable && node.component === 'DataTable' && Array.isArray(node.props.columns)) {
            for (const column of node.props.columns) {
                if (typeof column?.bind !== 'string')
                    continue;
                const fieldPath = `${path}.${column.bind}`;
                if (ctx.findItem(fieldPath)?.type === 'field')
                    fields.add(templatePath(fieldPath, [...repeats, path]));
            }
        }
        readPlacements(node.children, ctx, fields, groups, childRepeats);
    }
}
/** Core ordering still renders Items a partial Component leaves unbound (Component §11.4). */
function unboundDefinitionNodes(nodes, ctx) {
    const fields = new Set();
    const groups = new Set();
    readPlacements(nodes, ctx, fields, groups);
    const boundItems = new Set([...fields].map(placementKey));
    const boundGroups = new Set([...groups].map(placementKey));
    walkNodes(nodes, node => {
        if (node.bindPath && ctx.findItem(node.bindPath)?.type === 'display') {
            boundItems.add(placementKey(node.bindPath));
        }
    });
    function retainUnbound(items, prefix) {
        return items.flatMap(item => {
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            if (item.type !== 'group')
                return boundItems.has(path) ? [] : [item];
            const original = item.children ?? [];
            const children = retainUnbound(original, path);
            return children.length || (original.length === 0 && !boundGroups.has(path))
                ? [{ ...item, children }]
                : [];
        });
    }
    const fallback = planDefinitionFallback(retainUnbound(ctx.items, ''), ctx, '', false);
    walkNodes(fallback, node => {
        // A fallback fragment may render more fields of a repeat without adding a second row control.
        if (node.isRepeatTemplate && node.bindPath && boundGroups.has(placementKey(node.bindPath))) {
            node.props = { ...node.props, allowAdd: false, allowRemove: false };
        }
    });
    return fallback;
}
function definitionSections(nodes, ctx) {
    const groups = ctx.items.filter(item => item.type === 'group');
    const keys = new Set(groups.map(item => item.key));
    function splitByGroup(node) {
        if (node.bindPath) {
            const key = placementKey(node.bindPath).split('.')[0];
            return [{ id: keys.has(key) ? key : undefined, node }];
        }
        const children = node.children.flatMap(splitByGroup);
        const owners = new Set(children.map(child => child.id));
        if (owners.size <= 1)
            return [{ id: children[0]?.id, node }];
        // The generated pages can split visual wrappers while preserving the controls inside them.
        // Keep mixed interactive containers intact so their own behavior remains available.
        if (node.component !== 'Stack' && node.component !== 'Grid' && node.component !== 'Root')
            return [{ node }];
        const fragments = [];
        for (const child of children) {
            const last = fragments[fragments.length - 1];
            if (last && last.id === child.id)
                last.node.children.push(child.node);
            else
                fragments.push({ id: child.id, node: { ...node, id: ctx.nextId('section-fragment'), children: [child.node] } });
        }
        return fragments;
    }
    const order = [];
    const byGroup = new Map();
    let loose;
    for (const { id, node } of nodes.flatMap(splitByGroup)) {
        if (id !== undefined) {
            const group = byGroup.get(id);
            if (group)
                group.push(node);
            else {
                byGroup.set(id, [node]);
                order.push(undefined);
            }
            loose = undefined;
        }
        else {
            if (!loose) {
                loose = { nodes: [], loose: true };
                order.push(loose);
            }
            loose.nodes.push(node);
        }
    }
    const generated = groups.flatMap(item => {
        const group = byGroup.get(item.key);
        return group ? [{ id: item.key, title: item.label || item.key, titleBind: item.key, nodes: group }] : [];
    });
    let nextGroup = 0;
    return order.map(section => section ?? generated[nextGroup++]);
}
function isSharedControl(node) {
    return node.component === 'ActionButton' || node.component === 'ValidationSummary';
}
function planSections(ctx) {
    const tree = ctx.componentDocument?.tree;
    const root = tree && planComponentTree(tree, ctx, '', undefined, false);
    const authoredPages = componentTreeOwnsPages(tree);
    const container = root && (!root.bindPath || authoredPages) && root.component !== 'Section' && root.children.length
        ? { ...root, children: [] }
        : undefined;
    const nodes = container ? root.children : root ? [root] : planDefinitionFallback(ctx.items, ctx, '', false);
    // Studio can place unbound instructions beside actions intended for every step.
    const lastContent = [...nodes].reverse().findIndex(node => !(node.category === 'display' && !node.bindPath) && !isSharedControl(node));
    const suffix = lastContent < 0 ? nodes : nodes.slice(nodes.length - lastContent);
    const sharedNodes = suffix.length < nodes.length && suffix.some(isSharedControl) ? suffix : [];
    const base = nodes.slice(0, nodes.length - sharedNodes.length);
    let sections;
    if (authoredPages) {
        sections = splitSections(base, node => node.component === 'Section' ? authoredSection(node, '$component') : undefined);
    }
    else if (ctx.theme?.pages?.length) {
        // Theme regions may place Items that the Component document does not bind.
        const represented = new Set();
        walkNodes(base, node => {
            if (node.bindPath)
                represented.add(placementKey(node.bindPath).split('.')[0]);
        });
        const unplaced = root ? ctx.items.filter(item => !represented.has(item.key)) : [];
        sections = themeSections([...base, ...planDefinitionFallback(unplaced, ctx, '', false)], ctx);
    }
    sections ?? (sections = definitionSections(root ? [...base, ...unboundDefinitionNodes(base, ctx)] : base, ctx));
    return { sections: sections.map(section => ({ ...section, container })), sharedNodes };
}
function nameLooseSections(sections, painted, ctx) {
    const ids = new Set(sections.flatMap(section => section.id ? [section.id] : []));
    sections.forEach((section, index) => {
        if (!section.loose)
            return;
        let id;
        walkNodes(section.nodes, (node, _parents, paintedNode) => {
            if (id && section.title)
                return;
            const item = node.bindPath ? ctx.findItem(node.bindPath) : null;
            if (!id && item?.key && !ids.has(item.key))
                id = item.key;
            if (section.title || node.component !== 'Heading' || node.bindPath && item?.type !== 'display')
                return;
            const title = stringProp(node.props.text);
            if (!title?.trim())
                return;
            const paintedTitle = stringProp(paintedNode?.props.text);
            section.title = paintedTitle?.trim() ? paintedTitle : title;
            section.titleHeadingId = paintedNode?.id;
            section.titleBind = node.bindPath;
            const componentId = stringProp(node.props.id);
            if (!node.bindPath && componentId)
                section.titleLocaleKey = `$component.${componentId}.text`;
        }, [], painted[index].nodes);
        if (!id)
            return;
        if (section.themeRemainder && !section.title) {
            section.title = UI_STRINGS['wizard.otherItems'];
            section.titleLocaleKey = '$ui.wizard.otherItems';
        }
        if (section.title) {
            section.id = id;
            ids.add(id);
        }
    });
}
function attachLooseSections(sections, definitionTitle, workspace) {
    const pages = [];
    let leading = [];
    sections.forEach((section, index) => {
        if (!section.id && (section.loose || workspace)) {
            (pages.at(-1)?.indexes ?? leading).push(index);
        }
        else {
            pages.push({ section, owner: index, indexes: [...leading, index] });
            leading = [];
        }
    });
    if (!pages.length && leading.length) {
        pages.push({
            section: { nodes: [], title: definitionTitle, titleLocaleKey: '$form.title', container: sections[0].container },
            owner: 0, indexes: leading,
        });
    }
    return pages;
}
export function resolvePageSequence(definition, options = {}) {
    const componentPresentation = options.component && 'formPresentation' in options.component
        ? options.component.formPresentation : undefined;
    const presentation = options.context?.formPresentation
        ?? mergeFormPresentationForPlanning(definition.formPresentation, componentPresentation);
    const ctx = preparePlanContext({
        ...options.context,
        items: definition.items,
        componentDocument: options.component,
        theme: options.theme,
        // Retain presentation hints while collecting unpaginated nodes for this section plan.
        formPresentation: { ...presentation, pageMode: 'single' },
        activeBreakpoint: null,
        findItem: path => findItemAtPath(definition.items, path),
    });
    const structural = planSections(ctx);
    const { sections } = structural;
    // Responsive overrides affect paint. Bindings and children are authored structure (Component §9.2).
    const painted = options.context?.activeBreakpoint
        ? planSections({ ...ctx, activeBreakpoint: options.context.activeBreakpoint })
        : structural;
    nameLooseSections(sections, painted.sections, ctx);
    const placements = new Map();
    const templates = new Set();
    const pages = attachLooseSections(sections, definition.title, presentation?.pageMode === 'workspace')
        .map(({ section: { loose, themeRemainder: _themeRemainder, ...section }, owner, indexes }) => {
        const fields = new Set();
        const groups = new Set();
        if (!loose && section.titleBind)
            groups.add(section.titleBind);
        const nodes = indexes.flatMap(index => sections[index].nodes);
        const structuralNodes = section.container ? [{ ...section.container, children: nodes }] : nodes;
        readPlacements(structuralNodes, ctx, fields, groups);
        const ownedFields = [...fields].filter(path => {
            const key = placementKey(path);
            const previous = placements.get(key) ?? [];
            if (previous.some(placement => placementCovers(placement, path)))
                return false;
            placements.set(key, [...previous, path]);
            return true;
        });
        const fieldTemplates = [...new Set(ownedFields.map(placementKey))].filter(path => {
            if (templates.has(path))
                return false;
            templates.add(path);
            return true;
        });
        const paintedOwner = painted.sections[owner];
        const title = section.nodes[0]?.component === 'Section'
            ? paintedOwner.title : section.title;
        return { ...section, title,
            nodes: indexes.flatMap(index => painted.sections[index].nodes), container: paintedOwner.container,
            fields: ownedFields, fieldTemplates, groups: [...groups] };
    });
    const last = pages.at(-1);
    if (last && painted.sharedNodes.length)
        last.sharedNodes = painted.sharedNodes;
    return pages;
}
/** Title source for an explicit Wizard child, shared by the renderer and authoring checks. */
export function describeWizardStep(node, index) {
    const id = stringProp(node.props.id);
    const title = stringProp(node.props.title);
    return {
        id,
        authoredSection: node.component === 'Section',
        title: title ?? node.fieldItem?.label,
        titleBind: stringProp(node.props.titleBind),
        titleLocaleKey: stringProp(node.props.titleLocaleKey) ?? (id && title ? `$component.${id}.title` : undefined),
        titleIndex: index + 1,
    };
}
export function findAuthoredPageSection(page) {
    return page.nodes.find(node => node.component === 'Section' && node.props.id === page.id);
}
export function hasWizardSections(pages) {
    return pages.some(page => page.id || findAuthoredPageSection(page) !== undefined);
}
/** Apply the normal Component planner when the document supplies its own page control. */
export function planExplicitPageRoot(definition, options) {
    const component = options.component;
    if (!component || (component.tree.component !== 'Wizard' && component.tree.component !== 'Tabs'))
        return undefined;
    const componentPresentation = 'formPresentation' in component ? component.formPresentation : undefined;
    const presentation = options.context?.formPresentation
        ?? mergeFormPresentationForPlanning(definition.formPresentation, componentPresentation);
    return planComponentTree(component.tree, preparePlanContext({
        ...options.context,
        items: definition.items,
        findItem: path => findItemAtPath(definition.items, path),
        componentDocument: component,
        theme: options.theme,
        formPresentation: presentation,
    }));
}
/** Section titles from the same planner inputs the respondent view uses. */
export function resolveSectionTitlePlan(definition, options = {}) {
    const component = options.component;
    const componentPresentation = component && 'formPresentation' in component ? component.formPresentation : undefined;
    const presentation = mergeFormPresentationForPlanning(definition.formPresentation, componentPresentation);
    if (component?.tree.component === 'Wizard' && presentation?.pageMode !== 'workspace') {
        return planExplicitPageRoot(definition, options)?.children.map(describeWizardStep) ?? [];
    }
    if (presentation?.pageMode !== 'workspace' && presentation?.pageMode !== 'wizard')
        return [];
    if (presentation.pageMode === 'wizard' && component?.tree.component === 'Tabs')
        return [];
    const pages = resolvePageSequence(definition, options);
    if (presentation.pageMode === 'wizard' && !hasWizardSections(pages))
        return [];
    return pages.map((page, index) => ({ ...page, titleIndex: index + 1 }));
}
